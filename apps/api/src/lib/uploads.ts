import { AppError } from './errors.js';

export type UploadKind = 'pdf' | 'jpg' | 'png';

export interface DetectedUpload {
  kind: UploadKind;
  extension: UploadKind;
  contentType: 'application/pdf' | 'image/jpeg' | 'image/png';
}

const PDF_SIGNATURE = Buffer.from('%PDF-');
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectUpload(buffer: Buffer): DetectedUpload {
  if (buffer.length >= PDF_SIGNATURE.length && buffer.subarray(0, 5).equals(PDF_SIGNATURE)) {
    return { kind: 'pdf', extension: 'pdf', contentType: 'application/pdf' };
  }
  if (buffer.length >= JPEG_SIGNATURE.length && buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    return { kind: 'jpg', extension: 'jpg', contentType: 'image/jpeg' };
  }
  if (buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { kind: 'png', extension: 'png', contentType: 'image/png' };
  }
  throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Only PDF, JPG, and PNG files are accepted.');
}

export function contentTypeForKind(kind: UploadKind): DetectedUpload['contentType'] {
  switch (kind) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
  }
}

export function safeDownloadName(studentRoll: string, kind: 'document' | 'certificate'): string {
  return `${studentRoll.replace(/[^A-Za-z0-9_-]/g, '_')}-${kind}`;
}
