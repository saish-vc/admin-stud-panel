import { describe, expect, it } from 'vitest';
import {
  bcryptCostFromConfig,
  hashPassword,
  hashPasswords,
  validateNewPassword,
  verifyPassword,
} from '../../src/lib/password.js';
import { createTestConfig } from '../helpers/config.js';

describe('password policy', () => {
  it('accepts a password that satisfies every rule', () => {
    expect(validateNewPassword('Nttf@Portal2026')).toEqual({ valid: true, errors: [] });
  });

  it.each([
    ['Nt@1', 'at least 10 characters'],
    ['nttf@portal2026', 'an uppercase letter'],
    ['NTTF@PORTAL2026', 'a lowercase letter'],
    ['Nttf@Portal', 'a number'],
    ['NttfPortal2026', 'a symbol'],
  ])('rejects %s because it lacks %s', (password, expectedError) => {
    const result = validateNewPassword(password);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(expectedError);
  });

  it('rejects a password longer than 128 characters', () => {
    const result = validateNewPassword(`Aa1!${'x'.repeat(126)}`);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('at most 128 characters');
  });

  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('Student@Test2026', 4);
    expect(hash).not.toContain('Student@Test2026');
    await expect(verifyPassword('Student@Test2026', hash)).resolves.toBe(true);
    await expect(verifyPassword('Wrong@Test2026', hash)).resolves.toBe(false);
  });

  it('returns false for a malformed stored hash instead of throwing', async () => {
    await expect(verifyPassword('anything', 'not-a-bcrypt-hash')).resolves.toBe(false);
  });

  it('hashes many passwords with a unique salt each and bounded concurrency', async () => {
    const passwords = ['Same@Test2026', 'Same@Test2026', 'Same@Test2026'];
    const hashes = await hashPasswords(passwords, 4, 2);
    expect(hashes).toHaveLength(3);
    expect(new Set(hashes).size).toBe(3);
    for (const hash of hashes) {
      await expect(verifyPassword(passwords[0]!, hash)).resolves.toBe(true);
    }
  });

  it('returns an empty list for no passwords', async () => {
    await expect(hashPasswords([], 4)).resolves.toEqual([]);
  });

  it('exposes the configured bcrypt cost', () => {
    const config = createTestConfig();
    expect(bcryptCostFromConfig(config)).toBe(4);
  });
});
