"""Synthetic sanity checks: known motion in -> known G out."""
import numpy as np
import pandas as pd

from etl import physics, tyre_model


def _raw(t, speed_kmh, x_m, y_m, brake=None):
    n = len(t)
    return pd.DataFrame({
        "t": t, "Speed": speed_kmh, "Throttle": np.full(n, 100.0),
        "Brake": np.zeros(n, bool) if brake is None else brake,
        "Gear": np.full(n, 6), "DRS": np.zeros(n, int),
        "X": x_m / 0.1, "Y": y_m / 0.1,          # feed is in decimetres
    })


def test_constant_radius_corner_gives_v2_over_r():
    r, v = 100.0, 50.0                         # 100 m radius at 180 km/h -> 25 m/s^2
    t = np.arange(0, 12, 0.27)                 # ~3.7 Hz like the real feed
    ang = v * t / r                            # counter-clockwise = left turn
    lap = physics.add_g_forces(physics.resample_lap_to_distance(
        _raw(t, np.full_like(t, v * 3.6), r * np.cos(ang), r * np.sin(ang))))
    mid = lap.iloc[len(lap) // 4: 3 * len(lap) // 4]
    assert abs(mid["G_Lat"].median() - v ** 2 / r / 9.80665) < 0.05
    assert abs(mid["G_Long"].median()) < 0.05


def test_straight_line_braking_gives_constant_decel():
    a = -40.0                                  # ~4.1 g
    t = np.arange(0, 1.8, 0.05)
    v = 85.0 + a * t
    s = 85.0 * t + 0.5 * a * t ** 2
    brake = np.ones(len(t), bool)
    lap = physics.add_g_forces(physics.resample_lap_to_distance(_raw(t, v * 3.6, s, np.zeros_like(s), brake), 2.0), 2.0)
    assert abs(lap["G_Long"].iloc[5:-5].median() - a / 9.80665) < 0.15
    assert lap["G_Lat"].abs().max() < 0.05
    lap = physics.add_brake_pressure(lap)
    assert lap["BrakePressurePct"].between(0, 100).all() and lap["BrakePressurePct"].max() > 50


def test_fuel_correction_reveals_tyre_degradation():
    # true tyre deg 0.08 s/lap, hidden by fuel burn (100 kg / 50 laps * 0.033 = 0.066 s/lap gain)
    n = 50
    lapno = np.arange(1, n + 1)
    fuel = 100 - 2.0 * (lapno - 1)
    lt = 90 + 0.08 * (lapno - 1) + fuel * 0.033
    laps = pd.DataFrame({"RaceID": 1, "DriverID": "x", "LapNumber": lapno, "LapTimeSeconds": lt,
                         "IsPitInLap": False, "IsPitOutLap": False, "TyreAge": lapno, "StintKey": "1|x|1"})
    out, _ = tyre_model.build_lap_features(laps, n)
    slope = out["StintDegSlope"].iloc[0]
    assert abs(slope - 0.08) < 0.005, slope
