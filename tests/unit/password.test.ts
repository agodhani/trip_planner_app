import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

describe('password hashing', () => {
  it('encodes as scrypt$N$r$p$salt$hash', () => {
    const h = hashPassword('correct horse battery staple');
    const parts = h.split('$');
    expect(parts[0]).toBe('scrypt');
    expect(parts[1]).toBe('32768');
    expect(parts[2]).toBe('8');
    expect(parts[3]).toBe('1');
    expect(parts).toHaveLength(6);
  });

  it('verifies the correct password', () => {
    const h = hashPassword('hunter2 hunter2');
    expect(verifyPassword('hunter2 hunter2', h)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const h = hashPassword('hunter2 hunter2');
    expect(verifyPassword('hunter2 hunter3', h)).toBe(false);
  });

  it('rejects a malformed hash', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(verifyPassword('x', 'pbkdf2$1$2$3$4$5')).toBe(false);
  });
});
