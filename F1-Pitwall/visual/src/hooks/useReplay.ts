import { useCallback, useEffect, useRef, useState } from "react";

export const REPLAY_SPEEDS = [1, 2, 5, 20, 60] as const;

/**
 * Replay clock in race-seconds.
 *  - `tRef` is updated every animation frame (the track map reads it directly for 60 fps motion)
 *  - `t` is the React state copy, published ~8x per second for the heavier panels
 */
export function useReplay(raceEnd: number) {
    const tRef = useRef(0);
    const [t, setT] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState<number>(5);

    useEffect(() => {
        if (!playing) return;
        let raf = 0;
        let last = performance.now();
        let lastPublish = 0;
        const loop = (now: number) => {
            const dt = Math.min(0.25, (now - last) / 1000);
            last = now;
            tRef.current = Math.min(raceEnd, tRef.current + dt * speed);
            if (now - lastPublish > 120) { setT(tRef.current); lastPublish = now; }
            if (tRef.current >= raceEnd) { setT(raceEnd); setPlaying(false); return; }
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(raf);
    }, [playing, speed, raceEnd]);

    const seek = useCallback((v: number) => {
        tRef.current = Math.max(0, Math.min(raceEnd, v));
        setT(tRef.current);
    }, [raceEnd]);

    const reset = useCallback(() => { setPlaying(false); seek(0); }, [seek]);

    return { tRef, t, playing, setPlaying, speed, setSpeed, seek, reset };
}
