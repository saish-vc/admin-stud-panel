import type { StorageAdapter } from '../../src/lib/storage.js';
import { AppError } from '../../src/lib/errors.js';

interface StoredObject {
  data: Buffer;
  contentType: string;
}

/** Deterministic storage adapter for integration tests; no disk or S3 access. */
export class MemoryStorage implements StorageAdapter {
  readonly objects = new Map<string, StoredObject>();

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { data: Buffer.from(data), contentType });
  }

  async get(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) {
      throw new AppError(404, 'FILE_NOT_FOUND', 'The requested file was not found.');
    }
    return object.data;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
