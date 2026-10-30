import 'server-only';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

type Entry = { count: number; resetAt: number };

const attempts = new Map<string, Entry>();

/**
 * In-memory login throttle: at most 10 failed attempts per (ip, email) per
 * 15 minutes.
 */
export function loginRateLimitOk(ip: string, email: string): boolean {
  const key = `${ip}|${email.toLowerCase()}`;
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) return true;
  return entry.count < MAX_FAILURES;
}

export function recordLoginFailure(ip: string, email: string): void {
  const key = `${ip}|${email.toLowerCase()}`;
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
  // opportunistic cleanup
  if (attempts.size > 10_000) {
    for (const [k, v] of attempts) {
      if (v.resetAt <= now) attempts.delete(k);
    }
  }
}

export function clearLoginFailures(ip: string, email: string): void {
  attempts.delete(`${ip}|${email.toLowerCase()}`);
}
