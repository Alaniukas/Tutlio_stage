/**
 * Fake data for the three Pro Klasė QA checks:
 *  1) duplicate free-time rows (€0 trial Matematika vs paid)
 *  2) ended lesson that stays planned until the tutor marks happened / no-show
 *  3) extra tutors already have Mon 16–20 windows — this only prints who to pick
 *
 * Usage: node scripts/seed-proklase-search-status-qa.mjs
 * Requires seed-qa-demo-orgs.mjs first.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ORG_ID = 'b0a00000-7e57-4000-8000-000000000001';
const TUTOR_ONA = 'b0a00000-7e57-4000-8000-000000000003';
const STUDENT_LUKAS = 'b0a00000-7e57-4000-8000-000000000005';
const STUDENT_EMILIJA = 'b0a00000-7e57-4000-8000-000000000006';
const SUBJECT_MATH = 'b0a00000-7e57-4000-8000-000000000011';
const SUBJECT_MATH_TRIAL_DUP = 'b0a00000-7e57-4000-8000-000000000015';
const AVAIL_SAT = 'b0a00000-7e57-4000-8000-000000000061';
const BUSY_SPLIT = 'b0a00000-7e57-4000-8000-0000000000c0';
const PENDING_HAPPENED = 'b0a00000-7e57-4000-8000-0000000000c1';
const PENDING_NOSHOW = 'b0a00000-7e57-4000-8000-0000000000c2';
const SAT_DATE = '2026-09-05';

function loadEnv() {
  const out = {};
  for (const name of ['.env.local', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (out[m[1]] == null || out[m[1]] === '') out[m[1]] = v;
    }
  }
  return out;
}

function vilniusIso(ymd, hm) {
  const [y, mo, d] = ymd.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString();
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: org, error: orgErr } = await supabase.from('organizations').select('id, name').eq('id', ORG_ID).maybeSingle();
  if (orgErr) throw new Error(`org lookup: ${orgErr.message}`);
  if (!org) throw new Error('Pro Klasė QA org missing — run node scripts/seed-qa-demo-orgs.mjs first');

  const { error: paidErr } = await supabase.from('subjects').upsert({
    id: SUBJECT_MATH,
    tutor_id: TUTOR_ONA,
    name: 'Matematika',
    price: 10,
    duration_minutes: 60,
    is_trial: false,
  }, { onConflict: 'id' });
  if (paidErr) throw new Error(`paid math: ${paidErr.message}`);

  const { error: trialErr } = await supabase.from('subjects').upsert({
    id: SUBJECT_MATH_TRIAL_DUP,
    tutor_id: TUTOR_ONA,
    name: 'Matematika',
    price: 0,
    duration_minutes: 60,
    is_trial: true,
  }, { onConflict: 'id' });
  if (trialErr) throw new Error(`trial math dup: ${trialErr.message}`);

  const { error: availErr } = await supabase.from('availability').upsert({
    id: AVAIL_SAT,
    tutor_id: TUTOR_ONA,
    day_of_week: 6,
    start_time: '11:00:00',
    end_time: '15:00:00',
    is_recurring: false,
    specific_date: SAT_DATE,
  }, { onConflict: 'id' });
  if (availErr) throw new Error(`availability: ${availErr.message}`);

  const { error: splitErr } = await supabase.from('sessions').upsert({
    id: BUSY_SPLIT,
    tutor_id: TUTOR_ONA,
    student_id: STUDENT_EMILIJA,
    subject_id: SUBJECT_MATH,
    start_time: vilniusIso(SAT_DATE, '12:00'),
    end_time: vilniusIso(SAT_DATE, '12:45'),
    status: 'completed',
    paid: true,
    payment_status: 'paid',
    price: 10,
    topic: 'QA split window (ignore)',
  }, { onConflict: 'id' });
  if (splitErr) throw new Error(`split session: ${splitErr.message}`);

  const now = new Date();
  const pendingEnd = new Date(now.getTime() - 25 * 60 * 1000);
  const pendingStart = new Date(pendingEnd.getTime() - 60 * 60 * 1000);
  const noshowEnd = new Date(now.getTime() - 90 * 60 * 1000);
  const noshowStart = new Date(noshowEnd.getTime() - 60 * 60 * 1000);

  const { error: p1 } = await supabase.from('sessions').upsert({
    id: PENDING_HAPPENED,
    tutor_id: TUTOR_ONA,
    student_id: STUDENT_LUKAS,
    subject_id: SUBJECT_MATH,
    start_time: pendingStart.toISOString(),
    end_time: pendingEnd.toISOString(),
    status: 'active',
    paid: false,
    payment_status: 'unpaid',
    price: 25,
    topic: 'QA — pažymėk ĮVYKUSI',
    status_confirmed_at: null,
    status_confirmed_by: null,
  }, { onConflict: 'id' });
  if (p1) throw new Error(`pending happened: ${p1.message}`);

  const { error: p2 } = await supabase.from('sessions').upsert({
    id: PENDING_NOSHOW,
    tutor_id: TUTOR_ONA,
    student_id: STUDENT_EMILIJA,
    subject_id: SUBJECT_MATH,
    start_time: noshowStart.toISOString(),
    end_time: noshowEnd.toISOString(),
    status: 'active',
    paid: false,
    payment_status: 'unpaid',
    price: 25,
    topic: 'QA — pažymėk NEATVYKĘ',
    status_confirmed_at: null,
    status_confirmed_by: null,
  }, { onConflict: 'id' });
  if (p2) throw new Error(`pending noshow: ${p2.message}`);

  const { data: tutors } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('organization_id', ORG_ID)
    .order('full_name');

  const appUrl = (env.VITE_APP_URL || env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  console.log('Pro Klasė search/status QA seed OK');
  console.log(`  Org: ${org.name}`);
  console.log(`  Duplicate bait: Ona has Matematika €10 + trial Matematika €0 on ${SAT_DATE} 11:00–15:00 (busy 12:00–12:45)`);
  console.log(`  Pending happened: Lukas, ended ~25 min ago`);
  console.log(`  Pending no-show: Emilija, ended ~90 min ago`);
  console.log('  Tutors in org:');
  for (const t of tutors || []) {
    console.log(`    - ${t.full_name}  ${t.email || ''}`);
  }
  console.log(`  Admin:  ${appUrl}/company/login`);
  console.log(`  Tutor:  ${appUrl}/login`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
