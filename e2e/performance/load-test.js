import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:4000';
const DURATION = __ENV.K6_DURATION || '30s';
const STUDENT_ROLL = __ENV.STUDENT_ROLL || 'NTTF2026001';
const STUDENT_PASSWORD = __ENV.STUDENT_PASSWORD || 'Student@E2E2026';
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'clerk@nttf.ac.in';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'NttfE2E!2026';

const STUDENT_VUS = Number(__ENV.STUDENT_VUS || 50);
const ADMIN_VUS = Number(__ENV.ADMIN_VUS || 10);

const loginFailures = new Rate('login_failures');

export const options = {
  scenarios: {
    students: {
      executor: 'constant-vus',
      exec: 'studentJourney',
      vus: STUDENT_VUS,
      duration: DURATION,
      tags: { role: 'student' },
    },
    admins: {
      executor: 'constant-vus',
      exec: 'adminJourney',
      vus: ADMIN_VUS,
      duration: DURATION,
      tags: { role: 'admin' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    'http_req_duration{role:student}': ['p(95)<500'],
    'http_req_duration{role:admin}': ['p(95)<500'],
    login_failures: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'max'],
};

let studentSession = null;
let adminSession = null;

function authenticate(path, payload, tags) {
  const response = http.post(`${BASE_URL}${path}`, JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    tags,
  });
  const ok = check(response, {
    'login returned 200': (result) => result.status === 200,
    'login returned an access token': (result) => Boolean(result.json('data.accessToken')),
  });
  loginFailures.add(!ok, tags);
  if (!ok) return null;
  return { token: response.json('data.accessToken') };
}

function ensureStudentSession() {
  if (!studentSession) {
    studentSession = authenticate(
      '/api/auth/student/login',
      { rollNumber: STUDENT_ROLL, password: STUDENT_PASSWORD },
      { role: 'auth', actor: 'student' },
    );
  }
  return studentSession;
}

function ensureAdminSession() {
  if (!adminSession) {
    adminSession = authenticate(
      '/api/auth/admin/login',
      { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      { role: 'auth', actor: 'admin' },
    );
  }
  return adminSession;
}

function authorizedGet(session, path, tags) {
  return http.get(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${session.token}` },
    tags,
  });
}

export function studentJourney() {
  const session = ensureStudentSession();
  if (!session) {
    sleep(1);
    return;
  }

  const profile = authorizedGet(session, '/api/student/profile', {
    role: 'student',
    operation: 'profile',
  });
  check(profile, { 'profile returned 200': (result) => result.status === 200 });

  const requests = authorizedGet(session, '/api/student/requests?page=1&limit=10', {
    role: 'student',
    operation: 'request-history',
  });
  check(requests, { 'request history returned 200': (result) => result.status === 200 });

  if (profile.status === 401 || requests.status === 401) studentSession = null;
  sleep(1);
}

export function adminJourney() {
  const session = ensureAdminSession();
  if (!session) {
    sleep(1);
    return;
  }

  const stats = authorizedGet(session, '/api/admin/stats', {
    role: 'admin',
    operation: 'stats',
  });
  check(stats, { 'stats returned 200': (result) => result.status === 200 });

  const queue = authorizedGet(session, '/api/admin/requests?page=1&limit=20', {
    role: 'admin',
    operation: 'queue',
  });
  check(queue, { 'queue returned 200': (result) => result.status === 200 });

  if (stats.status === 401 || queue.status === 401) adminSession = null;
  sleep(1);
}
