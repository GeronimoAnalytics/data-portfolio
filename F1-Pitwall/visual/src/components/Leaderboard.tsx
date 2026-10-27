import * as React from "react";
import { Race } from "../data/model";
import { CarState, fmtGap, fmtLap } from "../data/raceEngine";
import { expectedLife, stintDegLoss } from "../data/strategy";
import { COMPOUND_COLORS, COMPOUND_LETTER } from "../data/teamColors";

export interface LeaderboardProps {
    race: Race;
    cars: CarState[];
    t: number;
    pitLoss: number;
    focusId: string | undefined;
    compareId: string | undefined;
    onFocus: (id: string) => void;
    onCompare: (id: string) => void;
    variant?: "order" | "timing";
    maxRows?: number;
}

/** life used -> bar colour (green -> yellow -> red) */
const lifeColor = (f: number) => (f < 0.55 ? "#2BE38B" : f < 0.8 ? "#FFC906" : "#FF2B4F");

/** RACE ORDER & TYRE LIFE (default) or full TIMING tower with sectors. */
export const Leaderboard: React.FC<LeaderboardProps> = p => {
    const timing = p.variant === "timing";
    const lifeByCompound = React.useMemo(() => {
        const m = new Map<string, number>();
        for (const c of ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET", "UNKNOWN"] as const) m.set(c, expectedLife(p.race, c, p.t, p.pitLoss));
        return m;
        // tyre life only needs refreshing every ~30 s of race time, not per frame
    }, [p.race, Math.floor(p.t / 30), p.pitLoss]);

    const fastest = React.useMemo(() => {
        let best = Infinity, holder = "";
        for (const d of p.race.drivers) for (const l of d.laps) {
            if (l.lapTime !== null && l.end <= p.t && l.lapTime < best) { best = l.lapTime; holder = d.id; }
        }
        return { best, holder };
    }, [p.race, p.t]);

    const rows = p.maxRows ? p.cars.slice(0, p.maxRows) : p.cars;
    return (
        <div className={`pw-order ${timing ? "is-timing" : ""}`}>
            <div className="pw-order__head">
                <span>Pos</span><span>Driver</span><span className="c">Tyre</span><span>Life</span>
                <span className="r">{timing ? "Gap" : "Gap"}</span>
                {timing && <><span className="r">Int</span><span className="r">Last lap</span><span className="c">Sectors</span></>}
                <span className="r">Degradation</span>
            </div>
            <div className="pw-order__body">
                {rows.map(c => {
                    const d = c.driver;
                    const lap = c.current ?? c.last;
                    const life = lap ? lifeByCompound.get(lap.compound) ?? 25 : 25;
                    const age = lap?.tyreAge ?? null;
                    const used = age !== null ? Math.min(1, age / life) : 0;
                    const loss = lap ? stintDegLoss(d, lap.stint, p.t) : null;
                    const isF = d.id === p.focusId, isC = d.id === p.compareId;
                    const gapText = c.pos === 1 ? (c.status === "FIN" ? "Winner" : "Leader")
                        : timing ? fmtGap(c.gapToLeader, c.lapsDown) : fmtGap(c.interval, c.intervalLapsDown).replace(/^\+/, "+");
                    return (
                        <div key={d.id} className={`pw-order__row ${isF ? "is-focus" : ""} ${isC ? "is-compare" : ""} ${c.status === "OUT" ? "is-out" : ""}`}
                             onClick={() => p.onFocus(d.id)} onContextMenu={e => { e.preventDefault(); p.onCompare(d.id); }}
                             title={`${d.name} — click: focus · right-click: compare`}>
                            <span className="pw-order__pos">{c.status === "OUT" ? "–" : c.pos}</span>
                            <span className="pw-order__drv">
                                <i style={{ background: d.color }} />
                                <b>{d.name ? d.name.split(" ").slice(-1)[0] : d.code}</b>
                                {c.status === "PIT" && <em className="pw-pill pw-pill--pit">PIT</em>}
                                {c.status === "OUT" && <em className="pw-pill pw-pill--out">OUT</em>}
                            </span>
                            <span className="pw-order__tyre">
                                {lap && <b style={{ color: COMPOUND_COLORS[lap.compound] }}>{COMPOUND_LETTER[lap.compound]}</b>}
                                <span>{age ?? "–"}/{life}</span>
                            </span>
                            <span className="pw-order__life">
                                <i style={{ width: `${Math.max(4, (1 - used) * 100)}%`, background: lifeColor(used) }} />
                            </span>
                            <span className="r num">{gapText}</span>
                            {timing && (
                                <>
                                    <span className="r num dim">{c.pos === 1 ? "" : fmtGap(c.interval, c.intervalLapsDown)}</span>
                                    <span className={`r num ${c.last && fastest.holder === d.id && c.last.lapTime === fastest.best ? "purple" : ""}`}>{fmtLap(c.last?.lapTime ?? null)}</span>
                                    <span className="pw-secs">{c.sectors.map((s, k) => <i key={k} className={`pw-sec pw-sec--${s.color} ${s.live ? "is-live" : ""}`} />)}</span>
                                </>
                            )}
                            <span className={`r num ${loss !== null && loss > 8 ? "warn" : ""}`}>{loss !== null ? `${loss.toFixed(1)}s` : "—"}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
