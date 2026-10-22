import type { Command, DeviceConnection, DeviceInfo, DeviceStatus, Sample } from './DeviceConnection';
import { initialStatus } from './DeviceConnection';
import { PacketFlags, parsePackets } from './packet';

/**
 * BLE transport for the ESP32 firmware. Not wired into the app yet —
 * kept ready so it can replace PointerInputSource once hardware exists.
 * UUIDs are placeholders until the firmware GATT table is finalised.
 */
export const SMARTCORE_SERVICE_UUID = '0000fe00-0000-1000-8000-00805f9b34fb';
export const SAMPLE_CHAR_UUID = '0000fe01-0000-1000-8000-00805f9b34fb';
export const COMMAND_CHAR_UUID = '0000fe02-0000-1000-8000-00805f9b34fb';
export const INFO_CHAR_UUID = '0000fe03-0000-1000-8000-00805f9b34fb';

const OPCODES: Record<Command['type'], number> = {
  SET_TARGET_PRESSURE: 0x01,
  INFLATE: 0x02,
  DEFLATE: 0x03,
  CALIBRATE: 0x04,
  START: 0x05,
  STOP: 0x06,
  ESTOP: 0xff,
};

export function encodeCommand(cmd: Command): Uint8Array {
  const buf = new Uint8Array(cmd.type === 'SET_TARGET_PRESSURE' ? 3 : 1);
  buf[0] = OPCODES[cmd.type];
  if (cmd.type === 'SET_TARGET_PRESSURE') {
    new DataView(buf.buffer).setInt16(1, Math.round(cmd.value * 10), true);
  }
  return buf;
}

// Minimal Web Bluetooth typings (not part of lib.dom).
type BleCharacteristic = EventTarget & {
  value?: DataView;
  startNotifications(): Promise<BleCharacteristic>;
  writeValueWithResponse(data: BufferSource): Promise<void>;
  readValue(): Promise<DataView>;
};
type BleDevice = EventTarget & {
  name?: string;
  gatt?: {
    connect(): Promise<{
      getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<BleCharacteristic> }>;
    }>;
    disconnect(): void;
  };
};
type BluetoothApi = { requestDevice(opts: unknown): Promise<BleDevice> };

export class WebBluetoothConnection implements DeviceConnection {
  private device: BleDevice | null = null;
  private commandChar: BleCharacteristic | null = null;
  private sampleListeners = new Set<(s: Sample) => void>();
  private statusListeners = new Set<(s: DeviceStatus) => void>();
  private status: DeviceStatus = initialStatus();

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  async connect(): Promise<DeviceInfo> {
    const bluetooth = (navigator as unknown as { bluetooth?: BluetoothApi }).bluetooth;
    if (!bluetooth) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Bluetooth');
    this.setStatus({ link: 'connecting' });
    this.device = await bluetooth.requestDevice({
      filters: [{ namePrefix: 'SmartCore' }],
      optionalServices: [SMARTCORE_SERVICE_UUID],
    });
    const server = await this.device.gatt!.connect();
    const service = await server.getPrimaryService(SMARTCORE_SERVICE_UUID);
    const sampleChar = await service.getCharacteristic(SAMPLE_CHAR_UUID);
    this.commandChar = await service.getCharacteristic(COMMAND_CHAR_UUID);
    const infoChar = await service.getCharacteristic(INFO_CHAR_UUID);

    sampleChar.addEventListener('characteristicvaluechanged', () => {
      if (sampleChar.value) this.handleNotification(sampleChar.value);
    });
    await sampleChar.startNotifications();
    this.device.addEventListener('gattserverdisconnected', () => this.setStatus({ link: 'disconnected' }));

    // Info: [battery u8][fw major u8][fw minor u8][fw patch u8]
    const info = await infoChar.readValue();
    const battery = info.getUint8(0);
    const firmware = `${info.getUint8(1)}.${info.getUint8(2)}.${info.getUint8(3)}`;
    this.setStatus({ link: 'connected', battery });
    return { name: this.device.name ?? 'SmartCore', firmware, battery };
  }

  async disconnect(): Promise<void> {
    this.device?.gatt?.disconnect();
    this.device = null;
    this.commandChar = null;
    this.setStatus({ link: 'disconnected' });
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
    if (!this.commandChar) throw new Error('ยังไม่ได้เชื่อมต่ออุปกรณ์');
    await this.commandChar.writeValueWithResponse(encodeCommand(cmd) as BufferSource);
  }

  private handleNotification(view: DataView) {
    for (const { sample, flags } of parsePackets(view)) {
      const sensors = {
        pressure: !!(flags & PacketFlags.PRESSURE_OK),
        pelvisImu: !!(flags & PacketFlags.PELVIS_IMU_OK),
        trunkImu: !!(flags & PacketFlags.TRUNK_IMU_OK),
      };
      const s = this.status.sensors;
      if (s.pressure !== sensors.pressure || s.pelvisImu !== sensors.pelvisImu || s.trunkImu !== sensors.trunkImu) {
        this.setStatus({ sensors });
      }
      for (const cb of this.sampleListeners) cb(sample);
    }
  }

  private setStatus(patch: Partial<DeviceStatus>) {
    this.status = { ...this.status, ...patch };
    for (const cb of this.statusListeners) cb(this.status);
  }
}
