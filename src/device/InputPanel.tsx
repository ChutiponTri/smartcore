import { useEffect, useRef, useState } from 'react';
import type { ControlView, PadId, PointerControls, PosePreset } from './PointerInputSource';
import { pressSurfaceHandlers } from './pointerBindings';
import { PAD_RANGE_DEG } from './PointerInputSource';

const POS_KEY = 'smartcore.inputPanel.pos';
const PRESET_LABELS: Record<PosePreset, string> = {
  1: 'เชิงกรานแอ่นไปหน้า',
  2: 'เชิงกรานกดไปหลัง',
  3: 'แอ่นเอว',
  4: 'ท่าถูกต้อง',
};

function loadPos(): { right: number; bottom: number } {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage unavailable */
  }
  return { right: 16, bottom: 16 };
}

function usePadView(controls: PointerControls) {
  const [view, setView] = useState<ControlView>(() => controls.getView());
  useEffect(() => controls.subscribe(setView), [controls]);
  return view;
}

export function InputPanel({
  controls,
  open,
  onClose,
}: {
  controls: PointerControls;
  open: boolean;
  onClose: () => void;
}) {
  const view = usePadView(controls);
  const [pos, setPos] = useState(loadPos);
  const dragRef = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null);

  if (!open) return null;

  const onHeaderDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ...pos };
  };
  const onHeaderMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPos({
      right: Math.max(0, Math.min(window.innerWidth - 120, d.right - (e.clientX - d.x))),
      bottom: Math.max(0, Math.min(window.innerHeight - 60, d.bottom - (e.clientY - d.y))),
    });
  };
  const onHeaderUp = () => {
    dragRef.current = null;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div
      className="fixed z-[60] w-[340px] rounded-2xl border border-slate-300 bg-white/85 text-slate-800 shadow-2xl backdrop-blur transition-opacity hover:bg-white/95"
      style={{ right: pos.right, bottom: pos.bottom }}
      role="dialog"
      aria-label="แผงอินพุต"
    >
      <div
        className="flex cursor-move select-none items-center justify-between rounded-t-2xl bg-slate-800/90 px-3 py-2 text-sm text-white"
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
      >
        <span className="font-semibold">แผงอินพุต</span>
        <span className="flex items-center gap-2">
          <kbd className="rounded bg-white/20 px-1.5 text-xs">`</kbd>
          <button
            type="button"
            className="rounded px-1.5 text-lg leading-none hover:bg-white/20"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onClose}
            aria-label="ปิดแผงอินพุต"
          >
            ×
          </button>
        </span>
      </div>

      <div className="space-y-3 p-3 text-sm">
        <section>
          <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
            <span>แรงกดหลังลงถุงลม</span>
            <span>
              ละเอียด {view.fineOffset >= 0 ? '+' : ''}
              {view.fineOffset.toFixed(1)}
              {view.fineOffset !== 0 && (
                <button type="button" className="ml-1 text-brand-700 underline" onClick={() => controls.resetFine()}>
                  รีเซ็ต
                </button>
              )}
            </span>
          </div>
          <div
            className={`flex h-16 cursor-pointer select-none items-center justify-center rounded-xl border-2 text-center font-semibold transition-colors ${
              view.pressing ? 'border-brand-600 bg-brand-100 text-brand-800' : 'border-dashed border-slate-300 bg-slate-50'
            }`}
            {...pressSurfaceHandlers(controls)}
          >
            {view.pressing ? 'กำลังเกร็งกด…' : 'กดค้าง (คลิกซ้าย / Space)'}
            <span className="ml-2 text-xs font-normal text-slate-500">· ล้อเมาส์ปรับละเอียด</span>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            แรงเกร็งสูงสุด
            <input
              type="range"
              min={1}
              max={20}
              step={0.5}
              value={view.pressDepth}
              onChange={(e) => controls.setPressDepth(Number(e.target.value))}
              className="flex-1 accent-brand-600"
            />
            <span className="w-8 text-right tabular">+{view.pressDepth}</span>
          </label>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Pad label="เชิงกราน" hint="ลูกศร" pad="pelvis" value={view.pelvis} controls={controls} />
          <Pad label="ลำตัว" hint="Shift+ลูกศร" pad="trunk" value={view.trunk} controls={controls} />
        </section>

        <section>
          <div className="mb-1 text-xs font-medium text-slate-500">รูปแบบท่า (ปุ่ม 1–4)</div>
          <div className="grid grid-cols-2 gap-1.5">
            {([1, 2, 3, 4] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => controls.applyPreset(p)}
                className={`rounded-lg border px-2 py-1.5 text-left text-xs ${
                  view.preset === p || (p === 4 && view.preset === null)
                    ? 'border-brand-600 bg-brand-50 font-semibold text-brand-800'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <kbd className="mr-1 rounded bg-slate-200 px-1">{p}</kbd>
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Pad({
  label,
  hint,
  pad,
  value,
  controls,
}: {
  label: string;
  hint: string;
  pad: PadId;
  value: { tilt: number; obliquity: number };
  controls: PointerControls;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const activePad = useRef<PadId>(pad);

  const update = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    controls.setPad(activePad.current, { x, y });
  };

  const px = 50 + (value.obliquity / PAD_RANGE_DEG) * 50;
  const py = 50 - (value.tilt / PAD_RANGE_DEG) * 50;

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
        <span>{label}</span>
        <span className="text-slate-400">{hint}</span>
      </div>
      <div
        ref={ref}
        className="relative aspect-square cursor-crosshair touch-none select-none rounded-xl border border-slate-300 bg-slate-50"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          activePad.current = pad === 'pelvis' && e.shiftKey ? 'trunk' : pad;
          update(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) update(e);
        }}
        onPointerUp={() => controls.setPad(activePad.current, null)}
        onPointerCancel={() => controls.setPad(activePad.current, null)}
      >
        <div className="absolute inset-x-0 top-1/2 h-px bg-slate-300" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
        <div className="absolute left-1/2 top-[33%] h-[34%] w-[34%] -translate-x-1/2 rounded-full border border-dashed border-brand-500/60" />
        <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[10px] text-slate-400">หน้า</span>
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] text-slate-400">หลัง</span>
        <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">ซ้าย</span>
        <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">ขวา</span>
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600 shadow ring-2 ring-white"
          style={{ left: `${px}%`, top: `${py}%` }}
        />
      </div>
      <div className="mt-0.5 text-center text-[11px] text-slate-500 tabular">
        {value.tilt.toFixed(1)}° / {value.obliquity.toFixed(1)}°
      </div>
    </div>
  );
}
