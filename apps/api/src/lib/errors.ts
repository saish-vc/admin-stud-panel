import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
  }
}

export const errors = {
  badRequest: (message = 'The request is invalid.', details?: unknown) =>
    new AppError(400, 'VALIDATION_ERROR', message, details),
  unauthorized: (message = 'Authentication is required.', code = 'AUTH_REQUIRED') =>
    new AppError(401, code, message),
  forbidden: (message = 'You do not have permission to perform this action.') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (message = 'The requested resource was not found.') =>
    new AppError(404, 'NOT_FOUND', message),
  conflict: (message: string, code = 'CONFLICT') => new AppError(409, code, message),
  tooLarge: (message = 'The uploaded file is too large.') =>
    new AppError(413, 'FILE_TOO_LARGE', message),
  unsupportedMedia: (message = 'Only PDF, JPG, and PNG files are accepted.') =>
    new AppError(415, 'UNSUPPORTED_FILE_TYPE', message),
  rateLimited: (message = 'Too many requests. Please try again later.') =>
    new AppError(429, 'RATE_LIMITED', message),
  internal: (message = 'An unexpected error occurred.') =>
    new AppError(500, 'INTERNAL_ERROR', message),
};

export function parseOrThrow<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw errors.badRequest(
      'One or more fields are invalid.',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = res.locals.requestId as string | undefined;

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
        requestId,
      },
    });
    return;
  }

  // Express body-parser errors are client errors, not internal failures.
  if (error && typeof error === 'object' && 'type' in error) {
    const bodyError = error as { type?: string; status?: number };
    if (bodyError.type === 'entity.parse.failed') {
      res.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message: 'The request body is not valid JSON.',
          requestId,
        },
      });
      return;
    }
    if (bodyError.type === 'entity.too.large') {
      res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'The request body is too large.',
          requestId,
        },
      });
      return;
    }
  }

  // multer/file-size errors are normalised at the upload boundary; anything here is unexpected.
  req.log?.error({ err: error, requestId }, 'unhandled_request_error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId,
    },
  });
}
