/**
 * Pro Klasė QA — mokėjimo UI pagal payment_payer (Mantvidas incident).
 *
 * Atnaujina esamus seed mokinius (ne kuria naujų ID):
 *  A) Lukas — payment_payer=parent, tas pats el. kaip mokėtojas, per_lesson
 *  B) Gabija — payment_payer=parent, mokėtojas alaniukasa@gmail.com
 *
 * Usage:
 *   node scripts/seed-qa-demo-orgs.mjs
 *   node scripts/seed-proklase-payer-view-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PASSWORD = 'TutlioQaDemo2026!';

const ORG_ID = 'b0a00000-7e57-4000-8000-000000000001';
const TUTOR_ONA = 'b0a00000-7e57-4000-8000-000000000003';
const SUBJECT_MATH = 'b0a00000-7e57-4000-8000-000000000011';

const STUDENT_LUKAS = 'b0a00000-7e57-4000-8000-000000000005';
const STUDENT_GABIJA = 'b0a00000-7e57-4000-8000-000000000006';
const SESSION_GABIJA = 'b0a00000-7e57-4000-8000-0000000000d5';

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

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: org } = await supabase.from('organizations').select('id').eq('id', ORG_ID).maybeSingle();
  if (!org) throw new Error('Pro Klasė QA org missing — run: node scripts/seed-qa-demo-orgs.mjs');

  const lukasEmail = 'proklase.qa.student@tutlio.lt';

  const { error: lukasErr } = await supabase.from('students').update({
    payment_payer: 'parent',
    payer_email: lukasEmail,
    payer_name: 'QA Mama (tas pats el.)',
    payment_model: 'per_lesson',
  }).eq('id', STUDENT_LUKAS);
  if (lukasErr) throw new Error(`Lukas: ${lukasErr.message}`);

  const { error: gabijaErr } = await supabase.from('students').update({
    payment_payer: 'parent',
    payer_email: 'alaniukasa@gmail.com',
    payer_name: 'QA Mama (kitas el.)',
    payment_model: 'per_lesson',
  }).eq('id', STUDENT_GABIJA);
  if (gabijaErr) throw new Error(`Gabija: ${gabijaErr.message}`);

  const start = new Date();
  start.setDate(start.getDate() + 5);
  start.setHours(15, 30, 0, 0);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + 60);

  const { error: sessErr } = await supabase.from('sessions').upsert({
    id: SESSION_GABIJA,
    tutor_id: TUTOR_ONA,
    student_id: STUDENT_GABIJA,
    subject_id: SUBJECT_MATH,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    status: 'active',
    paid: false,
    payment_status: 'unpaid',
    price: 29,
    topic: 'Gabija — mokėtojas kitas el.',
    meeting_link: null,
  }, { onConflict: 'id' });
  if (sessErr) throw new Error(`Gabija session: ${sessErr.message}`);

  console.log('\n✅ Pro Klasė payer-view QA seed done.\n');
  console.log('Slaptažodis:', PASSWORD);
  console.log('\nScenarijus A (tas pats el. = mokėtojas):');
  console.log('  http://localhost:3000/login →', lukasEmail);
  console.log('  → /student/sessions — kaina + Mokėti');
  console.log('\nScenarijus B (skirtingas mokėtojas):');
  console.log('  http://localhost:3000/login → proklase.qa.student2@tutlio.lt');
  console.log('  → /student/sessions — tik statusas, be Mokėti');
  console.log('\nPilnas planas: test_proklase_qa.md §10–14');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
