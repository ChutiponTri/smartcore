import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runtime, useRuntime } from '../app/runtime';
import type { ScanResult } from '../device/DeviceConnection';
import { Button, Card, PageHeader, StatusBadge } from '../ui/components';

type Phase = 'idle' | 'scanning' | 'found' | 'connecting';

export function Connect() {
  const rt = useRuntime();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [devices, setDevices] = useState<ScanResult[]>([]);
  const connected = rt.status.link === 'connected';

  const scan = async () => {
    setPhase('scanning');
    setDevices([]);
    const found = await runtime.scan();
    setDevices(found);
    setPhase('found');
  };

  const connect = async () => {
    setPhase('connecting');
    try {
      await runtime.connect();
    } finally {
      setPhase('idle');
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="เชื่อมต่ออุปกรณ์" subtitle="เปิดสวิตช์อุปกรณ์ SmartCore แล้ววางไว้ใกล้แท็บเล็ตหรือคอมพิวเตอร์" />

      {connected && rt.info ? (
        <Card
          title="เชื่อมต่อแล้ว"
          actions={
            <Button variant="ghost" size="sm" onClick={() => void runtime.disconnect()}>
              ตัดการเชื่อมต่อ
            </Button>
          }
        >
          <div className="flex flex-wrap items-center gap-6">
            <DeviceGlyph />
            <div className="min-w-0 flex-1">
              <div className="text-xl font-semibold">{rt.info.name}</div>
              <div className="mt-1 text-sm text-slate-500">Bluetooth LE · 100 Hz</div>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Info label="แบตเตอรี่">
              <Battery level={rt.status.battery} />
            </Info>
            <Info label="เฟิร์มแวร์">v{rt.info.firmware}</Info>
            <Info label="ถุงลม">{rt.status.pump === 'holding' ? `${rt.status.targetPressure} mmHg` : 'ยังไม่เป่าลม'}</Info>
          </dl>
          <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-700">สถานะเซ็นเซอร์</h3>
          <div className="flex flex-wrap gap-2">
            <SensorBadge ok={rt.status.sensors.pressure} label="เซ็นเซอร์แรงดัน" />
            <SensorBadge ok={rt.status.sensors.pelvisImu} label="IMU เชิงกราน" />
            <SensorBadge ok={rt.status.sensors.trunkImu} label="IMU ลำตัว" />
          </div>
          <div className="mt-6 flex justify-end">
            <Button onClick={() => navigate('/therapist/patients')}>ไปเลือกผู้ป่วย →</Button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-col items-center py-6 text-center">
            <Radar active={phase === 'scanning'} />
            <p className="mt-4 text-slate-600">
              {phase === 'scanning'
                ? 'กำลังค้นหาอุปกรณ์ใกล้เคียง…'
                : phase === 'found' && devices.length === 0
                  ? 'ไม่พบอุปกรณ์ ลองสแกนอีกครั้ง'
                  : 'กดสแกนเพื่อค้นหาอุปกรณ์ผ่าน Bluetooth'}
            </p>
            <Button className="mt-4" size="lg" onClick={() => void scan()} disabled={phase === 'scanning' || phase === 'connecting'}>
              {phase === 'found' ? 'สแกนอีกครั้ง' : 'สแกนหาอุปกรณ์'}
            </Button>
          </div>

          {devices.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-4 px-4 py-3">
                  <SignalBars rssi={d.rssi} />
                  <div className="flex-1">
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-sm text-slate-500 tabular">สัญญาณ {d.rssi} dBm</div>
                  </div>
                  <Button onClick={() => void connect()} disabled={phase === 'connecting'}>
                    {phase === 'connecting' ? 'กำลังเชื่อมต่อ…' : 'เชื่อมต่อ'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-800 tabular">{children}</dd>
    </div>
  );
}

function SensorBadge({ ok, label }: { ok: boolean; label: string }) {
  return <StatusBadge tone={ok ? 'ok' : 'warn'}>{label} {ok ? 'พร้อม' : 'ไม่พบ'}</StatusBadge>;
}

function Battery({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative inline-block h-4 w-8 rounded-[4px] border-2 border-slate-500">
        <span
          className={`absolute inset-y-0 left-0 m-[1px] rounded-[2px] ${level > 20 ? 'bg-brand-600' : 'bg-amber-500'}`}
          style={{ width: `calc(${level}% - 2px)` }}
        />
        <span className="absolute -right-[5px] top-1/2 h-2 w-[3px] -translate-y-1/2 rounded-r bg-slate-500" />
      </span>
      {level}%
    </span>
  );
}

function SignalBars({ rssi }: { rssi: number }) {
  const bars = rssi > -60 ? 4 : rssi > -70 ? 3 : rssi > -80 ? 2 : 1;
  return (
    <span className="flex h-6 items-end gap-0.5" aria-label={`สัญญาณ ${bars} ขีด`}>
      {[1, 2, 3, 4].map((b) => (
        <span key={b} className={`w-1.5 rounded-sm ${b <= bars ? 'bg-brand-600' : 'bg-slate-200'}`} style={{ height: `${b * 25}%` }} />
      ))}
    </span>
  );
}

function Radar({ active }: { active: boolean }) {
  return (
    <div className="relative grid h-28 w-28 place-items-center">
      {active &&
        [0, 0.6, 1.2].map((d) => (
          <span
            key={d}
            className="absolute inset-0 animate-ping rounded-full border-2 border-brand-500/50"
            style={{ animationDuration: '1.8s', animationDelay: `${d}s` }}
          />
        ))}
      <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 7l10 10-5 5V2l5 5L7 17" />
        </svg>
      </span>
    </div>
  );
}

function DeviceGlyph() {
  return (
    <svg viewBox="0 0 80 48" className="h-14 w-24" aria-hidden>
      <rect x="2" y="14" width="56" height="26" rx="13" fill="#ccfbf1" stroke="#0f766e" strokeWidth="2" />
      <rect x="60" y="20" width="18" height="14" rx="3" fill="#0f766e" />
      <circle cx="69" cy="27" r="2.5" fill="#5eead4" />
      <path d="M58 27h2" stroke="#0f766e" strokeWidth="3" />
    </svg>
  );
}
