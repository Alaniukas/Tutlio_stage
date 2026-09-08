// Explicitly authorized read-only preview; never call a deployed billing endpoint.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const env = parseEnv(readFileSync('.env.local', 'utf8'));
const origin = 'https://cuhciqwmqfuajeeqjjbm.supabase.co';
if (env.VITE_SUPABASE_URL?.replace(/\/$/, '') !== origin) throw new Error('Unexpected database');
process.env.VITE_SUPABASE_URL = origin;
process.env.SUPABASE_URL = origin;
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
process.env.CRON_SECRET = 'local-readonly-preview';
delete process.env.RESEND_API_KEY;
const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const method = (init.method || input?.method || 'GET').toUpperCase();
  if (url.origin !== origin || !url.pathname.startsWith('/rest/v1/') || !['GET', 'HEAD'].includes(method)) {
    throw new Error(`Read-only guard blocked ${method} ${url.origin}${url.pathname}`);
  }
  requests.push({ method, path: url.pathname });
  return originalFetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) });
};
const { default: handler } = await import('../api/bill-school-extra-lessons.ts');
let status = 200;
let result;
await handler({ method: 'GET', headers: { authorization: 'Bearer local-readonly-preview' }, query: {
  dryRun: 'true', organizationId: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
  periodStart: '2026-09-01', periodEnd: '2026-09-07',
}}, { status(code) { status = code; return this; }, json(body) { result = body; return this; } });
const report = { checkedAt: new Date().toISOString(), status, requests, result };
writeFileSync('tmp/school-support-review/laisvi-billing-readonly.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (status >= 500) process.exitCode = 1;
