import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../src/lib/errors.js';
import {
  certificateObjectKey,
  createStorage,
  documentObjectKey,
  LocalStorage,
} from '../../src/lib/storage.js';
import { createTestConfig } from '../helpers/config.js';

let directory: string;
let storage: LocalStorage;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'nttf-storage-'));
  storage = new LocalStorage(directory);
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('LocalStorage', () => {
  it('writes, reads, and deletes a private object', async () => {
    const key = 'documents/student/evidence.pdf';
    await storage.put(key, Buffer.from('evidence'));
    await expect(storage.get(key)).resolves.toEqual(Buffer.from('evidence'));
    await expect(readFile(path.join(directory, key))).resolves.toEqual(Buffer.from('evidence'));
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toMatchObject({ status: 404, code: 'FILE_NOT_FOUND' });
  });

  it('treats deleting a missing object as idempotent', async () => {
    await expect(storage.delete('documents/missing.pdf')).resolves.toBeUndefined();
  });

  it.each([
    '../escape.pdf',
    '/absolute.pdf',
    '\\windows-absolute.pdf',
    'documents/../../x.pdf',
    '',
  ])('rejects unsafe key %j', async (key) => {
    await expect(storage.get(key)).rejects.toBeInstanceOf(AppError);
    await expect(storage.put(key, Buffer.from('x'))).rejects.toMatchObject({
      code: 'INVALID_STORAGE_KEY',
    });
  });

  it('preserves a missing-file error for reads', async () => {
    await expect(storage.get('documents/never-written.pdf')).rejects.toMatchObject({
      status: 404,
      code: 'FILE_NOT_FOUND',
    });
  });
});

describe('storage factory and keys', () => {
  it('creates local storage from configuration', () => {
    const config = createTestConfig({
      storage: {
        driver: 'local',
        localDir: path.join(directory, 'factory'),
      },
    });
    expect(createStorage(config)).toBeInstanceOf(LocalStorage);
  });

  it('refuses S3 without S3 configuration', () => {
    const config = createTestConfig({ storage: { driver: 's3', localDir: directory } });
    expect(() => createStorage(config)).toThrow('S3 storage is selected but not configured');
  });

  it('generates randomised, separated object keys', () => {
    const document = documentObjectKey('png');
    expect(document).toMatch(/^documents\/[0-9a-f-]{36}\.png$/);
    expect(documentObjectKey('pdf')).not.toBe(documentObjectKey('pdf'));
    expect(certificateObjectKey()).toMatch(/^certificates\/[0-9a-f-]{36}\.pdf$/);
  });
});
