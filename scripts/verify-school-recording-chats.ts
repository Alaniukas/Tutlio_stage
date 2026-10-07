import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

function argument(name: string, fallback = ''): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] || '';
}

// Read credentials directly into memory. Never print them or write production data.
const environment = parseEnv(readFileSync(argument('--env-file', '.env'), 'utf8'));
const origin = new URL(argument('--production-url', 'https://tutlio.lt')).origin;
assert(['https://tutlio.lt', 'https://tutlio.com', 'https://tutlio.pl'].includes(origin), 'Unexpected production origin.');
assert(environment.SUPABASE_SERVICE_ROLE_KEY, 'Internal authentication unavailable.');
const url = new URL('/api/admin-school-recording-check', origin);
url.searchParams.set('organizationId', argument('--organization'));
url.searchParams.set('userId', argument('--viewer-user'));
const denied = await fetch(url, { signal: AbortSignal.timeout(15_000) });
assert.equal(denied.status, 401, 'Diagnostic must require internal authentication.');
const response = await fetch(url, {
  headers: { 'x-internal-key': environment.SUPABASE_SERVICE_ROLE_KEY },
  signal: AbortSignal.timeout(60_000), redirect: 'error',
});
assert.equal(response.status, 200, 'Production diagnostic failed.');
const result = await response.json() as {
  groups: number; results: Array<{ retainedVideos?: number; videoStatus?: number | null;
    pairedChats?: number; checks?: Array<{ valid: boolean }> }>;
};
console.log(JSON.stringify(result, null, 2));
let verifiedChats = 0;
for (const group of result.results) {
  if (group.retainedVideos) assert.equal(group.videoStatus, 206, 'Live video access failed.');
  for (const check of group.checks || []) {
    assert.equal(check.valid, true, 'Live chat stream or copied-link isolation failed.');
    verifiedChats += 1;
  }
}
console.log(JSON.stringify({ liveProductionVerification: true, verifiedChats }));
if (!verifiedChats) process.exitCode = 2;
