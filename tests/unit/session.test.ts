import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashSessionToken } from '@/lib/auth/session';
import { safeNextPath } from '@/lib/auth/guards';

describe('session token hashing', () => {
  it('is the sha256 hex of the raw token', () => {
    const token = 'abc123';
    expect(hashSessionToken(token)).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
  });

  it('is deterministic and never equals the raw token', () => {
    const token = 'super-secret-token-value';
    const h = hashSessionToken(token);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe(token);
    expect(hashSessionToken(token)).toBe(h);
  });
});

describe('safeNextPath', () => {
  it('accepts same-origin relative paths', () => {
    expect(safeNextPath('/trips')).toBe('/trips');
    expect(safeNextPath('/invite/abc?x=1')).toBe('/invite/abc?x=1');
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeNextPath('https://evil.example.com')).toBeNull();
    expect(safeNextPath('//evil.example.com/x')).toBeNull();
    expect(safeNextPath('javascript:alert(1)')).toBeNull();
    expect(safeNextPath('')).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});
