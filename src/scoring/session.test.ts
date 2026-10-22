import { describe, expect, it } from 'vitest';
import type { Sample } from '../device/DeviceConnection';
import { IDENTITY_ZERO, StillnessDetector } from './calibration';
import { DEFAULT_CONFIG, SessionEngine, effectiveRange, repQuality } from './session';
import type { EngineEvent } from './session';

const sample = (t: number, pressure: number, pelvisTilt = 0, trunkTilt = pelvisTilt): Sample => ({
  seq: t / 10,
  t,
  pressure,
  pelvis: { tilt: pelvisTilt, obliquity: 0, rotation: 0 },
  trunk: { tilt: trunkTilt, obliquity: 0, rotation: 0 },
});

describe('effectiveRange', () => {
  it('scales the band around its centre by difficulty', () => {
    expect(effectiveRange({ ...DEFAULT_CONFIG, difficulty: 'normal' })).toEqual({ lo: 38, hi: 42 });
    expect(effectiveRange({ ...DEFAULT_CONFIG, difficulty: 'easy' })).toEqual({ lo: 37, hi: 43 });
    expect(effectiveRange({ ...DEFAULT_CONFIG, difficulty: 'hard' })).toEqual({ lo: 38.8, hi: 41.2 });
  });
});

describe('SessionEngine', () => {
  const cfg = { ...DEFAULT_CONFIG, holdSec: 2, reps: 2, restSec: 1 };

  function run(engine: SessionEngine, fromT: number, ms: number, f: (t: number) => Sample) {
    const events: EngineEvent[] = [];
    for (let t = fromT; t < fromT + ms; t += 10) events.push(...engine.push(f(t)));
    return events;
  }

  it('runs countdown → hold → rest → hold → done when on target', () => {
    const e = new SessionEngine(cfg, IDENTITY_ZERO);
    e.push(sample(0, 40));
    e.start();
    const events = run(e, 10, 10_000, (t) => sample(t, 40));
    const types = events.map((ev) => ev.type);
    expect(types.filter((t) => t === 'countdown').length).toBeGreaterThanOrEqual(3);
    expect(types.filter((t) => t === 'rep_start')).toHaveLength(2);
    expect(types).toContain('rest_start');
    expect(types[types.length - 1]).toBe('done');
    const s = e.summary();
    expect(s.repsSucceeded).toBe(2);
    expect(s.inTargetPct).toBeGreaterThan(99);
    expect(s.score).toBe(40); // 4 s × 10 pts
  });

  it('pauses the hold timer during compensation and counts it by type', () => {
    const e = new SessionEngine({ ...cfg, reps: 1 }, IDENTITY_ZERO);
    e.push(sample(0, 40));
    e.start();
    run(e, 10, 3000, (t) => sample(t, 40)); // countdown
    expect(e.currentPhase).toBe('hold');
    run(e, 3010, 500, (t) => sample(t, 40));
    const before = e.snapshot.holdProgress;
    const comp = run(e, 3510, 1000, (t) => sample(t, 40, 8, 8)); // anterior tilt
    expect(comp.filter((ev) => ev.type === 'compensation')).toEqual([{ type: 'compensation', comp: 'anterior_tilt' }]);
    // Only the 200 ms debounce window may still count as good time.
    expect(e.snapshot.holdProgress - before).toBeLessThanOrEqual(0.11);
    const rest = run(e, 4510, 3000, (t) => sample(t, 40));
    const end = rest.find((ev) => ev.type === 'rep_end');
    expect(end && end.type === 'rep_end' && end.result.compensations.anterior_tilt).toBe(1);
    expect(e.summary().compensations.anterior_tilt).toBe(1);
  });

  it('ends a rep as failed after the timeout when pressure is off target', () => {
    const e = new SessionEngine({ ...cfg, reps: 1 }, IDENTITY_ZERO);
    e.push(sample(0, 30));
    e.start();
    const events = run(e, 10, 3000 + 6100, (t) => sample(t, 30));
    const end = events.find((ev) => ev.type === 'rep_end');
    expect(end && end.type === 'rep_end' && end.result.success).toBe(false);
    expect(e.currentPhase).toBe('done');
  });

  it('stop() ends the session early', () => {
    const e = new SessionEngine(cfg, IDENTITY_ZERO);
    e.push(sample(0, 40));
    e.start();
    run(e, 10, 3500, (t) => sample(t, 40));
    const s = e.stop();
    expect(s.stoppedEarly).toBe(true);
    expect(s.repsCompleted).toBe(1);
    expect(s.repsSucceeded).toBe(0);
  });
});

describe('repQuality', () => {
  it('rewards time in target and steadiness', () => {
    expect(repQuality(1, 0, { lo: 38, hi: 42 })).toBe(100);
    expect(repQuality(1, 2, { lo: 38, hi: 42 })).toBe(70);
    expect(repQuality(0.5, 1, { lo: 38, hi: 42 })).toBe(50);
  });
});

describe('StillnessDetector', () => {
  it('restarts when moving more than 1° and yields the mean as zero pose', () => {
    const d = new StillnessDetector(3000, 1);
    for (let t = 0; t < 1000; t += 10) d.push(sample(t, 40, 2));
    const moved = d.push(sample(1000, 40, 3.5));
    expect(moved.restarted).toBe(true);
    let zero = null;
    for (let t = 1010; t <= 4100 && !zero; t += 10) zero = d.push(sample(t, 40, 3.5, 1)).zero;
    expect(zero).not.toBeNull();
    expect(zero!.pelvis.tilt).toBeCloseTo(3.5);
    expect(zero!.trunk.tilt).toBeCloseTo(1);
  });
});
