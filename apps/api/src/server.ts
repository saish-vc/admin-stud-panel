import { loadConfig } from './config.js';
import { createDb, createPool } from './db/client.js';
import { createApp } from './app.js';
import { createLogger } from './middleware/logging.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const pool = createPool(config.databaseUrl);
  const db = createDb(pool);
  const app = createApp({ db, config, logger });

  pool.on('error', (error) => {
    logger.error({ err: error }, 'database_pool_error');
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'nttf_certificate_portal_api_started');
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown_started');
    server.close(() => {
      void pool.end().finally(() => {
        logger.info('shutdown_complete');
        process.exit(0);
      });
    });
    setTimeout(() => {
      logger.error('shutdown_forced');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('Failed to start NTTF API', error);
  process.exit(1);
});
