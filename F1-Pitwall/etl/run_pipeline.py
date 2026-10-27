"""CLI entry point.

    python -m etl.run_pipeline                       # all seasons from config
    python -m etl.run_pipeline --seasons 2024 --rounds 1 2 3
    python -m etl.run_pipeline --build-only          # re-assemble star from staging
    python -m etl.run_pipeline --force               # re-stage races already staged
"""
from __future__ import annotations

import argparse
import logging
import time

from . import config
from .build_star_schema import build_star, load_jolpica, stage_race

log = logging.getLogger("pitwall")


def main() -> None:
    ap = argparse.ArgumentParser(description="F1 Pit Wall ETL")
    ap.add_argument("--seasons", type=int, nargs="+", default=config.SEASONS)
    ap.add_argument("--rounds", type=int, nargs="+", help="limit to these rounds (all seasons)")
    ap.add_argument("--build-only", action="store_true")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    for noisy in ("fastf1", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    t0 = time.time()
    j = load_jolpica(args.seasons)

    if not args.build_only:
        races = j["races"]
        if args.rounds:
            races = races[races["Round"].isin(args.rounds)]
        for r in races.sort_values(["Season", "Round"]).itertuples(index=False):
            try:
                stage_race(r.Season, r.Round, r.EventDate, j["results"], force=args.force)
            except Exception:  # one broken race must not kill a 3-season run
                log.exception("Failed to stage %s R%s - continuing", r.Season, r.Round)

    build_star(j)
    log.info("Done in %.1f min -> %s", (time.time() - t0) / 60, config.STAR_DIR)


if __name__ == "__main__":
    main()
