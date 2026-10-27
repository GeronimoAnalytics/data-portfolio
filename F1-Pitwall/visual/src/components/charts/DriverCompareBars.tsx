import * as React from "react";
import { Driver } from "../../data/model";
import { PALETTE } from "../../data/teamColors";

interface Metric { label: string; unit: string; get: (d: Driver) => number | null; fmt: (v: number) => string }

const brakeZones = (d: Driver) => d.tel.filter(s => s.brake && s.brakePct > 5);
const METRICS: Metric[] = [
    { label: "Top speed", unit: "km/h", get: d => (d.tel.length ? Math.max(...d.tel.map(s => s.speed)) : null), fmt: v => v.toFixed(0) },
    { label: "Brake pressure", unit: "% avg", get: d => { const z = brakeZones(d); return z.length ? z.reduce((s, x) => s + x.brakePct, 0) / z.length : null; }, fmt: v => v.toFixed(0) },
    { label: "G-Force", unit: "peak g", get: d => (d.tel.length ? Math.max(...d.tel.map(s => Math.hypot(s.gLat, s.gLong))) : null), fmt: v => v.toFixed(1) },
    { label: "Full throttle", unit: "% lap", get: d => (d.tel.length ? (d.tel.filter(s => s.throttle >= 98).length / d.tel.length) * 100 : null), fmt: v => v.toFixed(0) },
    { label: "Gear usage", unit: "avg", get: d => (d.tel.length ? d.tel.reduce((s, x) => s + x.gear, 0) / d.tel.length : null), fmt: v => v.toFixed(1) },
];

/** DRIVER TELEMETRY COMPARISON — fastest-lap KPIs, focus (red) vs rival (yellow). */
export const DriverCompareBars: React.FC<{ a?: Driver; b?: Driver; compact?: boolean }> = ({ a, b, compact }) => {
    const metrics = compact ? METRICS.filter(m => m.label !== "Full throttle") : METRICS;
    return (
        <div className="pw-bars">
            {metrics.map(m => {
                const va = a ? m.get(a) : null, vb = b ? m.get(b) : null;
                const max = Math.max(va ?? 0, vb ?? 0) || 1;
                const lo = m.label === "Top speed" ? max * 0.7 : 0;                 // zoom where differences live
                const h = (v: number | null) => (v === null ? 0 : Math.max(4, ((v - lo) / (max - lo)) * 100));
                return (
                    <div key={m.label} className="pw-bars__group">
                        <div className="pw-bars__plot">
                            <div className="pw-bars__bar" style={{ height: `${h(va)}%`, ["--c" as string]: PALETTE.a }}><span>{va !== null ? m.fmt(va) : "—"}</span></div>
                            <div className="pw-bars__bar" style={{ height: `${h(vb)}%`, ["--c" as string]: PALETTE.b }}><span>{vb !== null ? m.fmt(vb) : "—"}</span></div>
                        </div>
                        <div className="pw-bars__label">{m.label}<em>{m.unit}</em></div>
                    </div>
                );
            })}
        </div>
    );
};
