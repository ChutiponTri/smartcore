import { useSyncExternalStore } from 'react';
import type { DeviceConnection, DeviceInfo, DeviceStatus, Sample, ScanResult } from '../device/DeviceConnection';
import { initialStatus } from '../device/DeviceConnection';
import type { PointerControls } from '../device/PointerInputSource';
import { PointerInputSource } from '../device/PointerInputSource';
import type { RelAngles, ZeroPose } from '../scoring/calibration';
import { IDENTITY_ZERO, relativeAngles } from '../scoring/calibration';
import type { CompensationType } from '../scoring/rules';
import { COMPENSATION_TYPES, PostureMonitor, pressureInRange } from '../scoring/rules';
import type { EngineEvent, EngineSnapshot, Phase, SessionConfig } from '../scoring/session';
import { SessionEngine, effectiveRange } from '../scoring/session';
import type { RawColumns } from '../store/db';
import { db } from '../store/db';
import { settings } from '../store/settings';
import type { GameFrame, SoundCue, SyncMessage } from '../sync/broadcast';
import { applyControl, openChannel } from '../sync/broadcast';

// ---------------------------------------------------------------------------
// Live ring buffer for charts (kept outside React state)
// ---------------------------------------------------------------------------

export const LIVE_CAPACITY = 2048;

export class LiveBuffer {
  readonly x = new Float64Array(LIVE_CAPACITY);
  readonly pressure = new Float64Array(LIVE_CAPACITY);
  readonly tilt = new Float64Array(LIVE_CAPACITY);
  readonly obliquity = new Float64Array(LIVE_CAPACITY);
  readonly lumbar = new Float64Array(LIVE_CAPACITY);
  readonly good = new Uint8Array(LIVE_CAPACITY);
  head = 0;
  size = 0;
  version = 0;

  push(x: number, p: number, rel: RelAngles, good: boolean) {
    const i = this.head;
    this.x[i] = x;
    this.pressure[i] = p;
    this.tilt[i] = rel.pelvisTilt;
    this.obliquity[i] = rel.pelvisObliquity;
    this.lumbar[i] = rel.lumbar;
    this.good[i] = good ? 1 : 0;
    this.head = (i + 1) % LIVE_CAPACITY;
    this.size = Math.min(LIVE_CAPACITY, this.size + 1);
    this.version++;
  }

  clear() {
    this.head = 0;
    this.size = 0;
    this.version++;
  }

  /** Ordered copy of the last `windowSec` seconds. */
  window(windowSec: number) {
    const n = this.size;
    const start = (this.head - n + LIVE_CAPACITY) % LIVE_CAPACITY;
    const latest = n ? this.x[(this.head - 1 + LIVE_CAPACITY) % LIVE_CAPACITY] : 0;
    let skip = 0;
    while (skip < n && this.x[(start + skip) % LIVE_CAPACITY] < latest - windowSec) skip++;
    const m = n - skip;
    const out = {
      x: new Float64Array(m),
      pressure: new Float64Array(m),
      tilt: new Float64Array(m),
      obliquity: new Float64Array(m),
      lumbar: new Float64Array(m),
      good: new Uint8Array(m),
      latest,
    };
    for (let k = 0; k < m; k++) {
      const i = (start + skip + k) % LIVE_CAPACITY;
      out.x[k] = this.x[i];
      out.pressure[k] = this.pressure[i];
      out.tilt[k] = this.tilt[i];
      out.obliquity[k] = this.obliquity[i];
      out.lumbar[k] = this.lumbar[i];
      out.good[k] = this.good[i];
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Raw recording for CSV export
// ---------------------------------------------------------------------------

const PHASE_CODE: Record<Phase, number> = { ready: 0, countdown: 1, hold: 2, rest: 3, done: 4, stopped: 5 };
export const PHASE_FROM_CODE = Object.fromEntries(Object.entries(PHASE_CODE).map(([k, v]) => [v, k])) as Record<
  number,
  Phase
>;
export const COMP_FROM_CODE: (CompensationType | null)[] = [null, ...COMPENSATION_TYPES];

class Recorder {
  private cols: Record<keyof RawColumns, number[]> = {
    seq: [],
    t: [],
    pressure: [],
    pelvisTilt: [],
    pelvisObliquity: [],
    pelvisRotation: [],
    trunkTilt: [],
    trunkObliquity: [],
    trunkRotation: [],
    flags: [],
  };

  push(s: Sample, snap: EngineSnapshot) {
    const c = this.cols;
    c.seq.push(s.seq);
    c.t.push(s.t);
    c.pressure.push(s.pressure);
    c.pelvisTilt.push(s.pelvis.tilt);
    c.pelvisObliquity.push(s.pelvis.obliquity);
    c.pelvisRotation.push(s.pelvis.rotation);
    c.trunkTilt.push(s.trunk.tilt);
    c.trunkObliquity.push(s.trunk.obliquity);
    c.trunkRotation.push(s.trunk.rotation);
    const comp = snap.compensation ? COMPENSATION_TYPES.indexOf(snap.compensation) + 1 : 0;
    c.flags.push((snap.A ? 1 : 0) | (snap.B ? 2 : 0) | (PHASE_CODE[snap.phase] << 2) | (comp << 5));
  }

  toColumns(): RawColumns {
    const c = this.cols;
    return {
      seq: Uint16Array.from(c.seq),
      t: Uint32Array.from(c.t),
      pressure: Float32Array.from(c.pressure),
      pelvisTilt: Float32Array.from(c.pelvisTilt),
      pelvisObliquity: Float32Array.from(c.pelvisObliquity),
      pelvisRotation: Float32Array.from(c.pelvisRotation),
      trunkTilt: Float32Array.from(c.trunkTilt),
      trunkObliquity: Float32Array.from(c.trunkObliquity),
      trunkRotation: Float32Array.from(c.trunkRotation),
      flags: Uint8Array.from(c.flags),
    };
  }
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export type LiveReadout = { pressure: number; rel: RelAngles; A: boolean; B: boolean; compensation: CompensationType | null };

export type RuntimeState = {
  status: DeviceStatus;
  info: DeviceInfo | null;
  zero: ZeroPose | null;
  calibratedAt: number | null;
  session: { patientId: string; config: SessionConfig; startedAt: number } | null;
  snapshot: EngineSnapshot | null;
  live: LiveReadout | null;
  lastSessionId: number | null;
  error: string | null;
};

const UI_THROTTLE_MS = 100;

class Runtime {
  readonly source = new PointerInputSource();
  readonly connection: DeviceConnection = this.source;
  /** Present while the active connection is driven by the input panel. */
  readonly controls: PointerControls | null = this.source;
  readonly buffer = new LiveBuffer();

  private state: RuntimeState = {
    status: initialStatus(),
    info: null,
    zero: null,
    calibratedAt: null,
    session: null,
    snapshot: null,
    live: null,
    lastSessionId: null,
    error: null,
  };
  private listeners = new Set<() => void>();
  private engine: SessionEngine | null = null;
  private recorder: Recorder | null = null;
  private idlePosture = new PostureMonitor();
  private lastUi = 0;
  private sampleCount = 0;
  private pendingSamples: Sample[] = [];
  private latestFrame: GameFrame | null = null;
  private sampleListeners = new Set<(s: Sample) => void>();
  private channel = openChannel((m) => this.onChannel(m));

  constructor() {
    this.connection.onStatus((status) => {
      if (status.link === 'connected') this.isHost = true;
      this.patch({ status });
      this.publishFrame();
    });
    this.connection.onSample((s) => this.onSample(s));
    this.controls?.subscribe((view) => {
      if (this.isHost) this.channel.post({ kind: 'controlView', view });
    });
    settings.subscribe(() => this.publishFrame());
  }

  /**
   * True once this window has held a device connection. Only the host window
   * answers on the sync channel, so a second window opened at /play stays quiet.
   */
  private isHost = false;

  // ---- store plumbing ----
  getState = () => this.state;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  private patch(p: Partial<RuntimeState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }

  /** Raw 100 Hz samples for pages that need them (e.g. calibration). */
  onRawSample(cb: (s: Sample) => void) {
    this.sampleListeners.add(cb);
    return () => {
      this.sampleListeners.delete(cb);
    };
  }

  // ---- device ----
  async scan(): Promise<ScanResult[]> {
    return this.connection.scan ? this.connection.scan() : [];
  }

  async connect() {
    this.patch({ error: null });
    try {
      const info = await this.connection.connect();
      this.buffer.clear();
      this.patch({ info });
      return info;
    } catch (e) {
      this.patch({ error: (e as Error).message });
      throw e;
    }
  }

  async disconnect() {
    if (this.engine) await this.stopSession();
    await this.connection.disconnect();
    this.patch({ info: null, zero: null, calibratedAt: null, live: null });
  }

  async command(cmd: Parameters<DeviceConnection['sendCommand']>[0]) {
    try {
      await this.connection.sendCommand(cmd);
    } catch (e) {
      this.patch({ error: (e as Error).message });
    }
  }

  async estop() {
    if (this.state.status.link === 'connected') {
      await this.connection.sendCommand({ type: 'ESTOP' }).catch(() => {});
    }
    if (this.engine) await this.stopSession();
    this.patch({ zero: null, calibratedAt: null });
  }

  setCalibration(zero: ZeroPose) {
    this.idlePosture.reset();
    this.patch({ zero, calibratedAt: Date.now() });
  }

  // ---- session ----
  startSession(patientId: string, config: SessionConfig) {
    if (!this.state.zero) throw new Error('ยังไม่ได้ปรับเทียบท่าศูนย์');
    this.engine = new SessionEngine(config, this.state.zero);
    this.recorder = new Recorder();
    this.engine.start();
    void this.command({ type: 'START' });
    this.patch({
      session: { patientId, config, startedAt: Date.now() },
      snapshot: this.engine.snapshot,
      lastSessionId: null,
    });
  }

  /** Stops early (or after ESTOP) and saves what was recorded. */
  async stopSession() {
    if (!this.engine) return null;
    this.engine.stop();
    return this.finishSession();
  }

  private async finishSession() {
    const engine = this.engine!;
    const recorder = this.recorder!;
    const session = this.state.session!;
    this.engine = null;
    this.recorder = null;
    void this.command({ type: 'STOP' });
    const summary = engine.summary();
    const id = await db.sessions.add({
      patientId: session.patientId,
      startedAt: session.startedAt,
      endedAt: Date.now(),
      config: session.config,
      zero: engine.zero,
      summary,
      reps: engine.results,
      hasRaw: true,
    });
    await db.raw.put({ sessionId: id as number, columns: recorder.toColumns() });
    this.patch({ session: null, snapshot: { ...engine.snapshot }, lastSessionId: id as number });
    this.publishFrame();
    return id as number;
  }

  // ---- sample pipeline ----
  private onSample(s: Sample) {
    for (const cb of this.sampleListeners) cb(s);

    const zero = this.state.zero ?? IDENTITY_ZERO;
    let readout: LiveReadout;
    let events: EngineEvent[] = [];
    if (this.engine) {
      events = this.engine.push(s);
      const snap = this.engine.snapshot;
      this.recorder?.push(s, snap);
      readout = { pressure: s.pressure, rel: snap.rel, A: snap.A, B: snap.B, compensation: snap.compensation };
    } else {
      const rel = relativeAngles(s, zero);
      const cfg = settings.get().config;
      this.idlePosture.setThresholds({
        pelvisDeg: cfg.pelvisDeg,
        lumbarDeg: cfg.lumbarDeg,
        hysteresisDeg: 1,
        debounceMs: 200,
      });
      const posture = this.idlePosture.update(rel, s.t);
      readout = {
        pressure: s.pressure,
        rel,
        A: pressureInRange(s.pressure, effectiveRange(cfg)),
        B: posture.ok,
        compensation: posture.compensation,
      };
    }

    this.buffer.push(s.t / 1000, s.pressure, readout.rel, readout.A && readout.B);
    this.lastReadout = readout;

    for (const ev of events) this.handleEvent(ev);

    this.sampleCount++;
    this.pendingSamples.push(s);
    if (this.sampleCount % 2 === 0) this.publishFrame();
    if (this.pendingSamples.length >= 4 && this.isHost) {
      this.channel.post({ kind: 'samples', samples: this.pendingSamples });
      this.pendingSamples = [];
    }

    const now = performance.now();
    if (now - this.lastUi > UI_THROTTLE_MS || events.length) {
      this.lastUi = now;
      this.patch({ live: readout, snapshot: this.engine ? this.engine.snapshot : this.state.snapshot });
    }
  }

  private lastReadout: LiveReadout | null = null;

  private handleEvent(ev: EngineEvent) {
    const cue = (c: SoundCue) => this.channel.post({ kind: 'cue', cue: c });
    switch (ev.type) {
      case 'countdown':
        cue('countdown');
        break;
      case 'rep_start':
        cue('go');
        break;
      case 'compensation':
        cue('warn');
        break;
      case 'rep_end':
        cue(ev.result.success ? 'pass' : 'miss');
        break;
      case 'done':
        cue('finish');
        void this.finishSession();
        break;
      default:
        break;
    }
  }

  private buildFrame(): GameFrame {
    const st = this.state;
    const cfg = this.engine?.cfg ?? st.session?.config ?? settings.get().config;
    const snap = this.engine?.snapshot ?? null;
    const r = this.lastReadout;
    return {
      connected: st.status.link === 'connected',
      estop: st.status.pump === 'estop',
      calibrated: !!st.zero,
      gameId: cfg.gameId,
      difficulty: cfg.difficulty,
      phase: snap ? snap.phase : st.snapshot?.phase === 'done' || st.snapshot?.phase === 'stopped' ? st.snapshot.phase : 'idle',
      rep: snap?.rep ?? st.snapshot?.rep ?? 0,
      totalReps: cfg.reps,
      remainingSec: snap?.remainingSec ?? 0,
      holdProgress: snap?.holdProgress ?? 0,
      score: snap?.score ?? st.snapshot?.score ?? 0,
      pressure: r?.pressure ?? 0,
      range: effectiveRange(cfg),
      A: r?.A ?? false,
      B: r?.B ?? true,
      compensation: r?.compensation ?? null,
      pelvisTilt: r?.rel.pelvisTilt ?? 0,
      pelvisObliquity: r?.rel.pelvisObliquity ?? 0,
      muted: settings.get().muted,
      pointerInput: !!this.controls,
    };
  }

  private publishFrame() {
    if (!this.isHost) return;
    this.latestFrame = this.buildFrame();
    this.channel.post({ kind: 'frame', frame: this.latestFrame });
  }

  /** Latest frame for a game view hosted in this same window. */
  currentFrame(): GameFrame {
    return this.latestFrame ?? this.buildFrame();
  }

  /** Clears the finished-session snapshot so the game returns to idle. */
  resetResult() {
    this.patch({ snapshot: null });
    this.publishFrame();
  }

  private onChannel(m: SyncMessage) {
    if (!this.isHost) return;
    if (m.kind === 'hello') this.publishFrame();
    else if (m.kind === 'control' && this.controls) applyControl(this.controls, m.op, m.args);
  }
}

export const runtime = new Runtime();

export function useRuntime(): RuntimeState {
  return useSyncExternalStore(runtime.subscribe, runtime.getState);
}
