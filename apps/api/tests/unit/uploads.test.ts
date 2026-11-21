import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors.js';
import { contentTypeForKind, detectUpload, safeDownloadName } from '../../src/lib/uploads.js';

const PDF = Buffer.from('%PDF-1.7\ncertificate');
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

describe('upload signature detection', () => {
  it('recognises the PDF magic bytes', () => {
    expect(detectUpload(PDF)).toEqual({
      kind: 'pdf',
      extension: 'pdf',
      contentType: 'application/pdf',
    });
  });

  it('recognises JPEG and PNG magic bytes', () => {
    expect(detectUpload(JPEG).contentType).toBe('image/jpeg');
    expect(detectUpload(PNG).contentType).toBe('image/png');
  });

  it.each([
    ['empty buffer', Buffer.alloc(0)],
    ['plain text', Buffer.from('this is not a document')],
    ['an Office archive', Buffer.from([0x50, 0x4b, 0x03, 0x04])],
    ['a truncated PDF signature', Buffer.from('%PD')],
  ])('rejects %s', (_label, buffer) => {
    expect(() => detectUpload(buffer)).toThrowError(AppError);
    try {
      detectUpload(buffer);
    } catch (error) {
      expect((error as AppError).status).toBe(415);
      expect((error as AppError).code).toBe('UNSUPPORTED_FILE_TYPE');
    }
  });

  it('maps kinds to canonical content types', () => {
    expect(contentTypeForKind('pdf')).toBe('application/pdf');
    expect(contentTypeForKind('jpg')).toBe('image/jpeg');
    expect(contentTypeForKind('png')).toBe('image/png');
  });

  it('sanitises download filenames', () => {
    expect(safeDownloadName('NTTF/2026/001', 'document')).toBe('NTTF_2026_001-document');
    expect(safeDownloadName('NTTF2026001', 'certificate')).toBe('NTTF2026001-certificate');
  });
});
