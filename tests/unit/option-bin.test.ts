import { describe, expect, it } from 'vitest';
import { readdOutcome } from '@/lib/domain/option-bin';

describe('readdOutcome', () => {
  it('restores a binned row so votes and comments come back', () => {
    expect(readdOutcome({ removedAt: new Date('2026-10-30T12:00:00Z') })).toBe('restore');
  });

  it('keeps a live row — shortlisting twice stays idempotent', () => {
    expect(readdOutcome({ removedAt: null })).toBe('keep');
  });

  it('keeps when the conflict lookup found nothing', () => {
    expect(readdOutcome(undefined)).toBe('keep');
    expect(readdOutcome(null)).toBe('keep');
  });
});
