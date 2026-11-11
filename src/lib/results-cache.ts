/**
 * Session-only cache for provider search results, so going back/forward or
 * refreshing keeps the last result list without re-spending provider quota.
 * Keys: `tp:results:<tripId>:<kind>:<searchParams>`; never store errors.
 */

const PREFIX = 'tp:results:';

export function resultsKey(tripId: string, kind: string, searchParams: string): string {
  return `${PREFIX}${tripId}:${kind}:${searchParams}`;
}

/** Where the last-used form state lives so a remount can find its entry. */
export function formKey(tripId: string, kind: string): string {
  return `${PREFIX}${tripId}:${kind}:_form`;
}

export function readResults<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeResults(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or privacy mode — persistence is best-effort only.
  }
}
