import * as React from "react";
import { interp } from "../data/buildDataset";
import { Driver, Race, TelemetryMode, TelSample } from "../data/model";
import { fmtLap } from "../data/raceEngine";
import { FONT_MONO, prepareCanvas, useElementSize } from "../hooks/useElementSize";

export interface TelemetryPanelProps {
    race: Race;
    a: Driver | undefined;
    b: Driver | undefined;
    mode: TelemetryMode;
    onMode: (m: TelemetryMode) => void;
    hoverDist: number | null;
    onHover: (d: number | null) => void;
    /** compact = overview card: speed + delta only, no mode switch / G-G diagram */
    compact?: boolean;
}

export const COLOR_A = "#FF2B4F";
export const COLOR_B = "#FFC906";

interface Channel {
    key: string;
    label: string;
    formula?: string;
    unit: string;
    get: (s: TelSample) => number;
    range: (vals: number[]) => [number, number];
    step?: boolean;
    zero?: boolean;
    fmt: (v: number) => string;
    weight: number;
}

const fixed = (lo: number, hi: number) => () => [lo, hi] as [number, number];
const sym = (min: number) => (v: number[]) => { const m = Math.max(min, ...v.map(Math.abs)); return [-m * 1.08, m * 1.08] as [number, number]; };

const RAW: Channel[] = [
    { key: "speed", label: "SPEED", unit: "km/h", get: s => s.speed, range: v => [Math.max(0, Math.min(...v) - 15), Math.max(...v) + 10], fmt: v => v.toFixed(0), weight: 1.5 },
    { key: "throttle", label: "THROTTLE", unit: "%", get: s => s.throttle, range: fixed(-5, 105), fmt: v => v.toFixed(0), weight: 0.8 },
    { key: "brake", label: "BRAKE", unit: "on/off", get: s => s.brake * 100, range: fixed(-5, 105), step: true, fmt: v => (v > 50 ? "ON" : "OFF"), weight: 0.55 },
    { key: "gear", label: "GEAR", unit: "", get: s => s.gear, range: fixed(0.5, 8.5), step: true, fmt: v => v.toFixed(0), weight: 0.75 },
];
const PHYSICS: Channel[] = [
    { key: "glong", label: "G LONG", formula: "a = Δv/Δt", unit: "g", get: s => s.gLong, range: sym(2), zero: true, fmt: v => v.toFixed(2), weight: 1.1 },
    { key: "glat", label: "G LAT", formula: "a = v²·κ", unit: "g", get: s => s.gLat, range: sym(2), zero: true, fmt: v => v.toFixed(2), weight: 1.1 },
    { key: "bp", label: "BRAKE PRESS.", formula: "est. (decel − drag)", unit: "%", get: s => s.brakePct, range: fixed(-5, 105), fmt: v => v.toFixed(0), weight: 0.9 },
];

const GUTTER = 112, RIGHT = 12, TOP = 18, BOTTOM = 20, GAP = 6;

export const TelemetryPanel: React.FC<TelemetryPanelProps> = p => {
    const wrap = React.useRef<HTMLDivElement>(null);
    const cvs = React.useRef<HTMLCanvasElement>(null);
    const gg = React.useRef<HTMLCanvasElement>(null);
    const ggWrap = React.useRef<HTMLDivElement>(null);
    const { width, height } = useElementSize(wrap);
    const ggSize = useElementSize(ggWrap);

    const A = p.a?.tel ?? [], B = p.b?.tel ?? [];
    const lenA = A.length ? A[A.length - 1].d : 0, lenB = B.length ? B[B.length - 1].d : 0;
    const maxD = Math.max(lenA, lenB, p.race.trackLength || 1);

    // delta time at A's distances (B distance normalised so both laps start & end on the line)
    const delta = React.useMemo(() => {
        if (!A.length || !B.length) return [] as { d: number; v: number }[];
        const bd = B.map(s => s.d * (lenA / lenB)), bt = B.map(s => s.t);
        return A.map(s => ({ d: s.d, v: s.t - interp(s.d, bd, bt) }));
    }, [A, B, lenA, lenB]);

    const channels = p.compact ? RAW.slice(0, 2) : p.mode === "raw" ? RAW : PHYSICS;
    const deltaCh: Channel = { key: "delta", label: "Δ TIME", formula: "A − B", unit: "s", get: () => 0, range: sym(0.2), zero: true, fmt: v => (v >= 0 ? "+" : "") + v.toFixed(3), weight: 1 };
    const all = [...channels, deltaCh];

    React.useEffect(() => {
        const c = cvs.current;
        if (!c || width < 50 || height < 50) return;
        const ctx = prepareCanvas(c, width, height);
        if (!ctx) return;
        const plotW = width - GUTTER - RIGHT;
        const totalW = all.reduce((s, ch) => s + ch.weight, 0);
        const plotH = height - TOP - BOTTOM - GAP * (all.length - 1);
        const xOf = (d: number) => GUTTER + (d / maxD) * plotW;

        // sector bands + labels
        const [s1, s2] = p.race.sectorDist;
        [[0, s1], [s1, s2], [s2, maxD]].forEach(([d0, d1], k) => {
            ctx.fillStyle = k % 2 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0)";
            ctx.fillRect(xOf(d0), TOP, xOf(d1) - xOf(d0), height - TOP - BOTTOM);
            ctx.fillStyle = "#7C8BB8"; ctx.font = `600 9px ${FONT_MONO}`;
            ctx.fillText(`SECTOR ${k + 1}`, xOf(d0) + 6, 12);
        });

        let y = TOP;
        const readouts: { y: number; ch: Channel; h: number }[] = [];
        for (const ch of all) {
            const h = (plotH * ch.weight) / totalW;
            const valsA = ch.key === "delta" ? delta.map(o => o.v) : A.map(ch.get);
            const valsB = ch.key === "delta" ? [] : B.map(ch.get);
            const [lo, hi] = ch.range([...valsA, ...valsB].length ? [...valsA, ...valsB] : [0, 1]);
            const yOf = (v: number) => y + h - ((v - lo) / (hi - lo || 1)) * h;

            // frame & grid
            ctx.fillStyle = "rgba(8,16,48,0.55)"; ctx.fillRect(GUTTER, y, plotW, h);
            ctx.strokeStyle = "rgba(120,150,230,0.10)"; ctx.lineWidth = 1;
            for (let g = 1; g < 4; g++) { const gy = y + (h * g) / 4; ctx.beginPath(); ctx.moveTo(GUTTER, gy); ctx.lineTo(GUTTER + plotW, gy); ctx.stroke(); }
            if (ch.zero) { ctx.strokeStyle = "rgba(200,215,240,0.35)"; ctx.beginPath(); ctx.moveTo(GUTTER, yOf(0)); ctx.lineTo(GUTTER + plotW, yOf(0)); ctx.stroke(); }

            const line = (data: TelSample[], color: string, scale = 1, alpha = 1) => {
                ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1.4;
                ctx.beginPath();
                data.forEach((s, i) => {
                    const X = xOf(s.d * scale), Y = yOf(ch.get(s));
                    if (i === 0) ctx.moveTo(X, Y);
                    else if (ch.step) { ctx.lineTo(X, yOf(ch.get(data[i - 1]))); ctx.lineTo(X, Y); }
                    else ctx.lineTo(X, Y);
                });
                ctx.stroke(); ctx.globalAlpha = 1;
            };
            if (ch.key === "delta") {
                // filled delta trace: above zero = A losing (B colour), below = A gaining (A colour)
                const z = yOf(0);
                ctx.save(); ctx.beginPath(); ctx.rect(GUTTER, y, plotW, z - y); ctx.clip();
                ctx.fillStyle = "rgba(255,201,6,0.22)"; ctx.beginPath(); ctx.moveTo(xOf(0), z);
                delta.forEach(o => ctx.lineTo(xOf(o.d), yOf(o.v))); ctx.lineTo(xOf(delta[delta.length - 1]?.d ?? 0), z); ctx.fill(); ctx.restore();
                ctx.save(); ctx.beginPath(); ctx.rect(GUTTER, z, plotW, y + h - z); ctx.clip();
                ctx.fillStyle = "rgba(255,43,79,0.25)"; ctx.beginPath(); ctx.moveTo(xOf(0), z);
                delta.forEach(o => ctx.lineTo(xOf(o.d), yOf(o.v))); ctx.lineTo(xOf(delta[delta.length - 1]?.d ?? 0), z); ctx.fill(); ctx.restore();
                ctx.strokeStyle = "#EAF0FF"; ctx.lineWidth = 1.3; ctx.beginPath();
                delta.forEach((o, i) => (i ? ctx.lineTo(xOf(o.d), yOf(o.v)) : ctx.moveTo(xOf(o.d), yOf(o.v)))); ctx.stroke();
            } else {
                if (ch.key === "brake") {   // brake as filled blocks
                    for (const [data, col] of [[B, "rgba(255,201,6,0.45)"], [A, "rgba(255,43,79,0.6)"]] as [TelSample[], string][]) {
                        ctx.fillStyle = col;
                        const half = data === A ? [y + h * 0.08, h * 0.4] : [y + h * 0.52, h * 0.4];
                        data.forEach((s, i) => { if (s.brake && data[i + 1]) ctx.fillRect(xOf(s.d), half[0], xOf(data[i + 1].d) - xOf(s.d) + 0.5, half[1]); });
                    }
                } else {
                    line(B, COLOR_B, 1, 0.85);
                    line(A, COLOR_A);
                }
            }
            // axis ticks
            ctx.fillStyle = "#7C8BB8"; ctx.font = `10px ${FONT_MONO}`; ctx.textAlign = "right";
            ctx.fillText(ch.fmt(hi), GUTTER - 4, y + 9); ctx.fillText(ch.fmt(lo), GUTTER - 4, y + h - 2);
            ctx.textAlign = "start";
            readouts.push({ y, ch, h });
            y += h + GAP;
        }

        // distance axis
        ctx.fillStyle = "#7C8BB8"; ctx.font = `10px ${FONT_MONO}`;
        for (let d = 0; d <= maxD; d += 500) {
            const X = xOf(d);
            ctx.fillRect(X, height - BOTTOM, 1, 4);
            ctx.fillText(d % 1000 === 0 ? `${d / 1000}km` : `${d}`, X - 8, height - 5);
        }

        // labels + hover readouts
        const hd = p.hoverDist;
        for (const { y: cy, ch, h } of readouts) {
            ctx.fillStyle = "#EAF0FF"; ctx.font = `700 11px ${FONT_MONO}`;
            ctx.fillText(ch.label, 8, cy + 12);
            ctx.fillStyle = "#7C8BB8"; ctx.font = `10px ${FONT_MONO}`;
            ctx.fillText(ch.formula ? `${ch.formula}` : ch.unit, 8, cy + 23);
            if (hd !== null && h > 26) {
                const va = ch.key === "delta" ? interp(hd, delta.map(o => o.d), delta.map(o => o.v)) : A.length ? interp(hd, A.map(s => s.d), A.map(ch.get)) : NaN;
                const vb = ch.key === "delta" ? NaN : B.length ? interp(hd * (lenB / (lenA || 1)), B.map(s => s.d), B.map(ch.get)) : NaN;
                ctx.font = `700 11px ${FONT_MONO}`;
                if (Number.isFinite(va)) { ctx.fillStyle = ch.key === "delta" ? (va > 0 ? COLOR_B : COLOR_A) : COLOR_A; ctx.fillText(ch.fmt(va), 8, cy + 36); }
                if (Number.isFinite(vb) && h > 40) { ctx.fillStyle = COLOR_B; ctx.fillText(ch.fmt(vb), 58, cy + 36); }
            }
        }
        if (hd !== null) {
            const X = xOf(hd);
            ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(X, TOP); ctx.lineTo(X, height - BOTTOM); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = "#FFFFFF"; ctx.font = `700 9px ${FONT_MONO}`;
            ctx.fillText(`${Math.round(hd)} m`, X + 4, TOP + 9);
        }
    }, [width, height, A, B, delta, p.mode, p.hoverDist, p.race, maxD, lenA, lenB]);

    // ------------------------------------------------------------ G-G diagram (physics mode)
    React.useEffect(() => {
        const c = gg.current;
        if (!c || p.mode !== "physics") return;
        const size = Math.max(60, Math.min(ggSize.width, ggSize.height));
        const ctx = prepareCanvas(c, size, size);
        if (!ctx) return;
        const cx = size / 2, cy = size / 2, R = size / 2 - 14, gmax = 5.5;
        const sc = (g: number) => (g / gmax) * R;
        ctx.strokeStyle = "rgba(120,150,200,0.18)"; ctx.fillStyle = "#7C8BB8"; ctx.font = `8px ${FONT_MONO}`;
        for (let g = 1; g <= 5; g++) { ctx.beginPath(); ctx.arc(cx, cy, sc(g), 0, Math.PI * 2); ctx.stroke(); ctx.fillText(`${g}g`, cx + sc(g) - 10, cy - 2); }
        ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
        const dots = (data: TelSample[], col: string) => {
            ctx.fillStyle = col;
            data.forEach(s => ctx.fillRect(cx + sc(s.gLat) - 1, cy - sc(s.gLong) - 1, 2, 2));
        };
        dots(B, "rgba(255,201,6,0.45)");
        dots(A, "rgba(255,43,79,0.65)");
        if (p.hoverDist !== null && A.length) {
            const glat = interp(p.hoverDist, A.map(s => s.d), A.map(s => s.gLat));
            const glong = interp(p.hoverDist, A.map(s => s.d), A.map(s => s.gLong));
            ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + sc(glat), cy - sc(glong)); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx + sc(glat), cy - sc(glong), 4, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = "#8FA3C7"; ctx.font = `600 8px ${FONT_MONO}`;
        ctx.fillText("ACCEL", cx + 3, 9); ctx.fillText("BRAKE", cx + 3, size - 3);
        ctx.fillText("L", 2, cy - 3); ctx.fillText("R", size - 8, cy - 3);
    }, [p.mode, A, B, p.hoverDist, ggSize.width, ggSize.height]);

    const onMove = (e: React.MouseEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - r.left;
        if (x < GUTTER || x > width - RIGHT) { p.onHover(null); return; }
        p.onHover(((x - GUTTER) / (width - GUTTER - RIGHT)) * maxD);
    };

    const finalDelta = delta.length ? delta[delta.length - 1].v : null;
    const showGG = p.mode === "physics" && !p.compact;
    return (
        <div className={`pw-tele ${p.compact ? "is-compact" : ""}`}>
            <div className="pw-card__head">
                <h2>{p.compact ? "Telemetry trace" : "Driver telemetry"} <span className="pw-sub">fastest lap · distance</span></h2>
                <div className="pw-card__right">
                    <span className="pw-legend"><i style={{ background: COLOR_A }} />{p.a?.code ?? "—"} <b>{fmtLap(p.a?.fastestLapTime ?? null)}</b></span>
                    <span className="pw-legend"><i style={{ background: COLOR_B }} />{p.b?.code ?? "—"} <b>{fmtLap(p.b?.fastestLapTime ?? null)}</b></span>
                    {finalDelta !== null && <span className="pw-legend pw-legend--delta">Δ <b>{finalDelta >= 0 ? "+" : ""}{finalDelta.toFixed(3)}s</b></span>}
                    {!p.compact && (
                        <div className="pw-chips">
                            <button className={p.mode === "raw" ? "is-on" : ""} onClick={() => p.onMode("raw")}>Raw telemetry</button>
                            <button className={p.mode === "physics" ? "is-on" : ""} onClick={() => p.onMode("physics")}>Derived physics engine</button>
                        </div>
                    )}
                </div>
            </div>
            <div className={`pw-tele__body ${showGG ? "has-gg" : ""}`}>
                <div className="pw-tele__chart" ref={wrap} onMouseMove={onMove} onMouseLeave={() => p.onHover(null)}>
                    <canvas ref={cvs} className="pw-layer" />
                    {!A.length && <div className="pw-empty">No telemetry for this driver in the feed</div>}
                </div>
                {/* always mounted so its size is observed; hidden unless physics mode */}
                <div className={`pw-tele__gg ${showGG ? "" : "is-hidden"}`}>
                    <span className="pw-label">G-G diagram · friction circle</span>
                    <div className="pw-tele__ggcanvas" ref={ggWrap}><canvas ref={gg} /></div>
                </div>
            </div>
        </div>
    );
};
