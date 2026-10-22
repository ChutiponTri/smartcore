import { describe, expect, it } from 'vitest';
import type { RelAngles } from './calibration';
import { PostureMonitor, classifyCompensation, pressureInRange } from './rules';

const rel = (p: Partial<RelAngles>): RelAngles => ({
  pelvisTilt: 0,
  pelvisObliquity: 0,
  pelvisRotation: 0,
  trunkTilt: 0,
  trunkObliquity: 0,
  lumbar: 0,
  ...p,
});

const TH = { pelvisDeg: 5, lumbarDeg: 8, hysteresisDeg: 1, debounceMs: 200 };

/** Feeds a constant pose for `ms` at 100 Hz and returns the last state + any started events. */
function feed(m: PostureMonitor, r: RelAngles, fromMs: number, ms: number) {
  let last = m.update(r, fromMs);
  const started = last.started ? [last.started] : [];
  for (let t = fromMs + 10; t < fromMs + ms; t += 10) {
    last = m.update(r, t);
    if (last.started) started.push(last.started);
  }
  return { last, started, end: fromMs + ms };
}

describe('pressureInRange (A)', () => {
  it('is inclusive of both ends', () => {
    expect(pressureInRange(38, { lo: 38, hi: 42 })).toBe(true);
    expect(pressureInRange(42, { lo: 38, hi: 42 })).toBe(true);
    expect(pressureInRange(42.1, { lo: 38, hi: 42 })).toBe(false);
    expect(pressureInRange(37.9, { lo: 38, hi: 42 })).toBe(false);
  });
});

describe('PostureMonitor debounce', () => {
  it('ignores excursions shorter than 200 ms', () => {
    const m = new PostureMonitor(TH);
    const r = feed(m, rel({ pelvisTilt: 7 }), 0, 190);
    expect(r.last.ok).toBe(true);
    expect(r.started).toEqual([]);
    const back = feed(m, rel({}), r.end, 100);
    expect(back.last.ok).toBe(true);
    // A new excursion restarts the debounce timer.
    const again = feed(m, rel({ pelvisTilt: 7 }), back.end, 150);
    expect(again.started).toEqual([]);
  });

  it('counts an excursion held for 200 ms exactly once', () => {
    const m = new PostureMonitor(TH);
    const r = feed(m, rel({ pelvisTilt: 7 }), 0, 1000);
    expect(r.last.ok).toBe(false);
    expect(r.started).toEqual(['anterior_tilt']);
  });
});

describe('PostureMonitor hysteresis', () => {
  it('leaves at >5° but only returns at ≤4°', () => {
    const m = new PostureMonitor(TH);
    let r = feed(m, rel({ pelvisTilt: 5.5 }), 0, 300);
    expect(r.last.ok).toBe(false);

    r = feed(m, rel({ pelvisTilt: 4.5 }), r.end, 500);
    expect(r.last.ok).toBe(false);
    expect(r.last.compensation).toBe('anterior_tilt');

    r = feed(m, rel({ pelvisTilt: 3.9 }), r.end, 10);
    expect(r.last.ok).toBe(true);
    expect(r.last.compensation).toBeNull();
  });

  it('a value between 4° and 5° from OK does not trigger', () => {
    const m = new PostureMonitor(TH);
    const r = feed(m, rel({ pelvisTilt: -4.8, pelvisObliquity: 4.9 }), 0, 1000);
    expect(r.last.ok).toBe(true);
  });

  it('counts two separate excursions as two events', () => {
    const m = new PostureMonitor(TH);
    let r = feed(m, rel({ pelvisTilt: -7 }), 0, 400);
    const events = [...r.started];
    r = feed(m, rel({}), r.end, 300);
    r = feed(m, rel({ pelvisTilt: -7 }), r.end, 400);
    events.push(...r.started);
    expect(events).toEqual(['posterior_tilt', 'posterior_tilt']);
  });

  it('applies hysteresis to the lumbar limit as well', () => {
    const m = new PostureMonitor(TH);
    let r = feed(m, rel({ lumbar: 10 }), 0, 300);
    expect(r.last.compensation).toBe('lumbar_extension');
    r = feed(m, rel({ lumbar: 7.5 }), r.end, 100);
    expect(r.last.ok).toBe(false);
    r = feed(m, rel({ lumbar: 6.9 }), r.end, 10);
    expect(r.last.ok).toBe(true);
  });
});

describe('classifyCompensation', () => {
  it('detects anterior and posterior pelvic tilt', () => {
    expect(classifyCompensation(rel({ pelvisTilt: 9, trunkTilt: 9 }), 5, 8)).toBe('anterior_tilt');
    expect(classifyCompensation(rel({ pelvisTilt: -9, trunkTilt: -9 }), 5, 8)).toBe('posterior_tilt');
  });

  it('detects lumbar extension when trunk moves away from a neutral pelvis', () => {
    expect(classifyCompensation(rel({ pelvisTilt: 1.5, trunkTilt: 13, lumbar: 11.5 }), 5, 8)).toBe(
      'lumbar_extension',
    );
  });

  it('detects lateral pelvic tilt from obliquity in either direction', () => {
    expect(classifyCompensation(rel({ pelvisObliquity: -6 }), 5, 8)).toBe('lateral_tilt');
    expect(classifyCompensation(rel({ pelvisObliquity: 6 }), 5, 8)).toBe('lateral_tilt');
  });

  it('picks the most exceeded channel when several are out', () => {
    // tilt 6/5 = 1.2, lumbar 12/8 = 1.5 → lumbar dominates
    expect(classifyCompensation(rel({ pelvisTilt: 6, lumbar: 12 }), 5, 8)).toBe('lumbar_extension');
    // tilt 9/5 = 1.8 dominates
    expect(classifyCompensation(rel({ pelvisTilt: 9, lumbar: 9 }), 5, 8)).toBe('anterior_tilt');
  });

  it('returns null inside limits (limit itself is inside)', () => {
    expect(classifyCompensation(rel({ pelvisTilt: 5, pelvisObliquity: -5, lumbar: 8 }), 5, 8)).toBeNull();
    expect(classifyCompensation(rel({ lumbar: -12 }), 5, 8)).toBeNull();
  });
});
