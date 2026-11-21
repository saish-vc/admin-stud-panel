import multer from 'multer';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config.js';
import { AppError } from '../lib/errors.js';
import { detectUpload } from '../lib/uploads.js';

const memoryUpload = (config: AppConfig) =>
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.maxUploadBytes,
      files: 1,
      fields: 4,
      parts: 6,
      fieldSize: 10_000,
      fieldNameSize: 100,
    },
  });

export function documentUpload(config: AppConfig): RequestHandler {
  const middleware = memoryUpload(config).single('document');

  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          next(
            new AppError(413, 'FILE_TOO_LARGE', 'The supporting document must be at most 5 MB.'),
          );
          return;
        }
        next(
          new AppError(400, 'INVALID_UPLOAD', `The upload could not be accepted: ${error.code}.`),
        );
        return;
      }
      next(error);
    });
  };
}

export interface PreparedDocument {
  buffer: Buffer;
  contentType: string;
  extension: 'pdf' | 'jpg' | 'png';
}

export function prepareDocument(req: Request): PreparedDocument | undefined {
  if (!req.file) return undefined;
  if (req.file.size === 0) {
    throw new AppError(400, 'EMPTY_FILE', 'The supporting document is empty.');
  }
  const detected = detectUpload(req.file.buffer);
  return {
    buffer: req.file.buffer,
    contentType: detected.contentType,
    extension: detected.extension,
  };
}

export function sendDownload(
  res: Response,
  buffer: Buffer,
  contentType: string,
  filename: string,
): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename.replace(/[^A-Za-z0-9_.-]/g, '_')}"`,
  );
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', String(buffer.length));
  res.send(buffer);
}
