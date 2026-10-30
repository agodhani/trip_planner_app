import { describe, expect, it } from 'vitest';
import { roleAtLeast } from '@/lib/auth/guards';

describe('role ordering', () => {
  it('orders owner > editor > viewer', () => {
    expect(roleAtLeast('owner', 'owner')).toBe(true);
    expect(roleAtLeast('owner', 'editor')).toBe(true);
    expect(roleAtLeast('owner', 'viewer')).toBe(true);
    expect(roleAtLeast('editor', 'owner')).toBe(false);
    expect(roleAtLeast('editor', 'editor')).toBe(true);
    expect(roleAtLeast('editor', 'viewer')).toBe(true);
    expect(roleAtLeast('viewer', 'viewer')).toBe(true);
    expect(roleAtLeast('viewer', 'editor')).toBe(false);
    expect(roleAtLeast('viewer', 'owner')).toBe(false);
  });
});
