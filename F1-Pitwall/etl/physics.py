"""Derived-physics feature engineering for Fact_Telemetry.

The public F1 feed gives ~4 Hz car data (speed, throttle, brake on/off, gear, DRS)
and ~4 Hz position data (X/Y/Z). It does NOT give accelerations, brake pressure or
tyre state. This module derives them.

Method (all per lap):
1. Re-sample every channel onto a uniform DISTANCE grid (default 10 m). Two drivers'
   laps then share the same x-axis in Power BI and can be subtracted point-by-point.
2. Smooth speed and X/Y with a Savitzky-Golay filter (noise on a 4 Hz GPS-like signal
   would otherwise explode when differentiated).
3. Longitudinal acceleration via the chain rule:
       a_long = dv/dt = (dv/ds) * (ds/dt) = v * dv/ds
4. Lateral acceleration from path curvature kappa of the X/Y trace:
       kappa = (x' y'' - y' x'') / (x'^2 + y'^2)^(3/2)    (parametrisation-invariant)
       a_lat = v^2 * kappa          (positive = left-hand corner)
5. G = a / 9.80665, clipped to physically plausible bounds.
6. Estimated brake pressure %: deceleration NOT explained by aero drag / engine
   braking, scaled 0-100 % against a per-race reference (98th percentile).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.signal import savgol_filter

from . import config

KMH_TO_MS = 1 / 3.6


# --------------------------------------------------------------------------
# 1. Resampling
# --------------------------------------------------------------------------
def resample_lap_to_distance(raw: pd.DataFrame, step_m: float = config.TELEMETRY_STEP_M) -> pd.DataFrame:
    """Re-sample one lap of raw telemetry onto a uniform distance grid.

    `raw` columns: t (s since lap start), Speed (km/h), Throttle (0-100), Brake (bool),
    Gear (int), DRS (int code), X, Y (raw position units).
    Distance is integrated from speed (trapezoidal), exactly like FastF1's add_distance.
    """
    raw = raw.sort_values("t").drop_duplicates("t")
    if len(raw) < 20:
        return pd.DataFrame()

    t = raw["t"].to_numpy(float)
    v = raw["Speed"].to_numpy(float) * KMH_TO_MS
    dist = np.concatenate([[0.0], np.cumsum(0.5 * (v[1:] + v[:-1]) * np.diff(t))])
    dist = np.maximum.accumulate(dist)  # guard against float noise
    elapsed = t

    grid = np.arange(0.0, dist[-1], step_m)
    # np.interp needs strictly increasing xp: collapse stationary samples
    uniq = np.concatenate([[True], np.diff(dist) > 1e-6])
    d_u = dist[uniq]

    def lin(col):
        return np.interp(grid, d_u, raw[col].to_numpy(float)[uniq])

    def nearest(col):
        idx = np.clip(np.searchsorted(d_u, grid), 0, len(d_u) - 1)
        return raw[col].to_numpy()[uniq][idx]

    return pd.DataFrame({
        "Distance": grid,
        "ElapsedTime": np.interp(grid, d_u, elapsed[uniq]),
        "Speed": lin("Speed"),
        "Throttle": lin("Throttle"),
        "Brake": nearest("Brake").astype(bool),
        "Gear": nearest("Gear").astype(int),
        "DRS": nearest("DRS").astype(int),
        "X": lin("X") * config.POSITION_UNIT_TO_M,
        "Y": lin("Y") * config.POSITION_UNIT_TO_M,
    })


# --------------------------------------------------------------------------
# 2-5. G-forces
# --------------------------------------------------------------------------
def _savgol(y: np.ndarray, step_m: float, deriv: int = 0) -> np.ndarray:
    """Savitzky-Golay smoothing / differentiation with a window expressed in metres."""
    order = config.SMOOTH_POLYORDER
    win = max(int(round(config.SMOOTH_WINDOW_M / step_m)), order + 2)
    win = min(win, len(y))
    if win % 2 == 0:
        win -= 1
    if win <= order:                       # lap fragment too short to filter
        out = y.astype(float)
        for _ in range(deriv):
            out = np.gradient(out, step_m)
        return out
    return savgol_filter(y, win, order, deriv=deriv, delta=step_m, mode="interp")


def add_g_forces(lap: pd.DataFrame, step_m: float = config.TELEMETRY_STEP_M) -> pd.DataFrame:
    """Append G_Long, G_Lat, G_Total (in g) and Accel_Long_ms2 to a resampled lap."""
    if lap.empty:
        return lap
    lap = lap.copy()
    v = _savgol(lap["Speed"].to_numpy(float) * KMH_TO_MS, step_m)
    v = np.clip(v, 0.0, None)
    dv_ds = _savgol(lap["Speed"].to_numpy(float) * KMH_TO_MS, step_m, deriv=1)
    a_long = v * dv_ds                                              # m/s^2

    x, y = lap["X"].to_numpy(float), lap["Y"].to_numpy(float)
    dx, dy = _savgol(x, step_m, 1), _savgol(y, step_m, 1)
    ddx, ddy = _savgol(x, step_m, 2), _savgol(y, step_m, 2)
    denom = np.power(dx ** 2 + dy ** 2, 1.5)
    kappa = np.divide(dx * ddy - dy * ddx, denom, out=np.zeros_like(denom), where=denom > 1e-9)
    a_lat = v ** 2 * kappa                                          # m/s^2

    lap["Accel_Long_ms2"] = a_long
    lap["G_Long"] = np.clip(a_long / config.G, *config.G_LONG_CLIP)
    lap["G_Lat"] = np.clip(a_lat / config.G, -config.G_LAT_CLIP, config.G_LAT_CLIP)
    lap["G_Total"] = np.hypot(lap["G_Long"], lap["G_Lat"])
    return lap


# --------------------------------------------------------------------------
# 6. Estimated brake pressure
# --------------------------------------------------------------------------
def estimate_drag_k(tel: pd.DataFrame) -> float:
    """Fit a_resist = k * v^2 on coasting samples (no throttle, no brake, > 150 km/h).

    That resistance (aero drag + engine braking) decelerates the car even without
    brakes, so it must be removed before we attribute deceleration to the brakes.
    """
    coast = tel[(tel["Throttle"] < 5) & (~tel["Brake"]) & (tel["Speed"] > 150) & (tel["Accel_Long_ms2"] < 0)]
    if len(coast) < 50:
        return config.DEFAULT_DRAG_K
    v2 = (coast["Speed"] * KMH_TO_MS) ** 2
    k = float(np.median(-coast["Accel_Long_ms2"] / v2))
    return k if 0.0003 < k < 0.004 else config.DEFAULT_DRAG_K


def add_brake_pressure(tel: pd.DataFrame) -> pd.DataFrame:
    """Append BrakeDecel_ms2 and BrakePressurePct (0-100, estimated) for a whole race.

    Call on the concatenated telemetry of ALL drivers of one race, so the 100 %
    reference is shared and drivers are comparable.
    """
    if tel.empty:
        return tel
    tel = tel.copy()
    k = estimate_drag_k(tel)
    v2 = (tel["Speed"] * KMH_TO_MS) ** 2
    brake_decel = np.clip(-tel["Accel_Long_ms2"] - k * v2, 0.0, None)
    brake_decel = np.where(tel["Brake"], brake_decel, 0.0)
    braking = brake_decel[brake_decel > 0]
    ref = np.percentile(braking, config.BRAKE_REF_PERCENTILE) if braking.size > 100 else 5.0 * config.G
    tel["BrakeDecel_ms2"] = brake_decel
    tel["BrakePressurePct"] = np.clip(brake_decel / ref, 0.0, 1.0) * 100.0
    return tel


def drs_open(drs_code: pd.Series) -> pd.Series:
    """F1 DRS channel codes: 10, 12, 14 = flap open; 8 = eligible; 0/1 = closed."""
    return drs_code.isin([10, 12, 14])
