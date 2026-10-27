"""Fact_VisualFeed: one denormalised, multi-grain table for the Pitwall custom visual.

A Power BI custom visual receives ONE table (dataView). The pitwall needs two grains:

  RecordType = "L"  -> one row per driver-lap  (timing, sectors, tyres, fuel, degradation)
  RecordType = "T"  -> one row per driver x 20 m on the driver's fastest lap
                       (X/Y for the track map, raw channels + derived physics)

Columns that don't apply to a record type are null. RowKey keeps every row unique so
Power BI never collapses rows when the columns are used as "Don't summarize" groupings.
LapStart is seconds since the race start (lights out), taken from the timing feed's
lap-start timestamps, so it stays correct under Safety Cars and with missing lap times.
"""
from __future__ import annotations

import json
import logging

import numpy as np
import pandas as pd

from . import config

log = logging.getLogger(__name__)

VISUAL_TEL_STEP = 2  # keep every 2nd 10 m sample -> 20 m resolution in the visual


def build_visual_feed(j: dict[str, pd.DataFrame]) -> pd.DataFrame:
    races = j["races"].copy()
    races["RaceID"] = races["Season"] * 100 + races["Round"]
    drivers = j["drivers"].drop_duplicates("DriverID", keep="last").set_index("DriverID")
    res = j["results"].copy()
    res["RaceID"] = res["Season"] * 100 + res["Round"]
    grid = res.set_index(["RaceID", "DriverID"])[["GridPosition", "FinalPosition", "Status"]]

    parts = []
    for meta_file in sorted(config.STAGING_DIR.glob("*/meta.json")):
        rid = int(meta_file.parent.name)
        meta = json.loads(meta_file.read_text())
        laps_file = meta_file.parent / "laps.parquet"
        tel_file = meta_file.parent / "telemetry.parquet"
        if not laps_file.exists() or rid not in set(races["RaceID"]):
            continue
        race = races.set_index("RaceID").loc[rid]
        laps = pd.read_parquet(laps_file).sort_values(["DriverID", "LapNumber"])
        # guard against missing lap-start stamps (older staging stored NaT as a huge negative int)
        start = laps["LapStartEpoch"].where(laps["LapStartEpoch"] > 1e9)
        prev_end = laps.groupby("DriverID")["LapStartEpoch"].shift(1).where(lambda x: x > 1e9) \
            + laps.groupby("DriverID")["LapTimeSeconds"].shift(1)
        next_start = laps.groupby("DriverID")["LapStartEpoch"].shift(-1).where(lambda x: x > 1e9) - laps["LapTimeSeconds"]
        laps["LapStartEpoch"] = start.fillna(prev_end).fillna(next_start)
        laps = laps.dropna(subset=["LapStartEpoch"])
        t0 = laps.loc[laps["LapNumber"] == 1, "LapStartEpoch"].min()

        L = pd.DataFrame({
            "RecordType": "L",
            "RaceID": rid,
            "DriverID": laps["DriverID"],
            "ConstructorID": laps["ConstructorID"],
            "LapNumber": laps["LapNumber"],
            "LapStart": (laps["LapStartEpoch"] - t0).round(3),
            "LapTime": laps["LapTimeSeconds"].round(3),
            "S1": laps["Sector1Time"].round(3), "S2": laps["Sector2Time"].round(3), "S3": laps["Sector3Time"].round(3),
            "Compound": laps["TyreCompound"],
            "TyreAge": laps["TyreAge"],
            "Stint": laps["Stint"],
            "PitIn": laps["IsPitInLap"].astype(int),
            "PitOut": laps["IsPitOutLap"].astype(int),
            "Clean": laps["IsRepresentative"].astype(int),
            "FuelKg": laps["FuelLoadKg"].round(1),
            "FuelCorrLap": laps["FuelCorrectedLapTime"].round(3),
            "DegPct": laps["TyreDegPct"].round(2),
        })
        g = grid.reindex(pd.MultiIndex.from_arrays([L["RaceID"], L["DriverID"]]))
        L["Grid"] = g["GridPosition"].to_numpy()
        L["Classified"] = g["Status"].to_numpy()
        parts.append(L)

        if tel_file.exists():
            tel = pd.read_parquet(tel_file)
            tel = tel[tel["IsFastestLap"]]
            tel = tel[tel.groupby("DriverID").cumcount() % VISUAL_TEL_STEP == 0]
            car = laps.drop_duplicates("DriverID").set_index("DriverID")["ConstructorID"]
            parts.append(pd.DataFrame({
                "RecordType": "T", "RaceID": rid, "DriverID": tel["DriverID"],
                "ConstructorID": tel["DriverID"].map(car), "LapNumber": tel["LapNumber"],
                "Distance": tel["Distance"].round(0), "Elapsed": tel["ElapsedTime"].round(3),
                "X": tel["X"].round(1), "Y": tel["Y"].round(1),
                "Speed": tel["Speed"].round(1), "Throttle": tel["Throttle"].round(0),
                "Brake": tel["Brake"].astype(int), "BrakePct": tel["BrakePressurePct"].round(0),
                "Gear": tel["Gear"], "DRS": tel["DRSOpen"].astype(int),
                "GLong": tel["G_Long"].round(2), "GLat": tel["G_Lat"].round(2),
            }))

    feed = pd.concat(parts, ignore_index=True)
    race_cols = races.set_index("RaceID")
    feed["Season"] = feed["RaceID"].map(race_cols["Season"])
    feed["Round"] = feed["RaceID"].map(race_cols["Round"])
    feed["RaceName"] = feed["RaceID"].map(race_cols["RaceName"])
    feed["Circuit"] = feed["RaceID"].map(race_cols["Location"])
    metas = {int(p.parent.name): json.loads(p.read_text()) for p in config.STAGING_DIR.glob("*/meta.json")}
    feed["TotalLaps"] = feed["RaceID"].map(lambda r: metas[r]["TotalLaps"])
    feed["PitLoss"] = feed["RaceID"].map(lambda r: metas[r]["EstPitLossSeconds"]).astype(float).round(1)
    feed["Code"] = feed["DriverID"].map(drivers["Code"])
    feed["DriverName"] = feed["DriverID"].map(drivers["DriverName"])

    for c in ("TyreAge", "Stint", "Grid", "Gear"):
        feed[c] = feed[c].astype("Int64")
    feed.insert(0, "RowKey", np.arange(1, len(feed) + 1, dtype="int64"))
    cols = ["RowKey", "RecordType", "RaceID", "Season", "Round", "RaceName", "Circuit", "TotalLaps", "PitLoss",
            "DriverID", "Code", "DriverName", "ConstructorID", "Grid", "Classified", "LapNumber", "LapStart",
            "LapTime", "S1", "S2", "S3", "Compound", "TyreAge", "Stint", "PitIn", "PitOut", "Clean",
            "FuelKg", "FuelCorrLap", "DegPct", "Distance", "Elapsed", "X", "Y", "Speed", "Throttle",
            "Brake", "BrakePct", "Gear", "DRS", "GLong", "GLat"]
    return feed[cols]
