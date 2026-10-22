import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import uPlot from 'uplot';
import { COMPENSATION_LABEL, COMPENSATION_TYPES } from '../scoring/rules';
import type { SessionRecord } from '../store/db';
import { db } from '../store/db';
import { settings, useSettings } from '../store/settings';
import { Card, PageHeader, Stat, inputClass } from '../ui/components';
import { formatDate } from '../ui/format';

// Categorical slots 1–4 (validated reference palette, fixed order).
const SLOTS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];

export function History() {
  const s = useSettings();
  const patients = useLiveQuery(() => db.patients.orderBy('id').toArray(), []) ?? [];
  const patientId = s.patientId ?? patients[0]?.id ?? null;
  const sessions = useLiveQuery(
    async (): Promise<SessionRecord[]> => (patientId ? db.sessions.where('patientId').equals(patientId).sortBy('startedAt') : []),
    [patientId],
  );

  const first = sessions?.[0];
  const last = sessions?.[sessions.length - 1];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="ประวัติ"
        subtitle="แนวโน้มข้ามเซสชันของผู้ป่วย"
        actions={
          <select
            className={`${inputClass} w-48`}
            value={patientId ?? ''}
            onChange={(e) => settings.set({ patientId: e.target.value })}
            aria-label="เลือกผู้ป่วย"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} (เกิด {p.birthYear})
              </option>
            ))}
          </select>
        }
      />

      {!sessions || sessions.length === 0 ? (
        <Card>
          <p className="text-slate-600">ยังไม่มีเซสชันของผู้ป่วยรายนี้</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="จำนวนเซสชัน" value={sessions.length} />
            <Stat
              label="เวลาในเป้า ล่าสุด"
              value={last!.summary.inTargetPct.toFixed(0)}
              unit="%"
              sub={first !== last ? `เริ่มต้น ${first!.summary.inTargetPct.toFixed(0)}%` : undefined}
            />
            <Stat
              label="คุณภาพเฉลี่ย ล่าสุด"
              value={last!.summary.avgQuality}
              sub={first !== last ? `เริ่มต้น ${first!.summary.avgQuality}` : undefined}
            />
            <Stat
              label="ชดเชย/รอบ ล่าสุด"
              value={compPerRep(last!).toFixed(1)}
              sub={first !== last ? `เริ่มต้น ${compPerRep(first!).toFixed(1)}` : undefined}
            />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Card title="เวลาในเป้า และคุณภาพ (0–100)">
              <TrendChart
                sessions={sessions}
                series={[
                  { label: 'เวลาในเป้า %', color: SLOTS[0], get: (r) => r.summary.inTargetPct },
                  { label: 'คุณภาพเฉลี่ย', color: SLOTS[1], get: (r) => r.summary.avgQuality, dash: true },
                ]}
                yRange={[0, 100]}
              />
            </Card>
            <Card title="การชดเชยต่อเซสชัน (ครั้ง)">
              <TrendChart
                sessions={sessions}
                series={COMPENSATION_TYPES.map((t, i) => ({
                  label: COMPENSATION_LABEL[t],
                  color: SLOTS[i],
                  get: (r: SessionRecord) => r.summary.compensations[t],
                }))}
              />
            </Card>
          </div>

          <Card title="รายการเซสชัน" className="mt-5">
            <table className="w-full text-sm">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100 text-right">
                  <th className="py-2 text-left font-medium">วันที่</th>
                  <th className="py-2 text-left font-medium">เกม</th>
                  <th className="py-2 font-medium">รอบสำเร็จ</th>
                  <th className="py-2 font-medium">เวลาในเป้า</th>
                  <th className="py-2 font-medium">คุณภาพ</th>
                  <th className="py-2 font-medium">คะแนน</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="tabular">
                {[...sessions].reverse().map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 text-right">
                    <td className="py-2 text-left">{formatDate(r.startedAt)}</td>
                    <td className="py-2 text-left">{r.config.gameId === 'balloon' ? 'Balloon Hold' : 'Steady Boat'}</td>
                    <td className="py-2">
                      {r.summary.repsSucceeded}/{r.summary.repsPlanned}
                    </td>
                    <td className="py-2">{r.summary.inTargetPct.toFixed(1)}%</td>
                    <td className="py-2">{r.summary.avgQuality}</td>
                    <td className="py-2">{r.summary.score}</td>
                    <td className="py-2">
                      <Link to={`/therapist/summary/${r.id}`} className="font-medium text-brand-700 hover:underline">
                        ดูสรุป →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function compPerRep(r: SessionRecord) {
  const total = COMPENSATION_TYPES.reduce((a, t) => a + r.summary.compensations[t], 0);
  return r.summary.repsCompleted ? total / r.summary.repsCompleted : 0;
}

type TrendSeries = { label: string; color: string; get: (r: SessionRecord) => number; dash?: boolean };

function TrendChart({
  sessions,
  series,
  yRange,
}: {
  sessions: SessionRecord[];
  series: TrendSeries[];
  yRange?: [number, number];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const xs = sessions.map((_, i) => i + 1);
    const labels = sessions.map((r) => new Date(r.startedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }));
    const u = new uPlot(
      {
        width: el.clientWidth || 500,
        height: 240,
        scales: {
          x: { time: false, range: [0.6, sessions.length + 0.4] },
          y: yRange ? { range: yRange } : { range: (_u, _min, max) => [0, Math.max(4, Math.ceil(max + 1))] },
        },
        axes: [
          {
            stroke: '#64748b',
            grid: { show: false },
            splits: () => xs,
            values: (_u, ticks) => ticks.map((t) => labels[t - 1] ?? ''),
            font: '12px "IBM Plex Sans Thai", sans-serif',
          },
          { stroke: '#64748b', grid: { stroke: '#eef2f6' }, size: 40, font: '12px "IBM Plex Sans Thai", sans-serif' },
        ],
        series: [
          { label: 'เซสชัน', value: (_u, v) => (v == null ? '–' : labels[v - 1] ?? '') },
          ...series.map((s) => ({
            label: s.label,
            stroke: s.color,
            width: 2,
            dash: s.dash ? [6, 4] : undefined,
            points: { show: true, size: 8, fill: '#fff', stroke: s.color, width: 2 },
          })),
        ],
        cursor: { drag: { x: false, y: false } },
        legend: { live: true },
      },
      [xs, ...series.map((s) => sessions.map(s.get))],
      el,
    );
    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height: 240 }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.destroy();
    };
  }, [sessions, series, yRange]);

  return <div ref={ref} className="live-chart w-full" />;
}
