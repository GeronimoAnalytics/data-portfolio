import * as React from "react";
import { hasEmbeddedClip, playRadio, RadioSession } from "../audio/radioPlayer";
import { prepareCanvas, useElementSize } from "../hooks/useElementSize";

export interface RadioModuleProps {
    channelLabel: string;   // e.g. "VER · CAR 1"
    lap: number;
    compact?: boolean;
}

const LEDS = 15;
const ledColor = (i: number) => (i < 5 ? "#2BE38B" : i < 10 ? "#FF2B4F" : "#5B95FF");

export const RadioModule: React.FC<RadioModuleProps> = p => {
    const [playing, setPlaying] = React.useState(false);
    const [lastCall, setLastCall] = React.useState<number | null>(null);
    const session = React.useRef<RadioSession | null>(null);
    const eqWrap = React.useRef<HTMLDivElement>(null);
    const eq = React.useRef<HTMLCanvasElement>(null);
    const ledRefs = React.useRef<(HTMLElement | null)[]>([]);
    const { width, height } = useElementSize(eqWrap);

    const toggle = async () => {
        if (playing) { session.current?.stop(); return; }
        setPlaying(true);
        setLastCall(p.lap);
        try {
            session.current = await playRadio(() => { setPlaying(false); session.current = null; });
        } catch {
            setPlaying(false);
        }
    };

    React.useEffect(() => () => session.current?.stop(), []);

    // equalizer + rev-light LEDs
    React.useEffect(() => {
        const c = eq.current;
        if (!c || width < 10) return;
        let raf = 0;
        const bins = new Uint8Array(256);
        const draw = () => {
            const ctx = prepareCanvas(c, width, height);
            if (!ctx) return;
            const an = session.current?.analyser;
            if (an) an.getByteFrequencyData(bins); else bins.fill(0);
            const bars = 32, bw = width / bars;
            const mid = height / 2;
            let energy = 0;
            const idle = performance.now() / 600;
            for (let i = 0; i < bars; i++) {
                const v = an ? bins[3 + Math.floor((i * 36) / bars)] / 255 : 0.04 + 0.03 * Math.sin(idle + i * 0.6);
                energy += v;
                const h = Math.max(1.5, v * (height * 0.46));
                const g = ctx.createLinearGradient(0, mid - h, 0, mid + h);
                g.addColorStop(0, playing ? "#E4002B" : "#16224F");
                g.addColorStop(0.5, playing ? "#FFC906" : "#22336E");
                g.addColorStop(1, playing ? "#E4002B" : "#16224F");
                ctx.fillStyle = g;
                ctx.fillRect(i * bw + 1, mid - h, bw - 2, h * 2);
            }
            ctx.fillStyle = "rgba(230,237,247,0.08)"; ctx.fillRect(0, mid, width, 1);
            const level = Math.min(1, (energy / bars) * 1.7);
            const lit = playing ? Math.round(level * LEDS) : 0;
            ledRefs.current.forEach((el, i) => { if (el) el.className = `pw-led ${i < lit ? "is-lit" : ""}`; });
            raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(raf);
    }, [width, height, playing]);

    return (
        <div className={`pw-radio ${playing ? "is-live" : ""} ${p.compact ? "is-compact" : ""}`}>
            <h2>TEAM RADIO <span>{p.channelLabel}</span><em className={`pw-onair ${playing ? "is-on" : ""}`}>{playing ? "ON AIR" : "Standby"}</em></h2>
            <div className="pw-radio__body">
                <button className="pw-radiobtn" onClick={toggle} aria-pressed={playing} title={hasEmbeddedClip() ? "Embedded clip" : "Synth bleeps"}>
                    <span className="pw-radiobtn__label">[ RADIO MAX ]</span>
                    <span className="pw-radiobtn__sub">Unfiltered team radio</span>
                </button>
                <div className="pw-radio__side">
                    <div className="pw-revlights" aria-hidden="true">
                        {Array.from({ length: LEDS }, (_, i) => (
                            <i key={i} ref={el => { ledRefs.current[i] = el; }} className="pw-led" style={{ ["--led" as string]: ledColor(i) }} />
                        ))}
                    </div>
                    <div className="pw-eq" ref={eqWrap}><canvas ref={eq} className="pw-layer" /></div>
                    <div className="pw-radio__meta">{lastCall !== null ? `Last call · lap ${lastCall}` : "Push to talk · 300–3400 Hz"}</div>
                </div>
            </div>
        </div>
    );
};
