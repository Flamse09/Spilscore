const FORMULA_START = /^[=+\-@\t\r]/;

function cell(v: unknown, sep: string): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && FORMULA_START.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Semicolon-separated so Danish Excel opens it directly. */
export function toCsv(rows: Record<string, unknown>[], sep = ';'): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  return [cols.join(sep), ...rows.map((r) => cols.map((c) => cell(r[c], sep)).join(sep))].join('\r\n');
}

/** iOS home-screen apps handle the share sheet better than downloads; fall back to a download link. */
export async function shareOrDownload(filename: string, csv: string): Promise<void> {
  const file = new File(['﻿' + csv], filename, { type: 'text/csv' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      throw e;
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
