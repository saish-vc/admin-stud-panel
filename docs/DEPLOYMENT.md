# Deployment

The portal ships as two containers plus PostgreSQL 16 and private object/file storage:

```text
browser ──> web (nginx :8080) ──> api (Node 22 :4000) ──> PostgreSQL 16
                  │                      └──> S3 bucket or named local volume
                  └── SPA fallback, CSP/security headers, gzip, /api and /health proxy
```

| Artifact                  | Purpose                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `deploy/api.Dockerfile`   | Multi-stage Node 22 image; bundles `dist/server.js`, `dist/migrate.js`, `dist/seed.js`; runs as the unprivileged `node` user |
| `deploy/web.Dockerfile`   | Builds the Vite SPA, serves it from `nginx:1.27-alpine`                                                                      |
| `deploy/nginx.conf`       | SPA fallback, immutable asset caching, security headers, API proxy                                                           |
| `docker-compose.prod.yml` | Database, one-shot migrations, API, web, optional seed profile                                                               |
| `.env.production.example` | Required values and generation hints                                                                                         |

## 1. Configure

```bash
cp .env.production.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # JWT_REFRESH_SECRET
```

Set, at minimum:

- `POSTGRES_PASSWORD` and a matching `DATABASE_URL`.
- Two different `JWT_SECRET` / `JWT_REFRESH_SECRET` values of 32+ characters. Production refuses placeholder or equal secrets at startup.
- `PUBLIC_ORIGIN` — the exact HTTPS origin users open. It becomes `WEB_ORIGIN` and the base of QR verification links. Cookies are `Secure` in production, so TLS is required.
- `IMAGE_TAG` for traceable releases, and `HTTP_PORT` if 8080 is taken.

Compose fails fast when `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PUBLIC_ORIGIN`, or `POSTGRES_PASSWORD` are missing.

## 2. Deploy and migrate

```bash
npm run deploy:up          # docker compose -f docker-compose.prod.yml up -d --build
```

The `migrate` service applies committed Drizzle SQL as a one-shot release task; the API starts only after it exits successfully and PostgreSQL is healthy. Upgrades repeat the same command: build the new tag, let migrations run, then the new API replaces the old one.

Verify:

```bash
curl -fsS http://localhost:8080/health/liveness
curl -fsS http://127.0.0.1:8080/health/readiness
curl -fsSI http://localhost:8080/ | grep -E 'content-security-policy|strict-transport'
docker compose -f docker-compose.prod.yml logs --tail=100 migrate api
```

Open `http://localhost:8080`; the SPA must render and unknown verification codes must return the generic 404.

## 3. Seed staff and demo students (optional)

The seed script refuses production unless explicitly enabled. It is only for demo/initial provisioning:

```bash
# .env: SEED_ADMIN_PASSWORD=<12+ chars> and optionally SEED_STUDENT_COUNT
docker compose -f docker-compose.prod.yml --profile seed run --rm seed
```

It creates `clerk@nttf.ac.in`, `hod@nttf.ac.in`, and `superadmin@nttf.ac.in` with `mustChangePassword` enforced, plus demo students. Remove `SEED_ADMIN_PASSWORD` from the environment after the first run and rotate the staff password through the app.

## 4. Storage

- **Local (default):** certificates and uploads live in the `nttf_storage` named volume (`/data/storage`). Back it up with the database; do not bind-mount a world-readable directory.
- **S3-compatible (recommended for multi-host):** set `STORAGE_DRIVER=s3` plus `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and optionally `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE=true`. Keep the bucket private; uploads are encrypted with SSE-S3 and served only through authenticated API routes. Enabling S3 does not migrate existing local files.

## 5. TLS and reverse proxies

Nginx listens on plain HTTP `:8080` and is designed to sit behind a TLS-terminating load balancer (or an ingress that adds certificates). Requirements:

- Forward the client IP (`X-Forwarded-For` is already appended) so auth rate limiting still works; Express `trust proxy` is enabled in production.
- Set `PUBLIC_ORIGIN=https://<host>` so refresh cookies and QR links use HTTPS.
- HSTS is intentionally left to the TLS terminator so HTTP-only previews do not pin browsers.

If nginx terminates TLS itself, add a `listen 443 ssl` server block, mount certificates, redirect `:8080` to HTTPS, and then add the `Strict-Transport-Security` header.

## 6. Operations

| Task               | Command / action                                                                   |
| ------------------ | ---------------------------------------------------------------------------------- |
| Logs               | `npm run deploy:logs` (JSON logs via pino; secrets are redacted)                   |
| Restart API        | `docker compose -f docker-compose.prod.yml restart api`                            |
| Apply new release  | `IMAGE_TAG=<new> npm run deploy:up`                                                |
| Roll back          | redeploy the previous `IMAGE_TAG`; migrations are forward-only                     |
| Database backup    | `docker compose -f docker-compose.prod.yml exec -T db pg_dump -U nttf nttf_portal` |
| Storage backup     | S3 versioning/replication, or snapshot the `nttf_storage` volume                   |
| Readiness probe    | `GET /health/readiness` (checks PostgreSQL)                                        |
| API liveness probe | `GET /health/liveness`                                                             |
| Web liveness probe | `GET /healthz`                                                                     |

Scale the API only with an external rate-limit store; the default limiter is per-process in memory.

## 7. Security posture in the images

- API image runs as `node`, not root; only `node_modules`, the compiled bundles, migrations, and `docs/openapi.yaml` are copied.
- Web image serves no source maps (`VITE_SOURCEMAP=true` is required to opt in) and sends CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Permissions-Policy` on every document.
- `ENABLE_DOCS=false` is forced in the production compose; Swagger UI is a development convenience.
- Secrets are supplied as environment variables at runtime and never baked into images (`.dockerignore` excludes every `.env*` except the templates).
- CI builds both images and validates the compose file in the `containers` job.
