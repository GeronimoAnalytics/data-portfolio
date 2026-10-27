/**
 * Race replay engine: given a race and a replay clock T (seconds since lights-out),
 * reconstruct what a timing screen would show at that instant.
 *
 * Gaps are measured like official timing: at the last timing line each car crossed
 * (finish line, sector 1 and sector 2 lines), compare its crossing time with the
 * leader's / car-ahead's crossing time of that same line.
 */
import { interp } from "./buildDataset";
import { Driver, LapRow, Race } from "./model";

export type CarStatus = "RUN" | "PIT" | "FIN" | "OUT" | "GRID";
export type SectorColor = "purple" | "green" | "yellow" | "none";

export interface SectorCell { color: SectorColor; time: number | null; live: boolean }

export interface CarState {
    driver: Driver;
    pos: number;
    status: CarStatus;
    completed: number;          // laps completed
    lap: number;                // lap currently being driven (1-based)
    frac: number;               // fraction of current lap
    progress: number;           // completed + frac
    distOnLap: number;
    x: number | null;
    y: number | null;
    pointIdx: number;           // index of last timing line crossed (3 per lap)
    pointTime: number;          // when it was crossed
    gapToLeader: number | null;
    interval: number | null;
    lapsDown: number;
    intervalLapsDown: number;
    current: LapRow | null;
    last: LapRow | null;
    sectors: SectorCell[];
    pits: number;
}

/** time fractions of the lap at the sector lines, from the reference lap */
export function sectorFractions(race: Race): [number, number] {
    const f1 = interp(race.sectorDist[0], race.refDist, race.refFrac);
    const f2 = interp(race.sectorDist[1], race.refDist, race.refFrac);
    return [f1 || 1 / 3, f2 || 2 / 3];
}

/** absolute times at which a lap crosses the start, S1 and S2 lines */
export function timingPoints(l: LapRow, sf: [number, number]): [number, number, number] {
    const dur = l.end - l.start;
    const t1 = l.s1 && l.s1 < dur ? l.start + l.s1 : l.start + dur * sf[0];
    const t2 = l.s1 && l.s2 && l.s1 + l.s2 < dur ? l.start + l.s1 + l.s2 : l.start + dur * sf[1];
    return [l.start, t1, t2];
}

function lapIndexAt(d: Driver, T: number): number {
    // index of the lap whose [start, end) contains T, -1 before start, laps.length after the end
    const laps = d.laps;
    if (T < laps[0].start) return -1;
    if (T >= laps[laps.length - 1].end) return laps.length;
    let lo = 0, hi = laps.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (laps[mid].start <= T) lo = mid; else hi = mid - 1;
    }
    return lo;
}

/** car position on the reference lap for a given lap fraction */
const xyCache = new WeakMap<Race, { xs: number[]; ys: number[] }>();
export function trackArrays(race: Race): { xs: number[]; ys: number[] } {
    let c = xyCache.get(race);
    if (!c) { c = { xs: race.track.map(s => s.x), ys: race.track.map(s => s.y) }; xyCache.set(race, c); }
    return c;
}

export function trackXY(race: Race, frac: number): { d: number; x: number; y: number } | null {
    if (race.track.length < 2) return null;
    const d = interp(frac, race.refFrac, race.refDist);
    const { xs, ys } = trackArrays(race);
    return { d, x: interp(d, race.refDist, xs), y: interp(d, race.refDist, ys) };
}

function isClassified(status: string): boolean {
    const s = status.toLowerCase();
    return s === "" || s.includes("finished") || s.startsWith("+") || s.includes("lap");
}

export function raceStateAt(race: Race, T: number): CarState[] {
    const sf = sectorFractions(race);

    // ---------- session-best and personal-best sectors up to T (for purple / green)
    const sessionBest = [Infinity, Infinity, Infinity];
    const personalBest = new Map<string, number[]>();
    for (const d of race.drivers) {
        const pb = [Infinity, Infinity, Infinity];
        for (const l of d.laps) {
            const tp = timingPoints(l, sf);
            const ends = [tp[1], tp[2], l.end];
            [l.s1, l.s2, l.s3].forEach((s, k) => {
                if (s !== null && s > 0 && ends[k] <= T) {
                    if (s < pb[k]) pb[k] = s;
                    if (s < sessionBest[k]) sessionBest[k] = s;
                }
            });
        }
        personalBest.set(d.id, pb);
    }
    const colorOf = (driverId: string, k: number, s: number | null): SectorColor => {
        if (s === null || s <= 0) return "none";
        if (s <= sessionBest[k] + 1e-6) return "purple";
        if (s <= (personalBest.get(driverId)?.[k] ?? Infinity) + 1e-6) return "green";
        return "yellow";
    };

    // ---------- per car
    const cars: CarState[] = race.drivers.map(d => {
        const idx = lapIndexAt(d, T);
        const finishedAll = idx >= d.laps.length;
        const current = idx >= 0 && !finishedAll ? d.laps[idx] : null;
        const completed = idx < 0 ? 0 : finishedAll ? d.laps.length : idx;
        const last = completed > 0 ? d.laps[completed - 1] : null;
        const frac = current ? Math.min(1, Math.max(0, (T - current.start) / (current.end - current.start))) : 0;

        let status: CarStatus = idx < 0 ? "GRID" : "RUN";
        if (finishedAll) status = isClassified(d.classified) ? "FIN" : "OUT";
        else if (current && ((current.pitIn && frac > 0.86) || (current.pitOut && frac < 0.12))) status = "PIT";

        // last timing line crossed
        let pointIdx = -1, pointTime = 0;
        if (current) {
            const tp = timingPoints(current, sf);
            const k = T >= tp[2] ? 2 : T >= tp[1] ? 1 : 0;
            pointIdx = idx * 3 + k;
            pointTime = tp[k];
        } else if (finishedAll) {
            pointIdx = d.laps.length * 3;
            pointTime = d.laps[d.laps.length - 1].end;
        }

        // sector cells: this lap's completed sectors live, otherwise previous lap's (dimmed)
        const sectors: SectorCell[] = [0, 1, 2].map(k => {
            const secs = (l: LapRow) => [l.s1, l.s2, l.s3][k];
            if (current) {
                const tp = timingPoints(current, sf);
                const ends = [tp[1], tp[2], current.end];
                if (T >= ends[k]) return { color: colorOf(d.id, k, secs(current)), time: secs(current), live: true };
            }
            if (last) return { color: colorOf(d.id, k, secs(last)), time: secs(last), live: false };
            return { color: "none", time: null, live: false };
        });

        const pos = current ? trackXY(race, frac) : null;
        const pits = d.laps.filter(l => l.pitIn && l.end <= T).length;
        return {
            driver: d, pos: 0, status, completed, lap: current ? current.lap : completed, frac,
            progress: completed + frac, distOnLap: pos?.d ?? 0,
            x: pos ? pos.x : null,
            y: pos ? pos.y : null,
            pointIdx, pointTime, gapToLeader: null, interval: null, lapsDown: 0, intervalLapsDown: 0,
            current, last, sectors, pits,
        };
    });

    // ---------- order: running / finished by progress, retired at the bottom
    cars.sort((a, b) => {
        const ra = a.status === "OUT" ? 1 : 0, rb = b.status === "OUT" ? 1 : 0;
        if (ra !== rb) return ra - rb;
        if (a.status === "GRID" && b.status === "GRID") return (a.driver.grid ?? 99) - (b.driver.grid ?? 99);
        if (b.pointIdx !== a.pointIdx) return b.pointIdx - a.pointIdx;
        if (a.pointTime !== b.pointTime) return a.pointTime - b.pointTime;
        return b.progress - a.progress;
    });

    // ---------- gaps at the timing lines
    const leader = cars[0];
    const crossing = (c: CarState, point: number): number | null => {
        const lapIdx = Math.floor(point / 3), k = point % 3;
        const l = c.driver.laps[lapIdx];
        if (!l) return point === c.driver.laps.length * 3 ? c.driver.laps[lapIdx - 1]?.end ?? null : null;
        return timingPoints(l, sf)[k];
    };
    cars.forEach((c, i) => {
        c.pos = i + 1;
        if (i === 0 || c.pointIdx < 0) return;
        const vsLeader = leader.pointIdx - c.pointIdx;
        c.lapsDown = Math.floor(vsLeader / 3);
        const lt = crossing(leader, c.pointIdx);
        c.gapToLeader = lt !== null ? c.pointTime - lt : null;
        const ahead = cars[i - 1];
        c.intervalLapsDown = Math.floor((ahead.pointIdx - c.pointIdx) / 3);
        const at = crossing(ahead, c.pointIdx);
        c.interval = at !== null ? c.pointTime - at : null;
    });
    return cars;
}

/** Lap number shown on the timing screen (leader's lap). */
export function leaderLap(cars: CarState[], totalLaps: number): number {
    const l = cars[0];
    if (!l) return 0;
    return Math.min(totalLaps, Math.max(1, l.status === "FIN" ? totalLaps : l.lap));
}

/** Replay clock at which the race leader starts lap n. */
export function timeOfLap(race: Race, n: number): number {
    let t = Infinity;
    for (const d of race.drivers) {
        const l = d.laps.find(x => x.lap === n);
        if (l && l.start < t) t = l.start;
    }
    return Number.isFinite(t) ? t + 0.001 : 0;
}

export function fmtGap(s: number | null, lapsDown = 0): string {
    if (lapsDown > 0) return `+${lapsDown} LAP${lapsDown > 1 ? "S" : ""}`;
    if (s === null || !Number.isFinite(s)) return "—";
    return `+${s.toFixed(s < 100 ? 3 : 1)}`;
}

export function fmtLap(s: number | null): string {
    if (s === null || !Number.isFinite(s)) return "—";
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return `${m}:${r.toFixed(3).padStart(6, "0")}`;
}

export function fmtClock(s: number): string {
    const t = Math.max(0, s);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = Math.floor(t % 60);
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** Lightweight per-frame variant of raceStateAt: only on-track coordinates (for 60 fps animation). */
export function carPositionsAt(race: Race, T: number): { driver: Driver; x: number; y: number; pit: boolean }[] {
    const out: { driver: Driver; x: number; y: number; pit: boolean }[] = [];
    for (const d of race.drivers) {
        const idx = lapIndexAt(d, T);
        if (idx >= d.laps.length) continue;                    // finished / retired: off track
        const l = idx < 0 ? null : d.laps[idx];
        const frac = l ? Math.min(1, Math.max(0, (T - l.start) / (l.end - l.start))) : 0;
        const p = trackXY(race, frac);
        if (!p) continue;
        const pit = !!l && ((l.pitIn && frac > 0.86) || (l.pitOut && frac < 0.12));
        out.push({ driver: d, x: p.x, y: p.y, pit });
    }
    return out;
}
