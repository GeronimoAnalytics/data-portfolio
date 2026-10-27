import { Compound, Dataset, Driver, FeedRow, LapRow, Race, TelSample } from "./model";
import { teamColor } from "./teamColors";

const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const COMPOUNDS = new Set(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]);
const toCompound = (v: unknown): Compound => {
    const s = str(v).toUpperCase();
    return (COMPOUNDS.has(s) ? s : "UNKNOWN") as Compound;
};

function interp(x: number, xs: number[], ys: number[]): number {
    if (xs.length === 0) return 0;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (xs[mid] <= x) lo = mid; else hi = mid;
    }
    const f = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
    return ys[lo] + f * (ys[hi] - ys[lo]);
}
export { interp };

/** Fold the flat multi-grain feed (RecordType L / T) into races -> drivers -> laps / telemetry. */
export function buildDataset(rows: FeedRow[]): Dataset {
    const raceMap = new Map<number, { meta: FeedRow; drivers: Map<string, Driver> }>();

    for (const r of rows) {
        const raceId = num(r.raceid);
        const driverId = str(r.driverid);
        if (raceId === null || !driverId) continue;

        let race = raceMap.get(raceId);
        if (!race) { race = { meta: r, drivers: new Map() }; raceMap.set(raceId, race); }

        let drv = race.drivers.get(driverId);
        if (!drv) {
            const cid = str(r.constructorid);
            drv = {
                id: driverId, code: str(r.code) || driverId.slice(0, 3).toUpperCase(), name: str(r.drivername),
                constructorId: cid, color: teamColor(cid), grid: null, classified: "",
                laps: [], tel: [], fastestLapNo: null, fastestLapTime: null,
            };
            race.drivers.set(driverId, drv);
        }

        if (str(r.recordtype) === "T") {
            const d = num(r.distance), x = num(r.x), y = num(r.y);
            if (d === null || x === null || y === null) continue;
            drv.tel.push({
                d, x, y, t: num(r.elapsed) ?? 0, speed: num(r.speed) ?? 0, throttle: num(r.throttle) ?? 0,
                brake: num(r.brake) ?? 0, brakePct: num(r.brakepct) ?? 0, gear: num(r.gear) ?? 0,
                drs: num(r.drs) ?? 0, gLong: num(r.glong) ?? 0, gLat: num(r.glat) ?? 0,
            });
            drv.fastestLapNo = num(r.lapnumber);
        } else {
            const lap = num(r.lapnumber), start = num(r.lapstart);
            if (lap === null || start === null) continue;
            if (drv.grid === null) drv.grid = num(r.grid);
            if (!drv.classified) drv.classified = str(r.classified);
            drv.laps.push({
                lap, start, end: NaN, lapTime: num(r.laptime), s1: num(r.s1), s2: num(r.s2), s3: num(r.s3),
                compound: toCompound(r.compound), tyreAge: num(r.tyreage), stint: num(r.stint),
                pitIn: num(r.pitin) === 1, pitOut: num(r.pitout) === 1, clean: num(r.clean) === 1,
                fuelKg: num(r.fuelkg), fuelCorr: num(r.fuelcorrlap), degPct: num(r.degpct),
            });
        }
    }

    const races: Race[] = [];
    for (const [id, { meta, drivers }] of raceMap) {
        const list = [...drivers.values()].filter(d => d.laps.length > 0);
        if (list.length === 0) continue;
        const allLapTimes = list.flatMap(d => d.laps.map(l => l.lapTime).filter((t): t is number => t !== null));
        const medianLap = allLapTimes.sort((a, b) => a - b)[Math.floor(allLapTimes.length / 2)] ?? 90;
        const best: [number, number, number] = [Infinity, Infinity, Infinity];

        for (const d of list) {
            d.laps.sort((a, b) => a.lap - b.lap);
            d.tel.sort((a, b) => a.d - b.d);
            d.laps.forEach((l, i) => {
                const next = d.laps[i + 1];
                l.end = next ? next.start : l.start + (l.lapTime ?? medianLap);
                [l.s1, l.s2, l.s3].forEach((s, k) => { if (s !== null && s > 0 && s < best[k]) best[k] = s; });
            });
            const timed = d.laps.filter(l => l.lapTime !== null && !l.pitIn && !l.pitOut);
            const fl = timed.reduce<LapRow | null>((m, l) => (m === null || l.lapTime! < m.lapTime! ? l : m), null);
            d.fastestLapTime = fl?.lapTime ?? null;
            if (d.fastestLapNo === null) d.fastestLapNo = fl?.lap ?? null;
        }

        // reference lap = quickest lap that has telemetry
        const withTel = list.filter(d => d.tel.length > 20 && d.fastestLapTime !== null)
            .sort((a, b) => a.fastestLapTime! - b.fastestLapTime!);
        const ref = withTel[0];
        const track: TelSample[] = ref ? ref.tel : [];
        const lapT = track.length ? track[track.length - 1].t : 1;
        const refFrac = track.map(s => s.t / lapT);
        const refDist = track.map(s => s.d);
        let sectorDist: [number, number] = [0, 0];
        if (ref) {
            const flap = ref.laps.find(l => l.lap === ref.fastestLapNo);
            const ts = track.map(s => s.t);
            if (flap?.s1 && flap?.s2) sectorDist = [interp(flap.s1, ts, refDist), interp(flap.s1 + flap.s2, ts, refDist)];
            else sectorDist = [refDist[refDist.length - 1] / 3, (2 * refDist[refDist.length - 1]) / 3];
        }

        races.push({
            id, season: num(meta.season) ?? Math.floor(id / 100), round: num(meta.round) ?? id % 100,
            name: str(meta.racename), circuit: str(meta.circuit),
            totalLaps: num(meta.totallaps) ?? Math.max(...list.map(d => d.laps.length)),
            pitLoss: num(meta.pitloss) ?? 22,
            drivers: list, track, trackLength: refDist[refDist.length - 1] ?? 0, refFrac, refDist, sectorDist,
            raceEnd: Math.max(...list.map(d => d.laps[d.laps.length - 1].end)),
            bestSector: best,
        });
    }
    races.sort((a, b) => a.id - b.id);
    return { races, rowCount: rows.length };
}
