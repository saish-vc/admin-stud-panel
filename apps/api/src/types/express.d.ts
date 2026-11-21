import type { Logger } from 'pino';
import type { Principal } from '../auth/types.js';

declare global {
  namespace Express {
    interface Request {
      auth?: Principal;
      log?: Logger;
    }
  }
}

export {};
