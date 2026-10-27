import * as React from "react";
import { Race } from "../data/model";
import { CarState } from "../data/raceEngine";
import { Plan, StrategyState } from "../data/strategy";
import { PALETTE } from "../data/teamColors";
import { useElementSize } from "../hooks/useElementSize";

export interface PitWindowPanelProps {
    race: Race;
    focus: CarState | undefined;
    strategy: StrategyState;
    plans: Plan[];
    compact?: boolean;
}

/**
 * PIT WINDOW STRATEGY (PREDICTED)
 * Curve  = cumulative time lost to degradation on the current set: d * age^2 / 2
 * Line   = pit loss. Where they cross is the optimal tyre age; the band is the predicted window.
 */
export const PitWindowPanel: React.FC<PitWindowPanelProps> = p => {
    const wrap = React.useRef<HTMLDivElement>(null);
    const { width, height } = useElementSize(wrap);
    const s = p.strategy;
    const lap = p.focus?.current ?? p.focus?.last;
    const fuelKg = lap?.fuelKg ?? null;
    const fuelPct = fuelKg !== null ? Math.round((fuelKg / 100) * 100) : null;

    let chart: React.ReactNode = <div className="pw-empty">Need ≥ 5 clean laps or field data</div>;
    if (width > 40 && height > 40 && s.degRate && s.stintStartLap !== null && s.ageAtStintStart !== null && s.optimalAge) {
        const d = s.degRate, a0 = s.ageAtStintStart, L0 = s.stintStartLap;
        const ageAtFlag = a0 + (p.race.totalLaps - L0);                       // x axis never runs past the flag
        const wantAge = Math.max(s.optimalAge * 1.35, s.windowClose !== null ? a0 + s.windowClose - L0 + 3 : 0);
        const maxAge = Math.max((s.tyreAge ?? a0) + 3, Math.min(wantAge, ageAtFlag));
        const lapOf = (age: number) => L0 + age - a0;
        const pad = { l: 34, r: 40, t: 18, b: 20 };
        const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
        const loss = (age: number) => (d * age * age) / 2;
        const yMax = Math.max(s.pitLoss * 1.5, loss(maxAge));
        const X = (age: number) => pad.l + ((age - a0) / (maxAge - a0 || 1)) * W;
        const Y = (v: number) => pad.t + H - (v / yMax) * H;
        const pts: string[] = [];
        for (let i = 0; i <= 60; i++) { const age = a0 + ((maxAge - a0) * i) / 60; pts.push(`${i ? "L" : "M"}${X(age).toFixed(1)},${Y(loss(age)).toFixed(1)}`); }
        const nowAge = s.tyreAge ?? a0;
        // band = the plan-optimiser window (laps) mapped onto tyre age; none when no stop pays off
        const ageOf = (lap: number) => a0 + lap - L0;
        const w0 = s.windowOpen !== null ? Math.max(a0, ageOf(s.windowOpen) - 0.5) : Infinity;
        const w1 = s.windowClose !== null ? Math.min(maxAge, ageOf(s.windowClose) + 0.5) : -Infinity;
        const ticks = 5;
        chart = (
            <svg width={width} height={height}>
                <defs>
                    <linearGradient id="pwBand" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0" stopColor={PALETTE.blue} stopOpacity="0.55" /><stop offset="1" stopColor={PALETTE.blue} stopOpacity="0.1" />
                    </linearGradient>
                </defs>
                {Array.from({ length: 4 }, (_, i) => (
                    <g key={i}>
                        <line x1={pad.l} x2={pad.l + W} y1={pad.t + (H * i) / 3} y2={pad.t + (H * i) / 3} stroke={PALETTE.grid} />
                        <text x={pad.l - 6} y={pad.t + (H * i) / 3 + 3} textAnchor="end" className="pw-ax">{Math.round(yMax * (1 - i / 3))}s</text>
                    </g>
                ))}
                {w0 < w1 ? (
                    <>
                        <rect x={X(w0)} y={pad.t} width={Math.max(2, X(w1) - X(w0))} height={H} fill="url(#pwBand)" stroke={PALETTE.blue} strokeOpacity={0.8} />
                        <text x={(X(w0) + X(w1)) / 2} y={pad.t - 5} textAnchor="middle" className="pw-ax pw-ax--hi">
                            L{Math.round(lapOf(w0))}–{Math.round(lapOf(w1))}
                        </text>
                    </>
                ) : (
                    <text x={pad.l + W} y={pad.t - 5} textAnchor="end" className="pw-ax pw-ax--hi">
                        {s.windowStatus === "no-stop" ? "No stop needed before the flag" : ""}
                    </text>
                )}
                <line x1={pad.l} x2={pad.l + W} y1={Y(s.pitLoss)} y2={Y(s.pitLoss)} stroke={PALETTE.yellow} strokeDasharray="5 4" />
                <text x={pad.l + W + 4} y={Y(s.pitLoss) + 3} className="pw-ax" fill={PALETTE.yellow}>PIT {s.pitLoss.toFixed(0)}s</text>
                <path d={pts.join("")} fill="none" stroke="#fff" strokeWidth={2} />
                <circle cx={X(nowAge)} cy={Y(loss(nowAge))} r={5} fill={PALETTE.blue} stroke="#fff" strokeWidth={1.5} />
                <circle cx={X(s.optimalAge)} cy={Y(loss(s.optimalAge))} r={4} fill={PALETTE.yellow} />
                {Array.from({ length: ticks + 1 }, (_, i) => a0 + ((maxAge - a0) * i) / ticks).map(age => (
                    <text key={age} x={X(age)} y={height - 5} textAnchor="middle" className="pw-ax">L{Math.round(lapOf(age))}</text>
                ))}
                <text x={pad.l + 4} y={pad.t + 10} className="pw-ax">Deg. loss on current set · ● now ● d·L²/2 = pit loss</text>
            </svg>
        );
    }

    return (
        <div className={`pw-pitwin ${p.compact ? "is-compact" : ""}`}>
            <div className="pw-pitwin__chart" ref={wrap}>{chart}</div>
            <div className="pw-pitwin__side">
                <div className="pw-fuel">
                    <span className="pw-label">Current fuel</span>
                    <div><b>{fuelKg !== null ? `${fuelKg.toFixed(1)} kg` : "—"}</b><em>{fuelPct !== null ? `${fuelPct}%` : ""}</em></div>
                    <div className="pw-bar"><i style={{ width: `${fuelPct ?? 0}%` }} /></div>
                </div>
                <span className="pw-label">Strategy options</span>
                <div className="pw-plans">
                    {p.plans.length === 0 && <span className="dim">—</span>}
                    {p.plans.slice(0, 3).map((pl, i) => (
                        <div key={pl.label} className={`pw-plan ${i === 0 ? "is-best" : ""}`}
                             title={pl.stops.length ? `Stops: ${pl.stops.map(l => `L${l}`).join(", ")}` : "No more stops"}>
                            <b>{String.fromCharCode(65 + i)} · {pl.label}</b>
                            <span>{i === 0 ? "best" : `+${pl.delta.toFixed(1)}s`}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
