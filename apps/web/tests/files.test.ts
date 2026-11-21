import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, validateUploadFile } from '@/lib/files';

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validateUploadFile', () => {
  it.each([
    ['transcript.pdf', 'application/pdf'],
    ['photo.jpg', 'image/jpeg'],
    ['photo.png', 'image/png'],
  ])('accepts %s', (name, type) => {
    expect(validateUploadFile(makeFile(name, type, 1024))).toBeNull();
  });

  it('accepts a known extension when the browser omits the MIME type', () => {
    expect(validateUploadFile(makeFile('document.PDF', '', 512))).toBeNull();
  });

  it('rejects unsupported MIME types', () => {
    expect(validateUploadFile(makeFile('notes.pdf', 'text/plain', 512))).toBe(
      'Attach a PDF, JPG, or PNG file.',
    );
  });

  it('rejects unsupported extensions even with an accepted MIME type', () => {
    expect(validateUploadFile(makeFile('malware.exe', 'application/pdf', 512))).toBe(
      'Attach a PDF, JPG, or PNG file.',
    );
  });

  it('rejects empty files', () => {
    expect(validateUploadFile(makeFile('empty.pdf', 'application/pdf', 0))).toBe(
      'The selected file is empty.',
    );
  });

  it('rejects files larger than 5 MB', () => {
    expect(validateUploadFile(makeFile('large.pdf', 'application/pdf', MAX_UPLOAD_BYTES + 1))).toBe(
      'The file must be 5 MB or smaller.',
    );
  });

  it('accepts a file exactly at the 5 MB boundary', () => {
    expect(
      validateUploadFile(makeFile('limit.pdf', 'application/pdf', MAX_UPLOAD_BYTES)),
    ).toBeNull();
  });
});
