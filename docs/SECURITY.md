# Security

Status: v1 implementation baseline  
Last updated: 21 November 2026

## 1. Assets and threat model

| Asset                          | Confidentiality                | Integrity            | Availability |
| ------------------------------ | ------------------------------ | -------------------- | ------------ |
| Student master data            | High (PII)                     | High                 | Medium       |
| Supporting documents           | High                           | High                 | Medium       |
| Certificate PDFs               | Medium (issued documents)      | Critical             | Medium       |
| Audit logs                     | Medium                         | Critical (immutable) | High         |
| Admin credentials and sessions | Critical                       | Critical             | High         |
| Verification codes             | Low (public result is minimal) | Critical             | Medium       |

### Trust boundaries

1. Browser → reverse proxy/API: hostile input, untrusted tokens, files, query strings.
2. API → PostgreSQL: authenticated, parameterised.
3. API → object storage: privileged credentials, private bucket/directory.
4. Administrator → approval workflow: authenticated but least-privilege separation of duties.
5. Public verifier → verification endpoint: unauthenticated and privacy-limited.

### STRIDE summary

| Threat                 | Examples                                                                | Controls                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Spoofing               | Stolen/forged JWT, credential stuffing                                  | Short JWT lifetime, bcrypt cost 12, auth rate limit, DB-backed session rotation, secure cookie, active-account checks. |
| Tampering              | Editing audit history, replaying approval, modifying uploaded files     | Append-only audit trigger, state-machine checks, `FOR UPDATE` locking, magic-byte validation, randomized object keys.  |
| Repudiation            | “I never approved that”                                                 | Actor IDs, role, timestamp, IP/user-agent in session record, immutable audit rows.                                     |
| Information disclosure | IDOR to another student, public PII, excessive API fields, stack traces | Ownership checks, minimal projections, generic 404s, safe error handler, no public file routes.                        |
| Denial of service      | Login floods, 5 MB uploads, expensive PDF rendering                     | Auth rate limit, upload limit/count cap, request size cap, reverse-proxy limits, DB pool caps.                         |
| Elevation of privilege | Clerk calls approve, student calls admin API, token with forged role    | Server-side role enforcement on every route, roles read from DB, integration tests for each denial.                    |

### Out of scope and residual risk

- Malware scanning of uploads (antivirus service) is not included in v1. Files are never executed and are served as attachments with validated content types; a production deployment should add asynchronous AV scanning.
- Production secrets and database administrator separation are deployment responsibilities. A DB superuser can disable the audit trigger; production DB roles should deny normal writes to `audit_logs`.
- Refresh cookies require same-site deployment. Truly cross-site hosting must use a same-site API proxy rather than weakening `SameSite`.
- QR verification proves an issued record exists in this portal; it is not a cryptographic signature checked offline.

## 2. Authentication and session controls

- Passwords hashed with **bcrypt cost factor 12**, never logged, never returned.
- Initial student password is DOB (`DDMMYYYY`); seeded credentials set `must_change_password = true`.
- New password policy: 10+ characters, upper and lower case, digit, symbol; cannot equal current password.
- Access JWT: 15 minutes, typed `access`, issuer `nttf-portal`, audience `nttf-web`; secret ≥ 32 characters; algorithm pinned to HS256.
- Refresh JWT: 7 days, typed `refresh`, carries session ID and random JTI; only its SHA-256 hash is stored. Rotation on every refresh; reuse revokes the session. Cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production, path `/api/auth`.
- Role and active status are loaded from PostgreSQL on every authenticated request; token claims alone never authorise.
- Password change revokes all other sessions and returns a new token pair.
- Failed login responses are indistinguishable for unknown account versus bad password.
- Auth endpoints rate limited to **5 requests/minute/IP**. A successful-login-only limiter plus general IP limiter can be added at the edge; local configuration is per-process.
- Login on inactive admin or dropped student is denied.
- Logout is idempotent and clears the cookie.

## 3. Authorisation / OWASP API Security Top 10 (2023)

| #     | Category                                        | Implementation                                                                                                                                                              | Verification                                                                                                     |
| ----- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| API1  | Broken object level authorization               | Every student request/document route filters by `student_id` from token; staff routes require staff role; missing/foreign objects return 404.                               | `security.test.ts`: student A cannot read/stream B's request/document/certificate; unauthenticated document 401. |
| API2  | Broken authentication                           | bcrypt-12, login generic errors, token typing, refresh rotation, reuse revocation, forced password change, auth rate limit.                                                 | Integration auth flow + rate-limit + reuse tests.                                                                |
| API3  | Broken object property level authorization      | Zod allow-list request parsing; response mappers expose only approved fields; no mass assignment. Students cannot set status, verifiedBy, or remarks.                       | Route tests assert ignored/denied privileged fields, minimal verify payload.                                     |
| API4  | Unrestricted resource consumption               | 5 MB uploads; max 3 open requests; pagination clamps; auth limiter; JSON body cap; no public file listing; PDF generation bounded.                                          | Upload, open-limit, pagination, 429 tests; k6 load smoke.                                                        |
| API5  | Broken function level authorization             | Route-level RBAC: Clerk verify only, HOD/SUPER approve/reject; Clerk approve/reject denied.                                                                                 | Role matrix integration tests.                                                                                   |
| API6  | Unrestricted access to sensitive business flows | No public student/request listings; verification generic 404; approvals require two-stage process; no credentials exposed.                                                  | Security tests and OpenAPI review.                                                                               |
| API7  | Server-side request forgery                     | No server fetches user-supplied URLs. Uploads/PDF local or configured S3 endpoint only.                                                                                     | Code review; no URL consumer.                                                                                    |
| API8  | Security misconfiguration                       | Helmet headers, strict CORS allowlist, production secret validation, secure cookies, no stack traces, health endpoints minimal, Swagger gated off in production by default. | Middleware tests / headers check; startup config unit tests.                                                     |
| API9  | Improper inventory management                   | Versioned `/api`, explicit route modules, OpenAPI contract, docs-check CI gate, no shadow admin endpoints.                                                                  | CI docs gate and OpenAPI serving test.                                                                           |
| API10 | Unsafe consumption of APIs                      | No third-party APIs in v1; storage SDK configured with explicit endpoint/region; uploaded content treated as untrusted.                                                     | Review; adapter isolation.                                                                                       |

### Additional web controls

- React escapes all rendered data; remarks/purpose fields are not injected as HTML.
- Strict CSP via Helmet in the API; the SPA is served by the reverse proxy with a matching CSP in `deploy/nginx.conf`.
- CORS origins come from a comma-separated allowlist; credentials enabled only for those origins. Wildcard origins are rejected.
- CSRF: state-changing calls use Bearer access tokens (not cookies). Refresh cookie is `SameSite=Lax` and cannot be read cross-origin; CORS blocks unapproved origins. The refresh response is a body token, so CSRF cannot extract it.
- No sensitive values in logs. Request bodies are not logged.
- SQL access is parameterised through Drizzle; queue search escapes user input through bound parameters.
- File uploads: limit 5 MB, single file, magic-byte signature, randomized key, no original filename used in storage, content disposition attachment, `X-Content-Type-Options: nosniff`.
- Error responses reveal no schema, stack, SQL, or account existence.

## 4. Audit integrity

- Workflow actions append to `audit_logs` in the same transaction as the request update where possible.
- Client and API roles have no UPDATE/DELETE endpoints.
- PostgreSQL trigger `prevent_audit_mutation` raises on UPDATE/DELETE.
- Test teardown explicitly disables the trigger only to truncate fixtures; no runtime code path does.
- Every status transition has action, actor identity, role, and database timestamp. Failed PDF generation is persisted as `GENERATION_FAILED`.
- Actor identity invariant: exactly one of `actor_id` (staff) or `actor_student_id` (student) is set (DB CHECK).

## 5. Data protection

- Uploaded documents and PDFs live outside the web root or in a private bucket. Access is via API authorisation only.
- Public verification reveals holder name, roll number, programme, certificate type/number, issue date. Email, phone, DOB, purposes, remarks, and file links are excluded.
- Database backups, encryption at rest, KMS, TLS termination, and access reviews are deployment controls; production requires TLS and encrypted managed PostgreSQL/storage.
- Retention: seven years for audit and certificate metadata, subject to legal requirements. Documents can be deleted only through an approved operational procedure; no API deletion endpoint exists.

## 6. Logging and monitoring

- Structured JSON with timestamp, level, requestId, method, path, status, durationMs, actorRole; never tokens, cookies, passwords, purposes, remarks, or file bytes.
- Alerts recommended: spikes in 401/403/429, repeated `GENERATION_FAILED`, readiness failures, queue growth, DB connection saturation.
- Request IDs are returned in the `X-Request-Id` header for support correlation.

## 7. Security testing and sign-off

Automated checks:

- Auth, RBAC, ownership/IDOR, injection strings, CORS origin rejection, file-signature validation, oversize upload, pagination clamps, rate limiting, audit immutability, public-field minimisation.
- `npm audit --omit=dev --audit-level=high` is a CI advisory step (dependency availability can require temporary documented exceptions).
- Playwright + axe-core covers critical/serious accessibility violations.
- k6 validates availability under expected load.
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs the security suite inside the coverage gate and blocks on the documentation/OpenAPI presence and security sign-off checks. The `quality`, `e2e`, and `performance` jobs must be required status checks for `main`.

Sign-off checklist:

- [x] Route inventory and OpenAPI reviewed for hidden/unauthenticated endpoints.
- [x] Role boundary tests committed for STUDENT/CLERK/HOD/SUPER_ADMIN.
- [x] BOLA/IDOR tests committed.
- [x] Refresh rotation/reuse and forced-change tests committed.
- [x] Audit immutability test committed.
- [x] Upload signature/size tests committed.
- [x] CORS and security-header tests committed.
- [x] Rate-limit test committed.
- [x] Public projection minimisation test committed.
- [x] No hardcoded production secrets; startup validation documented.
- [x] CI quality, E2E/axe, and k6 jobs defined with ephemeral secrets and blocking thresholds.
- [x] OpenAPI contract and required documentation are presence-checked by CI.
- [ ] Production penetration test and AV integration are release-owner tasks outside this repository.

Sign-off: Security & Platform Engineering — 21 November 2026. Re-review required for any new route, role, public endpoint, or file type.
