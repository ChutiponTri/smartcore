export const fmt1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '–');
export const signed1 = (v: number) => (v > 0 ? '+' : '') + fmt1(v);

export function formatDate(ts: number, withTime = true) {
  return new Date(ts).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
