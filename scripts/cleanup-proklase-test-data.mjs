/**
 * One-off: remove Pro Klasė test student (Mathew Castle / domasgudas16 self-row)
 * and duplicate tutor invite STBHFEZ2 from production.
 *
 * Usage: vercel env pull .env.vercel.prod --environment=production --yes
 *        node scripts/cleanup-proklase-test-data.mjs
 */
import { readFileSync } from 'fs';

const env = readFileSync('.env.vercel.prod', 'utf8');
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)?.[1];
const url = 'https://cuhciqwmqfuajeeqjjbm.supabase.co';
const headers = { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' };

const TEST_STUDENT_ID = 'aa2d9786-d822-40ad-b846-bb3a8c9be46f';
const DUPLICATE_INVITE_ID = '4843f85d-afdc-4fe7-bebe-2e2771b65aa1';

async function del(path) {
  const r = await fetch(`${url}/rest/v1/${path}`, { method: 'DELETE', headers });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`DELETE ${path}: ${r.status} ${t.slice(0, 400)}`);
  }
}

async function rest(path) {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: { ...headers, Prefer: 'return=representation' } });
  const t = await r.text();
  if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : [];
}

const sessions = await rest(`sessions?select=id&student_id=eq.${TEST_STUDENT_ID}`);
console.log('Deleting sessions:', sessions.length);
for (const s of sessions) {
  await del(`sessions?id=eq.${s.id}`);
}

const pricing = await rest(`student_individual_pricing?select=id&student_id=eq.${TEST_STUDENT_ID}`);
for (const p of pricing) {
  await del(`student_individual_pricing?id=eq.${p.id}`);
}

await del(`students?id=eq.${TEST_STUDENT_ID}`);
console.log('Deleted test student', TEST_STUDENT_ID);

await del(`tutor_invites?id=eq.${DUPLICATE_INVITE_ID}`);
console.log('Deleted duplicate invite', DUPLICATE_INVITE_ID);

console.log('Done.');
