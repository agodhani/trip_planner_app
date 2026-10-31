import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('password hashing', () => {
  it('encodes as scrypt$N$r$p$salt$hash', async () => {
    const h = await hashPassword('correct horse battery staple');
    const parts = h.split('$');
    expect(parts[0]).toBe('scrypt');
    expect(parts[1]).toBe('32768');
    expect(parts[2]).toBe('8');
    expect(parts[3]).toBe('1');
    expect(parts).toHaveLength(6);
  });

  it('verifies the correct password', async () => {
    const h = await hashPassword('hunter2 hunter2');
    expect(await verifyPassword('hunter2 hunter2', h)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const h = await hashPassword('hunter2 hunter2');
    expect(await verifyPassword('hunter2 hunter3', h)).toBe(false);
  });

  it('rejects a malformed hash', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2$1$2$3$4$5')).toBe(false);
  });
});
