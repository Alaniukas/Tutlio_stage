/**
 * Pro Klasė QA — future sessions for /company/stats forward forecast QA.
 * Safe to re-run (upsert by id). Only touches org b0a00000-…0001.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(ROOT, '.env');
if (!existsSync(envPath)) throw new Error('Missing .env');

const env = {};
for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}

const sb = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = 'b0a00000-7e57-4000-8000-000000000001';
const TUTOR = 'b0a00000-7e57-4000-8000-000000000003';
const STUDENTS = {
  lukas: 'b0a00000-7e57-4000-8000-000000000005',
  gabija: 'b0a00000-7e57-4000-8000-000000000006',
  nojus: 'b0a00000-7e57-4000-8000-000000000007',
};
const SUBJECTS = {
  math: 'b0a00000-7e57-4000-8000-000000000011',
  english: 'b0a00000-7e57-4000-8000-000000000012',
  trial: 'b0a00000-7e57-4000-8000-000000000013',
};

/** Next calendar month in Europe/Vilnius-ish local wall times. */
function nextMonthSlots() {
  const now = new Date();
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const month = (now.getMonth() + 1) % 12;
  const pad = (n) => String(n).padStart(2, '0');
  const mk = (day, hour, minute = 0) =>
    new Date(`${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+02:00`);

  return [
    { id: 'b0a00000-7e57-4000-8000-000000000051', student: STUDENTS.lukas, subject: SUBJECTS.math, start: mk(3, 17), price: 29, topic: 'QA prognozė: algebra' },
    { id: 'b0a00000-7e57-4000-8000-000000000052', student: STUDENTS.gabija, subject: SUBJECTS.english, start: mk(5, 16), price: 27, topic: 'QA prognozė: speaking' },
    { id: 'b0a00000-7e57-4000-8000-000000000053', student: STUDENTS.nojus, subject: SUBJECTS.math, start: mk(7, 18, 30), price: 31, topic: 'QA prognozė: geometrija' },
    { id: 'b0a00000-7e57-4000-8000-000000000054', student: STUDENTS.lukas, subject: SUBJECTS.english, start: mk(10, 17), price: 27, topic: 'QA prognozė: grammar' },
    { id: 'b0a00000-7e57-4000-8000-000000000055', student: STUDENTS.gabija, subject: SUBJECTS.math, start: mk(12, 16), price: 29, topic: 'QA prognozė: funkcijos' },
    { id: 'b0a00000-7e57-4000-8000-000000000056', student: STUDENTS.nojus, subject: SUBJECTS.trial, start: mk(14, 15), price: 10, topic: 'QA prognozė: bandomoji' },
    { id: 'b0a00000-7e57-4000-8000-000000000057', student: STUDENTS.lukas, subject: SUBJECTS.math, start: mk(18, 17, 30), price: 29, topic: 'QA prognozė: trupmenos' },
    { id: 'b0a00000-7e57-4000-8000-000000000058', student: STUDENTS.gabija, subject: SUBJECTS.english, start: mk(22, 16, 30), price: 27, topic: 'QA prognozė: rašymas' },
  ];
}

const slots = nextMonthSlots();
const rows = slots.map((slot) => {
  const end = new Date(slot.start.getTime() + 60 * 60 * 1000);
  return {
    id: slot.id,
    tutor_id: TUTOR,
    student_id: slot.student,
    subject_id: slot.subject,
    start_time: slot.start.toISOString(),
    end_time: end.toISOString(),
    status: 'active',
    paid: false,
    payment_status: 'unpaid',
    price: slot.price,
    topic: slot.topic,
    tutor_comment: null,
  };
});

const { data: tutorRow, error: tutorErr } = await sb
  .from('profiles')
  .select('id, organization_id')
  .eq('id', TUTOR)
  .maybeSingle();
if (tutorErr) throw tutorErr;
if (!tutorRow?.organization_id) {
  throw new Error('Pro Klasė QA tutor missing — run scripts/seed-qa-demo-orgs.mjs first');
}

for (const row of rows) {
  const { error } = await sb.from('sessions').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

const monthLabel = rows[0]?.start_time?.slice(0, 7) ?? '?';
const totalRevenue = rows.reduce((sum, r) => sum + Number(r.price || 0), 0);
console.log(`Pro Klasė QA forward stats seed OK (${ORG_ID})`);
console.log(`Month: ${monthLabel} | sessions: ${rows.length} | projected revenue: €${totalRevenue.toFixed(2)}`);
console.log('Login: proklase.qa.admin@tutlio.lt / TutlioQaDemo2026! → /company/stats → filter "Kitas mėnuo"');
