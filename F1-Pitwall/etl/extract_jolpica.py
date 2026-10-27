"""Extract master data + official race results from the Jolpica (Ergast-compatible) API.

Jolpica is the system of record for IDs: its driverId / constructorId / circuitId
strings are used as the natural keys of every dimension in the star schema.
"""
from __future__ import annotations

import logging

import pandas as pd

from .http_client import jolpica

log = logging.getLogger(__name__)
PAGE = 100


def _paginate(path: str, table_key: str, item_key: str) -> list[dict]:
    """Walk Ergast-style pagination and return the concatenated item list.

    For race-nested resources (results, pitstops) `item_key` is the key of the
    *Races* list; caller flattens. Races split over two pages are merged by round.
    """
    offset, items = 0, []
    while True:
        mr = jolpica.get(path, {"limit": PAGE, "offset": offset})["MRData"]
        items.extend(mr[table_key][item_key])
        offset += PAGE
        if offset >= int(mr["total"]):
            return items


def races(season: int) -> pd.DataFrame:
    rows = []
    for r in _paginate(f"{season}.json", "RaceTable", "Races"):
        c = r["Circuit"]
        rows.append({
            "Season": int(r["season"]),
            "Round": int(r["round"]),
            "RaceName": r["raceName"],
            "EventDate": pd.to_datetime(r["date"]).date(),
            "CircuitID": c["circuitId"],
            "CircuitName": c["circuitName"],
            "Location": c["Location"]["locality"],
            "Country": c["Location"]["country"],
            "Latitude": float(c["Location"]["lat"]),
            "Longitude": float(c["Location"]["long"]),
        })
    return pd.DataFrame(rows)


def drivers(season: int) -> pd.DataFrame:
    rows = [{
        "DriverID": d["driverId"],
        "PermanentNumber": int(d["permanentNumber"]) if d.get("permanentNumber") else None,
        "Code": d.get("code"),
        "DriverName": f'{d["givenName"]} {d["familyName"]}',
        "Nationality": d.get("nationality"),
        "DateOfBirth": d.get("dateOfBirth"),
    } for d in _paginate(f"{season}/drivers.json", "DriverTable", "Drivers")]
    return pd.DataFrame(rows)


def constructors(season: int) -> pd.DataFrame:
    rows = [{
        "ConstructorID": c["constructorId"],
        "Name": c["name"],
        "Nationality": c.get("nationality"),
    } for c in _paginate(f"{season}/constructors.json", "ConstructorTable", "Constructors")]
    return pd.DataFrame(rows)


def results(season: int) -> pd.DataFrame:
    """Grand Prix results (sprints excluded). One row per driver per race."""
    rows = []
    for race in _paginate(f"{season}/results.json", "RaceTable", "Races"):
        rnd = int(race["round"])
        for res in race["Results"]:
            rows.append({
                "Season": season,
                "Round": rnd,
                "CarNumber": int(res["number"]),
                "DriverID": res["Driver"]["driverId"],
                "ConstructorID": res["Constructor"]["constructorId"],
                "GridPosition": int(res["grid"]),
                "FinalPosition": int(res["position"]),
                "PositionText": res["positionText"],   # "R", "D", "W" for non-classified
                "Points": float(res["points"]),
                "Status": res["status"],
                "LapsCompleted": int(res["laps"]),
            })
    return pd.DataFrame(rows)


def pit_stop_counts(season: int, rnd: int) -> pd.DataFrame:
    stops = []
    for race in _paginate(f"{season}/{rnd}/pitstops.json", "RaceTable", "Races"):
        stops.extend(race.get("PitStops", []))
    if not stops:
        return pd.DataFrame(columns=["DriverID", "PitStopsCount"])
    df = pd.DataFrame(stops)
    return (df.groupby("driverId").size().rename("PitStopsCount")
              .reset_index().rename(columns={"driverId": "DriverID"}))


def extract_season(season: int) -> dict[str, pd.DataFrame]:
    log.info("Jolpica: season %s", season)
    race_df = races(season)
    res_df = results(season)
    done_rounds = sorted(res_df["Round"].unique()) if not res_df.empty else []
    pits = []
    for rnd in done_rounds:
        p = pit_stop_counts(season, rnd)
        p["Season"], p["Round"] = season, rnd
        pits.append(p)
    pit_df = pd.concat(pits, ignore_index=True) if pits else pd.DataFrame()
    return {
        "races": race_df[race_df["Round"].isin(done_rounds)],
        "drivers": drivers(season),
        "constructors": constructors(season),
        "results": res_df,
        "pitstops": pit_df,
    }
