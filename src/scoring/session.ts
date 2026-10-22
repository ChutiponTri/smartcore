import type { Sample } from '../device/DeviceConnection';
import type { RelAngles, ZeroPose } from './calibration';
import { relativeAngles } from './calibration';
import type { CompensationType, PressureRange } from './rules';
import { COMPENSATION_TYPES, PostureMonitor, pressureInRange } from './rules';

export type GameId = 'balloon' | 'boat';
export type Difficulty = 'easy' | 'normal' | 'hard';

export type SessionConfig = {
  gameId: GameId;
  targetLo: number;
  targetHi: number;
  baseline: number;
  pelvisDeg: number;
  lumbarDeg: number;
  holdSec: number;
  reps: number;
  restSec: number;
  difficulty: Difficulty;
};

export const DEFAULT_CONFIG: SessionConfig = {
  gameId: 'balloon',
  targetLo: 38,
  targetHi: 42,
  baseline: 40,
  pelvisDeg: 5,
  lumbarDeg: 8,
  holdSec: 10,
  reps: 10,
  restSec: 5,
  difficulty: 'normal',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'ง่าย', normal: 'ปกติ', hard: 'ยาก' };
const DIFFICULTY_WIDTH: Record<Difficulty, number> = { easy: 1.5, normal: 1, hard: 0.6 };

/** Target range after applying difficulty (scales the band around its centre). */
export function effectiveRange(cfg: SessionConfig): PressureRange {
  const mid = (cfg.targetLo + cfg.targetHi) / 2;
  const half = ((cfg.targetHi - cfg.targetLo) / 2) * DIFFICULTY_WIDTH[cfg.difficulty];
  return { lo: round1(mid - half), hi: round1(mid + half) };
}

export const COUNTDOWN_SEC = 3;
/** A rep that never reaches the hold time ends after this multiple of it. */
export const REP_TIMEOUT_FACTOR = 3;
/** Live score points per second of A×B=1. */
export const POINTS_PER_SEC = 10;

export type Phase = 'ready' | 'countdown' | 'hold' | 'rest' | 'done' | 'stopped';

export type CompCounts = Record<CompensationType, number>;

export type RepResult = {
  rep: number;
  success: boolean;
  durationSec: number;
  goodSec: number;
  /** % of rep time with A×B=1 */
  inTargetPct: number;
  pressureMean: number;
  pressureSd: number;
  compensations: CompCounts;
  /** 0–100 quality score: time in target and steadiness */
  score: number;
};

export type SessionSummary = {
  repsPlanned: number;
  repsCompleted: number;
  repsSucceeded: number;
  holdSec: number;
  goodSec: number;
  inTargetPct: number;
  pressureOnlyPct: number;
  postureOnlyPct: number;
  compensations: CompCounts;
  score: number;
  avgQuality: number;
  stoppedEarly: boolean;
};

export type EngineSnapshot = {
  phase: Phase;
  rep: number;
  totalReps: number;
  /** seconds left in countdown/rest, or hold time still needed in hold */
  remainingSec: number;
  holdProgress: number;
  score: number;
  pressure: number;
  rel: RelAngles;
  A: boolean;
  B: boolean;
  compensation: CompensationType | null;
  t: number;
};

export type EngineEvent =
  | { type: 'countdown'; n: number }
  | { type: 'rep_start'; rep: number }
  | { type: 'compensation'; comp: CompensationType }
  | { type: 'rep_end'; result: RepResult }
  | { type: 'rest_start'; rep: number }
  | { type: 'done'; summary: SessionSummary };

export const emptyCounts = (): CompCounts =>
  Object.fromEntries(COMPENSATION_TYPES.map((t) => [t, 0])) as CompCounts;

const ZERO_REL: RelAngles = {
  pelvisTilt: 0,
  pelvisObliquity: 0,
  pelvisRotation: 0,
  trunkTilt: 0,
  trunkObliquity: 0,
  lumbar: 0,
};

type RepAccumulator = {
  startT: number;
  elapsedMs: number;
  goodMs: number;
  n: number;
  mean: number;
  m2: number;
  comps: CompCounts;
};

/**
 * Runs one training session over a stream of samples. Time is taken from the
 * samples (device clock), so the engine is deterministic and testable.
 */
export class SessionEngine {
  readonly cfg: SessionConfig;
  readonly zero: ZeroPose;
  readonly range: PressureRange;
  readonly results: RepResult[] = [];
  private posture: PostureMonitor;
  private phase: Phase = 'ready';
  private phaseStart = 0;
  private lastT: number | null = null;
  private rep = 0;
  private acc: RepAccumulator | null = null;
  private lastCountdown = -1;
  private totals = { holdMs: 0, goodMs: 0, aMs: 0, bMs: 0 };
  private snap: EngineSnapshot;

  constructor(cfg: SessionConfig, zero: ZeroPose) {
    this.cfg = cfg;
    this.zero = zero;
    this.range = effectiveRange(cfg);
    this.posture = new PostureMonitor({
      pelvisDeg: cfg.pelvisDeg,
      lumbarDeg: cfg.lumbarDeg,
      hysteresisDeg: 1,
      debounceMs: 200,
    });
    this.snap = {
      phase: 'ready',
      rep: 0,
      totalReps: cfg.reps,
      remainingSec: 0,
      holdProgress: 0,
      score: 0,
      pressure: 0,
      rel: ZERO_REL,
      A: false,
      B: true,
      compensation: null,
      t: 0,
    };
  }

  get snapshot(): EngineSnapshot {
    return this.snap;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  /** Begin the countdown; takes effect on the next sample. */
  start() {
    if (this.phase === 'ready') this.enter('countdown', this.lastT ?? 0);
  }

  stop(): SessionSummary {
    if (this.phase !== 'done' && this.phase !== 'stopped') {
      if (this.phase === 'hold' && this.acc && this.acc.elapsedMs > 0) this.finishRep(false);
      this.phase = 'stopped';
      this.snap = { ...this.snap, phase: 'stopped' };
    }
    return this.summary();
  }

  push(s: Sample): EngineEvent[] {
    const events: EngineEvent[] = [];
    const dt = this.lastT === null ? 0 : Math.min(100, Math.max(0, s.t - this.lastT));
    this.lastT = s.t;
    if (this.phase === 'countdown' && this.phaseStart < 0) this.phaseStart = s.t;

    const rel = relativeAngles(s, this.zero);
    const A = pressureInRange(s.pressure, this.range);
    const posture = this.posture.update(rel, s.t);
    const B = posture.ok;

    const sincePhase = s.t - this.phaseStart;
    let remainingSec = 0;

    switch (this.phase) {
      case 'countdown':
      case 'rest': {
        const total = (this.phase === 'countdown' ? COUNTDOWN_SEC : this.cfg.restSec) * 1000;
        const left = total - sincePhase;
        remainingSec = Math.max(0, left / 1000);
        const n = Math.ceil(left / 1000);
        if (n >= 1 && n <= COUNTDOWN_SEC && n !== this.lastCountdown) {
          this.lastCountdown = n;
          events.push({ type: 'countdown', n });
        }
        if (left <= 0) {
          this.rep++;
          this.acc = {
            startT: s.t,
            elapsedMs: 0,
            goodMs: 0,
            n: 0,
            mean: 0,
            m2: 0,
            comps: emptyCounts(),
          };
          this.enter('hold', s.t);
          events.push({ type: 'rep_start', rep: this.rep });
        }
        break;
      }
      case 'hold': {
        const acc = this.acc!;
        acc.elapsedMs += dt;
        if (A && B) acc.goodMs += dt;
        this.totals.holdMs += dt;
        if (A && B) this.totals.goodMs += dt;
        if (A) this.totals.aMs += dt;
        if (B) this.totals.bMs += dt;
        // Welford running variance of pressure
        acc.n++;
        const d = s.pressure - acc.mean;
        acc.mean += d / acc.n;
        acc.m2 += d * (s.pressure - acc.mean);
        if (posture.started) {
          acc.comps[posture.started]++;
          events.push({ type: 'compensation', comp: posture.started });
        }
        const holdMs = this.cfg.holdSec * 1000;
        remainingSec = Math.max(0, (holdMs - acc.goodMs) / 1000);
        if (acc.goodMs >= holdMs || acc.elapsedMs >= holdMs * REP_TIMEOUT_FACTOR) {
          const result = this.finishRep(acc.goodMs >= holdMs);
          events.push({ type: 'rep_end', result });
          if (this.rep >= this.cfg.reps) {
            this.enter('done', s.t);
            events.push({ type: 'done', summary: this.summary() });
          } else {
            this.enter('rest', s.t);
            remainingSec = this.cfg.restSec;
            events.push({ type: 'rest_start', rep: this.rep });
          }
        }
        break;
      }
      default:
        break;
    }

    const holdMs = this.cfg.holdSec * 1000;
    this.snap = {
      phase: this.phase,
      rep: this.rep,
      totalReps: this.cfg.reps,
      remainingSec,
      holdProgress: this.phase === 'hold' && this.acc ? Math.min(1, this.acc.goodMs / holdMs) : 0,
      score: Math.floor((this.totals.goodMs / 1000) * POINTS_PER_SEC),
      pressure: s.pressure,
      rel,
      A,
      B,
      compensation: posture.compensation,
      t: s.t,
    };
    return events;
  }

  summary(): SessionSummary {
    const { holdMs, goodMs, aMs, bMs } = this.totals;
    const compensations = emptyCounts();
    for (const r of this.results) {
      for (const t of COMPENSATION_TYPES) compensations[t] += r.compensations[t];
    }
    const pct = (v: number) => (holdMs > 0 ? round1((v / holdMs) * 100) : 0);
    return {
      repsPlanned: this.cfg.reps,
      repsCompleted: this.results.length,
      repsSucceeded: this.results.filter((r) => r.success).length,
      holdSec: round1(holdMs / 1000),
      goodSec: round1(goodMs / 1000),
      inTargetPct: pct(goodMs),
      pressureOnlyPct: pct(aMs),
      postureOnlyPct: pct(bMs),
      compensations,
      score: Math.floor((goodMs / 1000) * POINTS_PER_SEC),
      avgQuality: this.results.length
        ? Math.round(this.results.reduce((a, r) => a + r.score, 0) / this.results.length)
        : 0,
      stoppedEarly: this.phase === 'stopped',
    };
  }

  private finishRep(success: boolean): RepResult {
    const acc = this.acc!;
    const ratio = acc.elapsedMs > 0 ? acc.goodMs / acc.elapsedMs : 0;
    const sd = acc.n > 1 ? Math.sqrt(acc.m2 / (acc.n - 1)) : 0;
    const result: RepResult = {
      rep: this.rep,
      success,
      durationSec: round1(acc.elapsedMs / 1000),
      goodSec: round1(acc.goodMs / 1000),
      inTargetPct: round1(ratio * 100),
      pressureMean: round1(acc.mean),
      pressureSd: Math.round(sd * 100) / 100,
      compensations: acc.comps,
      score: repQuality(ratio, sd, this.range),
    };
    this.results.push(result);
    this.acc = null;
    return result;
  }

  private enter(phase: Phase, t: number) {
    this.phase = phase;
    // countdown started from start() before any sample: anchor on the next sample
    this.phaseStart = phase === 'countdown' && this.lastT === null ? -1 : t;
    this.lastCountdown = -1;
  }
}

/** 70% time-in-target, 30% steadiness (pressure SD relative to half the band width). */
export function repQuality(ratio: number, sd: number, range: PressureRange): number {
  const half = Math.max(0.5, (range.hi - range.lo) / 2);
  const steadiness = Math.min(1, Math.max(0, 1 - sd / half));
  return Math.round(100 * (0.7 * ratio + 0.3 * steadiness));
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}
