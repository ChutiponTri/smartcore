import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import { runtime } from '../app/runtime';

const WINDOW_SEC = 15;
const FRAME_MS = 33; // ~30 fps
const SERIES_1 = '#2a78d6';
const SERIES_2 = '#eb6834';
const BAND_FILL = 'rgba(15, 118, 110, 0.10)';
const BAND_EDGE = 'rgba(15, 118, 110, 0.55)';
const GOOD_FILL = 'rgba(27, 175, 122, 0.13)';
const AXIS = '#64748b';
const GRID = '#eef2f6';

type Band = { lo: number; hi: number };
type ChartSpec = {
  key: 'pressure' | 'pelvis' | 'lumbar';
  title: string;
  unit: string;
  band: () => Band;
  /** extra headroom around the band when choosing the y-range */
  pad: number;
};

export type LiveChartBands = { pressure: Band; pelvis: Band; lumbar: Band };

/**
 * Three stacked uPlot charts fed straight from the runtime ring buffer.
 * Redraws at ~30 fps via requestAnimationFrame; React never sees the samples.
 */
export function LiveCharts({ bands }: { bands: LiveChartBands }) {
  const bandsRef = useRef(bands);
  useEffect(() => {
    bandsRef.current = bands;
  });

  const pressureRef = useRef<HTMLDivElement>(null);
  const pelvisRef = useRef<HTMLDivElement>(null);
  const lumbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refs = { pressure: pressureRef, pelvis: pelvisRef, lumbar: lumbarRef };
    const specs: ChartSpec[] = [
      { key: 'pressure', title: 'แรงดัน', unit: 'mmHg', band: () => bandsRef.current.pressure, pad: 6 },
      { key: 'pelvis', title: 'เชิงกราน', unit: '°', band: () => bandsRef.current.pelvis, pad: 6 },
      { key: 'lumbar', title: 'มุมเอว', unit: '°', band: () => bandsRef.current.lumbar, pad: 6 },
    ];
    let good: Uint8Array = new Uint8Array(0);
    let xs: Float64Array = new Float64Array(0);

    const drawUnder = (spec: ChartSpec) => (u: uPlot) => {
      const ctx = u.ctx;
      const { left, top, width, height } = u.bbox;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, width, height);
      ctx.clip();
      // A×B=1 periods
      ctx.fillStyle = GOOD_FILL;
      let runStart = -1;
      for (let i = 0; i <= good.length; i++) {
        const on = i < good.length && good[i] === 1;
        if (on && runStart < 0) runStart = i;
        if (!on && runStart >= 0) {
          const x0 = u.valToPos(xs[runStart], 'x', true);
          const x1 = u.valToPos(xs[i - 1], 'x', true);
          ctx.fillRect(x0, top, Math.max(1, x1 - x0), height);
          runStart = -1;
        }
      }
      // target band
      const b = spec.band();
      const y0 = u.valToPos(b.hi, 'y', true);
      const y1 = u.valToPos(b.lo, 'y', true);
      ctx.fillStyle = BAND_FILL;
      ctx.fillRect(left, y0, width, y1 - y0);
      ctx.strokeStyle = BAND_EDGE;
      ctx.lineWidth = 1 * devicePixelRatio;
      ctx.setLineDash([6 * devicePixelRatio, 4 * devicePixelRatio]);
      for (const y of [y0, y1]) {
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + width, y);
        ctx.stroke();
      }
      ctx.restore();
    };

    const plots = specs.map((spec) => {
      const el = refs[spec.key].current!;
      const series: uPlot.Series[] = [{ label: 'เวลา', value: (_u, v) => (v == null ? '–' : `${v.toFixed(1)} วิ`) }];
      const fmt = (_u: uPlot, v: number | null) => (v == null ? '–' : `${v.toFixed(1)} ${spec.unit}`);
      if (spec.key === 'pressure') series.push({ label: 'แรงดัน', stroke: SERIES_1, width: 2, value: fmt });
      if (spec.key === 'pelvis') {
        series.push({ label: 'Pelvic tilt', stroke: SERIES_1, width: 2, value: fmt });
        series.push({ label: 'Obliquity', stroke: SERIES_2, width: 2, dash: [6, 4], value: fmt });
      }
      if (spec.key === 'lumbar') series.push({ label: 'Lumbar (ลำตัว − เชิงกราน)', stroke: SERIES_1, width: 2, value: fmt });

      const opts: uPlot.Options = {
        width: el.clientWidth || 600,
        height: 150,
        pxAlign: false,
        scales: {
          x: { time: false, range: [-WINDOW_SEC, 0] },
          y: {
            range: (_u, min, max) => {
              const b = spec.band();
              const lo = Math.min(Number.isFinite(min) ? min : b.lo, b.lo - spec.pad);
              const hi = Math.max(Number.isFinite(max) ? max : b.hi, b.hi + spec.pad);
              return [Math.floor(lo), Math.ceil(hi)];
            },
          },
        },
        axes: [
          {
            stroke: AXIS,
            grid: { stroke: GRID, width: 1 },
            ticks: { stroke: GRID, width: 1 },
            values: (_u, ticks) => ticks.map((t) => (t === 0 ? 'ตอนนี้' : `${t} วิ`)),
            font: '12px "IBM Plex Sans Thai", sans-serif',
          },
          {
            stroke: AXIS,
            grid: { stroke: GRID, width: 1 },
            ticks: { stroke: GRID, width: 1 },
            size: 48,
            font: '12px "IBM Plex Sans Thai", sans-serif',
          },
        ],
        series,
        legend: { live: true },
        cursor: { drag: { x: false, y: false }, points: { size: 8 } },
        hooks: { drawClear: [drawUnder(spec)] },
      };
      const empty: uPlot.AlignedData = [[], ...series.slice(1).map(() => [])];
      return { spec, u: new uPlot(opts, empty, el) };
    });

    const ro = new ResizeObserver(() => {
      for (const { spec, u } of plots) {
        const w = refs[spec.key].current?.clientWidth;
        if (w) u.setSize({ width: w, height: 150 });
      }
    });
    for (const { spec } of plots) ro.observe(refs[spec.key].current!);

    let raf = 0;
    let last = 0;
    let lastVersion = -1;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      const buf = runtime.buffer;
      if (buf.version === lastVersion) return;
      lastVersion = buf.version;
      const w = buf.window(WINDOW_SEC);
      xs = new Float64Array(w.x.length);
      for (let i = 0; i < xs.length; i++) xs[i] = w.x[i] - w.latest;
      good = w.good;
      for (const { spec, u } of plots) {
        const data: uPlot.AlignedData =
          spec.key === 'pressure'
            ? [xs, w.pressure]
            : spec.key === 'pelvis'
              ? [xs, w.tilt, w.obliquity]
              : [xs, w.lumbar];
        u.setData(data);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      plots.forEach(({ u }) => u.destroy());
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm border border-dashed" style={{ background: BAND_FILL, borderColor: BAND_EDGE }} />
          ช่วงเป้าหมาย / เกณฑ์
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: 'rgba(27, 175, 122, 0.35)' }} />✓ ช่วงที่ A×B = 1 (นับเวลา)
        </span>
      </div>
      <ChartBlock title="แรงดันถุงลม (mmHg)" innerRef={pressureRef} />
      <ChartBlock title="มุมเชิงกราน (°) — tilt และ obliquity" innerRef={pelvisRef} />
      <ChartBlock title="มุมเอว (°) — ลำตัวเทียบเชิงกราน" innerRef={lumbarRef} />
    </div>
  );
}

function ChartBlock({ title, innerRef }: { title: string; innerRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div>
      <div className="mb-1 text-sm font-medium text-slate-700">{title}</div>
      <div ref={innerRef} className="live-chart w-full" />
    </div>
  );
}
