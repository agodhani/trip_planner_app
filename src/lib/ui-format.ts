/**
 * Display formatting shared by server and client components. Dates are
 * calendar dates ('YYYY-MM-DD') formatted in UTC so SSR and hydration agree.
 */

const moneyFmt = new Map<string, Intl.NumberFormat>();

export function money(amount: number | null | undefined, currency = 'USD', digits = 0): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  const key = `${currency}|${digits}`;
  let f = moneyFmt.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat('en-US', {
        style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
      });
    } catch {
      return `${currency} ${amount.toFixed(digits)}`;
    }
    moneyFmt.set(key, f);
  }
  return f.format(amount);
}

function utcDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts });
const dayFmt = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
const shortFmt = fmt({ month: 'short', day: 'numeric' });
const wdFmt = fmt({ weekday: 'short' });

/** 'Thu, Dec 3' */
export function dayLabel(iso: string): string {
  const d = utcDate(iso);
  return d ? dayFmt.format(d) : iso;
}

/** 'Dec 3' */
export function shortDate(iso: string): string {
  const d = utcDate(iso);
  return d ? shortFmt.format(d) : iso;
}

/** 'Thu' */
export function weekday(iso: string): string {
  const d = utcDate(iso);
  return d ? wdFmt.format(d) : '';
}

/** 'Thu, Dec 3 – Mon, Dec 7' */
export function dateRange(start: string, end: string | null | undefined): string {
  return end && end !== start ? `${dayLabel(start)} – ${dayLabel(end)}` : dayLabel(start);
}

export function nightsBetween(start: string, end: string): number {
  const a = utcDate(start), b = utcDate(end);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

/** 'just now', '8m ago', '2h ago', '3d ago' — for presence and feed chrome. */
export function timeAgo(date: Date | string, nowMs = Date.now()): string {
  const t = typeof date === 'string' ? Date.parse(date) : date.getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
