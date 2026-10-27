"""Stage every race and assemble the Power BI star schema.

Stage (per race, incremental):  data/staging/<RaceID>/{laps,telemetry}.parquet + meta.json
Build (all races):              data/star/<Table>.parquet

Keys
  RaceID        int   = Season * 100 + Round        (e.g. 202405)
  DriverID      text  = Jolpica driverId            (e.g. "max_verstappen")
  ConstructorID text  = Jolpica constructorId       (e.g. "red_bull")
  CircuitID     text  = Jolpica circuitId           (e.g. "bahrain")
"""
from __future__ import annotations

import json
import logging

import numpy as np
import pandas as pd

from . import config, extract_jolpica, physics, tyre_model
from .build_visual_feed import build_visual_feed
from .extract_laps import load_race, slice_lap

log = logging.getLogger(__name__)


def race_id(season: int, rnd: int) -> int:
    return season * 100 + rnd


# ==========================================================================
# Jolpica master data (cached per season)
# ==========================================================================
def load_jolpica(seasons: list[int]) -> dict[str, pd.DataFrame]:
    parts: dict[str, list[pd.DataFrame]] = {}
    for season in seasons:
        for name, df in extract_jolpica.extract_season(season).items():
            parts.setdefault(name, []).append(df)
    return {k: pd.concat(v, ignore_index=True) for k, v in parts.items()}


# ==========================================================================
# Stage one race
# ==========================================================================
def stage_race(season: int, rnd: int, race_date, results: pd.DataFrame, force: bool = False) -> bool:
    rid = race_id(season, rnd)
    out = config.STAGING_DIR / str(rid)
    if (out / "meta.json").exists() and not force:
        return True

    timing = load_race(season, rnd, race_date)
    if timing is None or timing.laps.empty:
        log.warning("No timing data for %s", rid)
        return False

    # ---- map car numbers to Jolpica keys -------------------------------------
    res = results[(results["Season"] == season) & (results["Round"] == rnd)]
    car_map = res.set_index("CarNumber")[["DriverID", "ConstructorID"]]
    laps = timing.laps.join(car_map, on="CarNumber", how="inner")
    laps["RaceID"] = rid
    laps["StintKey"] = laps["RaceID"].astype(str) + "|" + laps["DriverID"] + "|" + laps["Stint"].astype("Int64").astype(str)

    # ---- tyre / fuel features --------------------------------------------------
    total_laps = int(res["LapsCompleted"].max())
    laps, pit_loss = tyre_model.build_lap_features(laps, total_laps)
    timed = laps[laps["LapTimeSeconds"].notna() & ~laps["IsPitInLap"] & ~laps["IsPitOutLap"]]
    fastest_idx = timed.groupby("DriverID")["LapTimeSeconds"].idxmin()
    laps["IsFastestLap"] = laps.index.isin(fastest_idx)

    # ---- telemetry -------------------------------------------------------------
    scope = laps[laps["IsFastestLap"]] if config.TELEMETRY_SCOPE == "fastest" else laps
    scope = scope.dropna(subset=["LapStartEpoch", "LapEndEpoch"])
    tel_parts = []
    for lap in scope.itertuples(index=False):
        raw = timing.telemetry.get(lap.CarNumber)
        if raw is None:
            continue
        rs = physics.resample_lap_to_distance(slice_lap(raw, lap.LapStartEpoch, lap.LapEndEpoch))
        if rs.empty:
            continue
        rs = physics.add_g_forces(rs)
        rs["RaceID"], rs["DriverID"], rs["LapNumber"] = rid, lap.DriverID, lap.LapNumber
        rs["IsFastestLap"] = lap.IsFastestLap
        tel_parts.append(rs)
    tel = pd.concat(tel_parts, ignore_index=True) if tel_parts else pd.DataFrame()
    if not tel.empty:
        tel = physics.add_brake_pressure(tel)
        tel["DRSOpen"] = physics.drs_open(tel["DRS"])

    out.mkdir(parents=True, exist_ok=True)
    laps.to_parquet(out / "laps.parquet", index=False)
    if not tel.empty:
        tel.to_parquet(out / "telemetry.parquet", index=False)
    (out / "meta.json").write_text(json.dumps({
        "RaceID": rid, "TotalLaps": total_laps, "EstPitLossSeconds": pit_loss,
        "LapSource": config.LAP_SOURCE, "TelemetryScope": config.TELEMETRY_SCOPE,
        "TelemetryRows": int(len(tel)),
    }))
    log.info("Staged %s: %s laps, %s telemetry rows, pit loss %s s", rid, len(laps), len(tel),
             None if pit_loss is None else round(pit_loss, 1))
    return True


# ==========================================================================
# Assemble star schema
# ==========================================================================
def _read_staged(name: str) -> pd.DataFrame:
    files = sorted(config.STAGING_DIR.glob(f"*/{name}.parquet"))
    return pd.concat([pd.read_parquet(f) for f in files], ignore_index=True) if files else pd.DataFrame()


def _write(df: pd.DataFrame, name: str) -> None:
    if config.WRITE_PARQUET:
        df.to_parquet(config.STAR_DIR / f"{name}.parquet", index=False)
    if config.WRITE_CSV:
        df.to_csv(config.STAR_DIR / f"{name}.csv", index=False)
    log.info("%-18s %9d rows", name, len(df))


def build_star(j: dict[str, pd.DataFrame]) -> None:
    metas = {int(p.parent.name): json.loads(p.read_text()) for p in config.STAGING_DIR.glob("*/meta.json")}

    # ---------------------------------------------------------------- dims
    dim_driver = (j["drivers"].drop_duplicates("DriverID", keep="last")
                  [["DriverID", "PermanentNumber", "Code", "DriverName", "Nationality"]])
    dim_driver["PermanentNumber"] = dim_driver["PermanentNumber"].astype("Int64")

    dim_constructor = j["constructors"].drop_duplicates("ConstructorID", keep="last")

    races = j["races"].copy()
    dim_circuit = (races.drop_duplicates("CircuitID", keep="last")
                   [["CircuitID", "CircuitName", "Location", "Country", "Latitude", "Longitude"]])

    races["RaceID"] = races["Season"] * 100 + races["Round"]
    races["TotalLaps"] = races["RaceID"].map(lambda r: metas.get(r, {}).get("TotalLaps")).astype("Int64")
    races["EstPitLossSeconds"] = races["RaceID"].map(lambda r: metas.get(r, {}).get("EstPitLossSeconds"))
    races["HasTiming"] = races["RaceID"].isin(metas.keys())
    dim_race = races[["RaceID", "Season", "Round", "RaceName", "EventDate", "CircuitID",
                      "TotalLaps", "EstPitLossSeconds", "HasTiming"]]

    # ---------------------------------------------------------------- facts
    laps = _read_staged("laps")
    tel = _read_staged("telemetry")

    res = j["results"].copy()
    res["RaceID"] = res["Season"] * 100 + res["Round"]
    pits = j["pitstops"].copy()
    if not pits.empty:
        pits["RaceID"] = pits["Season"] * 100 + pits["Round"]
        res = res.merge(pits[["RaceID", "DriverID", "PitStopsCount"]], on=["RaceID", "DriverID"], how="left")
    else:
        res["PitStopsCount"] = np.nan
    if not laps.empty:  # fallback when Jolpica has no pit data: stints - 1
        stints = (laps.groupby(["RaceID", "DriverID"])["Stint"].nunique() - 1).rename("StintStops")
        res = res.join(stints, on=["RaceID", "DriverID"])
        res["PitStopsCount"] = res["PitStopsCount"].fillna(res["StintStops"])
    res["PitStopsCount"] = res["PitStopsCount"].fillna(0).astype("int64")
    res["ResultID"] = res["RaceID"] * 100 + res["FinalPosition"]
    fact_results = res[["ResultID", "RaceID", "DriverID", "ConstructorID", "GridPosition", "FinalPosition",
                        "PositionText", "Points", "Status", "LapsCompleted", "PitStopsCount"]]

    lap_cols = ["RaceID", "DriverID", "ConstructorID", "LapNumber", "LapTimeSeconds",
                "Sector1Time", "Sector2Time", "Sector3Time", "TyreCompound", "TyreAge", "Stint", "StintKey",
                "IsPitInLap", "IsPitOutLap", "IsNeutralised", "IsRepresentative", "IsFastestLap",
                "FuelLoadKg", "FuelCorrectedLapTime", "StintDegSlope", "StintBaseline",
                "TyreDegSeconds", "TyreDegPct"]
    fact_laps = laps[lap_cols].copy() if not laps.empty else pd.DataFrame(columns=lap_cols)
    for c in ("TyreAge", "Stint"):
        fact_laps[c] = fact_laps[c].astype("Int64")

    tel_cols = ["RaceID", "DriverID", "LapNumber", "Distance", "ElapsedTime", "Speed", "Throttle",
                "Brake", "Gear", "DRS", "DRSOpen", "X", "Y", "G_Long", "G_Lat", "G_Total",
                "BrakePressurePct", "IsFastestLap"]
    fact_tel = tel[tel_cols].copy() if not tel.empty else pd.DataFrame(columns=tel_cols)
    # round to sensor precision -> far better VertiPaq compression
    for c, d in {"Distance": 1, "ElapsedTime": 3, "Speed": 1, "Throttle": 1, "X": 1, "Y": 1,
                 "G_Long": 2, "G_Lat": 2, "G_Total": 2, "BrakePressurePct": 1}.items():
        if not fact_tel.empty:
            fact_tel[c] = fact_tel[c].astype(float).round(d)

    for df, name in [(dim_driver, "Dim_Driver"), (dim_constructor, "Dim_Constructor"),
                     (dim_circuit, "Dim_Circuit"), (dim_race, "Dim_Race"),
                     (fact_results, "Fact_RaceResults"), (fact_laps, "Fact_LapTimes"),
                     (fact_tel, "Fact_Telemetry")]:
        _write(df.reset_index(drop=True), name)

    # denormalised multi-grain feed for the Pitwall custom visual (see build_visual_feed.py)
    if not laps.empty:
        _write(build_visual_feed(j), "Fact_VisualFeed")
