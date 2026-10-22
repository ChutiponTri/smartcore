import type { RelAngles } from './calibration';

export type CompensationType = 'anterior_tilt' | 'posterior_tilt' | 'lumbar_extension' | 'lateral_tilt';

export const COMPENSATION_TYPES: CompensationType[] = [
  'anterior_tilt',
  'posterior_tilt',
  'lumbar_extension',
  'lateral_tilt',
];

export const COMPENSATION_LABEL: Record<CompensationType, string> = {
  anterior_tilt: 'เชิงกรานแอ่นไปหน้า',
  posterior_tilt: 'เชิงกรานกดไปหลัง',
  lumbar_extension: 'แอ่นเอว',
  lateral_tilt: 'เชิงกรานเอียงข้าง',
};

export type PostureThresholds = {
  /** limit for |pelvic tilt| and |obliquity|, degrees */
  pelvisDeg: number;
  /** limit for lumbar extension (trunk − pelvis tilt), degrees */
  lumbarDeg: number;
  /** must come back inside (limit − hysteresis) to be counted as OK again */
  hysteresisDeg: number;
  /** must stay outside the limit this long before it counts as compensation */
  debounceMs: number;
};

export const DEFAULT_THRESHOLDS: PostureThresholds = {
  pelvisDeg: 5,
  lumbarDeg: 8,
  hysteresisDeg: 1,
  debounceMs: 200,
};

export type PressureRange = { lo: number; hi: number };

/** A(t) */
export function pressureInRange(pressure: number, range: PressureRange): boolean {
  return pressure >= range.lo && pressure <= range.hi;
}

/**
 * Returns the dominant compensation whose value exceeds the given limits,
 * or null when every channel is inside. Dominance = largest value/limit ratio.
 */
export function classifyCompensation(
  rel: RelAngles,
  pelvisLimit: number,
  lumbarLimit: number,
): CompensationType | null {
  const candidates: [CompensationType, number][] = [
    ['anterior_tilt', rel.pelvisTilt / pelvisLimit],
    ['posterior_tilt', -rel.pelvisTilt / pelvisLimit],
    ['lateral_tilt', Math.abs(rel.pelvisObliquity) / pelvisLimit],
    ['lumbar_extension', rel.lumbar / lumbarLimit],
  ];
  let best: CompensationType | null = null;
  let bestRatio = 1;
  for (const [type, ratio] of candidates) {
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = type;
    }
  }
  return best;
}

export type PostureState = {
  /** B(t): posture acceptable (true while a short excursion is still being debounced) */
  ok: boolean;
  compensation: CompensationType | null;
  /** set only on the update where a new compensation event is confirmed */
  started: CompensationType | null;
};

/** B(t) with hysteresis and debounce. */
export class PostureMonitor {
  private pendingSince: number | null = null;
  private current: CompensationType | null = null;
  private th: PostureThresholds;

  constructor(th: PostureThresholds = DEFAULT_THRESHOLDS) {
    this.th = th;
  }

  setThresholds(th: PostureThresholds) {
    this.th = th;
  }

  reset() {
    this.pendingSince = null;
    this.current = null;
  }

  update(rel: RelAngles, tMs: number): PostureState {
    const { pelvisDeg, lumbarDeg, hysteresisDeg, debounceMs } = this.th;

    if (this.current) {
      const stillOut = classifyCompensation(rel, pelvisDeg - hysteresisDeg, lumbarDeg - hysteresisDeg);
      if (stillOut) return { ok: false, compensation: this.current, started: null };
      this.current = null;
      this.pendingSince = null;
      return { ok: true, compensation: null, started: null };
    }

    const out = classifyCompensation(rel, pelvisDeg, lumbarDeg);
    if (!out) {
      this.pendingSince = null;
      return { ok: true, compensation: null, started: null };
    }
    if (this.pendingSince === null) this.pendingSince = tMs;
    if (tMs - this.pendingSince >= debounceMs) {
      this.current = out;
      return { ok: false, compensation: out, started: out };
    }
    return { ok: true, compensation: null, started: null };
  }
}
