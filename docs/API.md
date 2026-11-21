# API Contract

Base URL: `/api`  
OpenAPI: [`openapi.yaml`](./openapi.yaml)  
Interactive docs (development): `/api/docs`

All request and response bodies are JSON unless noted as `multipart/form-data`. Dates use ISO 8601. IDs are UUIDs. Errors use:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action.",
    "requestId": "..."
  }
}
```

## Authentication and tokens

- Access token: JWT, `Authorization: Bearer <token>`, 15-minute default lifetime.
- Refresh token: signed JWT delivered only as an `HttpOnly` cookie named `nttf_refresh`, scoped to `/api/auth`, `SameSite=Lax`, `Secure` in production, 7-day default lifetime.
- Refresh tokens are rotating. Reuse of an already-rotated token revokes the session.
- Successful login returns a user object with `mustChangePassword`. While true, only refresh/logout/me/change-password endpoints are permitted.

| Method | Path                    | Auth                     | Description                                                                        |
| ------ | ----------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| POST   | `/auth/student/login`   | public, 5/min/IP         | Student login with `rollNumber`, `password`.                                       |
| POST   | `/auth/admin/login`     | public, 5/min/IP         | Staff login with `email`, `password`.                                              |
| POST   | `/auth/refresh`         | refresh cookie, 5/min/IP | Rotate refresh token and return a new access token.                                |
| POST   | `/auth/logout`          | refresh cookie           | Revoke session and clear cookie.                                                   |
| GET    | `/auth/me`              | access token             | Current principal and forced-change flag.                                          |
| POST   | `/auth/change-password` | access token             | `currentPassword`, `newPassword`; revokes other sessions and returns fresh tokens. |

## Student

| Method | Path                                        | Auth    | Description                                                                                                     |
| ------ | ------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| GET    | `/student/profile`                          | STUDENT | Own academic master record.                                                                                     |
| GET    | `/student/requests?page=1&limit=20`         | STUDENT | Own requests, newest first, with timelines.                                                                     |
| POST   | `/student/requests`                         | STUDENT | Create request (`multipart/form-data`: `certificateType`, `purpose`, optional `document`). Max 3 open requests. |
| GET    | `/student/requests/:requestId`              | STUDENT | Own request details and timeline. Generic 404 for other students.                                               |
| POST   | `/student/requests/:requestId/resubmit`     | STUDENT | Only when `REJECTED`; updates purpose/optional document and returns to `SUBMITTED`.                             |
| GET    | `/student/requests/:requestId/document`     | STUDENT | Stream own supporting document.                                                                                 |
| GET    | `/student/requests/:requestId/certificate`  | STUDENT | Stream issued PDF when status is `READY`.                                                                       |
| GET    | `/student/requests/:requestId/verification` | STUDENT | Certificate number and public verification code for a ready request.                                            |

## Administration

All routes require a staff access token.

| Method | Path                                            | Roles                   | Description                                                                 |
| ------ | ----------------------------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| GET    | `/admin/stats`                                  | CLERK, HOD, SUPER_ADMIN | Counts by status and total issued.                                          |
| GET    | `/admin/requests?status=&type=&q=&page=&limit=` | CLERK, HOD, SUPER_ADMIN | Paginated queue; oldest actionable first.                                   |
| GET    | `/admin/requests/:requestId`                    | CLERK, HOD, SUPER_ADMIN | Full detail: request, student projection, timeline, certificate metadata.   |
| GET    | `/admin/requests/:requestId/document`           | CLERK, HOD, SUPER_ADMIN | Authenticated stream of supporting document.                                |
| POST   | `/admin/requests/:requestId/verify`             | CLERK, SUPER_ADMIN      | `SUBMITTED → UNDER_VERIFICATION`; optional `remarks`.                       |
| POST   | `/admin/requests/:requestId/approve`            | HOD, SUPER_ADMIN        | `UNDER_VERIFICATION → APPROVED → READY`; optional `remarks`; generates PDF. |
| POST   | `/admin/requests/:requestId/reject`             | HOD, SUPER_ADMIN        | `SUBMITTED` or `UNDER_VERIFICATION → REJECTED`; mandatory `remarks`.        |
| POST   | `/admin/requests/:requestId/generate`           | HOD, SUPER_ADMIN        | Retry PDF generation for an `APPROVED` request after a generation failure.  |
| GET    | `/admin/requests/:requestId/certificate`        | CLERK, HOD, SUPER_ADMIN | Stream issued certificate PDF.                                              |

## Public verification

| Method | Path            | Auth                 | Description                                                                   |
| ------ | --------------- | -------------------- | ----------------------------------------------------------------------------- |
| GET    | `/verify/:code` | public, rate limited | Minimal verified certificate projection. Generic 404 on unknown/invalid code. |

Example success:

```json
{
  "data": {
    "valid": true,
    "certificateNumber": "NTTF/DIPLOMA/2026/8F3A21",
    "certificateType": "DIPLOMA",
    "holderName": "Ananya Menon",
    "rollNumber": "NTTF2023017",
    "programme": "Diploma in Mechanical Engineering",
    "issuedAt": "2026-11-21T10:20:30.000Z"
  }
}
```

## Health and operations

| Method | Path                | Auth         | Description                             |
| ------ | ------------------- | ------------ | --------------------------------------- |
| GET    | `/health/liveness`  | public       | Process is alive.                       |
| GET    | `/health/readiness` | public       | `SELECT 1` succeeds against PostgreSQL. |
| GET    | `/docs`             | configurable | Swagger UI.                             |

## Key request/response shapes

### Student request

```json
{
  "requestId": "uuid",
  "certificateType": "BONAFIDE",
  "purpose": "Bank education loan verification",
  "status": "SUBMITTED",
  "adminRemarks": null,
  "supportingDocument": true,
  "createdAt": "2026-11-21T09:00:00.000Z",
  "verifiedAt": null,
  "timeline": [
    {
      "logId": 1,
      "action": "SUBMITTED",
      "statusAfter": "SUBMITTED",
      "actorRole": "STUDENT",
      "actorName": "Ananya Menon",
      "remarks": null,
      "timestamp": "2026-11-21T09:00:00.000Z"
    }
  ],
  "certificate": null
}
```

### Admin queue item

```json
{
  "requestId": "uuid",
  "rollNumber": "NTTF2023017",
  "studentName": "Ananya Menon",
  "programme": "Diploma in Mechanical Engineering",
  "batchYear": 2023,
  "certificateType": "BONAFIDE",
  "status": "UNDER_VERIFICATION",
  "purpose": "Bank education loan verification",
  "hasSupportingDocument": true,
  "createdAt": "2026-11-21T09:00:00.000Z"
}
```

### Workflow errors

| HTTP | Code                                                      | Meaning                                                         |
| ---- | --------------------------------------------------------- | --------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`                                        | Malformed form/body/query/file.                                 |
| 401  | `AUTH_REQUIRED` / `TOKEN_EXPIRED` / `INVALID_CREDENTIALS` | Authentication failure.                                         |
| 403  | `FORBIDDEN` / `PASSWORD_CHANGE_REQUIRED`                  | Role/ownership or forced-password gate.                         |
| 404  | `NOT_FOUND`                                               | Object missing or not visible to caller (prevents enumeration). |
| 409  | `INVALID_STATE_TRANSITION` / `OPEN_REQUEST_LIMIT`         | State conflict.                                                 |
| 413  | `FILE_TOO_LARGE`                                          | Upload over 5 MB.                                               |
| 415  | `UNSUPPORTED_FILE_TYPE`                                   | Not PDF/JPEG/PNG or signature mismatch.                         |
| 429  | `RATE_LIMITED`                                            | Auth/upload/public verification abuse.                          |
| 500  | `INTERNAL_ERROR`                                          | Generic safe error; correlation ID is logged.                   |
