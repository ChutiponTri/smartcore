import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { runtime, useRuntime } from '../app/runtime';
import { GameView } from '../games/GameView';
import { COMPENSATION_LABEL } from '../scoring/rules';
import { effectiveRange } from '../scoring/session';
import { useSettings } from '../store/settings';
import { validateConfig } from '../store/validateConfig';
import { openGameWindow } from '../app/gameWindow';
import { Button, Card, PageHeader, ProgressBar, StatusBadge } from '../ui/components';
import { fmt1, signed1 } from '../ui/format';
import { LiveCharts } from './LiveCharts';

const PHASE_LABEL = {
  ready: 'เตรียมพร้อม',
  countdown: 'นับถอยหลัง',
  hold: 'ค้างท่า',
  rest: 'พัก',
  done: 'จบเซสชัน',
  stopped: 'หยุดก่อนกำหนด',
} as const;

export function LiveMonitor() {
  const rt = useRuntime();
  const s = useSettings();
  const navigate = useNavigate();
  const [showGame, setShowGame] = useState(false);
  const cfg = rt.session?.config ?? s.config;
  const range = effectiveRange(cfg);
  const live = rt.live;
  const snap = rt.session ? rt.snapshot : null;
  const connected = rt.status.link === 'connected';
  const running = !!rt.session;

  // Jump to the summary once the session this page was showing has been saved.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running && rt.lastSessionId != null) {
      setShowGame(false);
      navigate(`/therapist/summary/${rt.lastSessionId}`);
    }
    wasRunning.current = running;
  }, [running, rt.lastSessionId, navigate]);

  const blockers: { text: string; to: string }[] = [];
  if (!connected) blockers.push({ text: 'เชื่อมต่ออุปกรณ์', to: '/therapist/connect' });
  if (!s.patientId) blockers.push({ text: 'เลือกผู้ป่วย', to: '/therapist/patients' });
  if (validateConfig(s.config).length) blockers.push({ text: 'ตั้งค่าเซสชันให้ถูกต้อง', to: '/therapist/setup' });
  if (connected && !rt.zero) blockers.push({ text: 'ปรับเทียบ', to: '/therapist/calibrate' });

  return (
    <div>
      <PageHeader
        title="มอนิเตอร์สด"
        subtitle={`${cfg.gameId === 'balloon' ? 'Balloon Hold' : 'Steady Boat'} · เป้าหมาย ${range.lo}–${range.hi} mmHg · เชิงกราน ±${cfg.pelvisDeg}° · เอว ${cfg.lumbarDeg}°`}
        actions={
          <>
            <Button variant="secondary" onClick={openGameWindow}>
              เปิดจอเกม (หน้าต่างใหม่)
            </Button>
            <Button variant="secondary" onClick={() => setShowGame(true)}>
              แสดงเกมในหน้านี้
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_340px] lg:grid-cols-[1fr_300px]">
        <Card>
          <LiveCharts
            bands={{
              pressure: range,
              pelvis: { lo: -cfg.pelvisDeg, hi: cfg.pelvisDeg },
              lumbar: { lo: -cfg.lumbarDeg, hi: cfg.lumbarDeg },
            }}
          />
        </Card>

        <div className="space-y-4">
          <Card title="เซสชัน">
            {running && snap ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <StatusBadge tone={snap.phase === 'hold' ? 'ok' : 'info'} icon={snap.phase === 'hold' ? '●' : '…'}>
                    {PHASE_LABEL[snap.phase]}
                  </StatusBadge>
                  <span className="text-sm text-slate-500">ผู้ป่วย {rt.session!.patientId}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Mini label="รอบ" value={`${Math.max(1, snap.rep)}/${snap.totalReps}`} />
                  <Mini label={snap.phase === 'hold' ? 'ค้างอีก' : 'เหลือ'} value={`${Math.ceil(snap.remainingSec)} วิ`} />
                  <Mini label="คะแนน" value={String(snap.score)} />
                </div>
                <ProgressBar value={snap.holdProgress} />
                <Button variant="secondary" className="w-full" onClick={() => void runtime.stopSession()}>
                  จบเซสชันตอนนี้
                </Button>
              </div>
            ) : blockers.length ? (
              <div className="space-y-2 text-sm">
                <p className="text-slate-600">ก่อนเริ่มเซสชัน ต้อง:</p>
                <ul className="space-y-1">
                  {blockers.map((b) => (
                    <li key={b.to}>
                      <Link to={b.to} className="font-medium text-brand-700 underline">
                        → {b.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  ผู้ป่วย <b>{s.patientId}</b> · {s.config.reps} รอบ × ค้าง {s.config.holdSec} วิ · พัก {s.config.restSec} วิ
                </p>
                <Button size="lg" className="w-full" onClick={() => runtime.startSession(s.patientId!, s.config)}>
                  ▶ เริ่มเซสชัน
                </Button>
              </div>
            )}
          </Card>

          <Card title="ค่าสด">
            {live ? (
              <div className="space-y-3">
                <Readout
                  label="แรงดัน"
                  value={`${fmt1(live.pressure)} mmHg`}
                  ok={live.A}
                  okText="อยู่ในช่วงเป้า"
                  badText={live.pressure < range.lo ? 'ต่ำกว่าเป้า' : 'สูงกว่าเป้า'}
                />
                <Readout
                  label="ท่าทาง"
                  value={`tilt ${signed1(live.rel.pelvisTilt)}° · obl ${signed1(live.rel.pelvisObliquity)}°`}
                  sub={`มุมเอว ${signed1(live.rel.lumbar)}°`}
                  ok={live.B}
                  okText="ไม่มีการชดเชย"
                  badText={live.compensation ? COMPENSATION_LABEL[live.compensation] : 'ชดเชย'}
                />
                <div
                  className={`flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold ${
                    live.A && live.B ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {live.A && live.B ? '✓ A×B = 1 กำลังนับเวลา' : '○ ไม่นับเวลา'}
                </div>
                {!rt.zero && <p className="text-xs text-amber-700">⚠ ยังไม่ปรับเทียบ: มุมแสดงเป็นค่าดิบ</p>}
              </div>
            ) : (
              <p className="text-sm text-slate-500">ยังไม่มีสัญญาณจากอุปกรณ์</p>
            )}
          </Card>
        </div>
      </div>

      {showGame && (
        <div className="fixed inset-x-0 bottom-0 top-[72px] z-40 flex flex-col bg-slate-900/70 p-4 backdrop-blur-sm">
          <div className="mb-2 flex justify-end">
            <Button variant="secondary" size="sm" onClick={() => setShowGame(false)}>
              ปิดจอเกม ✕
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl">
            <GameView controls={runtime.controls} />
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold tabular">{value}</div>
    </div>
  );
}

function Readout({
  label,
  value,
  sub,
  ok,
  okText,
  badText,
}: {
  label: string;
  value: string;
  sub?: string;
  ok: boolean;
  okText: string;
  badText: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-500">{label}</span>
        <StatusBadge tone={ok ? 'ok' : 'warn'}>{ok ? okText : badText}</StatusBadge>
      </div>
      <div className="mt-1 text-xl font-semibold tabular">{value}</div>
      {sub && <div className="text-sm text-slate-500 tabular">{sub}</div>}
    </div>
  );
}
