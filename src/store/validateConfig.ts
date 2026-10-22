import type { SessionConfig } from '../scoring/session';

export function validateConfig(c: SessionConfig): string[] {
  const errs: string[] = [];
  const all = [c.targetLo, c.targetHi, c.baseline, c.pelvisDeg, c.lumbarDeg, c.holdSec, c.reps, c.restSec];
  if (all.some((v) => !Number.isFinite(v))) errs.push('กรอกค่าให้ครบทุกช่อง');
  if (c.targetLo >= c.targetHi) errs.push('ค่าล่างของช่วงเป้าหมายต้องน้อยกว่าค่าบน');
  if (c.baseline < 10 || c.baseline > 70) errs.push('baseline ควรอยู่ระหว่าง 10–70 mmHg');
  if (c.pelvisDeg < 2) errs.push('เกณฑ์มุมเชิงกรานต้องไม่น้อยกว่า 2°');
  if (c.lumbarDeg < 2) errs.push('เกณฑ์มุมเอวต้องไม่น้อยกว่า 2°');
  if (c.holdSec < 2 || c.reps < 1 || c.restSec < 0) errs.push('เวลาค้าง จำนวนรอบ หรือเวลาพักไม่ถูกต้อง');
  return errs;
}
