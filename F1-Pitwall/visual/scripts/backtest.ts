/**
 * Backtest of the live strategy model against what teams actually did.
 * For every real pit stop (not the last-lap / SC-free filter), replay the race to 8 laps
 * before the stop and record the predicted window and plan.  Run: npm run backtest
 */
import { readFileSync } from "node:fs";
import { buildDataset } from "../src/data/buildDataset";
import { FeedRow } from "../src/data/model";
import { normaliseColumnName } from "../src/data/parseDataView";
import { raceStateAt, timeOfLap } from "../src/data/raceEngine";
import { plansAt, strategyAt } from "../src/data/strategy";

const { columns, rows } = JSON.parse(readFileSync("harness/feed.json", "utf8"));
const names = (columns as string[]).map(c => normaliseColumnName(undefined, c));
const ds = buildDataset((rows as unknown[][]).map(r => Object.fromEntries(names.map((n, i) => [n, r[i]])) as FeedRow));

const LEAD = Number(process.argv[2] ?? 8);
let n = 0, inWin = 0, absErr = 0, noStopWrong = 0;
const perRace: Record<string, { n: number; inWin: number; err: number }> = {};
for (const race of ds.races) {
    for (const d of race.drivers) {
        const stops = d.laps.filter(l => l.pitIn && l.lap > LEAD + 2 && l.lap < race.totalLaps - 2);
        for (const stop of stops) {
            const lapAt = stop.lap - LEAD;
            const T = timeOfLap(race, lapAt) + 1;
            const cars = raceStateAt(race, T);
            const focus = cars.find(c => c.driver.id === d.id);
            if (!focus || !focus.current || focus.current.lap !== lapAt && Math.abs(focus.current.lap - lapAt) > 1) continue;
            // skip stops made under neutralisation (SC/VSC): not a pace-driven decision
            const neutral = stop.lapTime !== null && stop.lapTime > 1.25 * (d.fastestLapTime ?? 1e9);
            if (neutral) continue;
            const s = strategyAt(race, cars, focus, T, null);
            const plans = plansAt(race, s, focus.lap);
            if (!plans.length) continue;                       // no deg data / wet: model makes no call
            n++;
            if (plans[0].stops.length === 0) { noStopWrong++; const k0 = `${race.season} ${race.name}`; perRace[k0] ??= { n: 0, inWin: 0, err: 0 }; perRace[k0].n++; perRace[k0].err += 10; absErr += 10; continue; }
            const hit = stop.lap >= (s.windowOpen as number) && stop.lap <= (s.windowClose as number);
            if (hit) inWin++;
            const mid = s.optimalLap as number;
            absErr += Math.abs(stop.lap - mid);
            const k = `${race.season} ${race.name}`;
            perRace[k] ??= { n: 0, inWin: 0, err: 0 };
            perRace[k].n++; perRace[k].inWin += hit ? 1 : 0; perRace[k].err += Math.abs(stop.lap - mid);
        }
    }
}
console.log(`lead ${LEAD} laps · stops evaluated: ${n}`);
console.log(`actual stop inside predicted window: ${((100 * inWin) / n).toFixed(0)}%`);
console.log(`mean |actual - optimum|: ${(absErr / n).toFixed(1)} laps (a wrong "no stop" call counts as 10)`);
console.log(`model said "no more stops" but team stopped: ${((100 * noStopWrong) / n).toFixed(0)}%`);
for (const [k, v] of Object.entries(perRace)) console.log(`  ${k.padEnd(32)} n=${String(v.n).padStart(2)}  in-window ${((100 * v.inWin) / v.n).toFixed(0).padStart(3)}%  err ${(v.err / v.n).toFixed(1)}`);
