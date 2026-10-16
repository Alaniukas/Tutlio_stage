import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Post-deployment verification: node scripts/verify-auth-session-revocation.mjs
// Creates and removes one isolated QA identity in the configured Tutlio project.
// Never uses existing accounts, sends invitations, or logs credentials/tokens.
// A failing test writes its evidence to ignored output/security and exits 1.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = parseEnv(await readFile(resolve(root, '.env'), 'utf8'));
const url = env.VITE_SUPABASE_URL;
if (new URL(url).hostname !== 'cuhciqwmqfuajeeqjjbm.supabase.co') {
  throw new Error('Unexpected Supabase project.');
}
if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase credentials.');
}
const request = (input, init = {}) => fetch(input, {
  ...init, redirect: 'manual', signal: AbortSignal.timeout(15000),
});
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: request },
};
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, options);
const clientA = createClient(url, env.VITE_SUPABASE_ANON_KEY, options);
const clientB = createClient(url, env.VITE_SUPABASE_ANON_KEY, options);
const email = `session-check-${Date.now()}-${randomBytes(4).toString('hex')}@example.invalid`;
const password = `${randomBytes(32).toString('base64url')}A7!`;
const newPassword = `${randomBytes(32).toString('base64url')}B8!`;
const report = {
  startedAt: new Date().toISOString(), project: 'cuhciqwmqfuajeeqjjbm',
  testEmail: email, checks: {}, cleanup: {},
};
let userId;
let sessionA;
let sessionB;
const safeError = error => ({
  name: error?.name, code: error?.code, status: error?.status,
});
const ensure = (value, message) => { if (!value) throw new Error(message); };
const claims = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
async function probe(token) {
  const headers = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };
  const results = await Promise.all([
    request(`${url}/auth/v1/user`, { headers }),
    request(`${url}/rest/v1/profiles?id=eq.${userId}&select=id`, { headers }),
    request('https://www.tutlio.lt/api/my-support-requests', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  ]);
  const bodies = await Promise.all(results.map(async response => {
    try { return await response.json(); } catch { return null; }
  }));
  return {
    auth: { status: results[0].status, authenticated: bodies[0]?.id === userId, errorCode: bodies[0]?.code },
    database: {
      status: results[1].status,
      canReadOwnProfile: Array.isArray(bodies[1]) && bodies[1].some(row => row.id === userId),
      errorCode: bodies[1]?.code,
    },
    api: {
      status: results[2].status,
      authenticated: results[2].status === 200 && Array.isArray(bodies[2]?.requests),
    },
  };
}

try {
  const created = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: 'Tutlio session revocation QA' },
    app_metadata: { session_security_qa: true },
  });
  if (created.error) {
    report.checks.createError = safeError(created.error);
    throw new Error('Could not create QA identity.');
  }
  userId = created.data.user.id;
  report.userId = userId;
  const loginA = await clientA.auth.signInWithPassword({ email, password });
  ensure(!loginA.error && loginA.data.session, 'Session A sign-in failed.');
  sessionA = loginA.data.session;
  const loginB = await clientB.auth.signInWithPassword({ email, password });
  ensure(!loginB.error && loginB.data.session, 'Session B sign-in failed.');
  sessionB = loginB.data.session;
  const claimsB = claims(sessionB.access_token);
  report.sessions = {
    A: claims(sessionA.access_token).session_id, B: claimsB.session_id,
    distinct: claims(sessionA.access_token).session_id !== claimsB.session_id,
    jwtLifetimeSeconds: claimsB.exp - claimsB.iat,
    oldAccessTokenExpiresAt: new Date(claimsB.exp * 1000).toISOString(),
  };
  ensure(report.sessions.distinct, 'Sessions A and B must be independent.');
  const unauthenticated = await request('https://www.tutlio.lt/api/my-support-requests');
  report.checks.unauthenticatedApiStatus = unauthenticated.status;
  report.checks.beforePasswordChangeB = await probe(sessionB.access_token);
  ensure(report.checks.beforePasswordChangeB.database.canReadOwnProfile, 'Baseline profile access failed.');
  ensure(report.checks.beforePasswordChangeB.auth.authenticated, 'Baseline auth access failed.');
  ensure(report.checks.beforePasswordChangeB.api.authenticated, 'Baseline Tutlio API access failed.');

  // Match the tutor settings flow: validate the current password by signing in,
  // then update the password using that newly authenticated session.
  const reauthenticated = await clientA.auth.signInWithPassword({ email, password });
  ensure(!reauthenticated.error && reauthenticated.data.session, 'Session A reauthentication failed.');
  sessionA = reauthenticated.data.session;
  report.sessions.changingSession = claims(sessionA.access_token).session_id;
  const changed = await clientA.auth.updateUser({ password: newPassword });
  if (changed.error) {
    report.checks.passwordChangeError = safeError(changed.error);
    throw new Error('Password change failed.');
  }
  report.passwordChangedAt = new Date().toISOString();
  report.checks.afterPasswordChangeA = await probe(sessionA.access_token);
  report.checks.afterPasswordChangeB = await probe(sessionB.access_token);
  report.remainingOldTokenSeconds = Math.max(0, claimsB.exp - Math.floor(Date.now() / 1000));

  // Attempt only a harmless update to this newly created account's own profile.
  const write = await request(`${url}/rest/v1/profiles?id=eq.${userId}&select=id`, {
    method: 'PATCH',
    headers: {
      apikey: env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${sessionB.access_token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify({ full_name: 'Tutlio session revocation QA - old session write' }),
  });
  let writeBody;
  try { writeBody = await write.json(); } catch { writeBody = null; }
  const writtenProfile = await admin.from('profiles').select('full_name').eq('id', userId).single();
  report.checks.oldSessionProfileWrite = {
    status: write.status,
    returnedOwnRow: Array.isArray(writeBody) && writeBody.some(row => row.id === userId),
    persisted: writtenProfile.data?.full_name === 'Tutlio session revocation QA - old session write',
  };
  const refreshedB = await clientB.auth.refreshSession({ refresh_token: sessionB.refresh_token });
  report.checks.oldSessionRefresh = {
    succeeded: !refreshedB.error && Boolean(refreshedB.data.session),
    error: refreshedB.error ? safeError(refreshedB.error) : null,
  };
  report.checks.oldAccessTokenAfterFailedRefresh = await probe(sessionB.access_token);
  const oldPasswordControl = createClient(url, env.VITE_SUPABASE_ANON_KEY, options);
  const oldLogin = await oldPasswordControl.auth.signInWithPassword({ email, password });
  report.checks.oldPasswordLogin = {
    succeeded: !oldLogin.error && Boolean(oldLogin.data.session),
    error: oldLogin.error ? safeError(oldLogin.error) : null,
  };
  const newPasswordControl = createClient(url, env.VITE_SUPABASE_ANON_KEY, options);
  const newLogin = await newPasswordControl.auth.signInWithPassword({ email, password: newPassword });
  report.checks.newPasswordLoginSucceeded = !newLogin.error && Boolean(newLogin.data.session);
  ensure(report.checks.unauthenticatedApiStatus === 401, 'Unauthenticated API control did not reject the request.');
  ensure(report.checks.afterPasswordChangeA.auth.authenticated
    && report.checks.afterPasswordChangeA.database.canReadOwnProfile
    && report.checks.afterPasswordChangeA.api.authenticated, 'The password-changing session lost access.');
  ensure(report.checks.afterPasswordChangeB.auth.status === 403
    && report.checks.afterPasswordChangeB.api.status === 401, 'The old session still passes server authentication.');
  ensure(report.checks.afterPasswordChangeB.database.status === 401
    && !report.checks.afterPasswordChangeB.database.canReadOwnProfile, 'The revoked JWT still reads database rows.');
  ensure(report.checks.oldSessionProfileWrite.status === 401
    && !report.checks.oldSessionProfileWrite.persisted, 'The revoked JWT still writes database rows.');
  ensure(!report.checks.oldSessionRefresh.succeeded, 'The revoked session can still refresh.');
  ensure(report.checks.oldAccessTokenAfterFailedRefresh.database.status === 401
    && !report.checks.oldAccessTokenAfterFailedRefresh.database.canReadOwnProfile, 'Replaying the revoked JWT still works.');
  ensure(!report.checks.oldPasswordLogin.succeeded && report.checks.newPasswordLoginSucceeded,
    'Old/new password controls did not match the completed password change.');
  report.completed = true;
} catch (error) {
  report.completed = false;
  report.failure = { ...safeError(error), message: error.message };
  process.exitCode = 1;
} finally {
  if (userId) {
    try {
      if (sessionA) {
        const signout = await admin.auth.admin.signOut(sessionA.access_token, 'global');
        report.cleanup.globalSignoutSucceeded = !signout.error;
        if (signout.error) report.cleanup.signoutError = safeError(signout.error);
      }
      const deletion = await admin.auth.admin.deleteUser(userId);
      report.cleanup.authUserDeleted = !deletion.error;
      if (deletion.error) report.cleanup.deleteError = safeError(deletion.error);
      const residual = await admin.from('profiles').select('id').eq('id', userId);
      report.cleanup.profileRemoved = !residual.error && residual.data?.length === 0;
      if (!report.cleanup.authUserDeleted || !report.cleanup.profileRemoved) process.exitCode = 1;
    } catch (error) {
      report.cleanup.failure = safeError(error);
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  const outputDir = resolve(root, 'output/security');
  await mkdir(outputDir, { recursive: true });
  const reportPath = resolve(outputDir, `session-invalidation-${report.startedAt.replace(/[:.]/g, '-')}.json`);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}
