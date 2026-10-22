import type {
  Angles,
  Command,
  DeviceConnection,
  DeviceInfo,
  DeviceStatus,
  Sample,
  ScanResult,
} from './DeviceConnection';
import { SAMPLE_RATE_HZ, initialStatus } from './DeviceConnection';

export type PadId = 'pelvis' | 'trunk';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type PosePreset = 1 | 2 | 3 | 4;

/** Commanded pose in degrees (tilt = vertical axis, obliquity = horizontal axis). */
export type PadValue = { tilt: number; obliquity: number };

export type ControlView = {
  pressing: boolean;
  pressDepth: number;
  fineOffset: number;
  pelvis: PadValue;
  trunk: PadValue;
  preset: PosePreset | null;
};

/** Operations the input panel can perform; also proxied across windows. */
export interface PointerControls {
  setPressing(on: boolean): void;
  nudgePressure(steps: number): void;
  resetFine(): void;
  setPressDepth(mmHg: number): void;
  /** Normalised -1..1 per axis, or null when the pad is released. */
  setPad(pad: PadId, value: { x: number; y: number } | null): void;
  setArrow(dir: Direction, down: boolean, pad: PadId): void;
  applyPreset(p: PosePreset): void;
  getView(): ControlView;
  subscribe(cb: (v: ControlView) => void): () => void;
}

export const PAD_RANGE_DEG = 15;
const FINE_STEP = 0.5;
const FINE_LIMIT = 15;
const INFLATE_RATE = 8; // mmHg/s
const DEFLATE_RATE = 6;
const ESTOP_DEFLATE_RATE = 14;
const ARROW_RATE = 20; // °/s

const PRESETS: Record<Exclude<PosePreset, 4>, { pelvis: PadValue; trunk: PadValue }> = {
  1: { pelvis: { tilt: 9, obliquity: 0 }, trunk: { tilt: 9, obliquity: 0 } },
  2: { pelvis: { tilt: -9, obliquity: 0 }, trunk: { tilt: -9, obliquity: 0 } },
  3: { pelvis: { tilt: 1.5, obliquity: 0 }, trunk: { tilt: 13, obliquity: 0 } },
};

/** Sensor mounting offsets: the zero pose is never exactly 0°, so calibration matters. */
const MOUNT_PELVIS: Angles = { tilt: 2.4, obliquity: -0.8, rotation: 1.1 };
const MOUNT_TRUNK: Angles = { tilt: -1.6, obliquity: 0.5, rotation: -0.7 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lowPass = (cur: number, target: number, dt: number, tau: number) =>
  cur + (target - cur) * (1 - Math.exp(-dt / tau));
/** Roughly bell-shaped noise bounded to ±amp. */
const noise = (amp: number) => ((Math.random() + Math.random() + Math.random()) / 1.5 - 1) * amp;

type PadState = {
  cmd: PadValue;
  actual: PadValue;
  drag: PadValue | null;
  arrows: Set<Direction>;
};

const newPad = (): PadState => ({
  cmd: { tilt: 0, obliquity: 0 },
  actual: { tilt: 0, obliquity: 0 },
  drag: null,
  arrows: new Set(),
});

/**
 * Device source driven by mouse/keyboard through the input panel.
 * Emits 100 Hz samples with sensor-like noise and smooth (low-pass) response.
 */
export class PointerInputSource implements DeviceConnection, PointerControls {
  private sampleListeners = new Set<(s: Sample) => void>();
  private statusListeners = new Set<(s: DeviceStatus) => void>();
  private viewListeners = new Set<(v: ControlView) => void>();
  private status: DeviceStatus = initialStatus();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private startedAt = 0;
  private seq = 0;

  private pumpLevel = 0;
  private effort = 0;
  private pressing = false;
  private pressDepth = 6;
  private fineOffset = 0;
  private preset: Exclude<PosePreset, 4> | null = null;
  private pads: Record<PadId, PadState> = { pelvis: newPad(), trunk: newPad() };
  private rotationDrift = 0;
  private battery = 87;

  async scan(): Promise<ScanResult[]> {
    await wait(1500);
    return [{ id: 'sc-01', name: 'SmartCore-01', rssi: -52 - Math.round(Math.random() * 12) }];
  }

  async connect(): Promise<DeviceInfo> {
    this.setStatus({ link: 'connecting' });
    await wait(900);
    this.startedAt = performance.now();
    this.lastTick = this.startedAt;
    this.seq = 0;
    this.timer = setInterval(() => this.tick(), 1000 / SAMPLE_RATE_HZ);
    this.setStatus({
      link: 'connected',
      battery: this.battery,
      sensors: { pressure: true, pelvisImu: true, trunkImu: true },
    });
    return { name: 'SmartCore-01', firmware: '0.1.0', battery: this.battery };
  }

  async disconnect(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.pumpLevel = 0;
    this.setStatus({ ...initialStatus() });
  }

  onSample(cb: (s: Sample) => void): () => void {
    this.sampleListeners.add(cb);
    return () => this.sampleListeners.delete(cb);
  }

  onStatus(cb: (s: DeviceStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => this.statusListeners.delete(cb);
  }

  async sendCommand(cmd: Command): Promise<void> {
    if (this.status.link !== 'connected') throw new Error('ยังไม่ได้เชื่อมต่ออุปกรณ์');
    switch (cmd.type) {
      case 'SET_TARGET_PRESSURE':
        this.setStatus({ targetPressure: clamp(cmd.value, 0, 80) });
        break;
      case 'INFLATE':
        this.setStatus({ pump: 'inflating', message: undefined });
        break;
      case 'DEFLATE':
        this.setStatus({ pump: 'deflating', running: false });
        break;
      case 'CALIBRATE':
        break;
      case 'START':
        if (this.status.pump === 'estop') throw new Error('อยู่ในสถานะหยุดฉุกเฉิน');
        this.setStatus({ running: true });
        break;
      case 'STOP':
        this.setStatus({ running: false });
        break;
      case 'ESTOP':
        this.setStatus({ pump: 'estop', running: false, message: 'กำลังระบายลม' });
        break;
    }
  }

  // ---- PointerControls ----

  setPressing(on: boolean) {
    if (this.pressing === on) return;
    this.pressing = on;
    this.emitView();
  }

  nudgePressure(steps: number) {
    this.fineOffset = clamp(this.fineOffset + steps * FINE_STEP, -FINE_LIMIT, FINE_LIMIT);
    this.emitView();
  }

  resetFine() {
    this.fineOffset = 0;
    this.emitView();
  }

  setPressDepth(mmHg: number) {
    this.pressDepth = clamp(mmHg, 1, 20);
    this.emitView();
  }

  setPad(pad: PadId, value: { x: number; y: number } | null) {
    const p = this.pads[pad];
    if (value) {
      this.preset = null;
      p.drag = {
        tilt: clamp(value.y, -1, 1) * PAD_RANGE_DEG,
        obliquity: clamp(value.x, -1, 1) * PAD_RANGE_DEG,
      };
      p.cmd = { ...p.drag };
    } else {
      p.drag = null;
    }
    this.emitView();
  }

  setArrow(dir: Direction, down: boolean, pad: PadId) {
    const arrows = this.pads[pad].arrows;
    if (down) {
      this.preset = null;
      arrows.add(dir);
    } else {
      // Releasing a key should release it on both pads (Shift may have changed meanwhile).
      this.pads.pelvis.arrows.delete(dir);
      this.pads.trunk.arrows.delete(dir);
    }
    this.emitView();
  }

  applyPreset(p: PosePreset) {
    this.preset = p === 4 ? null : (p as Exclude<PosePreset, 4>);
    for (const pad of Object.values(this.pads)) {
      pad.drag = null;
      pad.arrows.clear();
    }
    this.emitView();
  }

  getView(): ControlView {
    return {
      pressing: this.pressing,
      pressDepth: this.pressDepth,
      fineOffset: this.fineOffset,
      pelvis: { ...this.pads.pelvis.cmd },
      trunk: { ...this.pads.trunk.cmd },
      preset: this.preset,
    };
  }

  subscribe(cb: (v: ControlView) => void): () => void {
    this.viewListeners.add(cb);
    cb(this.getView());
    return () => this.viewListeners.delete(cb);
  }

  // ---- internals ----

  private tick() {
    const now = performance.now();
    const period = 1000 / SAMPLE_RATE_HZ;
    // Catch up on missed ticks (timer jitter / throttling), bounded to avoid bursts.
    let due = Math.floor((now - this.lastTick) / period);
    if (due > 50) {
      this.lastTick = now - 50 * period;
      due = 50;
    }
    for (let i = 0; i < due; i++) {
      this.lastTick += period;
      this.step(period / 1000);
    }
    if (due > 0 && this.viewListeners.size) this.emitViewThrottled(now);
  }

  private lastViewEmit = 0;
  private emitViewThrottled(now: number) {
    if (now - this.lastViewEmit > 50) {
      this.lastViewEmit = now;
      this.emitView();
    }
  }

  private step(dt: number) {
    this.stepPump(dt);

    const effortTarget = this.pressing ? this.pressDepth : 0;
    this.effort = lowPass(this.effort, effortTarget, dt, 0.45);
    const bladderFill = clamp(this.pumpLevel / 10, 0, 1);
    const pressure = Math.max(
      0,
      this.pumpLevel + (this.effort + this.fineOffset) * bladderFill + noise(0.3),
    );

    for (const id of ['pelvis', 'trunk'] as const) this.stepPad(id, dt);
    this.rotationDrift = lowPass(this.rotationDrift, noise(3), dt, 4);

    const pel = this.pads.pelvis.actual;
    const tr = this.pads.trunk.actual;
    const sample: Sample = {
      seq: this.seq & 0xffff,
      t: Math.round(this.seq * (1000 / SAMPLE_RATE_HZ)),
      pressure: round(pressure, 1),
      pelvis: {
        tilt: round(MOUNT_PELVIS.tilt + pel.tilt + noise(0.2), 2),
        obliquity: round(MOUNT_PELVIS.obliquity + pel.obliquity + noise(0.2), 2),
        rotation: round(MOUNT_PELVIS.rotation + this.rotationDrift * 0.3 + noise(0.2), 2),
      },
      trunk: {
        tilt: round(MOUNT_TRUNK.tilt + tr.tilt + noise(0.2), 2),
        obliquity: round(MOUNT_TRUNK.obliquity + tr.obliquity + noise(0.2), 2),
        rotation: round(MOUNT_TRUNK.rotation + this.rotationDrift + noise(0.2), 2),
      },
    };
    this.seq++;
    if (this.seq % (SAMPLE_RATE_HZ * 300) === 0 && this.battery > 5) {
      this.battery -= 1;
      this.setStatus({ battery: this.battery });
    }
    for (const cb of this.sampleListeners) cb(sample);
  }

  private stepPump(dt: number) {
    const st = this.status;
    if (st.pump === 'inflating') {
      this.pumpLevel = Math.min(st.targetPressure, this.pumpLevel + INFLATE_RATE * dt);
      if (this.pumpLevel >= st.targetPressure) this.setStatus({ pump: 'holding' });
    } else if (st.pump === 'holding') {
      // The pump trims small leaks/overshoot back to the set point.
      this.pumpLevel = lowPass(this.pumpLevel, st.targetPressure, dt, 1.5);
    } else if (st.pump === 'deflating' || st.pump === 'estop') {
      const rate = st.pump === 'estop' ? ESTOP_DEFLATE_RATE : DEFLATE_RATE;
      this.pumpLevel = Math.max(0, this.pumpLevel - rate * dt);
      if (this.pumpLevel === 0) {
        if (st.pump === 'estop') {
          if (st.message !== 'ระบายลมแล้ว') this.setStatus({ message: 'ระบายลมแล้ว' });
        } else {
          this.setStatus({ pump: 'idle' });
        }
      }
    }
  }

  private stepPad(id: PadId, dt: number) {
    const p = this.pads[id];
    if (p.drag) {
      p.cmd = { ...p.drag };
    } else if (p.arrows.size) {
      const dy = (p.arrows.has('up') ? 1 : 0) - (p.arrows.has('down') ? 1 : 0);
      const dx = (p.arrows.has('right') ? 1 : 0) - (p.arrows.has('left') ? 1 : 0);
      p.cmd = {
        tilt: clamp(p.cmd.tilt + dy * ARROW_RATE * dt, -PAD_RANGE_DEG, PAD_RANGE_DEG),
        obliquity: clamp(p.cmd.obliquity + dx * ARROW_RATE * dt, -PAD_RANGE_DEG, PAD_RANGE_DEG),
      };
    } else if (this.preset) {
      p.cmd = { ...PRESETS[this.preset][id] };
    } else {
      // Released: drift back to neutral on its own.
      p.cmd = {
        tilt: lowPass(p.cmd.tilt, 0, dt, 0.6),
        obliquity: lowPass(p.cmd.obliquity, 0, dt, 0.6),
      };
    }
    p.actual = {
      tilt: lowPass(p.actual.tilt, p.cmd.tilt, dt, 0.15),
      obliquity: lowPass(p.actual.obliquity, p.cmd.obliquity, dt, 0.15),
    };
  }

  private emitView() {
    const v = this.getView();
    for (const cb of this.viewListeners) cb(v);
  }

  private setStatus(patch: Partial<DeviceStatus>) {
    this.status = { ...this.status, ...patch };
    for (const cb of this.statusListeners) cb(this.status);
  }
}

function round(v: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
