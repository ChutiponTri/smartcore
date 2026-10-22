import type { Angles, Sample } from '../device/DeviceConnection';

export type ZeroPose = { pelvis: Angles; trunk: Angles };

/** Angles relative to the calibrated zero pose. lumbar = trunk.tilt − pelvis.tilt. */
export type RelAngles = {
  pelvisTilt: number;
  pelvisObliquity: number;
  pelvisRotation: number;
  trunkTilt: number;
  trunkObliquity: number;
  lumbar: number;
};

export const IDENTITY_ZERO: ZeroPose = {
  pelvis: { tilt: 0, obliquity: 0, rotation: 0 },
  trunk: { tilt: 0, obliquity: 0, rotation: 0 },
};

export function relativeAngles(s: Sample, zero: ZeroPose): RelAngles {
  const pelvisTilt = s.pelvis.tilt - zero.pelvis.tilt;
  const trunkTilt = s.trunk.tilt - zero.trunk.tilt;
  return {
    pelvisTilt,
    pelvisObliquity: s.pelvis.obliquity - zero.pelvis.obliquity,
    pelvisRotation: s.pelvis.rotation - zero.pelvis.rotation,
    trunkTilt,
    trunkObliquity: s.trunk.obliquity - zero.trunk.obliquity,
    lumbar: trunkTilt - pelvisTilt,
  };
}

/** Channels checked for stillness (rotation drifts slowly on IMUs and is excluded). */
const STILL_CHANNELS: ((s: Sample) => number)[] = [
  (s) => s.pelvis.tilt,
  (s) => s.pelvis.obliquity,
  (s) => s.trunk.tilt,
  (s) => s.trunk.obliquity,
];

export type StillnessUpdate = {
  /** 0..1 progress toward the required still duration */
  progress: number;
  remainingMs: number;
  /** true on the sample where movement forced the countdown to restart */
  restarted: boolean;
  zero: ZeroPose | null;
};

/**
 * Collects a window of samples; if any angle moves more than `toleranceDeg`
 * away from the window mean, the window restarts. When the window reaches
 * `durationMs`, its mean becomes the zero pose.
 */
export class StillnessDetector {
  private startT: number | null = null;
  private n = 0;
  private sums = { pelvis: [0, 0, 0], trunk: [0, 0, 0] };
  private stillSums = STILL_CHANNELS.map(() => 0);

  readonly durationMs: number;
  readonly toleranceDeg: number;

  constructor(durationMs = 3000, toleranceDeg = 1) {
    this.durationMs = durationMs;
    this.toleranceDeg = toleranceDeg;
  }

  reset() {
    this.startT = null;
    this.n = 0;
    this.sums = { pelvis: [0, 0, 0], trunk: [0, 0, 0] };
    this.stillSums = STILL_CHANNELS.map(() => 0);
  }

  push(s: Sample): StillnessUpdate {
    let restarted = false;
    if (this.startT !== null && this.n > 0) {
      const moved = STILL_CHANNELS.some((ch, i) => Math.abs(ch(s) - this.stillSums[i] / this.n) > this.toleranceDeg);
      if (moved) {
        this.reset();
        restarted = true;
      }
    }
    if (this.startT === null) this.startT = s.t;
    this.n++;
    STILL_CHANNELS.forEach((ch, i) => (this.stillSums[i] += ch(s)));
    const { pelvis, trunk } = this.sums;
    pelvis[0] += s.pelvis.tilt;
    pelvis[1] += s.pelvis.obliquity;
    pelvis[2] += s.pelvis.rotation;
    trunk[0] += s.trunk.tilt;
    trunk[1] += s.trunk.obliquity;
    trunk[2] += s.trunk.rotation;

    const elapsed = s.t - this.startT;
    const progress = Math.min(1, elapsed / this.durationMs);
    let zero: ZeroPose | null = null;
    if (elapsed >= this.durationMs) {
      const n = this.n;
      zero = {
        pelvis: { tilt: pelvis[0] / n, obliquity: pelvis[1] / n, rotation: pelvis[2] / n },
        trunk: { tilt: trunk[0] / n, obliquity: trunk[1] / n, rotation: trunk[2] / n },
      };
    }
    return { progress, remainingMs: Math.max(0, this.durationMs - elapsed), restarted, zero };
  }
}
