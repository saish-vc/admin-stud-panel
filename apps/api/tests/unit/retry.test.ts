import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '../../src/lib/retry.js';

describe('withRetry', () => {
  it('returns on the first successful attempt', async () => {
    const operation = vi.fn(async () => 'ok');
    await expect(withRetry(operation, { baseDelayMs: 0 })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures and eventually succeeds', async () => {
    let calls = 0;
    const onFailure = vi.fn();
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error(`failure ${calls}`);
        return calls;
      },
      { attempts: 3, baseDelayMs: 0, onFailure },
    );
    expect(result).toBe(3);
    expect(onFailure).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenNthCalledWith(1, expect.any(Error), 1);
  });

  it('throws the last error after exhausting every attempt', async () => {
    const operation = vi.fn(async () => {
      throw new Error('always broken');
    });
    await expect(withRetry(operation, { attempts: 3, baseDelayMs: 0 })).rejects.toThrow(
      'always broken',
    );
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry when only one attempt is configured', async () => {
    const operation = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(withRetry(operation, { attempts: 1, baseDelayMs: 0 })).rejects.toThrow('boom');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('caps the backoff delay for long retry chains', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const promise = withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error('retry');
        return 'done';
      },
      { attempts: 3, baseDelayMs: 10_000, maxDelayMs: 1 },
    );
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('done');
    vi.useRealTimers();
  });
});
