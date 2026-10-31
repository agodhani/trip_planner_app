import 'server-only';
import { DateTime } from 'luxon';
import { env } from '@/lib/env';

/**
 * Pinnable clock for tests: TP_TEST_NOW is honoured only when
 * PROVIDER_FIXTURES_DIR is set (i.e. fixture-replay test runs).
 */
export function now(): DateTime {
  if (env.PROVIDER_FIXTURES_DIR && process.env.TP_TEST_NOW) {
    const pinned = DateTime.fromISO(process.env.TP_TEST_NOW, { zone: 'utc' });
    if (pinned.isValid) return pinned;
  }
  return DateTime.now();
}

export function todayISO(tz: string): string {
  return now().setZone(tz).toFormat('yyyy-MM-dd');
}
