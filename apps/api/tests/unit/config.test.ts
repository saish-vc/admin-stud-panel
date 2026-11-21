import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

const ACCESS_SECRET = 'config-access-secret-0123456789abcdefgh';
const REFRESH_SECRET = 'config-refresh-secret-0123456789abcdefgh';

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://nttf:secret@localhost:5433/nttf_portal',
    JWT_SECRET: ACCESS_SECRET,
    JWT_REFRESH_SECRET: REFRESH_SECRET,
    ...overrides,
  };
}

describe('configuration', () => {
  it('applies safe defaults', () => {
    const config = loadConfig(env());
    expect(config.nodeEnv).toBe('development');
    expect(config.port).toBe(4000);
    expect(config.webOrigins).toEqual(['http://localhost:5173']);
    expect(config.cookie).toEqual({
      name: 'nttf_refresh',
      secure: false,
      refreshPath: '/api/auth',
    });
    expect(config.storage.driver).toBe('local');
    expect(config.seed.studentCount).toBe(1000);
    expect(config.enableDocs).toBe(false);
    expect(config.bcryptCost).toBe(12);
  });

  it('parses multiple origins and boolean strings', () => {
    const config = loadConfig(
      env({
        WEB_ORIGIN: 'https://portal.nttf.ac.in, https://admin.nttf.ac.in',
        ENABLE_DOCS: 'true',
        NODE_ENV: 'production',
        PUBLIC_APP_URL: 'https://portal.nttf.ac.in/',
      }),
    );
    expect(config.webOrigins).toEqual(['https://portal.nttf.ac.in', 'https://admin.nttf.ac.in']);
    expect(config.enableDocs).toBe(true);
    expect(config.publicAppUrl).toBe('https://portal.nttf.ac.in');
    expect(config.cookie.secure).toBe(true);
  });

  it('fails closed when required secrets or the database are missing', () => {
    expect(() => loadConfig(env({ DATABASE_URL: undefined }))).toThrow(
      'Invalid environment configuration',
    );
    expect(() => loadConfig(env({ JWT_SECRET: 'too-short' }))).toThrow('JWT_SECRET');
  });

  it('requires access and refresh secrets to differ', () => {
    expect(() => loadConfig(env({ JWT_REFRESH_SECRET: ACCESS_SECRET }))).toThrow(
      'JWT_SECRET and JWT_REFRESH_SECRET must be different',
    );
  });

  it('rejects wildcard and malformed web origins', () => {
    expect(() => loadConfig(env({ WEB_ORIGIN: '*' }))).toThrow('wildcard');
    expect(() => loadConfig(env({ WEB_ORIGIN: 'not a url' }))).toThrow('invalid URL');
  });

  it('enforces production password cost', () => {
    expect(() => loadConfig(env({ NODE_ENV: 'production', BCRYPT_COST: '10' }))).toThrow(
      'BCRYPT_COST must be at least 12 in production',
    );
  });

  it('requires complete S3 credentials when the S3 driver is selected', () => {
    expect(() => loadConfig(env({ STORAGE_DRIVER: 's3' }))).toThrow(
      'S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required',
    );

    const config = loadConfig(
      env({
        STORAGE_DRIVER: 's3',
        S3_REGION: 'ap-south-1',
        S3_BUCKET: 'nttf-certificates',
        S3_ACCESS_KEY_ID: 'access',
        S3_SECRET_ACCESS_KEY: 'secret',
        S3_FORCE_PATH_STYLE: 'true',
      }),
    );
    expect(config.storage.s3).toEqual({
      endpoint: undefined,
      region: 'ap-south-1',
      bucket: 'nttf-certificates',
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      forcePathStyle: true,
    });
  });

  it('bounds numeric and duration settings', () => {
    expect(() => loadConfig(env({ SEED_STUDENT_COUNT: '999' }))).toThrow();
    expect(() => loadConfig(env({ REFRESH_TOKEN_TTL_DAYS: '31' }))).toThrow();
    expect(() => loadConfig(env({ ACCESS_TOKEN_TTL: '15 minutes' }))).toThrow();
    expect(() => loadConfig(env({ PORT: '70000' }))).toThrow();
  });

  it('allows an explicit OpenAPI path', () => {
    const config = loadConfig(env({ OPENAPI_PATH: '/srv/nttf/openapi.yaml' }));
    expect(config.openApiPath).toBe('/srv/nttf/openapi.yaml');
  });
});
