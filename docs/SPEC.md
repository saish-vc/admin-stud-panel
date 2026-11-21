# NTTF Certificate Portal — Functional and Non-Functional Specification

Status: **Approved for v1 implementation**  
Owner: NTTF Academic Administration  
Last updated: 21 November 2026

## 1. Purpose

The portal lets NTTF diploma students request official certificates and lets NTTF administrators verify the request against institutional records before issuing a digitally generated certificate. It replaces an email-and-spreadsheet workflow with an auditable, role-controlled process.

### In scope (v1)

- Student login, forced first-login password change, profile, certificate requests, document upload, status timeline, approved certificate download.
- Staff (`CLERK`, `HOD`, `SUPER_ADMIN`) login and verification queue.
- Clerk document consistency verification; HOD/SUPER_ADMIN final approval or rejection.
- PDF certificate generation with a public, privacy-conscious QR verification link.
- Immutable audit trail for every workflow transition.
- Seed data of at least 1,000 realistic students.
- Automated linting, type checking, unit, integration, security, accessibility, E2E, and load testing.

### Out of scope (v1)

- Email/SMS delivery (events are logged to the application log only).
- Payments.
- Native mobile applications (the web UI is responsive).
- Bulk certificate generation.
- External identity providers (SSO/OAuth).
- Digitally signed certificates using a hardware security module or public PKI. The QR code validates the record through this portal.

## 2. Actors and permissions

| Capability                               | Student               | Clerk  | HOD | Super Admin |
| ---------------------------------------- | --------------------- | ------ | --- | ----------- |
| Login, refresh, logout                   | Yes                   | Yes    | Yes | Yes         |
| Change own password                      | Yes                   | Yes    | Yes | Yes         |
| View own profile                         | Yes                   | No     | No  | Yes         |
| Create/resubmit own request              | Yes                   | No     | No  | No          |
| View own request history and certificate | Yes                   | No     | No  | No          |
| View verification queue/details          | No                    | Yes    | Yes | Yes         |
| Verify supporting documents              | No                    | Yes    | No  | Yes         |
| Approve/reject request                   | No                    | **No** | Yes | Yes         |
| Trigger PDF generation                   | No                    | No     | Yes | Yes         |
| View public verification result          | Yes (unauthenticated) | Yes    | Yes | Yes         |
| Read audit trail in request detail       | No                    | Yes    | Yes | Yes         |

`SUPER_ADMIN` is an operational break-glass role. It may perform any staff action, and every use remains audited.

## 3. Functional requirements

### FR-1 Authentication

1. Students authenticate with roll number and password. Staff authenticate with email and password.
2. Password verification uses bcrypt with a cost factor of 12.
3. Login returns a short-lived JWT access token (15 minutes by default) in the JSON response and sets an opaque, rotating JWT refresh token in an `HttpOnly`, `SameSite=Lax`, path-scoped cookie. Refresh tokens expire after 7 days.
4. Refresh-token reuse (a rotated token presented again) revokes the session.
5. Accounts seeded with a temporary DOB password (`DDMMYYYY`) must change it before accessing any business endpoint.
6. New passwords require at least 10 characters, upper and lower case, a digit, and a symbol.
7. Auth endpoints are limited to 5 requests per minute per IP.
8. Inactive staff and `DROPPED` students cannot log in.

### FR-2 Student profile

The student can view roll number, full name, date of birth, email, phone, programme, batch year, semester, and status. These values are read-only and come from the institutional master record.

### FR-3 Certificate requests

1. A student can request `BONAFIDE`, `LC`, or `DIPLOMA`.
2. Purpose is mandatory, between 10 and 1,000 characters.
3. One supporting document may be attached: PDF, JPEG, or PNG, maximum 5 MB. The file is validated by content signature, stored under a randomized name outside the web root, and only served through authenticated endpoints.
4. New requests start as `SUBMITTED`.
5. At most three open requests (`SUBMITTED` or `UNDER_VERIFICATION`) are allowed per student at once.
6. A `REJECTED` request can be edited and resubmitted by its owner, returning to `SUBMITTED` while retaining the full audit history.
7. The student sees a reverse-chronological timeline of each request with status, actor role, remarks, and timestamps.

### FR-4 Staff verification workflow

The allowed transitions are:

```text
SUBMITTED --(CLERK/SUPER_ADMIN: VERIFIED_DOCS)--> UNDER_VERIFICATION
UNDER_VERIFICATION --(HOD/SUPER_ADMIN: APPROVED)--> APPROVED --(system: GENERATED_PDF)--> READY
SUBMITTED | UNDER_VERIFICATION --(HOD/SUPER_ADMIN: REJECTED)--> REJECTED
REJECTED --(owning student resubmits)--> SUBMITTED
```

- Only `CLERK` or `SUPER_ADMIN` can perform document verification.
- Only `HOD` or `SUPER_ADMIN` can approve or reject.
- Approval requires the request to be `UNDER_VERIFICATION`.
- Rejection requires non-empty remarks.
- The approve action performs an atomic approval decision, writes the `APPROVED` audit event, renders and stores the PDF, uploads it, records a certificate row, sets the request to `READY`, and writes `GENERATED_PDF`.
- If PDF generation exhausts three transient retries, the request remains `APPROVED`, a `GENERATION_FAILED` audit row is written, and an authorised staff member may call the generation endpoint again.
- Every transition writes exactly one audit row with request, actor (or actor student for submissions), action, and database timestamp.
- Audit rows cannot be updated or deleted; a PostgreSQL trigger enforces this for all database users except the migration owner bypass used during controlled teardown.

### FR-5 Queue and details

- Staff can filter the queue by status and certificate type, search by roll number or student name, and paginate.
- Default sort is oldest submitted/under-verification request first, so queues are fair.
- Detail view includes the student's master fields, request purpose, support document preview, timeline, and permitted actions.
- Document access requires staff authentication and is never public.

### FR-6 Certificate and verification

1. A certificate receives a human-readable unique number (`NTTF/<TYPE>/<YYYY>/<RANDOM>`), a verification code, and a generated PDF.
2. The PDF includes student name, roll number, programme, batch, certificate type, purpose, issue date, certificate number, and a QR code linking to `/verify/<verificationCode>`.
3. The public verification API returns only: valid flag, holder name, roll number, programme, certificate type, certificate number, and issue date. It does not return email, phone, DOB, staff remarks, or document URLs.
4. Unknown codes return a generic 404 to prevent enumeration.

### FR-7 Seed and administration

- The seed script inserts at least 1,000 realistic students in transactional chunks of 100–200.
- It pre-generates and de-duplicates roll numbers in memory.
- It creates `student_credentials` with bcrypt hashes of DOB passwords and `must_change_password = true`.
- It seeds one clerk, one HOD, and one super admin; their passwords come from environment variables and must be changed on first login by default.
- Seed scripts are idempotent with respect to configured administrator e-mails and explicit seed reset guard.

## 4. Non-functional requirements

| Area            | Requirement                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Availability    | Stateless API workers behind a load balancer; health endpoints for liveness/readiness.                                                                                  |
| Performance     | P95 < 500 ms for normal API operations under 50 student and 10 admin virtual users; error rate < 1%.                                                                    |
| Scalability     | API and web deploy independently; PostgreSQL connection pooling; storage adapters for local disk and S3.                                                                |
| Security        | OWASP API Security Top 10 controls; JWT with refresh rotation; RBAC; append-only audit; strict CORS; Helmet; rate limits; upload allow-list; SQL via parameterised ORM. |
| Privacy         | Public verification exposes only the minimum fields needed to confirm a certificate. Uploads and certificates are not publicly listable.                                |
| Accessibility   | WCAG 2.2 AA target. Automated axe scan must report zero critical or serious violations. Keyboard navigable, labelled forms, visible focus, error announcements.         |
| Reliability     | Retry idempotent transient PDF storage/generation failures up to 3 attempts with exponential backoff. Failed attempts are audited.                                      |
| Auditability    | Every request transition and generation attempt is attributable and immutable.                                                                                          |
| Observability   | Structured JSON logs with request ID, no secrets or document contents. Health endpoints expose dependency readiness only.                                               |
| Portability     | Local setup uses Docker Compose; production supports managed PostgreSQL and S3-compatible object storage.                                                               |
| Maintainability | TypeScript strict mode, documented OpenAPI contract, Drizzle migrations, ADRs, coverage gates, reproducible runbook.                                                    |
| Browser support | Current Chrome, Edge, Firefox, Safari; responsive from 360 px.                                                                                                          |

## 5. Data and retention

- `students`, `certificate_requests`, `admin_users`, `student_credentials`, `auth_sessions`, `certificates`, and `audit_logs` are held in PostgreSQL 16.
- Supporting documents and certificate PDFs are retained for the configured object-storage retention period.
- Audit records and issued certificate metadata are retained for at least seven years. Deletion must occur through a documented legal-hold review; no application endpoint mutates or deletes audit rows.
- Secrets are environment-provided, never committed. Production requires TLS at the proxy and secure cookies.

## 6. Acceptance criteria

1. `npm run lint`, `npm run typecheck`, and `npm run test:coverage` pass with line coverage ≥ 80% globally and ≥ 90% for auth/workflow/data-integrity modules.
2. The E2E journey — student submit → clerk verify → HOD approve → PDF ready → public verification — passes in Chromium.
3. Axe checks report zero critical/serious issues on login, student dashboard, and admin queue.
4. The k6 smoke/load profile achieves P95 < 500 ms and error-rate < 1%.
5. Security integration tests demonstrate denial of BOLA/IDOR, role escalation, bad tokens, injection, malicious uploads, and rate limiting.
6. All required documents under `docs/` are present and consistent with the implementation.
7. The seed produces at least 1,000 students and the documented demo accounts can log in.
