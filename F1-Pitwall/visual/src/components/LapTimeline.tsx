import * as React from "react";
import { interp } from "../data/buildDataset";
import { Driver, Race } from "../data/model";
import { fmtClock, timeOfLap } from "../data/raceEngine";
import { StrategyState } from "../data/strategy";
import { PALETTE } from "../data/teamColors";
import { REPLAY_SPEEDS } from "../hooks/useReplay";
import { useElementSize } from "../hooks/useElementSize";

export interface LapTimelineProps {
    race: Race;
    focus: Driver | undefined;
    compare: Driver | undefined;
    strategy: StrategyState;
    t: number;
    playing: boolean;
    onPlayPause: () => void;
    onReset: () => void;
    speed: number;
    onSpeed: (s: number) => void;
    onSeek: (t: number) => void;
    compact?: boolean;
}

/**
 * Bottom replay timeline = the lap slider of the pitwall.
 * x axis = race laps; the curve is the focus driver's lap-time trace (up to "now"),
 * shaded band = predicted pit window, dots = pit stops (focus red, rival yellow).
 */
export const LapTimeline: React.FC<LapTimelineProps> = p => {
    const wrap = React.useRef<HTMLDivElement>(null);
    const { width, height } = useElementSize(wrap);
    const total = p.race.totalLaps;

    // lap <-> race time mapping from the leader's lap starts
    const map = React.useMemo(() => {
        const laps: number[] = [], times: number[] = [];
        for (let n = 1; n <= total; n++) { laps.push(n - 1); times.push(timeOfLap(p.race, n)); }
        laps.push(total); times.push(p.race.raceEnd);
        return { laps, times };
    }, [p.race, total]);
    const lapPos = interp(p.t, map.times, map.laps);          // 0 .. total (fractional)
    const curLap = Math.min(total, Math.floor(lapPos) + 1);

    const padL = 12, padR = 14, top = 24, bottom = 18;
    const W = Math.max(10, width - padL - padR), H = Math.max(10, height - top - bottom);
    const x = (lapF: number) => padL + (lapF / total) * W;

    // pace trace of the focus driver (normalised), only up to now
    const pace = React.useMemo(() => {
        const laps = (p.focus?.laps ?? []).filter(l => l.lapTime !== null && !l.pitIn && !l.pitOut);
        const ts = laps.map(l => l.lapTime as number).sort((a, b) => a - b);
        const lo = ts[Math.floor(ts.length * 0.03)] ?? 0, hi = ts[Math.floor(ts.length * 0.9)] ?? 1;
        return laps.map(l => ({ lap: l.lap, v: Math.min(1, Math.max(0, ((l.lapTime as number) - lo) / (hi - lo || 1))) }));
    }, [p.focus]);
    const y = (v: number) => top + H * 0.25 + v * H * 0.5;
    const played = pace.filter(o => o.lap <= curLap);
    const path = played.map((o, i) => `${i ? "L" : "M"}${x(o.lap - 0.5).toFixed(1)},${y(o.v).toFixed(1)}`).join("");

    const s = p.strategy;
    const hasWindow = s.windowOpen !== null && s.windowClose !== null && s.windowOpen <= total;
    const stops = (d: Driver | undefined) => (d?.laps ?? []).filter(l => l.pitIn && l.lap <= curLap).map(l => l.lap);

    const seekAt = (clientX: number) => {
        const r = wrap.current?.getBoundingClientRect();
        if (!r) return;
        const lapF = Math.max(0, Math.min(total, ((clientX - r.left - padL) / W) * total));
        p.onSeek(interp(lapF, map.laps, map.times));
    };
    const dragging = React.useRef(false);

    const tickStep = total > 60 ? 10 : 5;
    return (
        <div className={`pw-timeline ${p.compact ? "is-compact" : ""}`}>
            <div className="pw-timeline__head">
                {!p.compact && <h2>LAP TIMELINE</h2>}
                <span className="pw-timeline__lap">LAP <b>{curLap}</b>/{total}</span>
                {!p.compact && <span className="pw-timeline__clock">{fmtClock(p.t)}</span>}
                <div className="pw-transport">
                    <button className="pw-tbtn" onClick={p.onReset} title="Reset to lights out" aria-label="Reset">
                        <svg viewBox="0 0 16 16"><path d="M3 2v12M13 2 5 8l8 6z" /></svg>
                    </button>
                    <button className={`pw-tbtn pw-tbtn--play ${p.playing ? "is-playing" : ""}`} onClick={p.onPlayPause}
                            aria-label={p.playing ? "Pause" : "Play"} title={p.playing ? "Pause" : "Play"}>
                        {p.playing ? <svg viewBox="0 0 16 16"><path d="M4 2h3v12H4zM9 2h3v12H9z" /></svg>
                            : <svg viewBox="0 0 16 16"><path d="M4 2l10 6-10 6z" /></svg>}
                    </button>
                    <div className="pw-speed" role="group" aria-label="Replay speed">
                        {REPLAY_SPEEDS.map(v => <button key={v} className={v === p.speed ? "is-on" : ""} onClick={() => p.onSpeed(v)}>{v}x</button>)}
                    </div>
                </div>
            </div>
            <div className="pw-timeline__plot" ref={wrap}
                 onPointerDown={e => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); seekAt(e.clientX); }}
                 onPointerMove={e => { if (dragging.current) seekAt(e.clientX); }}
                 onPointerUp={() => { dragging.current = false; }}>
                {width > 0 && (
                    <svg width={width} height={height}>
                        <defs>
                            <linearGradient id="pwWin" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0" stopColor={PALETTE.blue} stopOpacity="0.55" />
                                <stop offset="1" stopColor={PALETTE.blue} stopOpacity="0.08" />
                            </linearGradient>
                            <filter id="pwGlow"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                        </defs>
                        {/* rail */}
                        <line x1={x(0)} x2={x(total)} y1={y(0.5)} y2={y(0.5)} stroke="rgba(140,170,255,0.18)" strokeWidth={2} />
                        <line x1={x(0)} x2={x(lapPos)} y1={y(0.5)} y2={y(0.5)} stroke={PALETTE.red} strokeWidth={2} filter="url(#pwGlow)" />
                        {hasWindow && (
                            <g>
                                <rect x={x(s.windowOpen! - 1)} y={top} width={Math.max(3, x(Math.min(total, s.windowClose!)) - x(s.windowOpen! - 1))} height={H}
                                      fill="url(#pwWin)" stroke={PALETTE.blue} strokeOpacity={0.7} rx={3} />
                                <text x={Math.min(padL + W - 120, Math.max(padL + 60, x((s.windowOpen! + Math.min(total, s.windowClose!)) / 2 - 0.5)))} y={top - 6}
                                      textAnchor="middle" className="pw-tl-label">
                                    Optimal pit window <tspan className="pw-tl-red">L{s.windowOpen}–L{Math.min(total, s.windowClose!)}</tspan>
                                </text>
                            </g>
                        )}
                        <path d={path} fill="none" stroke="#DDE6FF" strokeWidth={1.4} strokeOpacity={0.85} />
                        {stops(p.compare).map(l => <circle key={`b${l}`} cx={x(l - 0.5)} cy={y(0.5)} r={4} fill={PALETTE.b} />)}
                        {stops(p.focus).map(l => <circle key={`a${l}`} cx={x(l - 0.5)} cy={y(0.5)} r={5} fill={PALETTE.red} stroke="#fff" strokeWidth={1} filter="url(#pwGlow)" />)}
                        {/* now */}
                        <line x1={x(lapPos)} x2={x(lapPos)} y1={top - 2} y2={top + H} stroke="#fff" strokeOpacity={0.5} />
                        <circle cx={x(lapPos)} cy={y(0.5)} r={7} fill={PALETTE.navy} stroke="#fff" strokeWidth={2} filter="url(#pwGlow)" />
                        <circle cx={x(lapPos)} cy={y(0.5)} r={2.5} fill={PALETTE.red} />
                        {/* axis */}
                        {Array.from({ length: Math.floor(total / tickStep) + 1 }, (_, i) => Math.max(1, i * tickStep)).map(l => (
                            <text key={l} x={x(l - 0.5)} y={height - 4} textAnchor="middle" className="pw-tl-tick">L{l}</text>
                        ))}
                    </svg>
                )}
            </div>
        </div>
    );
};
