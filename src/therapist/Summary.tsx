import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router-dom';
import { useRuntime } from '../app/runtime';
import { rawCsv, summaryCsv } from '../store/csv';
import { COMPENSATION_LABEL, COMPENSATION_TYPES } from '../scoring/rules';
import { DIFFICULTY_LABEL, effectiveRange } from '../scoring/session';
import type { SessionRecord } from '../store/db';
import { db } from '../store/db';
import { Button, Card, PageHeader, Stat, StatusBadge } from '../ui/components';
import { downloadText, formatDate } from '../ui/format';

const GAME_NAME = { balloon: 'Balloon Hold', boat: 'Steady Boat' } as const;

export function Summary() {
  const params = useParams();
  const rt = useRuntime();
  const record = useLiveQuery(async () => {
    const id = params.id ? Number(params.id) : rt.lastSessionId;
    if (id != null) return (await db.sessions.get(id)) ?? null;
    return (await db.sessions.orderBy('startedAt').last()) ?? null;
  }, [params.id, rt.lastSessionId]);

  if (record === undefined) return null;
  if (record === null) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="สรุปผลเซสชัน" />
        <Card>
          <p className="text-slate-600">ยังไม่มีเซสชันที่บันทึกไว้</p>
        </Card>
      </div>
    );
  }
  return <SummaryView r={record} />;
}

function SummaryView({ r }: { r: SessionRecord }) {
  const s = r.summary;
  const range = effectiveRange(r.config);
  const maxComp = Math.max(1, ...COMPENSATION_TYPES.map((t) => s.compensations[t]));
  const totalComp = COMPENSATION_TYPES.reduce((a, t) => a + s.compensations[t], 0);

  const exportRaw = async () => {
    const raw = await db.raw.get(r.id!);
    if (raw) downloadText(`${baseName(r)}_raw_100Hz.csv`, rawCsv(raw));
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="สรุปผลเซสชัน"
        subtitle={
          <>
            ผู้ป่วย <b>{r.patientId}</b> · {formatDate(r.startedAt)} · {GAME_NAME[r.config.gameId]} · ระดับ{' '}
            {DIFFICULTY_LABEL[r.config.difficulty]} · เป้าหมาย {range.lo}–{range.hi} mmHg
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => downloadText(`${baseName(r)}_summary.csv`, summaryCsv(r))}>
              ⤓ CSV สรุป
            </Button>
            <Button onClick={() => void exportRaw()} disabled={!r.hasRaw} title={r.hasRaw ? undefined : 'เซสชันนี้ไม่มีข้อมูลดิบ'}>
              ⤓ CSV ข้อมูลดิบ 100 Hz
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge tone="ok">บันทึกในเครื่องแล้ว</StatusBadge>
        {s.stoppedEarly && <StatusBadge tone="warn">หยุดก่อนครบรอบ</StatusBadge>}
        {!r.hasRaw && <StatusBadge tone="muted">ไม่มีข้อมูลดิบ</StatusBadge>}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="เวลาในเป้า (A×B = 1)" value={s.inTargetPct.toFixed(1)} unit="%" sub={`${s.goodSec} จาก ${s.holdSec} วินาที`} />
        <Stat label="คะแนน" value={s.score} sub={`คุณภาพเฉลี่ย ${s.avgQuality}/100`} />
        <Stat label="รอบสำเร็จ" value={`${s.repsSucceeded}/${s.repsPlanned}`} sub={`ทำไป ${s.repsCompleted} รอบ`} />
        <Stat label="การชดเชย" value={totalComp} unit="ครั้ง" sub={`แรงดันในเป้า ${s.pressureOnlyPct}% · ท่าดี ${s.postureOnlyPct}%`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card title="การชดเชยแยกประเภท">
          <ul className="space-y-3">
            {COMPENSATION_TYPES.map((t) => (
              <li key={t}>
                <div className="flex justify-between text-sm">
                  <span>{COMPENSATION_LABEL[t]}</span>
                  <span className="font-semibold tabular">{s.compensations[t]} ครั้ง</span>
                </div>
                <div className="mt-1 h-2.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#eb6834]" style={{ width: `${(s.compensations[t] / maxComp) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="ผลรายรอบ">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-100 text-right">
                  <th className="py-2 text-left font-medium">รอบ</th>
                  <th className="py-2 text-left font-medium">ผล</th>
                  <th className="py-2 font-medium">เวลา (วิ)</th>
                  <th className="py-2 font-medium">ในเป้า</th>
                  <th className="py-2 font-medium">แรงดันเฉลี่ย</th>
                  <th className="py-2 font-medium">SD</th>
                  <th className="py-2 font-medium">ชดเชย</th>
                  <th className="py-2 font-medium">คุณภาพ</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {r.reps.map((rep) => {
                  const comps = COMPENSATION_TYPES.reduce((a, t) => a + rep.compensations[t], 0);
                  return (
                    <tr key={rep.rep} className="border-b border-slate-50 text-right">
                      <td className="py-2 text-left">{rep.rep}</td>
                      <td className="py-2 text-left">
                        {rep.success ? <span className="text-emerald-700">✓ สำเร็จ</span> : <span className="text-amber-700">⚠ ไม่ครบ</span>}
                      </td>
                      <td className="py-2">{rep.durationSec.toFixed(1)}</td>
                      <td className="py-2">
                        <span className="inline-flex items-center gap-2">
                          <span className="hidden h-1.5 w-16 rounded-full bg-slate-100 sm:inline-block">
                            <span className="block h-full rounded-full bg-[#2a78d6]" style={{ width: `${rep.inTargetPct}%` }} />
                          </span>
                          {rep.inTargetPct.toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-2">{rep.pressureMean.toFixed(1)}</td>
                      <td className="py-2">{rep.pressureSd.toFixed(2)}</td>
                      <td className="py-2">{comps}</td>
                      <td className="py-2 font-semibold">{rep.score}</td>
                    </tr>
                  );
                })}
                {r.reps.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-slate-500">
                      ยังไม่มีรอบที่บันทึก
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Link to="/therapist/history" className="rounded-xl px-4 py-2 font-medium text-brand-700 hover:bg-brand-50">
          ดูประวัติผู้ป่วย →
        </Link>
      </div>
    </div>
  );
}

function baseName(r: SessionRecord) {
  const d = new Date(r.startedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${r.patientId}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
