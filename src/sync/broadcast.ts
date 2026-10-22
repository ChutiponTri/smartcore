import type { Sample } from '../device/DeviceConnection';
import type { ControlView, PointerControls } from '../device/PointerInputSource';
import type { CompensationType } from '../scoring/rules';
import type { Difficulty, GameId, Phase } from '../scoring/session';

const CHANNEL = 'smartcore-sync';

/** Everything the game screen needs, sent by the window that holds the device. */
export type GameFrame = {
  connected: boolean;
  estop: boolean;
  calibrated: boolean;
  gameId: GameId;
  difficulty: Difficulty;
  phase: Phase | 'idle';
  rep: number;
  totalReps: number;
  remainingSec: number;
  holdProgress: number;
  score: number;
  pressure: number;
  range: { lo: number; hi: number };
  A: boolean;
  B: boolean;
  compensation: CompensationType | null;
  pelvisTilt: number;
  pelvisObliquity: number;
  muted: boolean;
  pointerInput: boolean;
};

export type SoundCue = 'countdown' | 'go' | 'warn' | 'pass' | 'miss' | 'finish';

export type SyncMessage =
  | { kind: 'frame'; frame: GameFrame }
  | { kind: 'samples'; samples: Sample[] }
  | { kind: 'cue'; cue: SoundCue }
  | { kind: 'hello' }
  | { kind: 'control'; op: ControlOp; args: unknown[] }
  | { kind: 'controlView'; view: ControlView };

type ControlOp = Exclude<keyof PointerControls, 'getView' | 'subscribe'>;

export function openChannel(onMessage?: (m: SyncMessage) => void) {
  if (typeof BroadcastChannel === 'undefined') {
    return { post: () => {}, close: () => {} };
  }
  const ch = new BroadcastChannel(CHANNEL);
  let closed = false;
  if (onMessage) ch.onmessage = (e: MessageEvent<SyncMessage>) => onMessage(e.data);
  return {
    post: (m: SyncMessage) => {
      if (!closed) ch.postMessage(m);
    },
    close: () => {
      closed = true;
      ch.close();
    },
  };
}

/**
 * PointerControls for a second window: forwards operations to the window that
 * holds the device and mirrors back the control view.
 */
export class RemoteControls implements PointerControls {
  private view: ControlView = {
    pressing: false,
    pressDepth: 6,
    fineOffset: 0,
    pelvis: { tilt: 0, obliquity: 0 },
    trunk: { tilt: 0, obliquity: 0 },
    preset: null,
  };
  private listeners = new Set<(v: ControlView) => void>();
  private ch: ReturnType<typeof openChannel> | null = null;

  /** Opens the sync channel; returns the matching disconnect (use from an effect). */
  connect() {
    const ch = openChannel((m) => {
      if (m.kind === 'controlView') {
        this.view = m.view;
        this.listeners.forEach((l) => l(m.view));
      }
    });
    this.ch = ch;
    return () => {
      ch.close();
      if (this.ch === ch) this.ch = null;
    };
  }

  private send(op: ControlOp, ...args: unknown[]) {
    this.ch?.post({ kind: 'control', op, args });
  }

  setPressing(on: boolean) {
    this.send('setPressing', on);
  }
  nudgePressure(steps: number) {
    this.send('nudgePressure', steps);
  }
  resetFine() {
    this.send('resetFine');
  }
  setPressDepth(mmHg: number) {
    this.send('setPressDepth', mmHg);
  }
  setPad(...args: Parameters<PointerControls['setPad']>) {
    this.send('setPad', ...args);
  }
  setArrow(...args: Parameters<PointerControls['setArrow']>) {
    this.send('setArrow', ...args);
  }
  applyPreset(...args: Parameters<PointerControls['applyPreset']>) {
    this.send('applyPreset', ...args);
  }
  getView() {
    return this.view;
  }
  subscribe(cb: (v: ControlView) => void) {
    this.listeners.add(cb);
    cb(this.view);
    return () => this.listeners.delete(cb);
  }
}

/** Applies a forwarded control message to the local controls. */
const CONTROL_OPS: ControlOp[] = [
  'setPressing',
  'nudgePressure',
  'resetFine',
  'setPressDepth',
  'setPad',
  'setArrow',
  'applyPreset',
];

export function applyControl(controls: PointerControls, op: ControlOp, args: unknown[]) {
  if (!CONTROL_OPS.includes(op)) return;
  (controls[op] as (...a: unknown[]) => void).apply(controls, args);
}
