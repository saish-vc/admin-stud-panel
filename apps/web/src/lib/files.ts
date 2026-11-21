export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_UPLOAD_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const ACCEPTED_UPLOAD_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'] as const;
export const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export function validateUploadFile(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeAccepted =
    ACCEPTED_UPLOAD_MIME.includes(file.type as (typeof ACCEPTED_UPLOAD_MIME)[number]) ||
    file.type === '';
  const extensionAccepted = ACCEPTED_UPLOAD_EXTENSIONS.includes(
    extension as (typeof ACCEPTED_UPLOAD_EXTENSIONS)[number],
  );

  if (!mimeAccepted || !extensionAccepted) {
    return 'Attach a PDF, JPG, or PNG file.';
  }
  if (file.size === 0) {
    return 'The selected file is empty.';
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'The file must be 5 MB or smaller.';
  }
  return null;
}
