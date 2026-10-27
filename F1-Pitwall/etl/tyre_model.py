"""Fuel-corrected tyre degradation model for Fact_LapTimes.

Raw lap time mixes two opposite effects over a stint:
  * the car gets FASTER as fuel burns off   (~0.033 s per kg, ~1.6-1.9 kg per lap)
  * the car gets SLOWER as the tyre degrades
To isolate tyre wear we remove the fuel effect first:

    FuelLoadKg(lap)        = START_FUEL - burn_per_lap * (lap - 1)
    FuelCorrectedLapTime   = LapTime - FuelLoadKg * FUEL_EFFECT_S_PER_KG
                             (= estimated lap time with an empty tank)

Then, per stint, a least-squares line FuelCorrectedLapTime ~ TyreAge is fitted on
representative (clean, green-flag) laps:

    StintDegSlope  [s/lap]  = slope of that line
    StintBaseline  [s]      = fitted value at the stint's first representative tyre age
    TyreDegSeconds          = FuelCorrectedLapTime - StintBaseline
    TyreDegPct              = TyreDegSeconds / StintBaseline * 100
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import config


def flag_representative(laps: pd.DataFrame) -> pd.DataFrame:
    """IsNeutralised: SC/VSC/red-flag laps (field is slow). IsRepresentative: clean push laps."""
    laps = laps.copy()
    timed = laps.dropna(subset=["LapTimeSeconds"])
    race_median = timed["LapTimeSeconds"].median()
    field_median_per_lap = timed.groupby("LapNumber")["LapTimeSeconds"].median()
    neutral_laps = field_median_per_lap[field_median_per_lap > config.NEUTRALISED_PCT * race_median].index
    laps["IsNeutralised"] = laps["LapNumber"].isin(neutral_laps)

    clean = (
        laps["LapTimeSeconds"].notna()
        & (laps["LapNumber"] > 1)
        & ~laps["IsPitInLap"] & ~laps["IsPitOutLap"]
        & ~laps["IsNeutralised"]
    )
    drv_median = laps[clean].groupby("DriverID")["LapTimeSeconds"].median()
    limit = laps["DriverID"].map(drv_median) * config.REPRESENTATIVE_PCT
    laps["IsRepresentative"] = clean & (laps["LapTimeSeconds"] <= limit)
    return laps


def add_fuel_correction(laps: pd.DataFrame, total_laps: int) -> pd.DataFrame:
    laps = laps.copy()
    burn = config.START_FUEL_KG / max(total_laps, 1)
    laps["FuelLoadKg"] = (config.START_FUEL_KG - burn * (laps["LapNumber"] - 1)).clip(lower=0)
    laps["FuelCorrectedLapTime"] = laps["LapTimeSeconds"] - laps["FuelLoadKg"] * config.FUEL_EFFECT_S_PER_KG
    return laps


def add_degradation(laps: pd.DataFrame) -> pd.DataFrame:
    laps = laps.copy()
    for col in ("StintDegSlope", "StintBaseline", "TyreDegSeconds", "TyreDegPct"):
        laps[col] = np.nan

    for _, idx in laps.groupby("StintKey").groups.items():
        stint = laps.loc[idx]
        rep = stint[stint["IsRepresentative"]]
        if len(rep) < config.MIN_STINT_LAPS_FOR_FIT:
            continue
        x, y = rep["TyreAge"].to_numpy(float), rep["FuelCorrectedLapTime"].to_numpy(float)
        slope, intercept = np.polyfit(x, y, 1)
        baseline = intercept + slope * x.min()
        laps.loc[idx, "StintDegSlope"] = slope
        laps.loc[idx, "StintBaseline"] = baseline
        laps.loc[idx, "TyreDegSeconds"] = stint["FuelCorrectedLapTime"] - baseline
        laps.loc[idx, "TyreDegPct"] = (stint["FuelCorrectedLapTime"] - baseline) / baseline * 100
    return laps


def estimate_pit_loss(laps: pd.DataFrame) -> float | None:
    """Race-level pit-loss estimate (s): (in-lap + out-lap) - 2 x driver's clean median.

    Only stops where neither lap was neutralised are used (a stop under SC is cheap).
    """
    clean_median = laps[laps["IsRepresentative"]].groupby("DriverID")["LapTimeSeconds"].median()
    losses = []
    lap_idx = laps.set_index(["DriverID", "LapNumber"])
    for (drv, lap_no), row in lap_idx[lap_idx["IsPitInLap"]].iterrows():
        nxt = lap_idx.loc[(drv, lap_no + 1)] if (drv, lap_no + 1) in lap_idx.index else None
        if nxt is None or row["IsNeutralised"] or nxt["IsNeutralised"] or drv not in clean_median:
            continue
        if pd.isna(row["LapTimeSeconds"]) or pd.isna(nxt["LapTimeSeconds"]):
            continue
        losses.append(row["LapTimeSeconds"] + nxt["LapTimeSeconds"] - 2 * clean_median[drv])
    losses = [l for l in losses if 10 < l < 45]   # drop drive-throughs, long repairs
    return float(np.median(losses)) if losses else None


def build_lap_features(laps: pd.DataFrame, total_laps: int) -> tuple[pd.DataFrame, float | None]:
    laps = flag_representative(laps)
    laps = add_fuel_correction(laps, total_laps)
    laps = add_degradation(laps)
    return laps, estimate_pit_loss(laps)
