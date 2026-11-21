# NTTF Student Certificate Portal

A documentation-first, test-first portal for Nettur Technical Training Foundation. Students request **Bona Fide**, **Leaving (LC)**, and **Diploma** certificates; a clerk verifies supporting documents; an HOD or super administrator approves or rejects; the portal issues a QR-bearing PDF and exposes a minimal public verification result. Every transition is written to an append-only audit log.

## Stack

| Layer    | Choice                                                                   |
| -------- | ------------------------------------------------------------------------ |
| Web      | React 19, Vite, TypeScript, Tailwind, shadcn/ui-style primitives         |
| API      | Node.js 22, Express 5, TypeScript, Zod                                   |
| Database | PostgreSQL 16 with Drizzle ORM and committed SQL migrations              |
| Auth     | Short-lived JWT access token, rotating refresh cookie, role checks in DB |
| PDF      | `pdfkit` + `qrcode`                                                      |
| Storage  | Private local disk in development, S3-compatible object storage in prod  |
| Tests    | Vitest, Testing Library, Supertest, Playwright, axe-core, k6             |
| CI       | GitHub Actions with blocking quality, accessibility, and load gates      |

## Repository layout

```text
apps/api/                 Express API, Drizzle schema and migrations, seed scripts
apps/web/                 React SPA (student, admin, public verification)
deploy/                   Production Dockerfiles and nginx configuration
e2e/                      Playwright journeys, axe checks, k6 load profile
docs/                     Specification, architecture, API contract, security, runbook
docs/adr/                 Architecture decision records
.github/workflows/ci.yml  Blocking quality gates
```

## Quick start

Prerequisites: Node.js 22+ (24 also supported), npm 11+, and Docker Desktop for the local PostgreSQL 16 container.

```bash
cp .env.example .env
# Set JWT_SECRET, JWT_REFRESH_SECRET, and SEED_ADMIN_PASSWORD to strong local values.
npm ci
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:5173>, the API liveness probe at <http://localhost:4000/health/liveness>, and Swagger UI at <http://localhost:4000/api/docs>.

The default seed creates at least 1,000 students plus three staff accounts:

| Role        | Login                   | Password                          |
| ----------- | ----------------------- | --------------------------------- |
| Clerk       | `clerk@nttf.ac.in`      | `SEED_ADMIN_PASSWORD` from `.env` |
| HOD         | `hod@nttf.ac.in`        | `SEED_ADMIN_PASSWORD` from `.env` |
| Super Admin | `superadmin@nttf.ac.in` | `SEED_ADMIN_PASSWORD` from `.env` |

The seed prints a sample student roll number. Student passwords are their date of birth as `DDMMYYYY`; every seeded credential must be changed on first login. See [`docs/RUNBOOK.md`](docs/RUNBOOK.md) for environment variables, database lifecycle, and demo accounts.

## Production deployment

The repository ships multi-stage API and web images, an nginx SPA/proxy configuration, and a production Compose stack with a one-shot migration job. PostgreSQL runs behind the stack, and storage is either a private S3-compatible bucket or the mounted local volume.

```bash
cp .env.production.example .env   # generate JWT secrets and set PUBLIC_ORIGIN/DATABASE_URL
npm run deploy:up                 # build images, migrate, start api + nginx on :8080
docker compose -f docker-compose.prod.yml --profile seed run --rm seed   # demo data only
```

Health: `GET /health/liveness` (process), `GET /health/readiness` (PostgreSQL), `GET /healthz` (nginx). The full release, TLS, backup, rollback, and seeding procedure is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Roles and workflow

```text
Student submits ──> SUBMITTED
CLERK/SUPER_ADMIN verifies documents ──> UNDER_VERIFICATION
HOD/SUPER_ADMIN approves ──> APPROVED ──> PDF + QR stored ──> READY
SUBMITTED | UNDER_VERIFICATION ──> HOD rejects (remarks required) ──> REJECTED
REJECTED ──> owning student edits and resubmits ──> SUBMITTED
```

- Only a clerk or super administrator verifies documents.
- Only an HOD or super administrator approves or rejects.
- Approval and issuance are separate audited transitions. If PDF generation fails after three retries the request stays `APPROVED`, a `GENERATION_FAILED` audit row is written, and staff can retry.
- A public QR link returns only holder name, roll number, programme, certificate type, number, and issue date. Unknown codes return a generic 404.

## Documentation

| Document                                                           | Purpose                                               |
| ------------------------------------------------------------------ | ----------------------------------------------------- |
| [`docs/SPEC.md`](docs/SPEC.md)                                     | Functional and non-functional requirements            |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                     | Components, data flow, deployment, and testing design |
| [`docs/API.md`](docs/API.md)                                       | Human-readable API contract                           |
| [`docs/openapi.yaml`](docs/openapi.yaml)                           | OpenAPI 3.0.3 contract used by Swagger UI             |
| [`docs/SECURITY.md`](docs/SECURITY.md)                             | Threat model, OWASP API controls, and sign-off        |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md)                               | Setup, operations, incidents, and release checklist   |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)                         | Containers, migrations, TLS, backups, rollback        |
| [`docs/architecture-diagram.html`](docs/architecture-diagram.html) | Interactive Archify architecture diagram              |
| [`docs/adr/`](docs/adr/)                                           | Dated architecture decision records                   |

## Quality gates

```bash
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm run test:integration
npm run test:security
npm run test:coverage
npx playwright install chromium
npm run test:e2e          # journey + axe WCAG 2.2 AA checks
npm run test:perf         # requires k6 and a running, seeded API
npm run docker:build      # production API and web images
```

Coverage thresholds are enforced at 80% lines/statements/functions globally and 90% for `apps/api/src/auth/**` and `apps/api/src/services/**`. The Playwright suite covers the full student → clerk → HOD → PDF → public verification journey. The k6 profile runs 50 student and 10 admin virtual users and fails on P95 ≥ 500 ms or an error rate ≥ 1%.

GitHub Actions runs the same gates in `.github/workflows/ci.yml` against a PostgreSQL 16 service:

- `quality`: lint, typecheck, production build, unit + integration + security coverage, documentation presence, and security sign-off checks.
- `e2e`: Playwright Chromium plus axe accessibility checks, with ephemeral secrets.
- `containers`: builds both production images and validates `docker-compose.prod.yml`.
- `performance`: a seeded API and a bounded k6 load profile with threshold enforcement.

Configure branch protection so these jobs are required before merging to `main`. CI never uses committed secrets; JWT secrets and the E2E admin password are generated per run.

## Security highlights

- Passwords use bcrypt cost 12 in production; access JWTs last 15 minutes; refresh tokens rotate and are stored hashed.
- Uploads are limited to PDF/JPEG/PNG, 5 MB, validated by magic bytes, stored under randomized private keys, and served only through authenticated endpoints.
- Role and account status are read from PostgreSQL on every authenticated request; tokens alone never authorize.
- Audit rows are append-only via a PostgreSQL trigger; no application endpoint mutates or deletes them.
- Public verification exposes only the minimum certificate fields and is rate limited.
- Configuration is validated at startup; production refuses weak or missing secrets.

## Scope

v1 deliberately excludes e-mail/SMS delivery, payments, native mobile apps, bulk issuance, SSO, and HSM/PKI signatures. The QR code verifies the record through this portal; it is not an offline cryptographic signature. See `docs/SPEC.md` for the complete in-scope and out-of-scope lists.
