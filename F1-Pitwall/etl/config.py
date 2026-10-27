"""Central configuration for the F1 Pit Wall ETL.

Every tunable lives here so the pipeline itself stays free of magic numbers.
Values can be overridden with environment variables (see README).
"""
from __future__ import annotations

import os
from pathlib import Path

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------
ROOT_DIR = Path(os.environ.get("F1_PITWALL_ROOT", Path(__file__).resolve().parents[1]))
DATA_DIR = ROOT_DIR / "data"
CACHE_DIR = DATA_DIR / "cache"        # raw HTTP responses (JSON), safe to delete
STAGING_DIR = DATA_DIR / "staging"    # one folder per race, rebuilt incrementally
STAR_DIR = DATA_DIR / "star"          # final star-schema tables -> Power BI reads this

# --------------------------------------------------------------------------
# Scope
# --------------------------------------------------------------------------
SEASONS: list[int] = [int(s) for s in os.environ.get("F1_SEASONS", "2023,2024,2025").split(",")]

# Telemetry volume control.
#   "fastest" -> only each driver's fastest lap per race   (~0.7M rows for 3 seasons)
#   "all"     -> every timed lap                            (~20-40M rows, use a bigger step)
TELEMETRY_SCOPE = os.environ.get("F1_TELEMETRY_SCOPE", "fastest")
TELEMETRY_STEP_M = float(os.environ.get("F1_TELEMETRY_STEP_M", "10"))  # distance grid resolution

# Output formats written to STAR_DIR. Power BI model reads Parquet.
WRITE_PARQUET = True
WRITE_CSV = os.environ.get("F1_WRITE_CSV", "0") == "1"

# --------------------------------------------------------------------------
# Data sources
# --------------------------------------------------------------------------
JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1"
OPENF1_BASE = "https://api.openf1.org/v1"

# Polite throttling (free tiers): jolpica ~4 req/s & 500 req/h, OpenF1 ~3 req/s & 30 req/min.
JOLPICA_MIN_INTERVAL_S = 0.8
OPENF1_MIN_INTERVAL_S = 2.1
HTTP_MAX_RETRIES = 6

# "openf1" (free, default) or "fastf1" (requires an F1TV subscription since FastF1 3.9:
# set F1_USERNAME / F1_PASSWORD).
LAP_SOURCE = os.environ.get("F1_LAP_SOURCE", "openf1")

# --------------------------------------------------------------------------
# Physics constants
# --------------------------------------------------------------------------
G = 9.80665                      # m/s^2
POSITION_UNIT_TO_M = 0.1         # F1 position feed X/Y/Z are in decimetres
SMOOTH_WINDOW_M = 90.0           # Savitzky-Golay window length (in metres) for v, x, y
SMOOTH_POLYORDER = 3
G_LAT_CLIP = 6.5                 # |G_Lat| physical sanity bound
G_LONG_CLIP = (-6.5, 3.0)        # braking .. traction-limited acceleration
DEFAULT_DRAG_K = 0.0014          # a_drag = k * v^2  (≈1 g at 300 km/h) if it can't be fitted
BRAKE_REF_PERCENTILE = 98.0      # per-race percentile of brake decel that maps to 100 %

# --------------------------------------------------------------------------
# Tyre / fuel model
# --------------------------------------------------------------------------
START_FUEL_KG = 100.0            # typical race start load (max allowed 110 kg)
FUEL_EFFECT_S_PER_KG = 0.033     # lap-time sensitivity to fuel mass
REPRESENTATIVE_PCT = 1.07        # lap <= 107 % of the driver's median green lap
NEUTRALISED_PCT = 1.10           # field median for a lap > 110 % of race median => SC/VSC/red lap
MIN_STINT_LAPS_FOR_FIT = 5

for _p in (CACHE_DIR, STAGING_DIR, STAR_DIR):
    _p.mkdir(parents=True, exist_ok=True)
