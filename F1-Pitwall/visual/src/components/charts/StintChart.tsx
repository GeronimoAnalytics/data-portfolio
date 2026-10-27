import * as React from "react";
import { Race } from "../../data/model";
import { CarState } from "../../data/raceEngine";
import { COMPOUND_COLORS, COMPOUND_LETTER } from "../../data/teamColors";

/** TYRE STRATEGY — every car's stints up to the replay time, ordered by running position. */
export const StintChart: React.FC<{ race: Race; cars: CarState[]; t: number; focusId?: string; compareId?: string; onFocus: (id: string) => void }> = p => {
    const total = p.race.totalLaps;
    return (
        <div className="pw-stints">
            {p.cars.map(c => {
                const stints: { compound: string; from: number; to: number; age0: number }[] = [];
                for (const l of c.driver.laps) {
                    if (l.start > p.t) break;
                    const last = stints[stints.length - 1];
                    if (last && last.compound === l.compound && !l.pitOut) last.to = l.lap;
                    else stints.push({ compound: l.compound, from: l.lap, to: l.lap, age0: (l.tyreAge ?? 1) - 1 });
                }
                const cls = c.driver.id === p.focusId ? "is-focus" : c.driver.id === p.compareId ? "is-compare" : "";
                return (
                    <div key={c.driver.id} className={`pw-stints__row ${cls}`} onClick={() => p.onFocus(c.driver.id)}>
                        <span className="pw-stints__pos">{c.pos}</span>
                        <span className="pw-stints__drv"><i style={{ background: c.driver.color }} />{c.driver.code}</span>
                        <div className="pw-stints__track">
                            {stints.map((s, i) => (
                                <i key={i} title={`${s.compound} L${s.from}–${s.to}${s.age0 > 0 ? ` (used, +${s.age0})` : ""}`}
                                   style={{
                                       left: `${((s.from - 1) / total) * 100}%`, width: `${((s.to - s.from + 1) / total) * 100}%`,
                                       ["--c" as string]: COMPOUND_COLORS[s.compound],
                                   }}>
                                    <b>{COMPOUND_LETTER[s.compound]}</b>{s.to - s.from >= 3 && <span>{s.to - s.from + 1}</span>}
                                </i>
                            ))}
                        </div>
                    </div>
                );
            })}
            <div className="pw-stints__axis">
                {Array.from({ length: Math.floor(total / 10) + 1 }, (_, i) => i * 10).map(l => (
                    <span key={l} style={{ left: `${(l / total) * 100}%` }}>L{Math.max(1, l)}</span>
                ))}
            </div>
        </div>
    );
};
