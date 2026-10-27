/**
 * Team-radio playback for the RADIO MAX button.
 *
 * - The clip is embedded at build time as a data URI (scripts/embed-audio.mjs) because a
 *   .pbiviz package cannot ship loose media files and visuals have no file-system access.
 * - Playback uses `new Audio(...)` routed through a Web Audio graph:
 *       <audio> -> band-pass "radio" EQ -> analyser -> speakers
 *   The analyser feeds the equalizer overlay and the rev-light LEDs.
 * - Two synthesized "bleeps" (the classic pit-radio open tone) are played before the clip.
 *   Without an embedded clip, the bleeps + a squelch burst are played on their own.
 */
import { RADIO_CLIP_DATA_URI } from "./radioClip";

export interface RadioSession {
    analyser: AnalyserNode;
    stop: () => void;
}

let ctx: AudioContext | null = null;
function audioContext(): AudioContext {
    if (!ctx) {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new Ctor();
    }
    return ctx;
}

function bleep(ac: AudioContext, out: AudioNode, at: number, freq = 1180, dur = 0.09): void {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.18, at + 0.005);
    g.gain.setValueAtTime(0.18, at + dur - 0.01);
    g.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + dur + 0.02);
}

function squelch(ac: AudioContext, out: AudioNode, at: number, dur = 0.22): void {
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
    const data = buf.getChannelData(0);
    const noise = new Uint32Array(data.length);
    for (let o = 0; o < noise.length; o += 16384) window.crypto.getRandomValues(noise.subarray(o, o + 16384)); // 64 KB API limit
    for (let i = 0; i < data.length; i++) data[i] = (noise[i] / 0xffffffff * 2 - 1) * (1 - i / data.length);
    const src = ac.createBufferSource();
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const g = ac.createGain(); g.gain.value = 0.12;
    src.buffer = buf;
    src.connect(bp).connect(g).connect(out);
    src.start(at);
}

export const hasEmbeddedClip = (): boolean => RADIO_CLIP_DATA_URI.length > 0;

export async function playRadio(onEnded: () => void): Promise<RadioSession> {
    const ac = audioContext();
    if (ac.state === "suspended") await ac.resume();

    const analyser = ac.createAnalyser();
    analyser.fftSize = 512;   // ~94 Hz bins: the 300-3400 Hz voice band spans ~bins 3-38
    analyser.smoothingTimeConstant = 0.72;
    analyser.connect(ac.destination);

    // radio voice band EQ (300 Hz - 3.4 kHz) with a touch of presence
    const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 280;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3600;
    const peak = ac.createBiquadFilter(); peak.type = "peaking"; peak.frequency.value = 1700; peak.gain.value = 4;
    hp.connect(lp).connect(peak).connect(analyser);

    const now = ac.currentTime + 0.02;
    bleep(ac, analyser, now);
    bleep(ac, analyser, now + 0.14);

    let audio: HTMLAudioElement | null = null;
    let timer = 0;
    let stopped = false;
    const finish = () => {
        if (stopped) return;
        stopped = true;
        window.clearTimeout(timer);
        const end = ac.currentTime + 0.02;
        bleep(ac, analyser, end, 980, 0.07);
        window.setTimeout(() => { analyser.disconnect(); onEnded(); }, 160);
    };

    if (hasEmbeddedClip()) {
        audio = new Audio(RADIO_CLIP_DATA_URI);
        audio.preload = "auto";
        const src = ac.createMediaElementSource(audio);
        src.connect(hp);
        audio.addEventListener("ended", finish);
        timer = window.setTimeout(() => { audio?.play().catch(finish); }, 300);
    } else {
        squelch(ac, analyser, now + 0.3);
        timer = window.setTimeout(finish, 900);
    }

    return {
        analyser,
        stop: () => { audio?.pause(); finish(); },
    };
}
