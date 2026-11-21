import bcrypt from 'bcrypt';
import type { AppConfig } from '../config.js';

export interface PasswordValidation {
  valid: boolean;
  errors: string[];
}

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;

export function validateNewPassword(password: string): PasswordValidation {
  const errors: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) errors.push('at least 10 characters');
  if (password.length > PASSWORD_MAX_LENGTH) errors.push('at most 128 characters');
  if (!/[a-z]/.test(password)) errors.push('a lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('an uppercase letter');
  if (!/\d/.test(password)) errors.push('a number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('a symbol');
  return { valid: errors.length === 0, errors };
}

export async function hashPassword(password: string, cost: number): Promise<string> {
  return bcrypt.hash(password, cost);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/** Hash a set of identical temporary passwords concurrently while preserving a unique salt per account. */
export async function hashPasswords(
  passwords: readonly string[],
  cost: number,
  concurrency = 8,
): Promise<string[]> {
  const hashes = new Array<string>(passwords.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < passwords.length) {
      const index = cursor;
      cursor += 1;
      const password = passwords[index];
      if (password === undefined) return;
      hashes[index] = await hashPassword(password, cost);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, passwords.length) }, () => worker()),
  );
  return hashes;
}

export function bcryptCostFromConfig(config: AppConfig): number {
  return config.bcryptCost;
}
