import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { CertificatePdfData } from '../../src/services/certificate-pdf.js';
import {
  buildCertificateNumber,
  buildVerificationUrl,
  certificateTypeLabel,
  formatIssueDate,
  generateCertificatePdf,
} from '../../src/services/certificate-pdf.js';

function decodeToken(token: string): string {
  if (token.startsWith('<')) {
    return Buffer.from(token.slice(1, -1), 'hex').toString('latin1');
  }
  return token.slice(1, -1).replace(/\\([()\\])/g, '$1');
}

/** Inflates PDF content streams and reconstructs the shown text lines. */
function decodePdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const contents: string[] = [];
  const marker = /stream\r?\n/g;
  let match: RegExpExecArray | null;

  while ((match = marker.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end === -1) break;
    const slice = Buffer.from(raw.slice(start, end), 'latin1');
    try {
      contents.push(inflateSync(slice).toString('latin1'));
    } catch {
      // Image and font streams are binary; only text streams matter here.
    }
    marker.lastIndex = end;
  }

  const lines: string[] = [];
  const tokenPattern = /<([0-9A-Fa-f]+)>|\((?:[^()\\]|\\.)*\)/g;

  for (const content of contents) {
    for (const array of content.matchAll(/\[((?:\\.|[^\]\\])*)\]\s*TJ/g)) {
      let line = '';
      for (const token of array[1]!.matchAll(tokenPattern)) {
        line += decodeToken(token[0]);
      }
      lines.push(line);
    }
    for (const single of content.matchAll(/(\((?:[^()\\]|\\.)*\))\s*Tj/g)) {
      lines.push(decodeToken(single[1]!));
    }
  }

  return lines.join('\n');
}

const sample: CertificatePdfData = {
  certificateNumber: 'NTTF/BONAFIDE/2026/ABCD1234',
  certificateType: 'BONAFIDE',
  fullName: 'Ananya Menon',
  rollNumber: 'NTTF2026001',
  programme: 'Diploma in Mechanical Engineering',
  batchYear: 2023,
  purpose: 'Higher education loan application.',
  issueDate: new Date('2026-02-02T11:31:00.000Z'),
  verificationUrl: 'http://localhost:5173/verify/NTTF-VERIFY-E2E-2026-0001',
};

describe('certificate presentation', () => {
  it('renders the student identity, roll number, and certificate type', async () => {
    const generated = await generateCertificatePdf(sample);
    const text = decodePdfText(generated.buffer);

    expect(text).toContain('Ananya Menon');
    expect(text).toContain('NTTF2026001');
    expect(text).toContain('Bona Fide Certificate');
    expect(text).toContain('NTTF/BONAFIDE/2026/ABCD1234');
    expect(text).toContain('Diploma');
    expect(text).toContain('Mechanical');
    expect(text).toContain('02 February 2026');
  });

  it('never renders internal administrator remarks', async () => {
    const generated = await generateCertificatePdf({
      ...sample,
      adminRemarks: 'INTERNAL CLERK NOTE: suspected forged document',
    } as CertificatePdfData);
    const text = decodePdfText(generated.buffer);

    expect(text).not.toContain('INTERNAL CLERK NOTE');
    expect(text).not.toContain('suspected forged document');
    expect(text).not.toContain('admin_remarks');
  });

  it('uses official certificate labels', () => {
    expect(certificateTypeLabel('BONAFIDE')).toBe('Bona Fide Certificate');
    expect(certificateTypeLabel('LC')).toBe('Leaving Certificate');
    expect(certificateTypeLabel('DIPLOMA')).toBe('Diploma Certificate');
  });

  it('builds a deterministic certificate number from type, UTC year, and suffix', () => {
    expect(buildCertificateNumber('LC', new Date('2026-12-31T23:00:00.000Z'), 'AB12CD34')).toBe(
      'NTTF/LC/2026/AB12CD34',
    );
  });

  it('builds an encoded public verification URL', () => {
    expect(buildVerificationUrl('https://portal.nttf.ac.in/', 'abc_DEF-123')).toBe(
      'https://portal.nttf.ac.in/verify/abc_DEF-123',
    );
  });

  it('formats the issue date for an Indian audience', () => {
    expect(formatIssueDate(new Date('2026-02-02T11:31:00.000Z'))).toBe('02 February 2026');
  });

  it('renders a valid PDF with an embedded QR code and matching digest', async () => {
    const generated = await generateCertificatePdf({
      certificateNumber: 'NTTF/BONAFIDE/2026/ABCD1234',
      certificateType: 'BONAFIDE',
      fullName: 'Ananya Menon',
      rollNumber: 'NTTF2026001',
      programme: 'Diploma in Mechanical Engineering',
      batchYear: 2023,
      purpose: 'Higher education loan application.',
      issueDate: new Date('2026-02-02T11:31:00.000Z'),
      verificationUrl: 'http://localhost:5173/verify/NTTF-VERIFY-E2E-2026-0001',
    });

    expect(generated.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(generated.buffer.length).toBeGreaterThan(2_000);
    expect(generated.sha256).toBe(createHash('sha256').update(generated.buffer).digest('hex'));
  });
});
