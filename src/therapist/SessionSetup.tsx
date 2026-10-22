import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BalloonThumb, BoatThumb, GardenThumb, QuestThumb } from '../games/GameThumbs';
import type { Difficulty, GameId, SessionConfig } from '../scoring/session';
import { DEFAULT_CONFIG, DIFFICULTY_LABEL, effectiveRange } from '../scoring/session';
import { settings, useSettings } from '../store/settings';
import { validateConfig } from '../store/validateConfig';
import { Button, Card, Field, NumberInput, PageHeader } from '../ui/components';

type GameCard = { id: GameId | null; title: string; desc: string; thumb: ReactNode; tag: string };

const GAMES: GameCard[] = [
  { id: 'balloon', title: 'Balloon Hold', desc: 'ประคองลูกโป่งให้ลอยนิ่งในแถบเป้าหมาย', thumb: <BalloonThumb />, tag: 'ถุงลม 1 ช่อง · IMU' },
  { id: 'boat', title: 'Steady Boat', desc: 'บังคับเรือให้แล่นผ่านประตูทุ่น', thumb: <BoatThumb />, tag: 'ถุงลม 1 ช่อง · IMU' },
  { id: null, title: 'Balance Garden', desc: 'ปลูกสวนด้วยแรงกดสมดุลซ้าย-ขวา', thumb: <GardenThumb />, tag: 'ถุงลม 2 ช่อง' },
  { id: null, title: 'Posture Quest', desc: 'ผจญภัยด้วยการคุมท่าเชิงกรานและลำตัว', thumb: <QuestThumb />, tag: 'IMU 2 ตัว' },
];

export function SessionSetup() {
  const s = useSettings();
  const navigate = useNavigate();
  const cfg = s.config;
  const set = (patch: Partial<SessionConfig>) => settings.set({ config: { ...cfg, ...patch } });
  const errors = validateConfig(cfg);
  const eff = errors.length ? null : effectiveRange(cfg);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="ตั้งค่าเซสชัน"
        subtitle={s.patientId ? `สำหรับผู้ป่วย ${s.patientId}` : 'ยังไม่ได้เลือกผู้ป่วย'}
        actions={
          <Button variant="ghost" onClick={() => settings.set({ config: { ...DEFAULT_CONFIG, gameId: cfg.gameId } })}>
            คืนค่าตั้งต้น
          </Button>
        }
      />

      <Card title="เลือกเกม" className="mb-5">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {GAMES.map((g) => {
            const locked = g.id === null;
            const selected = g.id === cfg.gameId;
            return (
              <button
                key={g.title}
                type="button"
                disabled={locked}
                onClick={() => g.id && set({ gameId: g.id })}
                className={`relative overflow-hidden rounded-2xl border-2 text-left transition ${
                  selected ? 'border-brand-600 ring-4 ring-brand-100' : 'border-slate-200 hover:border-slate-300'
                } ${locked ? 'cursor-not-allowed' : ''}`}
              >
                <div className={`aspect-[5/3] ${locked ? 'opacity-40 grayscale' : ''}`}>{g.thumb}</div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{g.title}</span>
                    {selected && <span className="text-brand-700" aria-label="เลือกอยู่">✓</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500">{g.desc}</p>
                  <p className="mt-1 text-xs text-slate-400">{g.tag}</p>
                </div>
                {locked && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-white">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                    เร็ว ๆ นี้
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="แรงดันถุงลม">
          <div className="grid grid-cols-2 gap-4">
            <Field label="ช่วงเป้าหมาย ต่ำสุด">
              <NumberInput value={cfg.targetLo} step={0.5} unit="mmHg" onChange={(v) => set({ targetLo: v })} />
            </Field>
            <Field label="ช่วงเป้าหมาย สูงสุด">
              <NumberInput value={cfg.targetHi} step={0.5} unit="mmHg" onChange={(v) => set({ targetHi: v })} />
            </Field>
            <Field label="Baseline" hint="ปั๊มจะเป่าลมถึงค่านี้ตอนปรับเทียบ">
              <NumberInput value={cfg.baseline} step={1} unit="mmHg" onChange={(v) => set({ baseline: v })} />
            </Field>
            <Field label="ระดับความยาก" hint={eff ? `ช่วงที่ใช้จริง ${eff.lo}–${eff.hi} mmHg` : undefined}>
              <div className="grid grid-cols-3 rounded-lg border border-slate-300 p-0.5">
                {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set({ difficulty: d })}
                    className={`rounded-md py-1.5 text-sm ${cfg.difficulty === d ? 'bg-brand-700 font-semibold text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    {DIFFICULTY_LABEL[d]}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Card>

        <Card title="ท่าทาง">
          <div className="grid grid-cols-2 gap-4">
            <Field label="เกณฑ์มุมเชิงกราน (±)" hint="ใช้กับทั้ง tilt และ obliquity · กลับเข้าเกณฑ์ที่ค่านี้ − 1°">
              <NumberInput value={cfg.pelvisDeg} step={0.5} unit="°" onChange={(v) => set({ pelvisDeg: v })} />
            </Field>
            <Field label="เกณฑ์มุมเอว (แอ่น)" hint="มุมลำตัวเทียบกับเชิงกราน">
              <NumberInput value={cfg.lumbarDeg} step={0.5} unit="°" onChange={(v) => set({ lumbarDeg: v })} />
            </Field>
          </div>
        </Card>

        <Card title="จังหวะการฝึก" className="lg:col-span-2">
          <div className="grid grid-cols-3 gap-4">
            <Field label="เวลาค้างต่อรอบ">
              <NumberInput value={cfg.holdSec} min={2} unit="วินาที" onChange={(v) => set({ holdSec: v })} />
            </Field>
            <Field label="จำนวนรอบ">
              <NumberInput value={cfg.reps} min={1} unit="รอบ" onChange={(v) => set({ reps: v })} />
            </Field>
            <Field label="เวลาพักระหว่างรอบ">
              <NumberInput value={cfg.restSec} min={0} unit="วินาที" onChange={(v) => set({ restSec: v })} />
            </Field>
          </div>
        </Card>
      </div>

      {errors.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {errors.map((e) => (
            <li key={e}>⚠ {e}</li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex justify-end">
        <Button size="lg" disabled={errors.length > 0} onClick={() => navigate('/therapist/calibrate')}>
          ไปปรับเทียบ →
        </Button>
      </div>
    </div>
  );
}
