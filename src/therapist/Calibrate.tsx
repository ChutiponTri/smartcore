import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { runtime, useRuntime } from '../app/runtime';
import type { Sample } from '../device/DeviceConnection';
import { StillnessDetector } from '../scoring/calibration';
import { useSettings } from '../store/settings';
import { Button, Card, PageHeader, ProgressBar, StatusBadge } from '../ui/components';
import { fmt1, signed1 } from '../ui/format';

type Step = 1 | 2 | 3;
const STILL_MS = 3000;

export function Calibrate() {
  const rt = useRuntime();
  const { config } = useSettings();
  const navigate = useNavigate();
  const [stepState, setStep] = useState<Step>(rt.zero ? 3 : 1);
  // ESTOP clears the zero pose: fall back to the start of the wizard.
  const step: Step = stepState === 3 && !rt.zero ? 1 : stepState;
  const [inflating, setInflating] = useState(false);
  const [stillActive, setStillActive] = useState(false);
  const [view, setView] = useState({ pressure: 0, remainingMs: STILL_MS, progress: 0, recentlyRestarted: false, dev: [0, 0, 0, 0] });

  const latest = useRef<Sample | null>(null);
  const detector = useRef(new StillnessDetector(STILL_MS, 1));
  const stillRef = useRef(false);
  const progressRef = useRef({ remainingMs: STILL_MS, progress: 0, restartedAt: 0 });
  const stableSince = useRef<number | null>(null);
  const firstStill = useRef<Sample | null>(null);

  const connected = rt.status.link === 'connected';
  const pump = rt.status.pump;

  // Sample feed (100 Hz) → refs; React redraws at ~15 Hz below.
  useEffect(
    () =>
      runtime.onRawSample((s) => {
        latest.current = s;
        if (!stillRef.current) return;
        if (!firstStill.current) firstStill.current = s;
        const u = detector.current.push(s);
        if (u.restarted) {
          firstStill.current = s;
          progressRef.current.restartedAt = performance.now();
        }
        progressRef.current.remainingMs = u.remainingMs;
        progressRef.current.progress = u.progress;
        if (u.zero) {
          stillRef.current = false;
          runtime.setCalibration(u.zero);
          void runtime.command({ type: 'CALIBRATE' });
          setStillActive(false);
          setStep(3);
        }
      }),
    [],
  );

  useEffect(() => {
    const id = setInterval(() => {
      const s = latest.current;
      if (!s) return;
      const f = firstStill.current ?? s;
      const { remainingMs, progress, restartedAt } = progressRef.current;
      setView({
        pressure: s.pressure,
        remainingMs,
        progress,
        recentlyRestarted: restartedAt > 0 && performance.now() - restartedAt < 1200,
        dev: [
          s.pelvis.tilt - f.pelvis.tilt,
          s.pelvis.obliquity - f.pelvis.obliquity,
          s.trunk.tilt - f.trunk.tilt,
          s.trunk.obliquity - f.trunk.obliquity,
        ],
      });
    }, 66);
    return () => clearInterval(id);
  }, []);

  // Step 1 completes once the pump holds and pressure settles near baseline.
  const inflateDone = pump === 'holding' && Math.abs(view.pressure - config.baseline) < 1.5 && rt.status.targetPressure === config.baseline;
  useEffect(() => {
    if (step !== 1 || !inflateDone) {
      stableSince.current = null;
      return;
    }
    stableSince.current ??= performance.now();
    if (inflating && performance.now() - stableSince.current > 600) {
      setInflating(false);
      setStep(2);
    }
  }, [step, inflateDone, inflating, view]);

  const startInflate = async () => {
    setInflating(true);
    await runtime.command({ type: 'SET_TARGET_PRESSURE', value: config.baseline });
    await runtime.command({ type: 'INFLATE' });
  };

  const startStill = () => {
    detector.current.reset();
    firstStill.current = null;
    progressRef.current = { remainingMs: STILL_MS, progress: 0, restartedAt: 0 };
    stillRef.current = true;
    setStillActive(true);
  };

  if (!connected) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="ปรับเทียบ" />
        <Card>
          <p className="text-slate-600">ต้องเชื่อมต่ออุปกรณ์ก่อนปรับเทียบ</p>
          <Link to="/therapist/connect" className="mt-3 inline-block font-medium text-brand-700 underline">
            ไปหน้าเชื่อมต่ออุปกรณ์
          </Link>
        </Card>
      </div>
    );
  }

  const secLeft = Math.ceil(view.remainingMs / 1000);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="ปรับเทียบ" subtitle="ทำทุกครั้งก่อนเริ่มเซสชัน หลังจัดท่าผู้ฝึกนอนหงายบนถุงลม" />

      <ol className="mb-5 grid grid-cols-3 gap-2">
        {['เป่าลมถึง baseline', 'นอนนิ่งตั้งท่าศูนย์', 'พร้อม'].map((label, i) => {
          const n = (i + 1) as Step;
          const done = step > n;
          const current = step === n;
          return (
            <li
              key={label}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                current ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800' : done ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-200 bg-white text-slate-400'
              }`}
            >
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${done ? 'bg-brand-700 text-white' : current ? 'bg-brand-700 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {done ? '✓' : n}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <Card title="ขั้นที่ 1 · เป่าลมถุงลมถึง baseline">
          <p className="text-slate-600">ให้ผู้ฝึกนอนหงาย ผ่อนคลาย วางถุงลมใต้หลังส่วนล่าง แล้วกดเริ่มเป่าลม</p>
          <div className="mt-6 flex items-end justify-between">
            <div>
              <div className="text-sm text-slate-500">แรงดันขณะนี้</div>
              <div className="text-5xl font-semibold tabular">
                {fmt1(view.pressure)}
                <span className="ml-2 text-lg font-normal text-slate-500">/ {config.baseline} mmHg</span>
              </div>
            </div>
            {pump === 'inflating' && <StatusBadge tone="info" icon="↑">กำลังเป่าลม</StatusBadge>}
            {inflateDone && <StatusBadge tone="ok">ถึง baseline แล้ว</StatusBadge>}
          </div>
          <div className="mt-4">
            <ProgressBar value={view.pressure / config.baseline} />
          </div>
          <div className="mt-6 flex justify-end gap-2">
            {inflateDone && !inflating ? (
              <Button onClick={() => setStep(2)}>ถัดไป →</Button>
            ) : (
              <Button onClick={() => void startInflate()} disabled={inflating}>
                {inflating ? 'กำลังเป่าลม…' : 'เริ่มเป่าลม'}
              </Button>
            )}
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card title="ขั้นที่ 2 · นอนนิ่ง 3 วินาที เพื่อตั้งท่าศูนย์">
          <p className="text-slate-600">บอกผู้ฝึกให้นอนนิ่งในท่าที่ถูกต้อง ถ้าขยับเกิน 1° ระบบจะเริ่มนับใหม่</p>
          <div className="mt-6 flex flex-wrap items-center gap-8">
            <CountdownRing progress={stillActive ? view.progress : 0} label={stillActive ? String(Math.max(1, secLeft)) : '3'} />
            <div className="min-w-[220px] flex-1 space-y-2">
              {view.recentlyRestarted ? (
                <StatusBadge tone="warn">มีการขยับ เริ่มนับใหม่</StatusBadge>
              ) : stillActive ? (
                <StatusBadge tone="info" icon="…">กำลังตรวจความนิ่ง</StatusBadge>
              ) : (
                <StatusBadge tone="muted">รอเริ่ม</StatusBadge>
              )}
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {['เชิงกราน tilt', 'เชิงกราน obliquity', 'ลำตัว tilt', 'ลำตัว obliquity'].map((l, i) => {
                  const over = Math.abs(view.dev[i]) > 1;
                  return (
                    <div key={l} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5">
                      <dt className="text-slate-500">{l}</dt>
                      <dd className={`tabular ${over ? 'font-semibold text-amber-700' : ''}`}>
                        {stillActive ? `${signed1(view.dev[i])}°` : '–'} {stillActive && (over ? '⚠' : '✓')}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>
          <div className="mt-6 flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              ← ย้อนกลับ
            </Button>
            <Button onClick={startStill} disabled={stillActive}>
              {stillActive ? 'กำลังนับ…' : 'เริ่มตั้งท่าศูนย์'}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && rt.zero && (
        <Card title="ขั้นที่ 3 · พร้อมเริ่มฝึก">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-700 text-2xl text-white" aria-hidden>
              ✓
            </span>
            <div>
              <div className="text-lg font-semibold">ปรับเทียบเรียบร้อย</div>
              <div className="text-sm text-slate-500">
                ถุงลม {rt.status.targetPressure} mmHg · ท่าศูนย์ถูกบันทึกแล้ว
              </div>
            </div>
          </div>
          <table className="mt-5 w-full text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 text-left font-medium">ท่าศูนย์ (ค่าดิบ)</th>
                <th className="py-1 text-right font-medium">tilt</th>
                <th className="py-1 text-right font-medium">obliquity</th>
                <th className="py-1 text-right font-medium">rotation</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {(['pelvis', 'trunk'] as const).map((k) => (
                <tr key={k} className="border-t border-slate-100">
                  <td className="py-1.5">{k === 'pelvis' ? 'เชิงกราน' : 'ลำตัว'}</td>
                  <td className="py-1.5 text-right">{signed1(rt.zero![k].tilt)}°</td>
                  <td className="py-1.5 text-right">{signed1(rt.zero![k].obliquity)}°</td>
                  <td className="py-1.5 text-right">{signed1(rt.zero![k].rotation)}°</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-6 flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(pump === 'holding' ? 2 : 1)}>
              ปรับเทียบใหม่
            </Button>
            <Button size="lg" onClick={() => navigate('/therapist/live')}>
              ไปมอนิเตอร์สด →
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function CountdownRing({ progress, label }: { progress: number; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36" role="img" aria-label={`เหลือ ${label} วินาที`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="#0f766e"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="72" textAnchor="middle" fontSize="40" fontWeight="600" fill="#0f172a">
        {label}
      </text>
    </svg>
  );
}
