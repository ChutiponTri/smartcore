export type Angles = { tilt: number; obliquity: number; rotation: number };

export type Sample = {
  seq: number;
  /** milliseconds since device start */
  t: number;
  /** mmHg */
  pressure: number;
  pelvis: Angles;
  trunk: Angles;
};

export type DeviceInfo = { name: string; firmware: string; battery: number };

export type PumpState = 'idle' | 'inflating' | 'holding' | 'deflating' | 'estop';

export type DeviceStatus = {
  link: 'disconnected' | 'connecting' | 'connected' | 'error';
  pump: PumpState;
  battery: number;
  targetPressure: number;
  running: boolean;
  sensors: { pressure: boolean; pelvisImu: boolean; trunkImu: boolean };
  message?: string;
};

export type Command =
  | { type: 'SET_TARGET_PRESSURE'; value: number }
  | { type: 'INFLATE' }
  | { type: 'DEFLATE' }
  | { type: 'CALIBRATE' }
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'ESTOP' };

export type ScanResult = { id: string; name: string; rssi: number };

export interface DeviceConnection {
  connect(): Promise<DeviceInfo>;
  disconnect(): Promise<void>;
  onSample(cb: (s: Sample) => void): () => void;
  onStatus(cb: (s: DeviceStatus) => void): () => void;
  sendCommand(cmd: Command): Promise<void>;
  /** Optional discovery step before connect(). */
  scan?(): Promise<ScanResult[]>;
}

export const SAMPLE_RATE_HZ = 100;

export function initialStatus(): DeviceStatus {
  return {
    link: 'disconnected',
    pump: 'idle',
    battery: 0,
    targetPressure: 40,
    running: false,
    sensors: { pressure: false, pelvisImu: false, trunkImu: false },
  };
}
