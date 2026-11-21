import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Worker processes may start from the repository root or apps/api.
loadDotenv({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true,
});

const booleanString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .or(z.boolean());

// Compose files and secret managers often inject unset optional values as empty
// strings; treat those as absent instead of failing URL/enum validation.
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalUrlString = z.preprocess(emptyToUndefined, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z
    .string()
    .regex(/^\d+[smhd]$/)
    .default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),
  ENABLE_DOCS: booleanString.default(false),
  OPENAPI_PATH: optionalString,
  BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).max(1000).default(5),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(60).default(1),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(20 * 1024 * 1024)
    .default(5 * 1024 * 1024),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_ENDPOINT: optionalUrlString,
  S3_REGION: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_FORCE_PATH_STYLE: booleanString.default(false),
  SEED_ADMIN_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(12).optional()),
  SEED_FORCE_PASSWORD_CHANGE: booleanString.default(true),
  SEED_STUDENT_COUNT: z.coerce.number().int().min(1000).max(5000).default(1000),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  logLevel: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtRefreshSecret: string;
  accessTokenTtl: string;
  refreshTokenTtlDays: number;
  webOrigins: string[];
  publicAppUrl: string;
  enableDocs: boolean;
  openApiPath: string;
  bcryptCost: number;
  authRateLimitMax: number;
  rateLimitWindowMs: number;
  maxUploadBytes: number;
  storage: {
    driver: 'local' | 's3';
    localDir: string;
    s3?: {
      endpoint?: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      forcePathStyle: boolean;
    };
  };
  cookie: {
    name: string;
    secure: boolean;
    refreshPath: string;
  };
  seed: {
    adminPassword?: string;
    forcePasswordChange: boolean;
    studentCount: number;
  };
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}

function resolveOpenApiPath(explicit: string | undefined): string {
  if (explicit) return explicit;
  const candidates = [
    resolve(process.cwd(), 'docs/openapi.yaml'),
    resolve(process.cwd(), '../../docs/openapi.yaml'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

const PLACEHOLDER_SECRET = /change[_\-\s]?me/i;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${formatIssues(parsed.error)}`);
  }
  const value = parsed.data;

  if (value.JWT_SECRET === value.JWT_REFRESH_SECRET) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different');
  }
  if (value.NODE_ENV === 'production' && value.BCRYPT_COST < 12) {
    throw new Error('BCRYPT_COST must be at least 12 in production');
  }
  if (
    value.NODE_ENV === 'production' &&
    (PLACEHOLDER_SECRET.test(value.JWT_SECRET) ||
      PLACEHOLDER_SECRET.test(value.JWT_REFRESH_SECRET) ||
      (value.SEED_ADMIN_PASSWORD ? PLACEHOLDER_SECRET.test(value.SEED_ADMIN_PASSWORD) : false))
  ) {
    throw new Error('Production secrets must not contain placeholder (CHANGE_ME) values');
  }
  if (value.NODE_ENV === 'production' && !value.ENABLE_DOCS && value.STORAGE_DRIVER === 'local') {
    // Allowed, but operatively local disk must be a durable mounted volume.
  }

  const webOrigins = value.WEB_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of webOrigins) {
    if (origin === '*') throw new Error('WEB_ORIGIN may not contain a wildcard');
    try {
      new URL(origin);
    } catch {
      throw new Error(`WEB_ORIGIN contains an invalid URL: ${origin}`);
    }
  }

  let s3: AppConfig['storage']['s3'];
  if (value.STORAGE_DRIVER === 's3') {
    if (
      !value.S3_BUCKET ||
      !value.S3_REGION ||
      !value.S3_ACCESS_KEY_ID ||
      !value.S3_SECRET_ACCESS_KEY
    ) {
      throw new Error(
        'S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required for S3 storage',
      );
    }
    s3 = {
      endpoint: value.S3_ENDPOINT,
      region: value.S3_REGION,
      bucket: value.S3_BUCKET,
      accessKeyId: value.S3_ACCESS_KEY_ID,
      secretAccessKey: value.S3_SECRET_ACCESS_KEY,
      forcePathStyle: value.S3_FORCE_PATH_STYLE,
    };
  }

  return {
    nodeEnv: value.NODE_ENV,
    isProduction: value.NODE_ENV === 'production',
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    databaseUrl: value.DATABASE_URL,
    jwtSecret: value.JWT_SECRET,
    jwtRefreshSecret: value.JWT_REFRESH_SECRET,
    accessTokenTtl: value.ACCESS_TOKEN_TTL,
    refreshTokenTtlDays: value.REFRESH_TOKEN_TTL_DAYS,
    webOrigins,
    publicAppUrl: value.PUBLIC_APP_URL.replace(/\/$/, ''),
    enableDocs: value.ENABLE_DOCS,
    openApiPath: resolveOpenApiPath(value.OPENAPI_PATH),
    bcryptCost: value.BCRYPT_COST,
    authRateLimitMax: value.RATE_LIMIT_AUTH_MAX,
    rateLimitWindowMs: value.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    maxUploadBytes: value.MAX_UPLOAD_BYTES,
    storage: {
      driver: value.STORAGE_DRIVER,
      localDir: resolve(process.cwd(), value.STORAGE_LOCAL_DIR),
      s3,
    },
    cookie: {
      name: 'nttf_refresh',
      secure: value.NODE_ENV === 'production',
      refreshPath: '/api/auth',
    },
    seed: {
      adminPassword: value.SEED_ADMIN_PASSWORD,
      forcePasswordChange: value.SEED_FORCE_PASSWORD_CHANGE,
      studentCount: value.SEED_STUDENT_COUNT,
    },
  };
}
