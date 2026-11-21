import { describe, expect, it } from 'vitest';
import { randomCertificateSuffix, randomCode, safeEqual, sha256 } from '../../src/lib/crypto.js';

describe('cryptographic helpers', () => {
  it('computes a stable SHA-256 hex digest', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256(Buffer.from('abc'))).toBe(sha256('abc'));
  });

  it('generates URL-safe verification codes of the requested entropy', () => {
    const code = randomCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeGreaterThanOrEqual(16);
    expect(randomCode(32).length).toBeGreaterThan(code.length);
    expect(randomCode()).not.toBe(randomCode());
  });

  it('generates uppercase hexadecimal certificate suffixes', () => {
    expect(randomCertificateSuffix()).toMatch(/^[0-9A-F]{8}$/);
    expect(randomCertificateSuffix(2)).toMatch(/^[0-9A-F]{4}$/);
  });

  it('compares equal strings without leaking length mismatches', () => {
    expect(safeEqual('same-value', 'same-value')).toBe(true);
    expect(safeEqual('same-value', 'other-value')).toBe(false);
    expect(safeEqual('short', 'much-longer')).toBe(false);
  });
});
