/**
 * Race-level charts built on LineChart:
 *   TyreWearChart  - fuel-corrected tyre loss per lap, focus vs rival (compound-coloured dots)
 *   PaceChart      - lap times focus vs rival
 *   PositionChart  - classic lap chart: running position of every car per lap
 * All of them only show laps completed at replay time T (no spoilers).
 */
import * as React from "react";
import { Driver, Race } from "../../data/model";
import { COMPOUND_COLORS, PALETTE } from "../../data/teamColors";
import { LineChart, Series } from "./LineChart";

const lapTick = (v: number) => `L${Math.round(v)}`;

export const TyreWearChart: React.FC<{ race: Race; a?: Driver; b?: Driver; t: number; window?: [number, number] | null }> = p => {
    const toSeries = (d: Driver | undefined, color: string, id: string): Series => ({
        id, color, glow: true, dots: true, width: 2,
        points: (d?.laps ?? []).filter(l => l.end <= p.t && l.clean && l.degPct !== null && l.fuelCorr !== null)
            .map(l => ({ x: l.lap, y: ((l.fuelCorr as number) * (l.degPct as number)) / (100 + (l.degPct as number)), dot: COMPOUND_COLORS[l.compound] })),
    });
    const sa = toSeries(p.a, PALETTE.a, "a"), sb = toSeries(p.b, PALETTE.b, "b");
    const ys = [...sa.points, ...sb.points].map(o => o.y).sort((x, y) => x - y);
    const lo = Math.min(-0.5, ys[Math.floor(ys.length * 0.03)] ?? 0), hi = Math.max(1.5, ys[Math.floor(ys.length * 0.97)] ?? 2);
    return (
        <LineChart series={[sb, sa]} x={[1, p.race.totalLaps]} y={[lo, hi]} xTick={lapTick} yTick={v => `${v.toFixed(1)}s`}
                   bands={p.window ? [{ x0: p.window[0], x1: p.window[1], color: "rgba(61,123,255,0.18)" }] : []}
                   empty="Waiting for clean laps" />
    );
};

export const PaceChart: React.FC<{ race: Race; a?: Driver; b?: Driver; t: number }> = p => {
    const toSeries = (d: Driver | undefined, color: string, id: string): Series => ({
        id, color, glow: true, width: 1.8, label: d?.code,
        points: (d?.laps ?? []).filter(l => l.end <= p.t && l.lapTime !== null && !l.pitIn && !l.pitOut).map(l => ({ x: l.lap, y: l.lapTime as number })),
    });
    const sa = toSeries(p.a, PALETTE.a, "a"), sb = toSeries(p.b, PALETTE.b, "b");
    const ys = [...sa.points, ...sb.points].map(o => o.y).sort((x, y) => x - y);
    const lo = (ys[0] ?? 80) - 0.3, hi = (ys[Math.floor(ys.length * 0.92)] ?? 100) + 0.6;
    const fmt = (v: number) => { const m = Math.floor(v / 60); return `${m}:${(v - m * 60).toFixed(1).padStart(4, "0")}`; };
    return <LineChart series={[sb, sa]} x={[1, p.race.totalLaps]} y={[lo, hi]} xTick={lapTick} yTick={fmt} empty="Waiting for laps" />;
};

export const PositionChart: React.FC<{ race: Race; t: number; focusId?: string; compareId?: string }> = p => {
    const series = React.useMemo(() => {
        // position at the end of each lap = order in which cars crossed the line on that lap
        const byLap = new Map<number, { id: string; end: number }[]>();
        for (const d of p.race.drivers) for (const l of d.laps) {
            if (l.end > p.t) continue;
            const arr = byLap.get(l.lap) ?? [];
            arr.push({ id: d.id, end: l.end });
            byLap.set(l.lap, arr);
        }
        const pos = new Map<string, { x: number; y: number }[]>();
        for (const [lap, arr] of byLap) {
            arr.sort((a, b) => a.end - b.end).forEach((o, i) => {
                const list = pos.get(o.id) ?? [];
                list.push({ x: lap, y: i + 1 });
                pos.set(o.id, list);
            });
        }
        return p.race.drivers.map(d => {
            const pts = (pos.get(d.id) ?? []).sort((a, b) => a.x - b.x);
            const hl = d.id === p.focusId ? PALETTE.a : d.id === p.compareId ? PALETTE.b : null;
            return { id: d.id, color: hl ?? d.color, width: hl ? 2.6 : 1.2, opacity: hl ? 1 : 0.45, glow: !!hl, label: d.code, points: pts } as Series;
        }).sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
    }, [p.race, p.t, p.focusId, p.compareId]);
    return <LineChart series={series} x={[1, p.race.totalLaps]} y={[1, p.race.drivers.length]} invertY
                      xTick={lapTick} yTick={v => `P${Math.round(v)}`} yTicks={Math.min(10, p.race.drivers.length - 1)} empty="Lights out pending" />;
};
