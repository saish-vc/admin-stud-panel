import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw/server';

// jsdom has no fetch of its own, so the Node implementation never resolves the
// relative URLs the app sends. Anchor them to the page origin before MSW wraps
// fetch, keeping handlers origin-agnostic.
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === 'string' && input.startsWith('/')) {
    return nativeFetch(new URL(input, window.location.origin), init);
  }
  return nativeFetch(input, init);
}) as typeof fetch;

Object.defineProperty(window, 'scrollTo', { value: () => {}, writable: true });

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
