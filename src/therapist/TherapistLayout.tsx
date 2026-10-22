import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { runtime, useRuntime } from '../app/runtime';
import { openGameWindow } from '../app/gameWindow';
import { InputPanel } from '../device/InputPanel';
import { usePointerKeyboard } from '../device/pointerBindings';
import { settings, useSettings } from '../store/settings';
import { EStopButton } from '../ui/EStopButton';
import { StatusBadge } from '../ui/components';

const NAV: { to: string; label: string; icon: string }[] = [
  { to: 'connect', label: 'เชื่อมต่ออุปกรณ์', icon: 'M12 3v18M7 8l10 8-5 4V4l5 4-10 8' },
  { to: 'patients', label: 'ผู้ป่วย', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0' },
  { to: 'setup', label: 'ตั้งค่าเซสชัน', icon: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4' },
  { to: 'calibrate', label: 'ปรับเทียบ', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v4l3 2' },
  { to: 'live', label: 'มอนิเตอร์สด', icon: 'M3 12h4l3-7 4 14 3-7h4' },
  { to: 'summary', label: 'สรุปผลเซสชัน', icon: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3' },
  { to: 'history', label: 'ประวัติ', icon: 'M4 19V5M4 19h16M8 15l4-4 3 3 5-6' },
];

export function TherapistLayout() {
  const rt = useRuntime();
  const s = useSettings();
  const [panelOpen, setPanelOpen] = useState(false);
  usePointerKeyboard(runtime.controls, () => setPanelOpen((v) => !v));

  const { status, info } = rt;
  const connected = status.link === 'connected';

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-16 shrink-0 flex-col border-r border-slate-200 bg-white lg:w-56">
        <Link to="/therapist/connect" className="flex h-[72px] items-center gap-2 border-b border-slate-100 px-3 lg:px-4">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <span className="hidden leading-tight lg:block">
            <span className="block font-semibold text-slate-900">SmartCore</span>
            <span className="block text-xs text-slate-500">Scolio · นักกายภาพ</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((n, i) => (
            <NavLink
              key={n.to}
              to={n.to}
              title={n.label}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  isActive ? 'bg-brand-50 font-semibold text-brand-800' : 'text-slate-600 hover:bg-slate-50'
                }`
              }
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={n.icon} />
              </svg>
              <span className="hidden lg:inline">
                <span className="mr-1 text-slate-400">{i + 1}.</span>
                {n.label}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-slate-100 p-3 text-xs text-slate-400 lg:block">
          แผงอินพุต: กด <kbd className="rounded bg-slate-100 px-1">`</kbd>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {connected ? (
              <StatusBadge tone="ok">
                {info?.name ?? 'SmartCore'} · แบต {status.battery}%
              </StatusBadge>
            ) : status.link === 'connecting' ? (
              <StatusBadge tone="info" icon="…">กำลังเชื่อมต่อ</StatusBadge>
            ) : (
              <StatusBadge tone="muted">ยังไม่เชื่อมต่อ</StatusBadge>
            )}
            {connected && <PumpBadge />}
            {s.patientId ? (
              <StatusBadge tone="info" icon="●">ผู้ป่วย {s.patientId}</StatusBadge>
            ) : (
              <StatusBadge tone="muted">ยังไม่เลือกผู้ป่วย</StatusBadge>
            )}
            {rt.zero ? <StatusBadge tone="ok">ปรับเทียบแล้ว</StatusBadge> : connected && <StatusBadge tone="warn">ยังไม่ปรับเทียบ</StatusBadge>}
          </div>
          <button
            type="button"
            onClick={() => settings.set({ muted: !s.muted })}
            className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
            aria-pressed={s.muted}
            title={s.muted ? 'เปิดเสียง' : 'ปิดเสียง'}
          >
            <SpeakerIcon muted={s.muted} />
            <span className="hidden xl:inline">{s.muted ? 'ปิดเสียงอยู่' : 'เสียงเปิด'}</span>
          </button>
          <button
            type="button"
            onClick={openGameWindow}
            className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8M12 16v4" />
            </svg>
            <span className="hidden xl:inline">เปิดจอเกม</span>
          </button>
          <EStopButton />
        </header>

        {status.pump === 'estop' && (
          <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-5 py-3 text-red-800" role="alert">
            <span className="flex items-center gap-2 font-semibold">
              <span aria-hidden>⚠</span>
              หยุดฉุกเฉินแล้ว · {status.message ?? 'กำลังระบายลม'}
              {status.message !== 'ระบายลมแล้ว' && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-600" />}
            </span>
            <Link to="/therapist/calibrate" className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-red-200 hover:bg-red-100">
              ปรับเทียบใหม่เพื่อเริ่มต่อ
            </Link>
          </div>
        )}
        {rt.error && (
          <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900">
            <span>⚠ {rt.error}</span>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-auto p-5 lg:p-6">
          <Outlet />
        </main>
      </div>

      {runtime.controls && <InputPanel controls={runtime.controls} open={panelOpen} onClose={() => setPanelOpen(false)} />}
    </div>
  );
}

function PumpBadge() {
  const { status } = useRuntime();
  switch (status.pump) {
    case 'inflating':
      return <StatusBadge tone="info" icon="↑">กำลังเป่าลม</StatusBadge>;
    case 'holding':
      return <StatusBadge tone="ok">ถุงลมพร้อม {status.targetPressure} mmHg</StatusBadge>;
    case 'deflating':
      return <StatusBadge tone="info" icon="↓">กำลังระบายลม</StatusBadge>;
    case 'estop':
      return <StatusBadge tone="bad">หยุดฉุกเฉิน</StatusBadge>;
    default:
      return <StatusBadge tone="muted">ถุงลมว่าง</StatusBadge>;
  }
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M4 9h4l5-4v14l-5-4H4z" />
      {muted ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M17 8a5 5 0 0 1 0 8M19.5 5.5a8.5 8.5 0 0 1 0 13" />}
    </svg>
  );
}
