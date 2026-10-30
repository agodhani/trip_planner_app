import 'server-only';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { env } from '@/lib/env';
import { ProviderError } from './types';

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(',')}}`;
}

export function fixtureKey(
  provider: string,
  operation: string,
  request: unknown,
): string {
  return createHash('sha256')
    .update(`${provider}|${operation}|${stableStringify(request)}`)
    .digest('hex');
}

function fixtureDir(): string | undefined {
  return env.PROVIDER_FIXTURES_DIR;
}

function hashPath(provider: string, operation: string, request: unknown): string {
  return join(
    fixtureDir()!,
    provider,
    operation,
    `${fixtureKey(provider, operation, request)}.json`,
  );
}

function defaultPath(provider: string, operation: string): string {
  return join(fixtureDir()!, provider, operation, 'default.json');
}

/**
 * Test-only fixture replay. When PROVIDER_FIXTURES_DIR is set, adapters get
 * their raw response body from a recorded file; anything else throws and
 * never touches the network.
 */
export function readFixture(
  provider: string,
  operation: string,
  request: unknown,
): string {
  const dir = fixtureDir();
  if (!dir) {
    throw new ProviderError(
      provider,
      'bad_request',
      'Fixture replay requested without PROVIDER_FIXTURES_DIR',
    );
  }
  const hashed = hashPath(provider, operation, request);
  for (const path of [hashed, defaultPath(provider, operation)]) {
    try {
      return readFileSync(/* turbopackIgnore: true */ path, 'utf8');
    } catch {
      // try the next candidate
    }
  }
  throw new ProviderError(
    provider,
    'bad_request',
    `No recorded fixture for ${provider}/${operation}. Expected: ${hashed} (or ${defaultPath(provider, operation)})`,
  );
}

export function fixturesEnabled(): boolean {
  return fixtureDir() !== undefined;
}

function stripKeys(value: unknown, keys: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => stripKeys(v, keys));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!keys.has(k)) out[k] = stripKeys(v, keys);
    }
    return out;
  }
  return value;
}

const SECRET_KEYS = new Set(['api_key', 'apiKey', 'apikey', 'key']);

/** Used by scripts/record-fixtures.ts to persist a real provider response. */
export function recordFixture(
  dir: string,
  provider: string,
  operation: string,
  request: unknown,
  body: string,
): string {
  let stored = body;
  try {
    stored = JSON.stringify(stripKeys(JSON.parse(body), SECRET_KEYS), null, 2);
  } catch {
    // non-JSON body: store verbatim
  }
  const path = join(
    dir,
    provider,
    operation,
    `${fixtureKey(provider, operation, request)}.json`,
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stored);
  return path;
}
