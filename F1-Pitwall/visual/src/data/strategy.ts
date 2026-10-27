/**
 * Live strategy model - the TypeScript twin of the DAX measures in the semantic model.
 *
 *  deg rate d  : least-squares slope of fuel-corrected lap time vs tyre age over the clean
 *                laps of the current stint that are COMPLETED at replay time T (>= 5 laps),
 *                else the field's rate on that compound so far in this race.
 *  optimal age : L* = sqrt(2 * pitLoss / d)  - accumulated deg loss d*L^2/2 equals a stop
 *  window      : optimal pit lap +/- max(2, 10 % of L*)
 *  badge       : undercut threat from the car behind + traffic check on the pit exit
 */
import { CarState } from "./raceEngine";
import { Compound, Driver, LapRow, Race } from "./model";

export interface Fit { slope: number; intercept: number; n: number }

export function fitLine(points: { x: number; y: number }[]): Fit | null {
    const n = points.length;
    if (n < 2) return null;
    const mx = points.reduce((s, p) => s + p.x, 0) / n;
    const my = points.reduce((s, p) => s + p.y, 0) / n;
    let sxy = 0, sxx = 0;
    for (const p of points) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; }
    if (sxx === 0) return null;
    const slope = sxy / sxx;
    return { slope, intercept: my - slope * mx, n };
}

const cleanPoints = (laps: LapRow[]) =>
    laps.filter(l => l.clean && l.fuelCorr !== null && l.tyreAge !== null)
        .map(l => ({ x: l.tyreAge as number, y: l.fuelCorr as number }));

export function stintFit(d: Driver, stint: number | null, T: number): Fit | null {
    if (stint === null) return null;
    const pts = cleanPoints(d.laps.filter(l => l.stint === stint && l.end <= T));
    return pts.length >= 5 ? fitLine(pts) : null;
}

export function fieldDegRate(race: Race, compound: Compound, T: number): number | null {
    const slopes: number[] = [];
    for (const d of race.drivers) {
        const stints = new Set(d.laps.filter(l => l.compound === compound && l.end <= T).map(l => l.stint));
        for (const s of stints) {
            const f = stintFit(d, s ?? null, T);
            if (f) slopes.push(f.slope);
        }
    }
    return slopes.length ? slopes.reduce((a, b) => a + b, 0) / slopes.length : null;
}

export type BadgeLevel = "ok" | "warn" | "alert" | "info";

export interface StrategyState {
    stint: number | null;
    compound: Compound;
    tyreAge: number | null;
    stintStartLap: number | null;
    ageAtStintStart: number | null;
    degRate: number | null;
    degSource: "stint" | "field" | "none";
    fit: Fit | null;
    pitLoss: number;
    optimalAge: number | null;
    optimalLap: number | null;
    windowOpen: number | null;
    windowClose: number | null;
    paceDropOff: number | null;
    windowStatus: "pending" | "open" | "overdue" | "no-stop" | "unknown";
    badges: { text: string; level: BadgeLevel }[];
    plans: Plan[];
    mustStop: boolean;      // dry race and only one dry compound used so far (2-compound rule)
    wet: boolean;           // intermediates / wets in use: dry deg model not applicable
}

export function strategyAt(race: Race, cars: CarState[], focus: CarState | undefined, T: number,
                           pitLossOverride: number | null): StrategyState {
    const pitLoss = pitLossOverride ?? race.pitLoss ?? 22;
    const empty: StrategyState = {
        stint: null, compound: "UNKNOWN", tyreAge: null, stintStartLap: null, ageAtStintStart: null,
        degRate: null, degSource: "none", fit: null, pitLoss, optimalAge: null, optimalLap: null,
        windowOpen: null, windowClose: null, paceDropOff: null, windowStatus: "unknown", badges: [],
        plans: [], mustStop: false, wet: false,
    };
    if (!focus) return empty;
    const d = focus.driver;
    const cur = focus.current ?? focus.last;
    if (!cur) return empty;

    const stintLaps = d.laps.filter(l => l.stint === cur.stint);
    const stintStartLap = stintLaps.length ? stintLaps[0].lap : null;
    const ageAtStintStart = stintLaps.length ? stintLaps[0].tyreAge : null;
    const fit = stintFit(d, cur.stint, T);
    let degRate: number | null = null;
    let degSource: StrategyState["degSource"] = "none";
    if (fit && fit.slope > 0.01) { degRate = fit.slope; degSource = "stint"; }
    else {
        const f = fieldDegRate(race, cur.compound, T);
        if (f !== null && f > 0.01) { degRate = f; degSource = "field"; }
    }

    // classic rule of thumb, shown as "opt. age": accumulated deg loss d*L^2/2 equals the pit loss
    const optimalAge = degRate ? Math.sqrt((2 * pitLoss) / degRate) : null;
    const tyreAgeNow = cur.tyreAge ?? null;
    const lapNow = focus.lap;

    // regulations: in a dry race every car must use two different dry compounds
    const WET = new Set(["INTERMEDIATE", "WET"]);
    const wet = WET.has(cur.compound) || race.drivers.some(x => x.laps.some(l => l.end <= T && l.end > T - 600 && WET.has(l.compound)));
    const dryUsed = new Set(d.laps.filter(l => l.start <= T && !WET.has(l.compound) && l.compound !== "UNKNOWN").map(l => l.compound));
    const mustStop = !wet && dryUsed.size < 2;

    // window from a remaining-race optimisation (0 / 1 / 2 more stops), so it respects the flag
    const plans = degRate && !wet ? optimisePlans(degRate, tyreAgeNow ?? 0, pitLoss, lapNow, race.totalLaps, mustStop) : [];
    let windowOpen: number | null = null, windowClose: number | null = null, optimalLap: number | null = null;
    let windowStatus: StrategyState["windowStatus"] = "unknown";
    if (plans.length) {
        const best = plans[0];
        if (best.stops.length === 0) windowStatus = "no-stop";
        else {
            optimalLap = best.stops[0];
            [windowOpen, windowClose] = best.window ?? [optimalLap, optimalLap];
            windowStatus = lapNow >= windowOpen ? "open" : "pending";
        }
    }

    // pace drop-off: last 3 vs first 3 clean laps of the stint (fuel corrected)
    const done = stintLaps.filter(l => l.clean && l.fuelCorr !== null && l.end <= T);
    const avg = (ls: LapRow[]) => ls.reduce((s, l) => s + (l.fuelCorr as number), 0) / ls.length;
    const paceDropOff = done.length >= 6 ? avg(done.slice(-3)) - avg(done.slice(0, 3)) : null;

    // ---------------- badges
    const badges: StrategyState["badges"] = [];
    const behind = cars[focus.pos] as CarState | undefined;   // pos is 1-based -> next index
    const tyreAge = cur.tyreAge ?? null;
    if (focus.status === "FIN" || focus.status === "OUT") {
        badges.push({ text: focus.status === "FIN" ? "CHEQUERED FLAG" : "RETIRED", level: "info" });
    } else {
        // undercut: if the car behind pits now, its fresh tyres gain ~ d * ourTyreAge per lap on us.
        // Over the in/out-lap cycle (~2 laps) minus ~1 s tyre warm-up, can it jump us?
        const undercutGain = degRate !== null && tyreAge !== null ? 2 * degRate * tyreAge - 1.0 : 0;
        const behindAge = behind ? (behind.current ?? behind.last)?.tyreAge ?? null : null;
        const behindAlreadyFresher = behindAge !== null && tyreAge !== null && behindAge < tyreAge - 3;
        if (behind && behind.interval !== null && behind.intervalLapsDown === 0 && behind.status !== "OUT" && !behindAlreadyFresher && undercutGain > 0) {
            if (undercutGain > behind.interval) badges.push({ text: `UNDERCUT THREAT HIGH · ${behind.driver.code} ${behind.interval.toFixed(1)}s`, level: "alert" });
            else if (undercutGain > behind.interval - 1.0) badges.push({ text: `UNDERCUT THREAT MODERATE · ${behind.driver.code}`, level: "warn" });
            else badges.push({ text: "UNDERCUT THREAT MINIMAL", level: "ok" });
        } else {
            badges.push({ text: "UNDERCUT THREAT MINIMAL", level: "ok" });
        }
        // pit exit: where would we rejoin if we boxed now?
        const myGap = focus.pos === 1 ? 0 : focus.gapToLeader;
        if (myGap !== null && focus.lapsDown === 0) {
            const rejoin = myGap + pitLoss;
            const traffic = cars.filter(c => c !== focus && c.status !== "OUT" && c.lapsDown === 0 &&
                (c.pos === 1 ? 0 : c.gapToLeader ?? NaN) > myGap)
                .map(c => ({ c, gap: (c.pos === 1 ? 0 : (c.gapToLeader as number)) - rejoin }))
                .filter(o => Math.abs(o.gap) < 1.5)
                .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
            const rejoinPos = 1 + cars.filter(c => c !== focus && c.status !== "OUT" && c.lapsDown === 0 &&
                (c.pos === 1 ? 0 : c.gapToLeader ?? Infinity) < rejoin).length;
            if (traffic.length) badges.push({ text: `TRAFFIC ON EXIT · ${traffic[0].c.driver.code} ${traffic[0].gap >= 0 ? "+" : ""}${traffic[0].gap.toFixed(1)}s · P${rejoinPos}`, level: "warn" });
            else badges.push({ text: `CLEAN EXIT GAP · REJOIN P${rejoinPos}`, level: "ok" });
        }
        if (wet) badges.push({ text: "WET / MIXED CONDITIONS · DRY MODEL PAUSED", level: "info" });
        else if (optimalLap !== null && optimalLap <= lapNow + 1) badges.push({ text: "BOX BOX · THIS LAP", level: "alert" });
        else if (windowStatus === "open") badges.push({ text: "PIT WINDOW OPEN", level: "warn" });
        if (windowStatus === "no-stop") badges.push({ text: "TYRES MAKE THE FLAG", level: "ok" });
        if (mustStop && !wet) badges.push({ text: "2ND COMPOUND STILL REQUIRED", level: "info" });
    }

    return {
        stint: cur.stint, compound: cur.compound, tyreAge, stintStartLap, ageAtStintStart, degRate, degSource,
        fit, pitLoss, optimalAge, optimalLap, windowOpen, windowClose, paceDropOff, windowStatus, badges,
        plans, mustStop, wet,
    };
}

// =====================================================================================
// Plans, tyre life and engineer calls (used by the pit-window panel, race order and Lambiase card)
// =====================================================================================

export interface Plan { label: string; stops: number[]; cost: number; delta: number; window?: [number, number] }

/**
 * Remaining-race time cost (s, relative) of 0, 1 or 2 more stops with linear degradation d:
 *   running n laps on a set that starts at age a costs d * sum_{i=1..n}(a + i); a new set starts at age 0.
 * Stop laps are searched exhaustively (R <= ~78 laps -> at most ~3k combinations).
 * The pit window of a plan = every first-stop lap whose total cost stays within WINDOW_TOL of the optimum.
 */
const WINDOW_TOL = 1.0;
export function optimisePlans(d: number, a: number, P: number, lapNow: number, total: number, mustStop: boolean): Plan[] {
    const R = total - lapNow;
    if (R < 1) return [];
    const run = (age0: number, n: number) => d * (n * age0 + (n * (n + 1)) / 2);
    const plans: Plan[] = [];
    if (!mustStop) plans.push({ label: "NO STOP", stops: [], cost: run(a, R), delta: 0 });
    if (R >= 2) {
        const c1 = (k: number) => run(a, k) + P + run(0, R - k);
        let kBest = 1;
        for (let k = 1; k < R; k++) if (c1(k) < c1(kBest)) kBest = k;
        let lo = kBest, hi = kBest;
        while (lo > 1 && c1(lo - 1) <= c1(kBest) + WINDOW_TOL) lo--;
        while (hi < R - 1 && c1(hi + 1) <= c1(kBest) + WINDOW_TOL) hi++;
        plans.push({ label: "1 STOP", stops: [lapNow + kBest], cost: c1(kBest), delta: 0, window: [lapNow + lo, lapNow + hi] });
    }
    if (R >= 6) {
        const c2 = (k1: number, k2: number) => run(a, k1) + 2 * P + run(0, k2 - k1) + run(0, R - k2);
        let b1 = 1, b2 = 2;
        for (let k1 = 1; k1 < R - 1; k1++) for (let k2 = k1 + 1; k2 < R; k2++) if (c2(k1, k2) < c2(b1, b2)) { b1 = k1; b2 = k2; }
        let lo = b1, hi = b1;
        while (lo > 1 && c2(lo - 1, b2) <= c2(b1, b2) + WINDOW_TOL) lo--;
        while (hi < b2 - 1 && c2(hi + 1, b2) <= c2(b1, b2) + WINDOW_TOL) hi++;
        plans.push({ label: "2 STOPS", stops: [lapNow + b1, lapNow + b2], cost: c2(b1, b2), delta: 0, window: [lapNow + lo, lapNow + hi] });
    }
    plans.sort((x, y) => x.cost - y.cost);
    plans.forEach(p => { p.delta = p.cost - plans[0].cost; });
    return plans;
}

/** Plans computed by strategyAt (kept as a function for the components). */
export function plansAt(_race: Race, s: StrategyState, _lapNow: number): Plan[] {
    return s.plans;
}

/** Expected life of a set (laps) = optimal tyre age for that compound's deg rate, else a compound default. */
const DEFAULT_LIFE: Record<string, number> = { SOFT: 18, MEDIUM: 28, HARD: 38, INTERMEDIATE: 25, WET: 30, UNKNOWN: 25 };
export function expectedLife(race: Race, compound: Compound, T: number, pitLoss: number): number {
    const d = fieldDegRate(race, compound, T);
    const life = d && d > 0.01 ? Math.sqrt((2 * pitLoss) / d) : DEFAULT_LIFE[compound];
    return Math.max(8, Math.min(60, Math.round(life)));
}

/** Time lost to tyre degradation in the current stint so far (s): sum of fuel-corrected loss vs baseline. */
export function stintDegLoss(d: Driver, stint: number | null, T: number): number | null {
    if (stint === null) return null;
    const laps = d.laps.filter(l => l.stint === stint && l.end <= T && l.clean && l.degPct !== null && l.fuelCorr !== null);
    if (!laps.length) return null;
    return laps.reduce((sum, l) => sum + Math.max(0, (l.fuelCorr as number) * (l.degPct as number) / (100 + (l.degPct as number))), 0);
}

/** Next compound a strategist would pick for the remaining distance. */
export function nextCompound(lapsRemaining: number): Compound {
    return lapsRemaining > 26 ? "HARD" : lapsRemaining > 14 ? "MEDIUM" : "SOFT";
}

export interface EngineerCall { text: string; tone: "primary" | "plan" | "watch" }

export function engineerCalls(race: Race, cars: CarState[], focus: CarState | undefined, s: StrategyState, plans: Plan[]): EngineerCall[] {
    if (!focus) return [];
    if (focus.status === "FIN") return [{ text: "Chequered flag", tone: "primary" }, { text: `Finished P${focus.pos}`, tone: "plan" }, { text: "Debrief in 10", tone: "watch" }];
    const calls: EngineerCall[] = [];
    const best = plans[0];
    if (best && best.stops.length) {
        const nxt = nextCompound(race.totalLaps - best.stops[0]);
        calls.push({ text: `Target L${best.stops[0]} for ${nxt[0]}`, tone: "primary" });
    } else if (best) {
        calls.push({ text: "Stay out · tyres to the flag", tone: "primary" });
    } else if (s.optimalLap !== null && s.optimalLap <= race.totalLaps) {
        calls.push({ text: `Target L${s.optimalLap}`, tone: "primary" });
    } else calls.push({ text: "Push · build the gap", tone: "primary" });
    if (best) {
        const alt = plans[1];
        calls.push({ text: `Plan A: ${best.label.toLowerCase()}${alt ? ` · ${alt.delta.toFixed(1)}s faster than ${alt.label.toLowerCase()}` : ""}`, tone: "plan" });
    }
    const behind = cars[focus.pos], ahead = cars[focus.pos - 2];
    if (behind && behind.interval !== null && behind.interval < 1.2 && behind.intervalLapsDown === 0) calls.push({ text: `Defend · ${behind.driver.code} +${behind.interval.toFixed(1)}s`, tone: "watch" });
    else if (ahead && focus.interval !== null && focus.interval < 1.5 && focus.intervalLapsDown === 0) calls.push({ text: `Attack ${ahead.driver.code} · DRS`, tone: "watch" });
    else if (behind) calls.push({ text: `Watch P${behind.pos} pace (${behind.driver.code})`, tone: "watch" });
    else calls.push({ text: "Manage the gap", tone: "watch" });
    return calls;
}
