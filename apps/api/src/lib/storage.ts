import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { AppConfig } from '../config.js';
import { AppError } from './errors.js';

export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

function assertSafeKey(key: string): void {
  if (!key || key.includes('..') || key.startsWith('/') || key.startsWith('\\')) {
    throw new AppError(500, 'INVALID_STORAGE_KEY', 'Invalid storage key.');
  }
}

export class LocalStorage implements StorageAdapter {
  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    assertSafeKey(key);
    const root = resolve(this.root);
    const target = resolve(join(root, normalize(key)));
    if (
      target !== root &&
      !target.startsWith(`${root}${process.platform === 'win32' ? '\\' : '/'}`)
    ) {
      throw new AppError(500, 'INVALID_STORAGE_KEY', 'Invalid storage key.');
    }
    return target;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data, { mode: 0o600 });
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.pathFor(key));
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new AppError(404, 'FILE_NOT_FOUND', 'The requested file was not found.');
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

export class S3Storage implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: NonNullable<AppConfig['storage']['s3']>) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) throw new AppError(404, 'FILE_NOT_FOUND', 'File not found.');
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof AppError) throw error;
      const name = error instanceof Error ? error.name : '';
      if (name === 'NoSuchKey' || name === 'NotFound') {
        throw new AppError(404, 'FILE_NOT_FOUND', 'The requested file was not found.');
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export function createStorage(config: AppConfig): StorageAdapter {
  if (config.storage.driver === 's3') {
    if (!config.storage.s3) {
      throw new Error('S3 storage is selected but not configured');
    }
    return new S3Storage(config.storage.s3);
  }
  return new LocalStorage(config.storage.localDir);
}

export function documentObjectKey(extension: 'pdf' | 'jpg' | 'png'): string {
  return `documents/${randomUUID()}.${extension}`;
}

export function certificateObjectKey(): string {
  return `certificates/${randomUUID()}.pdf`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
