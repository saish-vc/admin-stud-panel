# Architecture Decision Records

Short, dated records for the significant decisions in this repository.

## ADR-001 — Monorepo with independently deployable web and API

**Status:** Accepted  
**Date:** 2026-11-21

Use npm workspaces: `apps/web` (React SPA) and `apps/api` (Express service). Shared root tooling hosts tests, linting, and CI. This keeps the deployables independent while giving one reproducible install and a single quality gate. It avoids premature package extraction and keeps API/UI contracts close to the tests.

## ADR-002 — Drizzle ORM

**Status:** Accepted  
**Date:** 2026-11-21

Drizzle was chosen over Prisma. The domain relies on explicit SQL constraints, an append-only trigger, row locking, and ergonomic transactions for integration-test rollback. Drizzle is SQL-first, generates committed SQL migrations, has no separate schema engine at runtime, and lets these PostgreSQL features remain visible. Trade-off: fewer high-level relation helpers, which is acceptable for this small schema.

## ADR-003 — JWT access token + rotating refresh session

**Status:** Accepted  
**Date:** 2026-11-21

Access tokens are short-lived (15 min) and held in memory by the SPA. Refresh tokens are JWTs in an `HttpOnly` cookie whose SHA-256 hash is stored in `auth_sessions`; each refresh rotates the token and hash. This keeps routine requests stateless while allowing server-side revocation, reuse detection, and session listing for incident response. Fully server-side sessions were rejected for scaling reasons; long-lived access tokens were rejected for revocation risk.

## ADR-004 — Uploaded files are private objects, not public URLs

**Status:** Accepted  
**Date:** 2026-11-21

Uploads are stored with randomized UUID keys and streamed only through authorised API endpoints. Public or guessable URLs are rejected because supporting documents contain student PII and the requirement demands storage outside the webroot. An S3 adapter uses the same authenticated streaming pattern. Trade-off: API bandwidth for document preview; acceptable at NTTF's v1 volume.

## ADR-005 — Two-step approval and in-process PDF generation

**Status:** Accepted  
**Date:** 2026-11-21

Clerk verification and HOD approval are distinct controlled transitions. Approval and issuance are separated in the data model by `APPROVED` and `READY`. PDF rendering runs synchronously after approval with three bounded exponential-backoff attempts; failure leaves a recoverable `APPROVED` request and an audited failure. A durable job queue was rejected for v1 because the scope excludes bulk generation and expected concurrency is low. If latency or volume grows, introduce an outbox/queue without changing the workflow contract.

## ADR-006 — Additive auth, certificate, and audit actor model

**Status:** Accepted  
**Date:** 2026-11-21

The mandated core tables are implemented exactly, with additive tables/columns needed to fulfil authentication and audit requirements:

- credentials separated from the academic student record;
- `auth_sessions` for refresh rotation;
- `certificates` to preserve issued-document metadata;
- student actor reference in audit rows because students create audited transitions;
- `GENERATION_FAILED` audit action for persisted retry failures.

This preserves the required schema while avoiding plaintext or duplicated secrets and allowing every required state transition to be attributable. Student immutable master data is never mixed with credentials.

## ADR-007 — Integration tests use real PostgreSQL transactions

**Status:** Accepted  
**Date:** 2026-11-21

Integration tests use PostgreSQL 16 and run each test inside a transaction that is rolled back. The app accepts an injected Drizzle database, which points at a transaction-bound pg client. This catches CHECK/trigger/FK behaviour that mocks miss, satisfies the mandated rollback isolation, and avoids destructive table truncation between tests. Tests run serially because they share migration state and a single test database.
