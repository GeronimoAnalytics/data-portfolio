import * as React from "react";
import { PALETTE } from "../../data/teamColors";
import { useElementSize } from "../../hooks/useElementSize";

export interface Series {
    id: string;
    color: string;
    points: { x: number; y: number; dot?: string }[];
    width?: number;
    opacity?: number;
    dots?: boolean;
    glow?: boolean;
    label?: string;          // drawn at the end of the line
}

export interface LineChartProps {
    series: Series[];
    x: [number, number];
    y: [number, number];
    invertY?: boolean;
    xTick?: (v: number) => string;
    yTick?: (v: number) => string;
    xTicks?: number;
    yTicks?: number;
    vlines?: { x: number; label?: string; color?: string }[];
    bands?: { x0: number; x1: number; color: string }[];
    empty?: string;
}

/** Minimal responsive SVG line chart in the pitwall style (glow lines, faint grid). */
export const LineChart: React.FC<LineChartProps> = p => {
    const wrap = React.useRef<HTMLDivElement>(null);
    const { width, height } = useElementSize(wrap);
    const pad = { l: 34, r: p.series.some(s => s.label) ? 34 : 10, t: 8, b: 18 };
    const W = Math.max(1, width - pad.l - pad.r), H = Math.max(1, height - pad.t - pad.b);
    const X = (v: number) => pad.l + ((v - p.x[0]) / (p.x[1] - p.x[0] || 1)) * W;
    const Y = (v: number) => {
        const f = (v - p.y[0]) / (p.y[1] - p.y[0] || 1);
        return pad.t + (p.invertY ? f : 1 - f) * H;
    };
    const nx = p.xTicks ?? 6, ny = p.yTicks ?? 4;
    const hasData = p.series.some(s => s.points.length > 0);
    const uid = React.useId().replace(/:/g, "");
    return (
        <div className="pw-chart" ref={wrap}>
            {width > 0 && (
                <svg width={width} height={height}>
                    <defs>
                        <filter id={`g${uid}`} x="-10%" y="-10%" width="120%" height="120%">
                            <feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    </defs>
                    {(p.bands ?? []).map((b, i) => (
                        <rect key={i} x={X(b.x0)} y={pad.t} width={Math.max(2, X(b.x1) - X(b.x0))} height={H} fill={b.color} rx={2} />
                    ))}
                    {Array.from({ length: ny + 1 }, (_, i) => p.y[0] + ((p.y[1] - p.y[0]) * i) / ny).map((v, i) => (
                        <g key={`y${i}`}>
                            <line x1={pad.l} x2={pad.l + W} y1={Y(v)} y2={Y(v)} stroke={PALETTE.grid} />
                            <text x={pad.l - 5} y={Y(v) + 3} textAnchor="end" className="pw-ax">{p.yTick ? p.yTick(v) : v.toFixed(0)}</text>
                        </g>
                    ))}
                    {Array.from({ length: nx + 1 }, (_, i) => p.x[0] + ((p.x[1] - p.x[0]) * i) / nx).map((v, i) => (
                        <text key={`x${i}`} x={X(v)} y={height - 4} textAnchor="middle" className="pw-ax">{p.xTick ? p.xTick(v) : v.toFixed(0)}</text>
                    ))}
                    {(p.vlines ?? []).map((v, i) => (
                        <g key={`v${i}`}>
                            <line x1={X(v.x)} x2={X(v.x)} y1={pad.t} y2={pad.t + H} stroke={v.color ?? "#fff"} strokeOpacity={0.6} strokeDasharray="3 3" />
                            {v.label && <text x={X(v.x) + 4} y={pad.t + 10} className="pw-ax" fill={v.color ?? "#fff"}>{v.label}</text>}
                        </g>
                    ))}
                    {p.series.map(s => {
                        const pts = s.points.filter(pt => Number.isFinite(pt.y));
                        if (!pts.length) return null;
                        const d = pts.map((pt, i) => `${i ? "L" : "M"}${X(pt.x).toFixed(1)},${Y(pt.y).toFixed(1)}`).join("");
                        const last = pts[pts.length - 1];
                        return (
                            <g key={s.id} opacity={s.opacity ?? 1}>
                                <path d={d} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeLinejoin="round"
                                      filter={s.glow ? `url(#g${uid})` : undefined} />
                                {s.dots && pts.map((pt, i) => <circle key={i} cx={X(pt.x)} cy={Y(pt.y)} r={2.6} fill={pt.dot ?? s.color} stroke="#0B1640" strokeWidth={0.8} />)}
                                {s.label && <text x={X(last.x) + 5} y={Y(last.y) + 3} className="pw-ax" fill={s.color} fontWeight={700}>{s.label}</text>}
                            </g>
                        );
                    })}
                </svg>
            )}
            {!hasData && <div className="pw-empty">{p.empty ?? "No data yet"}</div>}
        </div>
    );
};
