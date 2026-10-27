import * as React from "react";
import { Race } from "../data/model";
import { CarState } from "../data/raceEngine";
import { StrategyState } from "../data/strategy";
import { COMPOUND_COLORS, COMPOUND_LETTER } from "../data/teamColors";
import { FONT_MONO, prepareCanvas, useElementSize } from "../hooks/useElementSize";

export interface StrategyPanelProps {
    race: Race;
    focus: CarState | undefined;
    strategy: StrategyState;
    t: number;
    pitLossOverride: number | null;
    onPitLoss: (v: number | null) => void;
    compact?: boolean;
}

export const StatusBadges: React.FC<{ strategy: StrategyState }> = ({ strategy }) => (
    <div className="pw-badges">
        {strategy.badges.length === 0 && <span className="pw-badge pw-badge--info">AWAITING DATA</span>}
        {strategy.badges.map(b => <span key={b.text} className={`pw-badge pw-badge--${b.level}`}>{b.text}</span>)}
    </div>
);

export const StrategyPanel: React.FC<StrategyPanelProps> = p => {
    const wrap = React.useRef<HTMLDivElement>(null);
    const cvs = React.useRef<HTMLCanvasElement>(null);
    const { width, height } = useElementSize(wrap);
    const s = p.strategy;
    const drv = p.focus?.driver;
    const nowLap = p.focus?.lap ?? 1;

    React.useEffect(() => {
        const c = cvs.current;
        if (!c || !drv || width < 60 || height < 60) return;
        const ctx = prepareCanvas(c, width, height);
        if (!ctx) return;
        const L = 40, R = 34, T = 10, B = 20;
        const W = width - L - R, H = height - T - B;
        const total = p.race.totalLaps;
        const done = drv.laps.filter(l => l.end <= p.t);
        const clean = done.filter(l => l.clean && l.fuelCorr !== null);
        const allClean = drv.laps.filter(l => l.clean && l.fuelCorr !== null).map(l => l.fuelCorr as number);
        const sorted = [...allClean].sort((a, b) => a - b);
        const lo = (sorted[Math.floor(sorted.length * 0.02)] ?? 80) - 0.6;
        const hi = (sorted[Math.floor(sorted.length * 0.98)] ?? 100) + 1.2;
        const xOf = (lap: number) => L + ((lap - 1) / Math.max(1, total - 1)) * W;
        const yOf = (v: number) => T + H - ((v - lo) / (hi - lo || 1)) * H;
        const yFuel = (kg: number) => T + H - (kg / 110) * H;

        // grid
        ctx.strokeStyle = "rgba(120,150,230,0.10)"; ctx.lineWidth = 1;
        ctx.fillStyle = "#7C8BB8"; ctx.font = `10px ${FONT_MONO}`;
        const step = hi - lo > 4 ? 1 : 0.5;
        for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
            ctx.beginPath(); ctx.moveTo(L, yOf(v)); ctx.lineTo(L + W, yOf(v)); ctx.stroke();
            ctx.textAlign = "right"; ctx.fillText(v.toFixed(step < 1 ? 1 : 0), L - 4, yOf(v) + 3);
        }
        ctx.textAlign = "center";
        for (let lap = 1; lap <= total; lap += total > 60 ? 10 : 5) ctx.fillText(`L${lap}`, xOf(lap), height - 6);
        ctx.textAlign = "start";

        // predicted window band
        if (s.windowOpen !== null && s.windowClose !== null && s.windowOpen <= total) {
            const x0 = xOf(s.windowOpen), x1 = xOf(Math.min(total, s.windowClose));
            const g = ctx.createLinearGradient(x0, 0, x1, 0);
            g.addColorStop(0, "rgba(61,123,255,0.05)"); g.addColorStop(0.5, "rgba(61,123,255,0.22)"); g.addColorStop(1, "rgba(61,123,255,0.05)");
            ctx.fillStyle = g; ctx.fillRect(x0, T, Math.max(2, x1 - x0), H);
            ctx.strokeStyle = "rgba(61,123,255,0.7)"; ctx.setLineDash([4, 3]);
            ctx.strokeRect(x0, T, Math.max(2, x1 - x0), H); ctx.setLineDash([]);
            ctx.fillStyle = "#8DB4FF"; ctx.font = `700 10px ${FONT_MONO}`;
            ctx.fillText(`PIT WINDOW L${s.windowOpen}–${s.windowClose}`, Math.min(x0 + 4, L + W - 120), T + 11);
        }

        // fuel load (right axis)
        ctx.strokeStyle = "rgba(61,123,255,0.6)"; ctx.setLineDash([2, 4]); ctx.lineWidth = 1.2; ctx.beginPath();
        drv.laps.forEach((l, i) => { if (l.fuelKg === null) return; i ? ctx.lineTo(xOf(l.lap), yFuel(l.fuelKg)) : ctx.moveTo(xOf(l.lap), yFuel(l.fuelKg)); });
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "#5B95FF"; ctx.font = `10px ${FONT_MONO}`;
        [0, 50, 100].forEach(kg => ctx.fillText(`${kg}kg`, L + W + 4, yFuel(kg) + 3));

        // pit stops
        done.filter(l => l.pitIn).forEach(l => {
            ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.beginPath(); ctx.moveTo(xOf(l.lap), T); ctx.lineTo(xOf(l.lap), T + H); ctx.stroke();
            ctx.fillStyle = "#E6EDF7"; ctx.font = `700 8px ${FONT_MONO}`; ctx.fillText("PIT", xOf(l.lap) + 2, T + H - 3);
        });

        // raw lap times (faint) and fuel-corrected clean laps (compound colour)
        done.forEach(l => {
            if (l.lapTime === null || l.pitIn || l.pitOut) return;
            const y = yOf(l.lapTime - (l.fuelKg ?? 0) * 0.033);
            if (y < T || y > T + H) return;
            ctx.fillStyle = "rgba(143,163,199,0.25)"; ctx.fillRect(xOf(l.lap) - 1, y - 1, 2, 2);
        });
        clean.forEach(l => {
            ctx.fillStyle = COMPOUND_COLORS[l.compound];
            ctx.beginPath(); ctx.arc(xOf(l.lap), yOf(l.fuelCorr as number), 2.6, 0, Math.PI * 2); ctx.fill();
        });

        // current stint fit + projection (own fit, else field deg rate anchored on the stint's clean laps)
        if (s.stintStartLap !== null && s.ageAtStintStart !== null && s.degRate !== null) {
            const ageAt = (lap: number) => (s.ageAtStintStart as number) + (lap - (s.stintStartLap as number));
            const stintClean = clean.filter(l => l.stint === s.stint);
            let val: ((lap: number) => number) | null = null;
            if (s.fit) val = (lap: number) => s.fit!.intercept + s.fit!.slope * ageAt(lap);
            else if (stintClean.length) {
                const ax = stintClean.reduce((a, l) => a + ageAt(l.lap), 0) / stintClean.length;
                const ay = stintClean.reduce((a, l) => a + (l.fuelCorr as number), 0) / stintClean.length;
                val = (lap: number) => ay + (s.degRate as number) * (ageAt(lap) - ax);
            }
            if (val) {
                const v = val;
                ctx.strokeStyle = COMPOUND_COLORS[s.compound]; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(xOf(s.stintStartLap), yOf(v(s.stintStartLap))); ctx.lineTo(xOf(nowLap), yOf(v(nowLap))); ctx.stroke();
                const end = Math.min(total, (s.windowClose ?? total) + 6);
                ctx.strokeStyle = "#FFB000"; ctx.setLineDash([5, 4]);
                ctx.beginPath(); ctx.moveTo(xOf(nowLap), yOf(v(nowLap))); ctx.lineTo(xOf(end), yOf(v(end))); ctx.stroke(); ctx.setLineDash([]);
                ctx.fillStyle = "#FFB000"; ctx.font = `700 10px ${FONT_MONO}`;
                const drop = v(end) - v(nowLap);
                ctx.fillText(`PROJ. +${drop.toFixed(2)}s @ L${end}${s.degSource === "field" ? " (FIELD)" : ""}`,
                    Math.min(xOf(end) - 4, L + W - 150), Math.max(T + 22, Math.min(T + H - 26, yOf(v(end)) - 6)));
            }
        }

        // now cursor
        ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xOf(nowLap), T); ctx.lineTo(xOf(nowLap), T + H); ctx.stroke();
        ctx.fillStyle = "#FFFFFF"; ctx.font = `700 10px ${FONT_MONO}`; ctx.fillText(`NOW L${nowLap}`, xOf(nowLap) + 3, T + H - 14);

        ctx.save(); ctx.translate(10, T + H / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = "#7C8BB8"; ctx.textAlign = "center";
        ctx.fillText("FUEL-CORR. LAP (s)", 0, 0); ctx.restore();
    }, [width, height, drv, p.t, s, nowLap, p.race]);

    // stint timeline
    const stints = React.useMemo(() => {
        if (!drv) return [] as { compound: string; from: number; to: number }[];
        const out: { compound: string; from: number; to: number }[] = [];
        for (const l of drv.laps) {
            const lastS = out[out.length - 1];
            if (lastS && lastS.compound === l.compound && !l.pitOut) lastS.to = l.lap; else out.push({ compound: l.compound, from: l.lap, to: l.lap });
        }
        return out;
    }, [drv]);

    const tile = (label: string, value: string, sub?: string, cls = "") => (
        <div className={`pw-tile ${cls}`}><span className="pw-kicker">{label}</span><b>{value}</b>{sub && <em>{sub}</em>}</div>
    );
    const pitLoss = p.pitLossOverride ?? s.pitLoss;

    return (
        <div className={`pw-strategy ${p.compact ? "is-compact" : ""}`}>
            <div className="pw-card__head">
                <h2>Degradation vs fuel load <span className="pw-sub">{drv?.code ?? "—"} · fuel-corrected</span></h2>
            </div>
            <StatusBadges strategy={s} />
            <div className="pw-tiles">
                {tile("DEG RATE", s.degRate !== null ? `${s.degRate.toFixed(3)}` : "—", s.degSource === "field" ? "s/lap · FIELD" : "s/lap · STINT")}
                {tile("TYRE", `${COMPOUND_LETTER[s.compound]}${s.tyreAge ?? "–"}`, s.optimalAge !== null ? `OPT. AGE ${s.optimalAge.toFixed(0)}` : "OPT. AGE —")}
                {tile("PIT WINDOW", s.windowOpen !== null ? (s.windowStatus === "no-stop" ? "TO FLAG" : `L${s.windowOpen}–${s.windowClose}`) : "—",
                    s.optimalLap !== null ? `OPTIMUM L${s.optimalLap}` : undefined, `is-${s.windowStatus}`)}
                {tile("DROP-OFF", s.paceDropOff !== null ? `${s.paceDropOff >= 0 ? "+" : ""}${s.paceDropOff.toFixed(2)}s` : "—", "LAST 3 vs FIRST 3")}
                <div className="pw-tile pw-tile--input">
                    <span className="pw-kicker">PIT LOSS</span>
                    <div className="pw-stepper">
                        <button onClick={() => p.onPitLoss(Math.max(10, +(pitLoss - 0.5).toFixed(1)))}>−</button>
                        <b>{pitLoss.toFixed(1)}s</b>
                        <button onClick={() => p.onPitLoss(Math.min(40, +(pitLoss + 0.5).toFixed(1)))}>+</button>
                    </div>
                    <em className={p.pitLossOverride === null ? "" : "is-link"} onClick={() => p.onPitLoss(null)}>
                        {p.pitLossOverride === null ? "RACE ESTIMATE" : "WHAT-IF · RESET"}
                    </em>
                </div>
            </div>
            {!p.compact && (
                <>
                    <div className="pw-strategy__chart" ref={wrap}><canvas ref={cvs} className="pw-layer" /></div>
                    <div className="pw-stintbar">
                        {stints.filter(st => st.from <= nowLap).map((st, i) => (
                            <i key={i} title={`${st.compound} L${st.from}–${Math.min(st.to, nowLap)}`}
                               style={{
                                   left: `${((st.from - 1) / p.race.totalLaps) * 100}%`,
                                   width: `${((Math.min(st.to, nowLap) - st.from + 1) / p.race.totalLaps) * 100}%`,
                                   background: COMPOUND_COLORS[st.compound],
                               }}>{COMPOUND_LETTER[st.compound]}</i>
                        ))}
                        {s.windowOpen !== null && s.windowClose !== null && s.windowOpen <= p.race.totalLaps && (
                            <u style={{
                                left: `${((s.windowOpen - 1) / p.race.totalLaps) * 100}%`,
                                width: `${((Math.min(s.windowClose, p.race.totalLaps) - s.windowOpen + 1) / p.race.totalLaps) * 100}%`,
                            }} />
                        )}
                        <b style={{ left: `${(Math.min(nowLap, p.race.totalLaps) / p.race.totalLaps) * 100}%` }} />
                    </div>
                </>
            )}
        </div>
    );
};
