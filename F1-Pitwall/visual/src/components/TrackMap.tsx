import * as React from "react";
import { interp } from "../data/buildDataset";
import { Driver, MapMode, Race } from "../data/model";
import { CarState, carPositionsAt, fmtLap } from "../data/raceEngine";
import { teamName } from "../data/teamColors";
import { FONT_UI, prepareCanvas, useElementSize } from "../hooks/useElementSize";

export interface TrackMapProps {
    race: Race;
    tRef: React.MutableRefObject<number>;
    focus: Driver | undefined;
    compare: Driver | undefined;
    focusCar?: CarState;
    hoverDist: number | null;
    mode: MapMode;
    onMode: (m: MapMode) => void;
    onSelect: (driverId: string) => void;
    compact?: boolean;
}

const SECTOR_COLORS = ["#FF2B4F", "#3D7BFF", "#FFC906"];
const SPEED_STOPS: [number, [number, number, number]][] = [
    [0, [43, 89, 255]], [0.3, [0, 224, 255]], [0.55, [57, 255, 136]], [0.8, [255, 230, 0]], [1, [255, 46, 46]],
];
function speedColor(f: number): string {
    const x = Math.min(1, Math.max(0, f));
    for (let i = 1; i < SPEED_STOPS.length; i++) {
        const [p1, c1] = SPEED_STOPS[i];
        const [p0, c0] = SPEED_STOPS[i - 1];
        if (x <= p1) {
            const k = (x - p0) / (p1 - p0);
            return `rgb(${c0.map((c, j) => Math.round(c + k * (c1[j] - c))).join(",")})`;
        }
    }
    return "rgb(255,46,46)";
}

interface Projection { px: number[]; py: number[]; map: (x: number, y: number) => [number, number]; cx: number; cy: number }

/** Rotate the layout onto its principal axis, mirror Y (feed is y-up), and fit into the box. */
function project(race: Race, w: number, h: number, pad: number, padRight = pad): Projection | null {
    const xs = race.track.map(s => s.x), ys = race.track.map(s => s.y);
    const n = xs.length;
    if (n < 3 || w < 20 || h < 20) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    let theta = -0.5 * Math.atan2(2 * sxy, sxx - syy);
    if (h > (w - padRight + pad) * 1.15) theta += Math.PI / 2;                       // portrait container -> long axis vertical
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const rot = (x: number, y: number): [number, number] => {
        const dx = x - mx, dy = y - my;
        return [dx * cos - dy * sin, -(dx * sin + dy * cos)];
    };
    const r = xs.map((x, i) => rot(x, ys[i]));
    const minX = Math.min(...r.map(p => p[0])), maxX = Math.max(...r.map(p => p[0]));
    const minY = Math.min(...r.map(p => p[1])), maxY = Math.max(...r.map(p => p[1]));
    const scale = Math.min((w - pad - padRight) / (maxX - minX || 1), (h - 2 * pad) / (maxY - minY || 1));
    const ox = pad + (w - pad - padRight - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = (h - (maxY - minY) * scale) / 2 - minY * scale;
    const map = (x: number, y: number): [number, number] => { const [a, b] = rot(x, y); return [ox + a * scale, oy + b * scale]; };
    const px = r.map(p => ox + p[0] * scale), py = r.map(p => oy + p[1] * scale);
    return { px, py, map, cx: pad + (w - pad - padRight) / 2, cy: h / 2 };
}

const car_status = (c: CarState | undefined) => !c ? "" : c.status === "PIT" ? "IN PIT" :
    `P${c.pos}${c.pos > 1 && c.interval !== null ? ` · +${c.interval.toFixed(2)}s` : ""}`;

export const TrackMap: React.FC<TrackMapProps> = p => {
    const wrap = React.useRef<HTMLDivElement>(null);
    const base = React.useRef<HTMLCanvasElement>(null);
    const live = React.useRef<HTMLCanvasElement>(null);
    const { width, height } = useElementSize(wrap);
    const pad = p.compact ? 30 : 44;
    const padRight = p.compact ? 150 : 190;   // keep the info card clear of the layout
    const proj = React.useMemo(() => project(p.race, width, height, pad, padRight), [p.race, width, height, pad, padRight]);

    // ---------------------------------------------------------------- static layer
    React.useEffect(() => {
        const c = base.current;
        if (!c || !proj) return;
        const ctx = prepareCanvas(c, width, height);
        if (!ctx) return;
        const { px, py } = proj;
        const tr = p.race.track;

        const path = () => { ctx.beginPath(); px.forEach((x, i) => (i ? ctx.lineTo(x, py[i]) : ctx.moveTo(x, py[i]))); ctx.closePath(); };
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        const k = p.compact ? 0.8 : 1;

        // neon tube: wide soft glow -> tarmac -> bright core
        ctx.save();
        ctx.shadowColor = "rgba(61,123,255,0.9)"; ctx.shadowBlur = 22 * k;
        path(); ctx.strokeStyle = "rgba(61,123,255,0.35)"; ctx.lineWidth = 14 * k; ctx.stroke();
        ctx.restore();
        path(); ctx.strokeStyle = "#0A1438"; ctx.lineWidth = 9 * k; ctx.stroke();

        const focusTel = p.focus?.tel ?? [];
        const ratio = focusTel.length ? focusTel[focusTel.length - 1].d / (p.race.trackLength || 1) : 1;
        const fd = focusTel.map(s => s.d), fs = focusTel.map(s => s.speed);
        const vMin = fs.length ? Math.min(...fs) : 0, vMax = fs.length ? Math.max(...fs) : 1;
        ctx.save();
        ctx.shadowBlur = 10 * k;
        for (let i = 1; i < tr.length; i++) {
            const d = tr[i].d;
            let col = "#6FA2FF";
            if (p.mode === "speed" && fs.length) col = speedColor((interp(d * ratio, fd, fs) - vMin) / (vMax - vMin || 1));
            else if (p.mode === "sectors") col = SECTOR_COLORS[d < p.race.sectorDist[0] ? 0 : d < p.race.sectorDist[1] ? 1 : 2];
            ctx.strokeStyle = col; ctx.shadowColor = col;
            ctx.lineWidth = (p.mode === "neon" ? 3.2 : 3.6) * k;
            ctx.beginPath(); ctx.moveTo(px[i - 1], py[i - 1]); ctx.lineTo(px[i], py[i]); ctx.stroke();
        }
        ctx.restore();
        if (p.mode === "neon") { path(); ctx.strokeStyle = "rgba(225,236,255,0.85)"; ctx.lineWidth = 1 * k; ctx.stroke(); }

        // DRS zones: green dashes alongside + label
        ctx.font = `700 ${10 * k}px ${FONT_UI}`;
        let zoneStart = -1;
        for (let i = 1; i <= tr.length; i++) {
            const on = i < tr.length && tr[i].drs && tr[i - 1].drs;
            if (on && zoneStart < 0) zoneStart = i;
            if ((!on || i === tr.length) && zoneStart >= 0) {
                const off = 15 * k;
                ctx.strokeStyle = "rgba(43,227,139,0.85)"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
                ctx.beginPath();
                for (let j = zoneStart; j < i; j++) {
                    const nx = -(py[j] - py[j - 1]), ny = px[j] - px[j - 1], len = Math.hypot(nx, ny) || 1;
                    const X = px[j] + (nx / len) * off, Y = py[j] + (ny / len) * off;
                    j === zoneStart ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
                }
                ctx.stroke(); ctx.setLineDash([]);
                const m = Math.floor((zoneStart + i) / 2);
                const nx = -(py[m] - py[m - 1]), ny = px[m] - px[m - 1], len = Math.hypot(nx, ny) || 1;
                ctx.fillStyle = "#2BE38B"; ctx.textAlign = "center";
                if (i - zoneStart > 6) ctx.fillText("DRS", px[m] + (nx / len) * (off + 11), py[m] + (ny / len) * (off + 11) + 3);
                ctx.textAlign = "start";
                zoneStart = -1;
            }
        }

        // start/finish chequer + sector markers
        const marker = (d: number, label: string, chequer = false) => {
            const i = Math.max(1, tr.findIndex(s => s.d >= d));
            const nx = -(py[i] - py[i - 1]), ny = px[i] - px[i - 1], len = Math.hypot(nx, ny) || 1;
            const L = 10 * k;
            if (chequer) {
                for (let q = -2; q < 2; q++) {
                    ctx.fillStyle = q % 2 ? "#fff" : "#000";
                    ctx.beginPath(); ctx.arc(px[i] + (nx / len) * (q + 0.5) * 3.2 * k, py[i] + (ny / len) * (q + 0.5) * 3.2 * k, 1.8 * k, 0, Math.PI * 2); ctx.fill();
                }
            } else {
                ctx.strokeStyle = "rgba(234,240,255,0.8)"; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(px[i] - (nx / len) * L, py[i] - (ny / len) * L); ctx.lineTo(px[i] + (nx / len) * L, py[i] + (ny / len) * L); ctx.stroke();
            }
            ctx.fillStyle = "rgba(234,240,255,0.85)"; ctx.font = `600 ${10 * k}px ${FONT_UI}`;
            ctx.fillText(label, px[i] - (nx / len) * (L + 8) - 14, py[i] - (ny / len) * (L + 8) + 3);
        };
        marker(0.1, "", true);
        marker(p.race.sectorDist[0], "Sector 2");
        marker(p.race.sectorDist[1], "Sector 3");
    }, [proj, p.race, p.mode, p.focus, width, height, p.compact]);

    // ---------------------------------------------------------------- live layer (60 fps)
    const trail = React.useRef<[number, number][]>([]);
    const hoverRef = React.useRef(p.hoverDist);
    hoverRef.current = p.hoverDist;
    const hitboxes = React.useRef<{ id: string; x: number; y: number }[]>([]);

    React.useEffect(() => {
        const c = live.current;
        if (!c || !proj) return;
        let raf = 0;
        trail.current = [];
        const draw = () => {
            const ctx = prepareCanvas(c, width, height);
            if (!ctx) return;
            const T = p.tRef.current;
            const cars = carPositionsAt(p.race, T);
            const boxes: { id: string; x: number; y: number }[] = [];
            const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);

            // hover cursor from the telemetry panel
            const hd = hoverRef.current;
            if (hd !== null && p.race.track.length) {
                const xs = p.race.track.map(s => s.x), ys = p.race.track.map(s => s.y);
                const [hx, hy] = proj.map(interp(hd, p.race.refDist, xs), interp(hd, p.race.refDist, ys));
                ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.arc(hx, hy, 10, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = "#FFFFFF"; ctx.font = `600 11px ${FONT_UI}`;
                ctx.fillText(`${Math.round(hd)} m`, hx + 14, hy - 10);
            }

            // focus trail
            const f = cars.find(cc => cc.driver.id === p.focus?.id);
            if (f) {
                const pt = proj.map(f.x, f.y);
                const tl = trail.current;
                const lastPt = tl[tl.length - 1];
                if (lastPt && Math.hypot(lastPt[0] - pt[0], lastPt[1] - pt[1]) > 80) trail.current = [];
                if (!lastPt || Math.hypot(lastPt[0] - pt[0], lastPt[1] - pt[1]) > 2) trail.current.push(pt);
                const t2 = trail.current;
                if (t2.length > 44) t2.shift();
                for (let i = 1; i < t2.length; i++) {
                    ctx.strokeStyle = `rgba(255,43,79,${(i / t2.length) * 0.9})`;
                    ctx.lineWidth = 4 * (i / t2.length);
                    ctx.beginPath(); ctx.moveTo(t2[i - 1][0], t2[i - 1][1]); ctx.lineTo(t2[i][0], t2[i][1]); ctx.stroke();
                }
            }

            // cars: field first, then rival, then focus on top
            const order = (id: string) => (id === p.focus?.id ? 2 : id === p.compare?.id ? 1 : 0);
            cars.sort((a, b) => order(a.driver.id) - order(b.driver.id));
            let focusXY: [number, number] | null = null;
            for (const car of cars) {
                const [x, y] = proj.map(car.x, car.y);
                const isF = car.driver.id === p.focus?.id, isC = car.driver.id === p.compare?.id;
                const r = isF ? 6 : isC ? 5.5 : 4.2;
                ctx.save();
                ctx.shadowColor = isF ? "#FF2B4F" : isC ? "#FFC906" : car.driver.color;
                ctx.shadowBlur = isF || isC ? 16 + 6 * pulse : 6;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
                if (car.pit) { ctx.strokeStyle = car.driver.color; ctx.lineWidth = 2; ctx.stroke(); }
                else { ctx.fillStyle = car.driver.color; ctx.fill(); }
                ctx.restore();
                ctx.lineWidth = isF || isC ? 2 : 1;
                ctx.strokeStyle = isF ? "#FF2B4F" : isC ? "#FFC906" : "rgba(5,10,31,0.9)";
                ctx.beginPath(); ctx.arc(x, y, r + (isF || isC ? 2.5 : 0.5), 0, Math.PI * 2); ctx.stroke();
                if (isF) { focusXY = [x, y]; }
                else {
                    const dx = x - proj.cx, dy = y - proj.cy, dl = Math.hypot(dx, dy) || 1;
                    ctx.font = `${isC ? 700 : 600} ${isC ? 11 : 10}px ${FONT_UI}`;
                    ctx.fillStyle = isC ? "#FFC906" : "rgba(214,226,255,0.78)";
                    ctx.textAlign = "center"; ctx.textBaseline = "middle";
                    ctx.fillText(car.driver.code + (car.pit ? " · PIT" : ""), x + (dx / dl) * (r + 11), y + (dy / dl) * (r + 9));
                    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
                }
                boxes.push({ id: car.driver.id, x, y });
            }
            // focus label card (team bar + name + team), like a broadcast graphic
            if (focusXY && p.focus) {
                const [x, y] = focusXY;
                const n = p.focus.name.split(" ");
                const title = `${n.length > 1 ? n[0][0] + ". " + n.slice(1).join(" ") : p.focus.name}`.toUpperCase() + " - " + teamName(p.focus.constructorId).toUpperCase();
                ctx.font = `700 11px ${FONT_UI}`;
                const tw = Math.max(ctx.measureText(title).width, 60) + 18;
                const bx = Math.min(width - tw - 6, Math.max(6, x - tw - 14)), by = Math.min(height - 40, Math.max(6, y - 40));
                ctx.fillStyle = "rgba(6,12,36,0.88)"; ctx.strokeStyle = "rgba(120,160,255,0.35)"; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.roundRect?.(bx, by, tw, 32, 4); ctx.fill(); ctx.stroke();
                ctx.fillStyle = p.focus.color; ctx.fillRect(bx + 5, by + 6, 3, 20);
                ctx.fillStyle = "#EAF0FF"; ctx.fillText(title, bx + 13, by + 15);
                ctx.font = `600 10px ${FONT_UI}`; ctx.fillStyle = "#8B9BC6";
                ctx.fillText(`${p.focus.code} · ${car_status(p.focusCar)}`, bx + 13, by + 27);
                ctx.strokeStyle = "rgba(255,43,79,0.8)"; ctx.beginPath(); ctx.moveTo(bx + tw, by + 16); ctx.lineTo(x - 8, y); ctx.stroke();
            }
            hitboxes.current = boxes;
            raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, [proj, p.race, p.focus, p.compare, p.tRef, width, height, p.focusCar]);

    const onClick = (e: React.MouseEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        const hit = hitboxes.current.map(b => ({ b, d: Math.hypot(b.x - x, b.y - y) })).sort((a, b) => a.d - b.d)[0];
        if (hit && hit.d < 14) p.onSelect(hit.b.id);
    };

    const refDriver = p.race.drivers.find(d => d.tel === p.race.track);
    // live dash for the focus car: its fastest-lap channels at its current track position
    const fc = p.focusCar;
    const tel = p.focus?.tel ?? [];
    const at = (key: "speed" | "throttle" | "gear") => {
        if (!fc || !tel.length || fc.status === "FIN" || fc.status === "OUT") return null;
        const scale = tel[tel.length - 1].d / (p.race.trackLength || 1);
        return interp(fc.distOnLap * scale, tel.map(s => s.d), tel.map(s => s[key]));
    };
    const sp = at("speed"), th = at("throttle"), gr = at("gear");
    const secs = fc?.sectors ?? [];
    const modes: [MapMode, string][] = [["neon", "Track"], ["sectors", "Sectors"], ["speed", "Speed"]];
    return (
        <div className={`pw-trackmap ${p.compact ? "is-compact" : ""}`} ref={wrap} onClick={onClick}>
            <canvas ref={base} className="pw-layer" />
            <canvas ref={live} className="pw-layer" />
            <div className="pw-trackinfo">
                <b>{p.race.name.replace(" Grand Prix", "")} ({p.race.circuit})</b>
                <dl>
                    <dt>Speed:</dt><dd>{sp !== null ? `${Math.round(sp)} km/h` : "—"}</dd>
                    <dt>Throttle:</dt><dd>{th !== null ? `${Math.round(th)}%` : "—"}</dd>
                    <dt>Gear:</dt><dd>{gr !== null ? Math.round(gr) : "—"}</dd>
                </dl>
                {!p.compact && (
                    <dl className="pw-trackinfo__secs">
                        {[0, 1, 2].map(k => (
                            <React.Fragment key={k}>
                                <dt>S{k + 1}:</dt>
                                <dd className={`pw-sectxt pw-sectxt--${secs[k]?.color ?? "none"}`}>{secs[k]?.time ? `${secs[k].time!.toFixed(1)}s` : "—"}</dd>
                            </React.Fragment>
                        ))}
                    </dl>
                )}
            </div>
            <div className="pw-trackfoot">
                <span className="pw-trackfoot__meta">
                    {(p.race.trackLength / 1000).toFixed(2)} km · {p.race.totalLaps} laps
                    {refDriver && !p.compact && <> · ref. {refDriver.code} {fmtLap(refDriver.fastestLapTime)}</>}
                </span>
                {!p.compact && (
                    <div className="pw-chips" onClick={e => e.stopPropagation()}>
                        {modes.map(([m, l]) => <button key={m} className={p.mode === m ? "is-on" : ""} onClick={() => p.onMode(m)}>{l}</button>)}
                    </div>
                )}
            </div>
        </div>
    );
};
