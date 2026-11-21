import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AppError, errorMiddleware } from '../../src/lib/errors.js';

function responseDouble() {
  const json = vi.fn();
  const status = vi.fn();
  const response = {
    locals: { requestId: 'req-test-1' },
    status: vi.fn((code: number) => {
      status(code);
      return response;
    }),
    json: vi.fn((body: unknown) => {
      json(body);
      return response;
    }),
  };
  return { response, status, json };
}

function run(error: unknown, reqLog = vi.fn()) {
  const { response, status, json } = responseDouble();
  const req = { log: { error: reqLog } } as unknown as Request;
  errorMiddleware(error, req, response as unknown as Response, vi.fn() as NextFunction);
  return { status, json, reqLog };
}

describe('error middleware', () => {
  it('serialises exposed application errors with a request ID', () => {
    const { status, json, reqLog } = run(
      new AppError(409, 'INVALID_STATE_TRANSITION', 'Only approved requests can be issued.', {
        from: 'SUBMITTED',
      }),
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INVALID_STATE_TRANSITION',
        message: 'Only approved requests can be issued.',
        details: { from: 'SUBMITTED' },
        requestId: 'req-test-1',
      },
    });
    expect(reqLog).not.toHaveBeenCalled();
  });

  it('omits details when none were supplied', () => {
    const { json } = run(new AppError(404, 'NOT_FOUND', 'Missing.'));
    expect(json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Missing.', requestId: 'req-test-1' },
    });
  });

  it('maps malformed JSON bodies to INVALID_JSON', () => {
    const { status, json } = run({ type: 'entity.parse.failed', status: 400 });
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INVALID_JSON',
        message: 'The request body is not valid JSON.',
        requestId: 'req-test-1',
      },
    });
  });

  it('maps oversized bodies to PAYLOAD_TOO_LARGE', () => {
    const { status, json } = run({ type: 'entity.too.large', status: 413 });
    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The request body is too large.',
        requestId: 'req-test-1',
      },
    });
  });

  it('hides unexpected errors, logs them, and never leaks a stack', () => {
    const reqLog = vi.fn();
    const { status, json } = run(new Error('database password is hunter2'), reqLog);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId: 'req-test-1',
      },
    });
    expect(JSON.stringify(json.mock.calls[0]?.[0])).not.toMatch(/hunter2|stack/i);
    expect(reqLog).toHaveBeenCalledTimes(1);
  });
});
