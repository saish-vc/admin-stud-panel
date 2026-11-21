import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomCode(bytes = 18): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomCertificateSuffix(bytes = 4): string {
  return randomBytes(bytes).toString('hex').toUpperCase();
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
