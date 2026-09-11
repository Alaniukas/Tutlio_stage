/**
 * Remove Pro Klasė prod test session: Ieva Nekrošaitė × TEST student (bandomoji).
 * Session: 8073c762-2c85-428e-9722-52e38a05d638 (2026-08-29, completed, €10 trial).
 *
 * Usage: node scripts/cleanup-proklase-ieva-test-session.mjs
 *        node scripts/cleanup-proklase-ieva-test-session.mjs --dry-run
 */
import { readFileSync } from 'fs';

const DRY = process.argv.includes('--dry-run');

const env = readFileSync('.env.vercel.prod', 'utf8');
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/)?.[1];
if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.vercel.prod');
const url = 'https://cuhciqwmqfuajeeqjjbm.supabase.co';
const headers = { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' };

const SESSION_ID = '8073c762-2c85-428e-9722-52e38a05d638';
const STUDENT_ID = '6c6009e0-5c34-4949-9307-bc21c01f775d';
const PACKAGE_ID = '5f17c4cb-efbf-498e-82e1-06dd10a30a27';

async function get(path) {
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=representation' },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : [];
}

async function del(path) {
  if (DRY) {
    console.log('[dry-run] DELETE', path);
    return;
  }
  const r = await fetch(`${url}/rest/v1/${path}`, { method: 'DELETE', headers });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`DELETE ${path}: ${r.status} ${t.slice(0, 400)}`);
  }
}

const session = (await get(`sessions?select=id,status,start_time,topic,student_id,tutor_id,lesson_package_id,profiles(full_name)&id=eq.${SESSION_ID}`))[0];
if (!session) {
  console.log('Session already gone:', SESSION_ID);
  process.exit(0);
}
console.log('Session:', {
  id: session.id,
  status: session.status,
  start: session.start_time,
  topic: session.topic,
  tutor: session.profiles?.full_name,
  package: session.lesson_package_id,
});

const student = (await get(`students?select=id,full_name,email,detached_at&id=eq.${STUDENT_ID}`))[0];
console.log('Student:', student);

const pkg = (await get(`lesson_packages?select=id,total_lessons,available_lessons,completed_lessons,paid,payment_status,stripe_checkout_session_id&id=eq.${PACKAGE_ID}`))[0];
console.log('Package:', pkg);

const items = await get(`lesson_package_items?select=id,available_lessons,completed_lessons&package_id=eq.${PACKAGE_ID}`);
console.log('Package items:', items);

// Related rows (best-effort)
for (const table of [
  `tutor_adjustments?session_id=eq.${SESSION_ID}`,
  `tutor_lesson_status_confirmation?session_id=eq.${SESSION_ID}`,
]) {
  try {
    const rows = await get(`${table}&select=id`);
    if (rows.length) console.log(table.split('?')[0], rows.length, 'row(s)');
  } catch (e) {
    console.log('skip', table.split('?')[0], String(e?.message || e).slice(0, 80));
  }
}

console.log(DRY ? '\nDry run — no deletes.' : '\nDeleting…');

await del(`tutor_adjustments?session_id=eq.${SESSION_ID}`);
try {
  await del(`tutor_lesson_status_confirmation?session_id=eq.${SESSION_ID}`);
} catch {
  /* table may not exist in all envs */
}

await del(`sessions?id=eq.${SESSION_ID}`);
await del(`lesson_package_items?package_id=eq.${PACKAGE_ID}`);
await del(`lesson_packages?id=eq.${PACKAGE_ID}`);

const pricing = await get(`student_individual_pricing?select=id&student_id=eq.${STUDENT_ID}`);
for (const p of pricing) {
  await del(`student_individual_pricing?id=eq.${p.id}`);
}

await del(`students?id=eq.${STUDENT_ID}`);

console.log(DRY ? 'Dry run complete.' : 'Done — removed test session, package, and TEST student.');
