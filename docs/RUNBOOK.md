# Runbook

Last updated: 21 November 2026  
Audience: Developers, release engineers, on-call operators

## 1. Prerequisites

- Node.js **22+** (Node 24 is also supported; CI uses 22)
- npm 11+
- Docker Desktop with Compose (local PostgreSQL 16)
- Playwright Chromium (`npx playwright install chromium`) for E2E
- Optional: k6 for load tests (or Docker image `grafana/k6`)
- Optional: `psql` client for inspection

## 2. First-time local setup

```bash
git clone <repository-url> nttf-certificate-portal
cd nttf-certificate-portal
cp .env.example .env
# Replace JWT_SECRET, JWT_REFRESH_SECRET, SEED_ADMIN_PASSWORD etc. with strong local values.
npm ci
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Open:

- Student/admin web: <http://localhost:5173>
- API liveness: <http://localhost:4000/health/liveness>
- Swagger UI: <http://localhost:4000/api/docs>

### Local ports

| Service             | Port |
| ------------------- | ---- |
| PostgreSQL (Docker) | 5433 |
| API                 | 4000 |
| Vite                | 5173 |

PostgreSQL uses port 5433 to avoid clashing with an existing local installation. Change `docker-compose.yml` and `DATABASE_URL` together if needed.

## 3. Environment variables

All configuration is validated at process start. Missing required values or production secrets shorter than 32 characters stop the API.

| Name                         | Required     | Purpose                                                         |
| ---------------------------- | ------------ | --------------------------------------------------------------- |
| `NODE_ENV`                   | yes          | `development`, `test`, `production`.                            |
| `PORT`                       | no (4000)    | API port.                                                       |
| `DATABASE_URL`               | yes          | PostgreSQL connection string.                                   |
| `JWT_SECRET`                 | yes          | Access token secret, 32+ characters.                            |
| `JWT_REFRESH_SECRET`         | yes          | Refresh token secret, different from access secret.             |
| `ACCESS_TOKEN_TTL`           | no (15m)     | JWT duration.                                                   |
| `REFRESH_TOKEN_TTL_DAYS`     | no (7)       | Refresh lifetime.                                               |
| `WEB_ORIGIN`                 | yes          | Comma-separated CORS/app origins.                               |
| `PUBLIC_APP_URL`             | yes          | Base URL placed in QR codes.                                    |
| `STORAGE_DRIVER`             | no (`local`) | `local` or `s3`.                                                |
| `STORAGE_LOCAL_DIR`          | local        | Private directory outside web root.                             |
| `S3_*`                       | when s3      | Endpoint, region, bucket, access key, secret, force-path-style. |
| `BCRYPT_COST`                | no (12)      | Password cost. Do not lower in production.                      |
| `RATE_LIMIT_AUTH_MAX`        | no (5)       | Auth attempts/min/IP.                                           |
| `ENABLE_DOCS`                | no           | `true` development; production defaults false.                  |
| `SEED_ADMIN_PASSWORD`        | seed         | Initial password for seeded staff. 12+ characters.              |
| `SEED_FORCE_PASSWORD_CHANGE` | no (`true`)  | Force seeded users to change password.                          |
| `SEED_STUDENT_COUNT`         | no (1000)    | Number of students to generate. Minimum 1000.                   |
| `LOG_LEVEL`                  | no (`info`)  | pino log level.                                                 |

Generate local secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run twice and use different values for access and refresh.

## 4. Database lifecycle

```bash
npm run db:up                 # start PostgreSQL 16 + create nttf_portal_test
npm run db:generate           # generate Drizzle migration after schema changes
npm run db:migrate            # apply committed migrations
npm run db:seed               # generate 1,000+ students and staff; safe to re-run
npm run db:seed:e2e           # deterministic E2E fixture (test database only)
npm run db:down               # stop local database
docker compose down -v        # destructive: remove local database volumes
```

The seed is transactional per insertion chunk and pre-checks roll numbers in memory. It exits non-zero if configured administrators are inconsistent or fewer than 1,000 students would be inserted. Seeded staff accounts are printed once to the console without password hashes. **Change seed passwords before any shared environment.**

### Reset local database

```bash
docker compose down -v
docker compose up -d db
npm run db:migrate
npm run db:seed
```

## 5. Demo accounts

With default local seed values:

| Role           | Login                       | Password                          |
| -------------- | --------------------------- | --------------------------------- |
| Clerk          | `clerk@nttf.ac.in`          | `SEED_ADMIN_PASSWORD` from `.env` |
| HOD            | `hod@nttf.ac.in`            | `SEED_ADMIN_PASSWORD` from `.env` |
| Super Admin    | `superadmin@nttf.ac.in`     | `SEED_ADMIN_PASSWORD` from `.env` |
| Sample student | printed by seed (`NTTF...`) | DOB as `DDMMYYYY`                 |

The seed prints sample student roll numbers/passwords to stdout. Every seeded credential must be changed on first login when `SEED_FORCE_PASSWORD_CHANGE=true`.

## 6. Tests and quality gates

```bash
npm run lint
npm run typecheck
npm run build
npm run test:unit
docker compose up -d db
npm run test:integration
npm run test:coverage
npm run test:security
npx playwright install chromium
npm run prepare:e2e
npm run test:e2e
npm run test:perf   # requires API running and seeded database
```

### CI pipeline

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) enforces the same gates on every push and pull request:

| Job           | What it proves                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`     | Lint and formatting, typecheck, production build, 80%/90% coverage thresholds over unit + integration + security suites, docs and sign-off gates. |
| `e2e`         | Playwright Chromium journey and axe WCAG 2.2 AA checks, with ephemeral secrets and a deterministic test database.                                 |
| `performance` | Seeded API plus the k6 profile at 50 student / 10 admin VUs; fails on P95 ≥ 500 ms or error rate ≥ 1%.                                            |

All jobs use a PostgreSQL 16 service container and test databases ending in `_test`. CI generates `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `E2E_ADMIN_PASSWORD` per run; no repository secret is required. Coverage, Playwright, and k6 reports are uploaded as artifacts. Mark all three jobs as required status checks in branch protection for `main`. The workflow does not deploy; release steps remain in §8.

### Database for integration tests

Integration tests use `TEST_DATABASE_URL` (defaults are intentionally local in `apps/api/tests/setup.integration.ts`). They apply migrations once, then open a pool client per test, `BEGIN` a transaction, inject the transaction-bound Drizzle client into the app, and `ROLLBACK` in `afterEach`. No test data persists.

To create the test database manually:

```bash
docker compose exec db psql -U nttf -d postgres -c 'CREATE DATABASE nttf_portal_test;'
```

The Compose init script already creates it on first volume initialisation.

### E2E

`npm run prepare:e2e` migrates the test/e2e database and loads deterministic students and staff. Playwright starts the API and Vite automatically. The fixture should never be run against production; it requires `NODE_ENV=test`.

Seeded E2E accounts are documented in `apps/api/scripts/seed-e2e.ts`. The E2E suite validates student submission → clerk verification → HOD approval → PDF visibility → public QR verification and runs axe-core checks.

### Load testing

```bash
# terminal 1
npm run dev:api

# terminal 2
k6 run e2e/performance/load-test.js
# or
docker run --rm -i -e BASE_URL=http://host.docker.internal:4000 grafana/k6 run - < e2e/performance/load-test.js
```

Each k6 virtual user logs in once per role and then reads authenticated endpoints: students call profile and request history; admins call stats and the queue. Thresholds fail the run if P95 ≥ 500 ms, error rate ≥ 1%, or a login failure occurs. Use a seeded database and raise `RATE_LIMIT_AUTH_MAX` when running the full 50 + 10 profile from one IP.

| Variable           | Default                 | Purpose                       |
| ------------------ | ----------------------- | ----------------------------- |
| `BASE_URL`         | `http://127.0.0.1:4000` | API under test.               |
| `K6_DURATION`      | `30s`                   | Per-scenario duration.        |
| `STUDENT_VUS`      | `50`                    | Student virtual users.        |
| `ADMIN_VUS`        | `10`                    | Admin virtual users.          |
| `STUDENT_ROLL`     | `NTTF2026001`           | E2E fixture student.          |
| `STUDENT_PASSWORD` | `Student@E2E2026`       | E2E fixture student password. |
| `ADMIN_EMAIL`      | `clerk@nttf.ac.in`      | E2E fixture clerk.            |
| `ADMIN_PASSWORD`   | `NttfE2E!2026`          | E2E fixture staff password.   |

CI runs the profile in the pinned `grafana/k6:0.57.0` container with `--network host` and exports `perf-summary.json` as an artifact.

## 7. PDF and storage

- `STORAGE_DRIVER=local`: files are written beneath `STORAGE_LOCAL_DIR` (default `storage/`) with UUID names. Ensure this path is outside any static root and durable on the host.
- `STORAGE_DRIVER=s3`: set all `S3_*` settings. Buckets must be private. The API streams objects after authorization; it does not hand out public object URLs.
- Issued PDFs contain a QR code pointing to `${PUBLIC_APP_URL}/verify/<code>`.
- If generation fails, the request remains `APPROVED`, `GENERATION_FAILED` is audited, and an HOD/SUPER_ADMIN can click **Generate certificate** in the admin request detail.

## 8. Production deployment

1. Provision PostgreSQL 16 with backups, TLS, and least-privileged app/migration users.
2. Provision a private S3-compatible bucket and scoped credentials (or plan the local volume backup).
3. Configure `deploy/` values from `.env.production.example` in the platform secret manager. Do not commit `.env`.
4. Build immutable images from `deploy/api.Dockerfile` and `deploy/web.Dockerfile` in CI (`containers` job).
5. Start the stack with `npm run deploy:up`. The `migrate` service applies committed Drizzle SQL and must exit 0 before the API starts.
6. Deploy `apps/web/dist` via the bundled nginx image (`deploy/nginx.conf` supplies SPA fallback, CSP, gzip, and `/api` + `/health` proxying). Terminate TLS at the load balancer or extend nginx.
7. Set `NODE_ENV=production`, `ENABLE_DOCS=false`, `WEB_ORIGIN=https://portal.example.org`, and `PUBLIC_APP_URL=https://portal.example.org`; production rejects placeholder or short secrets.
8. Verify `/health/liveness`, `/health/readiness`, and `/healthz`, then run the production smoke checklist below.
9. Seed staff only through the controlled seed procedure or a separate admin-provisioning run. Never use E2E fixtures in production. Remove `SEED_ADMIN_PASSWORD` afterwards.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full compose, storage, TLS, backup, rollback, and scaling guidance.

### Docker

```bash
cp .env.production.example .env       # generate secrets, set DATABASE_URL/PUBLIC_ORIGIN
npm run deploy:up                    # builds both images, migrates, starts db + api + web
docker compose -f docker-compose.prod.yml --profile seed run --rm seed   # demo data only
npm run deploy:logs
```

Rollback by redeploying the previous `IMAGE_TAG`; migrations are forward-only, so take a database backup before each release.

The container runs the API and expects the web bundle to be served by a CDN/Nginx. S3 storage is recommended; if local storage is used, mount a durable volume at `/app/storage`.

## 9. Operational checks

| Check                     | Command                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| API process alive         | `curl -f http://localhost:4000/health/liveness`                                                                        |
| DB connectivity           | `curl -f http://localhost:4000/health/readiness`                                                                       |
| Migrations current        | `npm run db:migrate` (idempotent)                                                                                      |
| Certificate failure count | query `audit_logs` by `action='GENERATION_FAILED'` and alert                                                           |
| Queue age                 | `GET /api/admin/stats` or SQL by status                                                                                |
| Audit integrity trigger   | attempt `UPDATE audit_logs ...` as app role; expect `audit_logs is append-only`                                        |
| Rotate JWT secrets        | deploy new secrets; existing access tokens expire in ≤15 min; refresh sessions become invalid and users reauthenticate |
| Revoke one staff session  | `UPDATE auth_sessions SET revoked_at = now() WHERE admin_id = ...`                                                     |

## 10. Incident response

1. **Suspected credential compromise:** deactivate the admin (`admin_users.is_active=false`), revoke all their sessions, rotate JWT secrets if token forgery is suspected, preserve logs and audit rows.
2. **Leaked document or certificate:** determine object key from `certificates`/`certificate_requests`, remove from storage according to legal-hold policy, preserve audit trail and incident ticket. API has no delete endpoint by design.
3. **Audit trigger disabled or rows altered:** treat as a high-severity integrity incident. Restore from trusted backup, compare audit counts/checksums, involve DB administrators.
4. **PDF generation failures:** inspect application logs for `certificate_generation_failed`; verify storage credentials/endpoint and disk capacity; retry through the admin endpoint. The request stays `APPROVED`; no duplicate is issued because certificate uniqueness is enforced per request.
5. **Rate-limit or availability incident:** scale API replicas/DB pool within limits, inspect slow queries, confirm queue indexes, use edge rate limiting.

## 11. Reproducibility checklist for a release

- [ ] Clean clone, `npm ci`.
- [ ] `.env.example` matches required config; no secrets committed.
- [ ] PostgreSQL 16 up; migrations applied.
- [ ] Seed produces ≥1,000 students and required staff.
- [ ] Lint, typecheck, build, coverage, security, E2E, axe, and k6 gates pass locally or in CI.
- [ ] The `quality`, `e2e`, and `performance` CI jobs are green and required in branch protection.
- [ ] `README.md`, `docs/SPEC.md`, `ARCHITECTURE.md`, `API.md`, `SECURITY.md`, `RUNBOOK.md`, `openapi.yaml`, the Archify JSON source, and the architecture diagram are updated.
- [ ] Backup and restore verified within the last release cycle.
- [ ] Production smoke: login, forced change, submit, verify, approve, download, public verify.
