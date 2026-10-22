import { COMP_FROM_CODE, PHASE_FROM_CODE } from '../app/runtime';
import { COMPENSATION_TYPES } from '../scoring/rules';
import { effectiveRange } from '../scoring/session';
import type { RawRecord, SessionRecord } from './db';

const csvRow = (cells: (string | number | boolean)[]) =>
  cells.map((c) => (typeof c === 'string' && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : String(c))).join(',');

export function summaryCsv(r: SessionRecord): string {
  const s = r.summary;
  const range = effectiveRange(r.config);
  const lines = [
    csvRow(['field', 'value']),
    csvRow(['patient_id', r.patientId]),
    csvRow(['started_at', new Date(r.startedAt).toISOString()]),
    csvRow(['ended_at', new Date(r.endedAt).toISOString()]),
    csvRow(['game', r.config.gameId]),
    csvRow(['difficulty', r.config.difficulty]),
    csvRow(['target_lo_mmHg', range.lo]),
    csvRow(['target_hi_mmHg', range.hi]),
    csvRow(['baseline_mmHg', r.config.baseline]),
    csvRow(['pelvis_limit_deg', r.config.pelvisDeg]),
    csvRow(['lumbar_limit_deg', r.config.lumbarDeg]),
    csvRow(['hold_sec', r.config.holdSec]),
    csvRow(['reps_planned', s.repsPlanned]),
    csvRow(['reps_completed', s.repsCompleted]),
    csvRow(['reps_succeeded', s.repsSucceeded]),
    csvRow(['time_in_target_pct', s.inTargetPct]),
    csvRow(['pressure_in_range_pct', s.pressureOnlyPct]),
    csvRow(['posture_ok_pct', s.postureOnlyPct]),
    csvRow(['score', s.score]),
    csvRow(['avg_quality', s.avgQuality]),
    csvRow(['stopped_early', s.stoppedEarly]),
    ...COMPENSATION_TYPES.map((t) => csvRow([`comp_${t}`, s.compensations[t]])),
    '',
    csvRow([
      'rep',
      'success',
      'duration_sec',
      'good_sec',
      'in_target_pct',
      'pressure_mean',
      'pressure_sd',
      ...COMPENSATION_TYPES.map((t) => `comp_${t}`),
      'quality',
    ]),
    ...r.reps.map((rep) =>
      csvRow([
        rep.rep,
        rep.success,
        rep.durationSec,
        rep.goodSec,
        rep.inTargetPct,
        rep.pressureMean,
        rep.pressureSd,
        ...COMPENSATION_TYPES.map((t) => rep.compensations[t]),
        rep.score,
      ]),
    ),
  ];
  return lines.join('\n');
}

export function rawCsv(raw: RawRecord): string {
  const c = raw.columns;
  const out: string[] = [
    'seq,t_ms,pressure_mmHg,pelvis_tilt_deg,pelvis_obliquity_deg,pelvis_rotation_deg,trunk_tilt_deg,trunk_obliquity_deg,trunk_rotation_deg,A,B,phase,compensation',
  ];
  const f = (v: number, d: number) => v.toFixed(d);
  for (let i = 0; i < c.t.length; i++) {
    const flags = c.flags[i];
    out.push(
      [
        c.seq[i],
        c.t[i],
        f(c.pressure[i], 1),
        f(c.pelvisTilt[i], 2),
        f(c.pelvisObliquity[i], 2),
        f(c.pelvisRotation[i], 2),
        f(c.trunkTilt[i], 2),
        f(c.trunkObliquity[i], 2),
        f(c.trunkRotation[i], 2),
        flags & 1,
        (flags >> 1) & 1,
        PHASE_FROM_CODE[(flags >> 2) & 7],
        COMP_FROM_CODE[(flags >> 5) & 7] ?? '',
      ].join(','),
    );
  }
  return out.join('\n');
}
