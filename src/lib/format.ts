import { DateTime } from 'luxon';

export function formatDateTime(date: Date | string, tz: string): string {
  const dt =
    typeof date === 'string' ? DateTime.fromISO(date) : DateTime.fromJSDate(date);
  return dt.setZone(tz).toFormat('dd LLL yyyy, HH:mm');
}

export function formatDate(date: Date | string, tz: string): string {
  const dt =
    typeof date === 'string' ? DateTime.fromISO(date) : DateTime.fromJSDate(date);
  return dt.setZone(tz).toFormat('dd LLL yyyy');
}
