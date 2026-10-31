import { DateTime } from 'luxon';
import type { TimeWindow } from './strategy';

export type WindowMinutes = {
  startMinute: number;
  endMinute: number;
  clipped: boolean;
} | null;

/**
 * Interpret `window` on calendar date D in windowTz, convert both ends to
 * airportTz, and intersect with the airport-local day D (00:00–23:59).
 * Returns airport-local minute bounds or null when the intersection is empty.
 */
export function windowForDate(
  window: TimeWindow,
  windowTz: string,
  airportTz: string,
  date: string,
): WindowMinutes {
  const [sh, sm] = window.start.split(':').map(Number);
  const [eh, em] = window.end.split(':').map(Number);
  const start = DateTime.fromISO(date, { zone: windowTz }).set({
    hour: sh, minute: sm, second: 0, millisecond: 0,
  });
  const end = DateTime.fromISO(date, { zone: windowTz }).set({
    hour: eh, minute: em, second: 0, millisecond: 0,
  });
  if (!start.isValid || !end.isValid) return null;
  const startA = start.setZone(airportTz);
  const endA = end.setZone(airportTz);
  const dayStart = DateTime.fromISO(date, { zone: airportTz }).startOf('day');
  const dayEnd = dayStart.endOf('day');
  const lo = startA > dayStart ? startA : dayStart;
  const hi = endA < dayEnd ? endA : dayEnd;
  if (lo > hi) return null;
  // `clipped` when the window does not fully cover the airport-local day —
  // times after midnight in windowTz fall on the next airport day and are
  // not included.
  const clipped = startA < dayStart || endA > dayEnd;
  return {
    startMinute: lo.hour * 60 + lo.minute,
    endMinute: hi.hour * 60 + hi.minute,
    clipped,
  };
}

/** Exact-instant post-filter for a flight's local departure time. */
export function passesWindow(
  departLocal: string, // 'YYYY-MM-DDTHH:mm'
  airportTz: string,
  window: TimeWindow | undefined,
  windowTz: string,
  date: string, // calendar date the window applies to
): boolean {
  if (!window) return true;
  const w = windowForDate(window, windowTz, airportTz, date);
  if (!w) return false;
  const dt = DateTime.fromISO(departLocal, { zone: airportTz });
  if (!dt.isValid) return false;
  const dayStart = dt.startOf('day');
  const minute = Math.round((dt.toMillis() - dayStart.toMillis()) / 60000);
  return minute >= w.startMinute && minute <= w.endMinute;
}
