"""Lap timing, tyre stints and raw car telemetry per race.

Two interchangeable sources produce the SAME normalised output:

  * OpenF1 (default)  - free for historical data (2023+), no account needed.
  * FastF1            - since FastF1 3.9 the F1 live-timing archive requires an
                        F1TV subscription (env vars F1_USERNAME / F1_PASSWORD).

Normalised output of `load_race(season, round, race_date)`:

  laps : one row per driver-lap
         CarNumber, LapNumber, LapStartEpoch, LapEndEpoch, LapTimeSeconds,
         Sector1Time, Sector2Time, Sector3Time, Stint, TyreCompound, TyreAge,
         IsPitInLap, IsPitOutLap
  telemetry : dict CarNumber -> DataFrame
         t (epoch s), Speed (km/h), Throttle (%), Brake (bool), Gear, DRS, X, Y
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd
from requests import HTTPError

from . import config
from .http_client import openf1

log = logging.getLogger(__name__)


@dataclass
class RaceTiming:
    laps: pd.DataFrame
    telemetry: dict[int, pd.DataFrame]


def _epoch(s: pd.Series) -> pd.Series:
    """ISO timestamps -> UNIX seconds; missing timestamps stay NaN (never the NaT int sentinel)."""
    ts = pd.to_datetime(s, utc=True, format="ISO8601")
    return (ts - pd.Timestamp("1970-01-01", tz="UTC")).dt.total_seconds()


def _dt_epoch(s: pd.Series) -> pd.Series:
    """datetime-like series (naive = UTC) -> UNIX seconds, NaT -> NaN."""
    return (pd.to_datetime(s, utc=True) - pd.Timestamp("1970-01-01", tz="UTC")).dt.total_seconds()


def _apply_stints(laps: pd.DataFrame, stints: pd.DataFrame) -> pd.DataFrame:
    """Attach Stint, TyreCompound and TyreAge to every lap from a stint table
    with columns CarNumber, Stint, LapStart, LapEnd, Compound, AgeAtStart."""
    laps = laps.copy()
    laps["Stint"], laps["TyreCompound"], laps["TyreAge"] = np.nan, None, np.nan
    for s in stints.itertuples(index=False):
        m = (laps["CarNumber"] == s.CarNumber) & laps["LapNumber"].between(s.LapStart, s.LapEnd)
        laps.loc[m, "Stint"] = s.Stint
        laps.loc[m, "TyreCompound"] = s.Compound
        laps.loc[m, "TyreAge"] = s.AgeAtStart + (laps.loc[m, "LapNumber"] - s.LapStart) + 1
    return laps


# ==========================================================================
# OpenF1
# ==========================================================================
def _openf1_session_key(season: int, race_date) -> int | None:
    sessions = openf1.get("sessions", {"year": season, "session_name": "Race"})
    target = pd.Timestamp(race_date)
    for s in sessions:
        if abs((pd.Timestamp(s["date_start"][:10]) - target).days) <= 1:
            return int(s["session_key"])
    return None


def _openf1_load(season: int, rnd: int, race_date, telemetry_cars: set[int] | None) -> RaceTiming | None:
    key = _openf1_session_key(season, race_date)
    if key is None:
        log.warning("OpenF1: no race session for %s R%s (%s)", season, rnd, race_date)
        return None

    raw = pd.DataFrame(openf1.get("laps", {"session_key": key}))
    if raw.empty:
        return None
    laps = pd.DataFrame({
        "CarNumber": raw["driver_number"].astype(int),
        "LapNumber": raw["lap_number"].astype(int),
        "LapStartEpoch": _epoch(raw["date_start"]),
        "LapTimeSeconds": raw["lap_duration"].astype(float),
        "Sector1Time": raw["duration_sector_1"].astype(float),
        "Sector2Time": raw["duration_sector_2"].astype(float),
        "Sector3Time": raw["duration_sector_3"].astype(float),
        "IsPitOutLap": raw["is_pit_out_lap"].fillna(False).astype(bool),
    }).sort_values(["CarNumber", "LapNumber"])
    nxt = laps.groupby("CarNumber")["LapStartEpoch"].shift(-1)
    laps["LapEndEpoch"] = (laps["LapStartEpoch"] + laps["LapTimeSeconds"]).fillna(nxt)

    pits = pd.DataFrame(openf1.get("pit", {"session_key": key}))
    pit_in = set(zip(pits["driver_number"].astype(int), pits["lap_number"].astype(int))) if not pits.empty else set()
    laps["IsPitInLap"] = [(c, l) in pit_in for c, l in zip(laps["CarNumber"], laps["LapNumber"])]

    st = pd.DataFrame(openf1.get("stints", {"session_key": key}))
    if not st.empty:
        st = pd.DataFrame({
            "CarNumber": st["driver_number"].astype(int), "Stint": st["stint_number"],
            "LapStart": st["lap_start"], "LapEnd": st["lap_end"],
            "Compound": st["compound"].str.upper(), "AgeAtStart": st["tyre_age_at_start"].fillna(0),
        }).dropna(subset=["LapStart", "LapEnd"])
        laps = _apply_stints(laps, st)

    telemetry = {}
    cars = sorted(laps["CarNumber"].unique()) if telemetry_cars is None else sorted(telemetry_cars)
    for car in cars:
        try:
            car_data = openf1.get("car_data", {"session_key": key, "driver_number": int(car)})
            location = openf1.get("location", {"session_key": key, "driver_number": int(car)})
        except HTTPError as exc:
            if exc.response is None or exc.response.status_code != 422:
                raise
            log.warning("OpenF1: telemetry unavailable for %s R%s car %s", season, rnd, car)
            continue
        cd, loc = pd.DataFrame(car_data), pd.DataFrame(location)
        if cd.empty or loc.empty:
            continue
        cd["t"], loc["t"] = _epoch(cd["date"]), _epoch(loc["date"])
        cd, loc = cd.sort_values("t"), loc.sort_values("t").drop_duplicates("t")
        telemetry[int(car)] = pd.DataFrame({
            "t": cd["t"].to_numpy(),
            "Speed": cd["speed"].astype(float).to_numpy(),
            "Throttle": cd["throttle"].astype(float).clip(0, 100).to_numpy(),
            "Brake": (cd["brake"].astype(float) > 0).to_numpy(),
            "Gear": cd["n_gear"].astype(int).to_numpy(),
            "DRS": cd["drs"].fillna(0).astype(int).to_numpy(),
            # position feed has its own clock: interpolate onto car-data timestamps
            "X": np.interp(cd["t"], loc["t"], loc["x"].astype(float)),
            "Y": np.interp(cd["t"], loc["t"], loc["y"].astype(float)),
        })
    return RaceTiming(laps.reset_index(drop=True), telemetry)


# ==========================================================================
# FastF1 (needs F1TV credentials since 3.9)
# ==========================================================================
def _fastf1_load(season: int, rnd: int, race_date, telemetry_cars: set[int] | None) -> RaceTiming | None:
    import fastf1  # imported lazily: optional dependency

    fastf1.Cache.enable_cache(str(config.CACHE_DIR / "fastf1"))
    session = fastf1.get_session(season, rnd, "R")
    session.load(laps=True, telemetry=True, weather=False, messages=False)
    fl = session.laps

    def sec(col):
        return fl[col].dt.total_seconds()

    laps = pd.DataFrame({
        "CarNumber": fl["DriverNumber"].astype(int),
        "LapNumber": fl["LapNumber"].astype(int),
        "LapStartEpoch": _dt_epoch(fl["LapStartDate"]),
        "LapTimeSeconds": sec("LapTime"),
        "Sector1Time": sec("Sector1Time"), "Sector2Time": sec("Sector2Time"), "Sector3Time": sec("Sector3Time"),
        "Stint": fl["Stint"], "TyreCompound": fl["Compound"], "TyreAge": fl["TyreLife"],
        "IsPitInLap": fl["PitInTime"].notna(), "IsPitOutLap": fl["PitOutTime"].notna(),
    })
    laps["LapEndEpoch"] = laps["LapStartEpoch"] + laps["LapTimeSeconds"]

    telemetry = {}
    cars = laps["CarNumber"].unique() if telemetry_cars is None else telemetry_cars
    for car in cars:
        key = str(car)
        if key not in session.car_data or key not in session.pos_data:
            continue
        cd, pos = session.car_data[key], session.pos_data[key]
        t_cd = _dt_epoch(cd["Date"])
        t_pos = _dt_epoch(pos["Date"])
        telemetry[int(car)] = pd.DataFrame({
            "t": t_cd.to_numpy(), "Speed": cd["Speed"].to_numpy(float),
            "Throttle": cd["Throttle"].to_numpy(float), "Brake": cd["Brake"].astype(bool).to_numpy(),
            "Gear": cd["nGear"].astype(int).to_numpy(), "DRS": cd["DRS"].astype(int).to_numpy(),
            "X": np.interp(t_cd, t_pos, pos["X"].astype(float)),
            "Y": np.interp(t_cd, t_pos, pos["Y"].astype(float)),
        })
    return RaceTiming(laps, telemetry)


# ==========================================================================
def load_race(season: int, rnd: int, race_date, telemetry_cars: set[int] | None = None) -> RaceTiming | None:
    loader = _fastf1_load if config.LAP_SOURCE == "fastf1" else _openf1_load
    return loader(season, rnd, race_date, telemetry_cars)


def slice_lap(tel: pd.DataFrame, start: float, end: float) -> pd.DataFrame:
    """Raw telemetry samples of one lap; t is rebased to seconds since lap start."""
    lap = tel[(tel["t"] >= start) & (tel["t"] <= end)].copy()
    lap["t"] = lap["t"] - start
    return lap
