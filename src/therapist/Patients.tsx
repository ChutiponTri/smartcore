import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Patient } from '../store/db';
import { db } from '../store/db';
import { settings, useSettings } from '../store/settings';
import { Button, Card, Field, PageHeader, inputClass } from '../ui/components';
import { formatDate } from '../ui/format';

type Draft = { id: string; birthYear: string; note: string; isNew: boolean };

const ID_PATTERN = /^P\d{3,}$/;

function nextId(patients: Patient[]) {
  const max = patients.reduce((m, p) => Math.max(m, Number(p.id.slice(1)) || 0), 0);
  return `P${String(max + 1).padStart(3, '0')}`;
}

export function Patients() {
  const s = useSettings();
  const navigate = useNavigate();
  const patients = useLiveQuery(() => db.patients.orderBy('id').toArray(), []) ?? [];
  const stats = useLiveQuery(async () => {
    const all = await db.sessions.toArray();
    const map = new Map<string, { count: number; last: number }>();
    for (const r of all) {
      const cur = map.get(r.patientId) ?? { count: 0, last: 0 };
      map.set(r.patientId, { count: cur.count + 1, last: Math.max(cur.last, r.startedAt) });
    }
    return map;
  }, []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const thisYear = new Date().getFullYear();

  const save = async () => {
    if (!draft) return;
    const id = draft.id.trim().toUpperCase();
    const birthYear = Number(draft.birthYear);
    if (!ID_PATTERN.test(id)) return setError('รหัสต้องอยู่ในรูปแบบ P ตามด้วยตัวเลข 3 หลัก เช่น P004');
    if (!Number.isInteger(birthYear) || birthYear < 1940 || birthYear > thisYear) return setError('ปีเกิด (ค.ศ.) ไม่ถูกต้อง');
    if (draft.isNew && (await db.patients.get(id))) return setError(`มีรหัส ${id} อยู่แล้ว`);
    const now = Date.now();
    if (draft.isNew) {
      await db.patients.add({ id, birthYear, note: draft.note.trim(), createdAt: now, updatedAt: now });
    } else {
      await db.patients.update(id, { birthYear, note: draft.note.trim(), updatedAt: now });
    }
    setDraft(null);
    setError(null);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="ผู้ป่วย"
        subtitle="ใช้รหัสแทนชื่อจริงเพื่อความเป็นส่วนตัว"
        actions={
          <Button onClick={() => setDraft({ id: nextId(patients), birthYear: '', note: '', isNew: true })}>+ เพิ่มผู้ป่วย</Button>
        }
      />

      {draft && (
        <Card title={draft.isNew ? 'เพิ่มผู้ป่วย' : `แก้ไข ${draft.id}`} className="mb-5">
          <div className="grid gap-4 sm:grid-cols-[140px_160px_1fr]">
            <Field label="รหัส">
              <input
                className={inputClass}
                value={draft.id}
                disabled={!draft.isNew}
                onChange={(e) => setDraft({ ...draft, id: e.target.value })}
              />
            </Field>
            <Field label="ปีเกิด (ค.ศ.)">
              <input
                className={inputClass}
                inputMode="numeric"
                placeholder="เช่น 2012"
                value={draft.birthYear}
                onChange={(e) => setDraft({ ...draft, birthYear: e.target.value })}
              />
            </Field>
            <Field label="หมายเหตุทางคลินิก" hint="ห้ามระบุชื่อ-นามสกุล หรือข้อมูลที่ระบุตัวตนได้">
              <input className={inputClass} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </Field>
          </div>
          {error && <p className="mt-3 text-sm text-red-700">⚠ {error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => (setDraft(null), setError(null))}>
              ยกเลิก
            </Button>
            <Button onClick={() => void save()}>บันทึก</Button>
          </div>
        </Card>
      )}

      <Card>
        <table className="w-full text-left">
          <thead className="text-sm text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="py-2 pr-3 font-medium">รหัส</th>
              <th className="py-2 pr-3 font-medium">ปีเกิด (อายุ)</th>
              <th className="py-2 pr-3 font-medium">หมายเหตุ</th>
              <th className="py-2 pr-3 font-medium">เซสชัน</th>
              <th className="py-2 pr-3 font-medium">ล่าสุด</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => {
              const selected = s.patientId === p.id;
              const st = stats?.get(p.id);
              return (
                <tr key={p.id} className={`border-b border-slate-50 ${selected ? 'bg-brand-50' : ''}`}>
                  <td className="py-3 pr-3 font-semibold tabular">
                    {selected && <span className="mr-1 text-brand-700" aria-label="เลือกอยู่">✓</span>}
                    {p.id}
                  </td>
                  <td className="py-3 pr-3 tabular">
                    {p.birthYear} <span className="text-slate-500">({thisYear - p.birthYear} ปี)</span>
                  </td>
                  <td className="max-w-xs py-3 pr-3 text-sm text-slate-600">{p.note || '–'}</td>
                  <td className="py-3 pr-3 tabular">{st?.count ?? 0}</td>
                  <td className="py-3 pr-3 text-sm text-slate-600">{st?.last ? formatDate(st.last, false) : '–'}</td>
                  <td className="py-3 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDraft({ id: p.id, birthYear: String(p.birthYear), note: p.note, isNew: false })}
                    >
                      แก้ไข
                    </Button>
                    <Button
                      variant={selected ? 'secondary' : 'primary'}
                      size="sm"
                      onClick={() => {
                        settings.set({ patientId: p.id });
                        navigate('/therapist/setup');
                      }}
                    >
                      {selected ? 'เลือกอยู่' : 'เลือก'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
