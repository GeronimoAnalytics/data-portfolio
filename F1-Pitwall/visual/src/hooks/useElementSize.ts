import { RefObject, useEffect, useState } from "react";

/** Tracks the content-box size of an element (ResizeObserver). */
export function useElementSize<T extends HTMLElement>(ref: RefObject<T>): { width: number; height: number } {
    const [size, setSize] = useState({ width: 0, height: 0 });
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const update = () => {
            const r = el.getBoundingClientRect();
            setSize(s => (Math.round(r.width) === s.width && Math.round(r.height) === s.height
                ? s : { width: Math.round(r.width), height: Math.round(r.height) }));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [ref]);
    return size;
}

/** Size a canvas for the device pixel ratio and return a ready-to-draw 2D context. */
export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(width * dpr)), h = Math.max(1, Math.floor(height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return ctx;
}

/** Embedded Titillium Web (see style/fonts.less) with system fallbacks. FONT_MONO kept as alias for numbers. */
export const FONT_UI = "'Titillium Web', 'Segoe UI', system-ui, -apple-system, sans-serif";
export const FONT_MONO = FONT_UI;
