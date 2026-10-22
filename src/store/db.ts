import Dexie, { type EntityTable } from 'dexie';
import type { ZeroPose } from '../scoring/calibration';
import { COMPENSATION_TYPES } from '../scoring/rules';
import type { RepResult, SessionConfig, SessionSummary } from '../scoring/session';
import { DEFAULT_CONFIG, REP_TIMEOUT_FACTOR, emptyCounts, repQuality } from '../scoring/session';

export type Patient = {
  /** Coded identifier, e.g. P001. No real names are stored. */
  id: string;
  birthYear: number;
  note: string;
  createdAt: number;
  updatedAt: number;
};

export type SessionRecord = {
  id?: number;
  patientId: string;
  startedAt: number;
  endedAt: number;
  config: SessionConfig;
  zero: ZeroPose | null;
  summary: SessionSummary;
  reps: RepResult[];
  hasRaw: boolean;
};

/** Raw 100 Hz recording stored column-wise. */
export type RawColumns = {
  seq: Uint16Array;
  t: Uint32Array;
  pressure: Float32Array;
  pelvisTilt: Float32Array;
  pelvisObliquity: Float32Array;
  pelvisRotation: Float32Array;
  trunkTilt: Float32Array;
  trunkObliquity: Float32Array;
  trunkRotation: Float32Array;
  /** bit0 A, bit1 B, bits2-4 phase code, bits5-7 compensation code */
  flags: Uint8Array;
};

export type RawRecord = { sessionId: number; columns: RawColumns };

export const db = new Dexie('smartcore') as Dexie & {
  patients: EntityTable<Patient, 'id'>;
  sessions: EntityTable<SessionRecord, 'id'>;
  raw: EntityTable<RawRecord, 'sessionId'>;
};

db.version(1).stores({
  patients: 'id, birthYear',
  sessions: '++id, patientId, startedAt',
  raw: 'sessionId',
});

db.on('populate', (tx) => {
  const now = Date.now();
  const patients: Patient[] = [
    { id: 'P001', birthYear: 2011, note: 'Thoracic curve ขวา Cobb 22° · ใส่เสื้อเกราะ 16 ชม./วัน', createdAt: now, updatedAt: now },
    { id: 'P002', birthYear: 2009, note: 'Thoracolumbar ซ้าย Cobb 18° · ฝึกต่อเนื่องหลังผ่าตัดไม่ได้', createdAt: now, updatedAt: now },
    { id: 'P003', birthYear: 2013, note: 'Lumbar curve Cobb 14° · เริ่มโปรแกรมใหม่', createdAt: now, updatedAt: now },
  ];
  void tx.table('patients').bulkAdd(patients);
  void tx.table('sessions').bulkAdd(buildHistory(patients.map((p) => p.id), now));
});

/** Deterministic PRNG so the history looks the same on every install. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildHistory(patientIds: string[], now: number): SessionRecord[] {
  const out: SessionRecord[] = [];
  const day = 86_400_000;
  patientIds.forEach((patientId, pi) => {
    const rand = mulberry32(42 + pi * 101);
    const skill0 = 0.45 + pi * 0.05;
    for (let k = 0; k < 8; k++) {
      const startedAt = now - (8 - k) * 4 * day - Math.round(rand() * 6) * 3_600_000 - day;
      const skill = Math.min(0.95, skill0 + k * 0.055 + (rand() - 0.5) * 0.08);
      const gameId = k % 3 === 2 ? 'boat' : 'balloon';
      const config: SessionConfig = { ...DEFAULT_CONFIG, gameId, reps: 8 + (k % 2) * 2 };
      const range = { lo: config.targetLo, hi: config.targetHi };
      const reps: RepResult[] = [];
      for (let r = 1; r <= config.reps; r++) {
        const ratio = Math.min(0.98, Math.max(0.3, skill + (rand() - 0.5) * 0.2));
        const success = ratio * REP_TIMEOUT_FACTOR > 1;
        const durationSec = Math.round((config.holdSec / Math.max(ratio, 1 / REP_TIMEOUT_FACTOR)) * 10) / 10;
        const goodSec = success ? config.holdSec : Math.round(durationSec * ratio * 10) / 10;
        const sd = Math.round((2.2 - skill * 1.8 + rand() * 0.4) * 100) / 100;
        const comps = emptyCounts();
        const nComp = Math.round((1 - skill) * 4 * rand());
        for (let c = 0; c < nComp; c++) {
          const weights = [0.35, 0.25, 0.3, 0.1];
          let x = rand();
          let idx = 0;
          while (idx < weights.length - 1 && x > weights[idx]) x -= weights[idx++];
          comps[COMPENSATION_TYPES[idx]]++;
        }
        reps.push({
          rep: r,
          success,
          durationSec,
          goodSec,
          inTargetPct: Math.round((goodSec / durationSec) * 1000) / 10,
          pressureMean: Math.round((40 + (rand() - 0.5) * 1.5) * 10) / 10,
          pressureSd: sd,
          compensations: comps,
          score: repQuality(goodSec / durationSec, sd, range),
        });
      }
      const holdSec = reps.reduce((a, r) => a + r.durationSec, 0);
      const goodSec = reps.reduce((a, r) => a + r.goodSec, 0);
      const compensations = emptyCounts();
      for (const r of reps) for (const t of COMPENSATION_TYPES) compensations[t] += r.compensations[t];
      const inTargetPct = Math.round((goodSec / holdSec) * 1000) / 10;
      out.push({
        patientId,
        startedAt,
        endedAt: startedAt + Math.round((holdSec + config.restSec * (config.reps - 1) + 3) * 1000),
        config,
        zero: null,
        reps,
        hasRaw: false,
        summary: {
          repsPlanned: config.reps,
          repsCompleted: reps.length,
          repsSucceeded: reps.filter((r) => r.success).length,
          holdSec: Math.round(holdSec * 10) / 10,
          goodSec: Math.round(goodSec * 10) / 10,
          inTargetPct,
          pressureOnlyPct: Math.min(100, Math.round((inTargetPct + 6 + rand() * 6) * 10) / 10),
          postureOnlyPct: Math.min(100, Math.round((inTargetPct + 10 + rand() * 6) * 10) / 10),
          compensations,
          score: Math.floor(goodSec * 10),
          avgQuality: Math.round(reps.reduce((a, r) => a + r.score, 0) / reps.length),
          stoppedEarly: false,
        },
      });
    }
  });
  return out;
}
