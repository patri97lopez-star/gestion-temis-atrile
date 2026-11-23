import type { LineItem } from '../types/erp';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const parsed = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(baseIso: string, days: number): string {
  const date = new Date(`${baseIso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeTaxId(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidSpanishTaxIdFormat(value: string): boolean {
  const normalized = normalizeTaxId(value);
  return /^[A-Z0-9]{8,12}$/.test(normalized);
}

export function calculateLinesTotals(
  lines: LineItem[],
  retentionRate = 0
): {
  taxBase: number;
  vatAmount: number;
  retentionAmount: number;
  total: number;
} {
  let taxBase = 0;
  let vatAmount = 0;

  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const discount = Math.min(100, Math.max(0, Number(line.discountPercent) || 0));
    const vatRate = Math.max(0, Number(line.vatRate) || 0);
    const lineBase = qty * price * (1 - discount / 100);
    taxBase += lineBase;
    vatAmount += lineBase * (vatRate / 100);
  }

  taxBase = round2(taxBase);
  vatAmount = round2(vatAmount);
  const retentionAmount = round2(taxBase * (Math.max(0, retentionRate) / 100));
  const total = round2(taxBase + vatAmount - retentionAmount);

  return { taxBase, vatAmount, retentionAmount, total };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function getQuarterFromDate(dateStr: string): { year: number; quarter: '1T' | '2T' | '3T' | '4T' } | null {
  if (!dateStr || dateStr.length < 7) return null;
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  if (!year || !month) return null;
  if (month <= 3) return { year, quarter: '1T' };
  if (month <= 6) return { year, quarter: '2T' };
  if (month <= 9) return { year, quarter: '3T' };
  return { year, quarter: '4T' };
}

export function getQuarterDateRange(year: number, quarter: '1T' | '2T' | '3T' | '4T'): { start: string; end: string } {
  switch (quarter) {
    case '1T':
      return { start: `${year}-01-01`, end: `${year}-03-31` };
    case '2T':
      return { start: `${year}-04-01`, end: `${year}-06-30` };
    case '3T':
      return { start: `${year}-07-01`, end: `${year}-09-30` };
    case '4T':
      return { start: `${year}-10-01`, end: `${year}-12-31` };
  }
}

export async function computeVerifactuHash(payload: {
  issuerTaxId: string;
  invoiceNumber: string;
  issueDate: string;
  total: number;
  prevHash: string;
}): Promise<string> {
  const canonical = [
    normalizeTaxId(payload.issuerTaxId),
    payload.invoiceNumber.trim(),
    payload.issueDate,
    payload.total.toFixed(2),
    payload.prevHash || 'GENESIS',
  ].join('|');

  const encoded = new TextEncoder().encode(canonical);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function emailToInviteId(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

export function createEntityId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function timestampToMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'string') return Date.parse(ts) || 0;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return Number((ts as { seconds: number }).seconds) * 1000;
  }
  return 0;
}
