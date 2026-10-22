import type { SoundCue } from '../sync/broadcast';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  return ctx;
}

/** Must be called from a user gesture once, so later cues can play. */
export function unlockAudio() {
  const a = audio();
  if (a && a.state === 'suspended') void a.resume();
}

export function audioReady() {
  return !!ctx && ctx.state === 'running';
}

type Note = { f: number; at: number; dur: number; type?: OscillatorType; gain?: number };

function play(notes: Note[]) {
  const a = audio();
  if (!a || a.state !== 'running') return;
  const t0 = a.currentTime + 0.02;
  const master = a.createGain();
  master.gain.value = 0.22;
  master.connect(a.destination);
  for (const n of notes) {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.f;
    const start = t0 + n.at;
    const peak = n.gain ?? 1;
    // Soft attack/release so nothing clicks or startles.
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(peak, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, start + n.dur);
    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(start + n.dur + 0.05);
  }
}

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, A4 = 440, F4 = 349.23, D4 = 293.66;

const CUES: Record<SoundCue, Note[]> = {
  countdown: [{ f: G5, at: 0, dur: 0.16, type: 'sine', gain: 0.8 }],
  go: [
    { f: C6, at: 0, dur: 0.18, type: 'sine' },
    { f: G5, at: 0, dur: 0.18, type: 'triangle', gain: 0.5 },
  ],
  warn: [
    { f: A4, at: 0, dur: 0.16, type: 'triangle', gain: 0.9 },
    { f: F4, at: 0.17, dur: 0.22, type: 'triangle', gain: 0.9 },
  ],
  pass: [
    { f: C5, at: 0, dur: 0.16 },
    { f: E5, at: 0.11, dur: 0.16 },
    { f: G5, at: 0.22, dur: 0.3 },
  ],
  miss: [
    { f: F4, at: 0, dur: 0.2, type: 'triangle', gain: 0.7 },
    { f: D4, at: 0.18, dur: 0.3, type: 'triangle', gain: 0.7 },
  ],
  finish: [
    { f: C5, at: 0, dur: 0.2 },
    { f: E5, at: 0.15, dur: 0.2 },
    { f: G5, at: 0.3, dur: 0.2 },
    { f: C6, at: 0.45, dur: 0.6 },
    { f: G5, at: 0.45, dur: 0.6, type: 'triangle', gain: 0.4 },
  ],
};

export function playCue(cue: SoundCue) {
  play(CUES[cue]);
}
