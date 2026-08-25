import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Rate } from 'k6/metrics';

const TARGET_VUS = Number(__ENV.TARGET_VUS || 1000);
const APP_URL = String(__ENV.APP_URL || '').replace(/\/$/, '');
const SUPABASE_URL = String(__ENV.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = String(__ENV.SUPABASE_ANON_KEY || '');
const USERS_FILE = __ENV.USERS_FILE || './users.staging.json';
const SOCKET_HOLD_MS = Number(__ENV.SOCKET_HOLD_MS || 20 * 60 * 1000);
const HTTP_INTERVAL_MS = Number(__ENV.HTTP_INTERVAL_MS || 5_000);
const realtimeJoinSuccess = new Rate('realtime_join_success');
const realtimeSocketErrors = new Counter('realtime_socket_errors');

if (__ENV.TARGET_ENV !== 'staging') {
  throw new Error('Capacity tests require TARGET_ENV=staging. Production is intentionally blocked.');
}
if (!APP_URL || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('APP_URL, SUPABASE_URL, and SUPABASE_ANON_KEY are required.');
}
if (/^https:\/\/(www\.)?tutlio\.(lt|pl|com)(\/|$)/i.test(APP_URL)) {
  throw new Error('Production Tutlio domains are blocked by this load-test harness.');
}
if (
  SUPABASE_URL.includes('cuhciqwmqfuajeeqjjbm.supabase.co') &&
  __ENV.ALLOW_SHARED_SUPABASE_LOAD !== 'true'
) {
  throw new Error(
    'The shared Tutlio Supabase project is blocked. Use an isolated branch, or explicitly set ALLOW_SHARED_SUPABASE_LOAD=true.',
  );
}

const users = new SharedArray('capacity users', () => {
  const parsed = JSON.parse(open(USERS_FILE));
  if (!Array.isArray(parsed)) throw new Error('USERS_FILE must contain a JSON array.');
  return parsed;
});

if (users.length < TARGET_VUS) {
  throw new Error(`USERS_FILE has ${users.length} users; ${TARGET_VUS} unique users are required.`);
}

export const options = {
  scenarios: {
    concurrent_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: Math.ceil(TARGET_VUS * 0.25) },
        { duration: '5m', target: Math.ceil(TARGET_VUS * 0.5) },
        { duration: '5m', target: TARGET_VUS },
        { duration: '15m', target: TARGET_VUS },
        { duration: '5m', target: 0 },
      ],
      gracefulRampDown: '1m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{workload:auth}': ['p(95)<1500'],
    'http_req_duration{workload:app-shell}': ['p(95)<750'],
    'http_req_duration{workload:supabase-read}': ['p(95)<750'],
    realtime_join_success: ['rate>0.99'],
    realtime_socket_errors: ['count<10'],
    ws_connecting: ['p(95)<3000'],
  },
  noConnectionReuse: false,
  userAgent: 'TutlioCapacityTest/1.0',
};

let session = null;

function login(user) {
  const response = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email: user.email, password: user.password }),
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      tags: { workload: 'auth', name: 'supabase-password-login' },
    },
  );
  const ok = check(response, { 'login succeeds': (r) => r.status === 200 });
  if (!ok) return null;
  const body = response.json();
  return { accessToken: body.access_token, userId: body.user.id };
}

function portalPath(role) {
  if (role === 'student') return '/student/sessions';
  if (role === 'parent') return '/parent/sessions';
  if (role === 'school_admin') return '/school/dashboard';
  if (role === 'org_admin') return '/company/dashboard';
  return '/dashboard';
}

function workloadRequests(user) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.accessToken}`,
    'Content-Type': 'application/json',
  };
  const supabaseParams = {
    headers,
    tags: { workload: 'supabase-read' },
  };
  const requests = [
    ['GET', `${APP_URL}${portalPath(user.role)}`, null, {
      tags: { workload: 'app-shell', name: 'portal-shell' },
    }],
    ['GET', `${SUPABASE_URL}/rest/v1/profiles?select=id,organization_id&id=eq.${session.userId}&limit=1`, null, {
      ...supabaseParams,
      tags: { ...supabaseParams.tags, name: 'profile-read' },
    }],
    ['POST', `${SUPABASE_URL}/rest/v1/rpc/get_my_conversations`, '{}', {
      ...supabaseParams,
      tags: { ...supabaseParams.tags, name: 'chat-inbox-read' },
    }],
  ];

  if (user.studentId) {
    requests.push([
      'GET',
      `${SUPABASE_URL}/rest/v1/sessions?select=id,start_time,status&student_id=eq.${user.studentId}&order=start_time.desc&limit=25`,
      null,
      { ...supabaseParams, tags: { ...supabaseParams.tags, name: 'student-sessions-read' } },
    ]);
  } else if (user.organizationId) {
    requests.push([
      'GET',
      `${SUPABASE_URL}/rest/v1/organizations?select=id,name&id=eq.${user.organizationId}&limit=1`,
      null,
      { ...supabaseParams, tags: { ...supabaseParams.tags, name: 'organization-read' } },
    ]);
  } else {
    requests.push([
      'GET',
      `${SUPABASE_URL}/rest/v1/sessions?select=id,start_time,status&tutor_id=eq.${session.userId}&order=start_time.desc&limit=25`,
      null,
      { ...supabaseParams, tags: { ...supabaseParams.tags, name: 'tutor-sessions-read' } },
    ]);
  }
  return requests;
}

function runHttpWorkload(user) {
  const responses = http.batch(workloadRequests(user));
  check(responses, {
    'authenticated reads succeed': (items) => items.every((response) => response.status === 200),
  });
}

export default function () {
  const user = users[__VU - 1];
  if (!session) session = login(user);
  if (!session) {
    sleep(5);
    return;
  }

  const websocketUrl = `${SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}&vsn=1.0.0`;
  const topic = `realtime:user:${session.userId}:inbox`;
  const joinRef = '1';
  let nextRef = 2;
  let joinRecorded = false;

  runHttpWorkload(user);
  const response = ws.connect(
    websocketUrl,
    { tags: { workload: 'realtime', name: 'private-inbox-socket' } },
    (socket) => {
      socket.on('open', () => {
        socket.send(JSON.stringify({
          topic,
          event: 'phx_join',
          payload: {
            config: {
              broadcast: { ack: false, self: false },
              presence: { enabled: false },
              postgres_changes: [],
              private: true,
            },
            access_token: session.accessToken,
          },
          ref: joinRef,
          join_ref: joinRef,
        }));

        socket.setInterval(() => {
          socket.send(JSON.stringify({
            topic: 'phoenix',
            event: 'heartbeat',
            payload: {},
            ref: String(nextRef++),
          }));
        }, 25_000);

        socket.setInterval(() => runHttpWorkload(user), HTTP_INTERVAL_MS);
        socket.setTimeout(() => socket.close(), SOCKET_HOLD_MS);
      });

      socket.on('message', (raw) => {
        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          return;
        }
        if (message.event === 'phx_reply' && message.ref === joinRef) {
          const joined = message.payload?.status === 'ok';
          joinRecorded = true;
          realtimeJoinSuccess.add(joined);
          check(message, { 'private inbox channel joins': () => joined });
          if (!joined) socket.close();
        }
        if (message.event === 'phx_error') {
          realtimeSocketErrors.add(1);
        }
      });

      socket.on('error', () => realtimeSocketErrors.add(1));
      socket.on('close', () => {
        if (!joinRecorded) realtimeJoinSuccess.add(false);
      });
    },
  );

  check(response, { 'realtime websocket upgrades': (result) => result?.status === 101 });
  sleep(3);
}
