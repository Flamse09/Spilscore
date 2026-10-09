export function parsePoints(text: string, negative: boolean): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return negative && n !== 0 ? -n : n;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
}
