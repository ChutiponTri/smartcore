import type { Sample } from './DeviceConnection';

/**
 * Wire format of one sample notification (little-endian, 21 bytes):
 *   0  u16  seq
 *   2  u32  t_ms
 *   6  i16  pressure ×0.1 mmHg
 *   8  i16  pelvis.tilt ×0.01°
 *  10  i16  pelvis.obliquity ×0.01°
 *  12  i16  pelvis.rotation ×0.01°
 *  14  i16  trunk.tilt ×0.01°
 *  16  i16  trunk.obliquity ×0.01°
 *  18  i16  trunk.rotation ×0.01°
 *  20  u8   flags
 */
export const PACKET_SIZE = 21;

export const PacketFlags = {
  PRESSURE_OK: 1 << 0,
  PELVIS_IMU_OK: 1 << 1,
  TRUNK_IMU_OK: 1 << 2,
  PUMP_ACTIVE: 1 << 3,
  ESTOP: 1 << 4,
  LOW_BATTERY: 1 << 5,
} as const;

export type ParsedPacket = { sample: Sample; flags: number };

export function parsePacket(view: DataView, offset = 0): ParsedPacket {
  if (view.byteLength - offset < PACKET_SIZE) {
    throw new RangeError(`packet too short: ${view.byteLength - offset} bytes`);
  }
  const i16 = (o: number) => view.getInt16(offset + o, true);
  const sample: Sample = {
    seq: view.getUint16(offset, true),
    t: view.getUint32(offset + 2, true),
    pressure: i16(6) * 0.1,
    pelvis: { tilt: i16(8) * 0.01, obliquity: i16(10) * 0.01, rotation: i16(12) * 0.01 },
    trunk: { tilt: i16(14) * 0.01, obliquity: i16(16) * 0.01, rotation: i16(18) * 0.01 },
  };
  return { sample, flags: view.getUint8(offset + 20) };
}

/** Parses a notification that may carry several packed samples. */
export function parsePackets(view: DataView): ParsedPacket[] {
  const out: ParsedPacket[] = [];
  for (let o = 0; o + PACKET_SIZE <= view.byteLength; o += PACKET_SIZE) out.push(parsePacket(view, o));
  return out;
}

export function encodePacket(sample: Sample, flags = 0): DataView {
  const view = new DataView(new ArrayBuffer(PACKET_SIZE));
  const i16 = (o: number, v: number) => view.setInt16(o, Math.round(v), true);
  view.setUint16(0, sample.seq & 0xffff, true);
  view.setUint32(2, sample.t >>> 0, true);
  i16(6, sample.pressure * 10);
  i16(8, sample.pelvis.tilt * 100);
  i16(10, sample.pelvis.obliquity * 100);
  i16(12, sample.pelvis.rotation * 100);
  i16(14, sample.trunk.tilt * 100);
  i16(16, sample.trunk.obliquity * 100);
  i16(18, sample.trunk.rotation * 100);
  view.setUint8(20, flags);
  return view;
}
