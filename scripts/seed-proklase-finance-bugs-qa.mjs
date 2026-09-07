/**
 * Fake data for Pro Klasė finance-bugs QA (atlygis / bandomosios / statistika).
 *
 * Scenarios:
 *  A) Rimantas-type: 1 completed regular (27 € klientui) + 1 future paid trial (10 €) → pravesta 1, korep. 15 €
 *  B) Admin tutor rate 0: completed 33 € klientui → korep. 0 € (ne 33 €)
 *  C) Intake: 2 tutors + Saturday windows for add-student / 2-slot trial toggle manual QA
 *  D) Mano Korepetitorius (plain company org): completed + future paid → pravesta tik completed, uždirbta = tarifas
 *
 * Usage:
 *   node scripts/seed-qa-demo-orgs.mjs
 *   node scripts/seed-proklase-finance-bugs-qa.mjs
 *
 * Requires .env.local (or .env) with stage Supabase keys.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PASSWORD = 'TutlioQaDemo2026!';

const PK_ORG = 'b0a00000-7e57-4000-8000-000000000001';
const MK_ORG = 'c1a00000-7e57-4000-8000-000000000001';

const TUTOR_ONA = 'b0a00000-7e57-4000-8000-000000000003';
const TUTOR_RUTA = 'b0a00000-7e57-4000-8000-0000000000e1';
const TUTOR_ADMIN_ZERO = 'b0a00000-7e57-4000-8000-0000000000e2';
const TUTOR_JONAS = 'b0a00000-7e57-4000-8000-0000000000e3';

const STUDENT_RIMANTAS = 'b0a00000-7e57-4000-8000-0000000000e4';
const STUDENT_INTAKE_EMPTY = 'b0a00000-7e57-4000-8000-0000000000e5';

const SUBJECT_MATH_RUTA = 'b0a00000-7e57-4000-8000-0000000000eb';
const SUBJECT_TRIAL_RUTA = 'b0a00000-7e57-4000-8000-0000000000ea';
const SUBJECT_MATH_JONAS = 'b0a00000-7e57-4000-8000-0000000000ee';
const SUBJECT_ADMIN_MATH = 'b0a00000-7e57-4000-8000-0000000000ef';

const SESSION_RIM_COMPLETED = 'b0a00000-7e57-4000-8000-0000000000e6';
const SESSION_RIM_FUTURE_TRIAL = 'b0a00000-7e57-4000-8000-0000000000e7';
const PKG_RIM_TRIAL = 'b0a00000-7e57-4000-8000-0000000000e8';
const SESSION_ADMIN_ZERO = 'b0a00000-7e57-4000-8000-0000000000e9';

const AVAIL_ONA_INTAKE = 'b0a00000-7e57-4000-8000-0000000000ec';
const AVAIL_JONAS_INTAKE = 'b0a00000-7e57-4000-8000-0000000000ed';

const MK_TUTOR = 'c1a00000-7e57-4000-8000-000000000003';
const MK_STUDENT = 'c1a00000-7e57-4000-8000-000000000005';
const MK_SUBJECT_MATH = 'c1a00000-7e57-4000-8000-000000000011';
const MK_SESSION_COMPLETED = 'c1a00000-7e57-4000-8000-0000000000f1';
const MK_SESSION_FUTURE_PAID = 'c1a00000-7e57-4000-8000-0000000000f2';

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

/** Next Saturday on or after today (local), formatted YYYY-MM-DD. */
function nextSaturdayYmd() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const add = day === 6 ? 7 : (6 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

async function ensureAuthUser(supabase, { id, email, fullName, password }) {
  const { data: existing } = await supabase.auth.admin.getUserById(id);
  if (existing?.user) {
    await supabase.auth.admin.updateUserById(id, { email, password, email_confirm: true });
    return;
  }
  const { error } = await supabase.auth.admin.createUser({
    id,
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`auth ${email}: ${error.message}`);
}

async function upsertTutor(supabase, row) {
  await ensureAuthUser(supabase, {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    password: PASSWORD,
  });
  const { error } = await supabase.from('profiles').upsert(
    {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      organization_id: row.organization_id,
      company_commission_percent: row.company_commission_percent,
      has_active_license: true,
      enable_manual_student_payments: false,
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(`profile ${row.email}: ${error.message}`);
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: pkOrg } = await supabase.from('organizations').select('id').eq('id', PK_ORG).maybeSingle();
  if (!pkOrg) throw new Error('Pro Klasė QA org missing — run: node scripts/seed-qa-demo-orgs.mjs');

  const intakeSat = nextSaturdayYmd();
  const year = new Date().getFullYear();
  const septYmd = `${year}-09-02`;
  const futureTrialYmd = `${year}-09-09`;
  const adminZeroYmd = `${year}-09-01`;

  await supabase.from('profiles').update({ company_commission_percent: 15 }).eq('id', TUTOR_ONA);

  await upsertTutor(supabase, {
    id: TUTOR_RUTA,
    email: 'proklase.qa.tutor-rimantas@tutlio.lt',
    full_name: 'QA Tutorė Rūta (Rimantas stat.)',
    organization_id: PK_ORG,
    company_commission_percent: 15,
  });

  await upsertTutor(supabase, {
    id: TUTOR_ADMIN_ZERO,
    email: 'proklase.qa.tutor-admin-zero@tutlio.lt',
    full_name: 'QA Admin korep. (tarifas 0)',
    organization_id: PK_ORG,
    company_commission_percent: 0,
  });

  await upsertTutor(supabase, {
    id: TUTOR_JONAS,
    email: 'proklase.qa.tutor-jonas-intake@tutlio.lt',
    full_name: 'QA Tutorius Jonas (intake)',
    organization_id: PK_ORG,
    company_commission_percent: 15,
  });

  const studentBase = {
    organization_id: PK_ORG,
    payer_name: 'QA Mokėtojas',
    payer_email: 'alaniukasa@gmail.com',
    payer_phone: '+37060000999',
    grade: '9 kl.',
    pricing_lessons_per_week: 1,
  };

  const { error: rimStuErr } = await supabase.from('students').upsert(
    {
      ...studentBase,
      id: STUDENT_RIMANTAS,
      tutor_id: TUTOR_RUTA,
      full_name: 'QA Rimantas (statistika)',
      email: 'proklase.qa.rimantas@tutlio.lt',
    },
    { onConflict: 'id' },
  );
  if (rimStuErr) throw new Error(`student rimantas: ${rimStuErr.message}`);

  const { error: emptyStuErr } = await supabase.from('students').upsert(
    {
      ...studentBase,
      id: STUDENT_INTAKE_EMPTY,
      tutor_id: TUTOR_ONA,
      full_name: 'QA Intake tuščias (0 pamokų)',
      email: null,
    },
    { onConflict: 'id' },
  );
  if (emptyStuErr) throw new Error(`student intake empty: ${emptyStuErr.message}`);

  await supabase.from('sessions').delete().eq('student_id', STUDENT_INTAKE_EMPTY);

  for (const sub of [
    { id: SUBJECT_MATH_RUTA, tutor_id: TUTOR_RUTA, name: 'Matematika', price: 27, is_trial: false },
    { id: SUBJECT_TRIAL_RUTA, tutor_id: TUTOR_RUTA, name: 'Bandomoji pamoka', price: 10, is_trial: true },
    { id: SUBJECT_MATH_JONAS, tutor_id: TUTOR_JONAS, name: 'Matematika', price: 27, is_trial: false },
    {
      id: SUBJECT_ADMIN_MATH,
      tutor_id: TUTOR_ADMIN_ZERO,
      name: 'Matematika',
      price: 33,
      is_trial: false,
    },
  ]) {
    const { error } = await supabase.from('subjects').upsert(
      { ...sub, duration_minutes: 60 },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`subject ${sub.id}: ${error.message}`);
  }

  await supabase.from('lesson_packages').upsert(
    {
      id: PKG_RIM_TRIAL,
      tutor_id: TUTOR_RUTA,
      student_id: STUDENT_RIMANTAS,
      subject_id: SUBJECT_TRIAL_RUTA,
      total_lessons: 1,
      available_lessons: 1,
      reserved_lessons: 0,
      completed_lessons: 0,
      price_per_lesson: 10,
      total_price: 10.4,
      paid: true,
      payment_status: 'paid',
      paid_at: vilniusIso(futureTrialYmd, '10:00'),
      active: true,
      payment_method: 'stripe',
    },
    { onConflict: 'id' },
  );

  const sessions = [
    {
      id: SESSION_RIM_COMPLETED,
      tutor_id: TUTOR_RUTA,
      student_id: STUDENT_RIMANTAS,
      subject_id: SUBJECT_MATH_RUTA,
      start_time: vilniusIso(septYmd, '17:00'),
      end_time: vilniusIso(septYmd, '18:00'),
      status: 'completed',
      paid: true,
      payment_status: 'paid',
      price: 27,
      topic: 'QA Rimantas — įvykusi regular (27 €)',
    },
    {
      id: SESSION_RIM_FUTURE_TRIAL,
      tutor_id: TUTOR_RUTA,
      student_id: STUDENT_RIMANTAS,
      subject_id: SUBJECT_TRIAL_RUTA,
      lesson_package_id: PKG_RIM_TRIAL,
      start_time: vilniusIso(futureTrialYmd, '18:00'),
      end_time: vilniusIso(futureTrialYmd, '18:45'),
      status: 'active',
      paid: true,
      payment_status: 'paid',
      price: 10,
      topic: 'QA Rimantas — būsima bandomoji (10 €, nepravesta)',
    },
    {
      id: SESSION_ADMIN_ZERO,
      tutor_id: TUTOR_ADMIN_ZERO,
      student_id: STUDENT_RIMANTAS,
      subject_id: SUBJECT_ADMIN_MATH,
      start_time: vilniusIso(adminZeroYmd, '10:00'),
      end_time: vilniusIso(adminZeroYmd, '11:00'),
      status: 'completed',
      paid: false,
      payment_status: 'unpaid',
      price: 33,
      topic: 'QA Admin korep. — completed, tarifas 0',
    },
  ];

  for (const sess of sessions) {
    const { error } = await supabase.from('sessions').upsert(sess, { onConflict: 'id' });
    if (error) throw new Error(`session ${sess.id}: ${error.message}`);
  }

  for (const row of [
    {
      id: AVAIL_ONA_INTAKE,
      tutor_id: TUTOR_ONA,
      specific_date: intakeSat,
      day_of_week: new Date(intakeSat + 'T12:00:00').getDay(),
      start_time: '10:00:00',
      end_time: '12:00:00',
      is_recurring: false,
    },
    {
      id: AVAIL_JONAS_INTAKE,
      tutor_id: TUTOR_JONAS,
      specific_date: intakeSat,
      day_of_week: new Date(intakeSat + 'T12:00:00').getDay(),
      start_time: '14:00:00',
      end_time: '16:00:00',
      is_recurring: false,
    },
  ]) {
    const { error } = await supabase.from('availability').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`availability ${row.id}: ${error.message}`);
  }

  const { data: mkOrg } = await supabase.from('organizations').select('id').eq('id', MK_ORG).maybeSingle();
  if (mkOrg) {
    await supabase.from('profiles').update({ company_commission_percent: 18 }).eq('id', MK_TUTOR);

    const mkCompletedStart = new Date();
    mkCompletedStart.setDate(mkCompletedStart.getDate() - 5);
    mkCompletedStart.setHours(16, 0, 0, 0);
    const mkCompletedEnd = new Date(mkCompletedStart);
    mkCompletedEnd.setHours(17, 0, 0, 0);

    const mkFutureStart = new Date();
    mkFutureStart.setDate(mkFutureStart.getDate() + 14);
    mkFutureStart.setHours(16, 0, 0, 0);
    const mkFutureEnd = new Date(mkFutureStart);
    mkFutureEnd.setHours(17, 0, 0, 0);

    for (const sess of [
      {
        id: MK_SESSION_COMPLETED,
        tutor_id: MK_TUTOR,
        student_id: MK_STUDENT,
        subject_id: MK_SUBJECT_MATH,
        start_time: mkCompletedStart.toISOString(),
        end_time: mkCompletedEnd.toISOString(),
        status: 'completed',
        paid: true,
        payment_status: 'paid',
        price: 40,
        topic: 'MK QA — įvykusi (40 € klientui, 18 € korep.)',
      },
      {
        id: MK_SESSION_FUTURE_PAID,
        tutor_id: MK_TUTOR,
        student_id: MK_STUDENT,
        subject_id: MK_SUBJECT_MATH,
        start_time: mkFutureStart.toISOString(),
        end_time: mkFutureEnd.toISOString(),
        status: 'active',
        paid: true,
        payment_status: 'paid',
        price: 40,
        topic: 'MK QA — būsima apmokėta (neturi skaičiuotis kaip pravesta)',
      },
    ]) {
      const { error } = await supabase.from('sessions').upsert(sess, { onConflict: 'id' });
      if (error) throw new Error(`mk session ${sess.id}: ${error.message}`);
    }
  }

  const appUrl = (env.VITE_APP_URL || env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  console.log('\n✅ Pro Klasė finance-bugs QA seed done.\n');
  console.log('Slaptažodis visiems:', PASSWORD);
  console.log('\n── A) Rimantas statistika (Pro Klasė) ──');
  console.log(`  Admin:     ${appUrl}/company/login  proklase.qa.admin@tutlio.lt`);
  console.log(`  Korep:     ${appUrl}/login  proklase.qa.tutor-rimantas@tutlio.lt`);
  console.log('  Mokinys:   QA Rimantas (statistika)');
  console.log(`  Įvykusi:   ${septYmd} 17:00 regular 27 € → korep. 15 €`);
  console.log(`  Būsima:    ${futureTrialYmd} 18:00 trial 10 € (apmokėta) → nepravesta`);
  console.log('  Rugsėjį Statistika /finance: pravesta ≥1, korep. dalis +15 € (ne +37 €)');
  console.log('\n── B) Admin korep. tarifas 0 ──');
  console.log(`  Korep:     ${appUrl}/login  proklase.qa.tutor-admin-zero@tutlio.lt`);
  console.log(`  Pamoka:    ${adminZeroYmd} completed 33 € klientui → /finance rodo 0 €`);
  console.log('\n── C) Intake (2 slotai / varnelė) ──');
  console.log(`  Data:      ${intakeSat} (šeštadienis)`);
  console.log('  Ona 10:00–12:00, Jonas 14:00–16:00');
  console.log('  Admin → Pridėti mokinį → Ieškoti pagal laisvą laiką');
  console.log('  Tvarkaraštis auto-trial: mokinys „QA Intake tuščias (0 pamokų)“');
  console.log('\n── D) Paprasta įmonė (ne PK) ──');
  console.log(`  Admin:     ${appUrl}/company/login?org=manokorepetitorius`);
  console.log('           manokorepetitorius.demo.admin@tutlio.lt');
  console.log('  Korep kortelė: uždirbta = 18 € (ne 40 €); pravesta +1, ne +2');
  console.log('\nUnit testai:');
  console.log('  npx vitest run tests/lib/proKlaseTutorPay.test.ts tests/lib/proklase-admin-finance.test.ts tests/lib/org-tutor-lesson-pay.test.ts tests/lib/proKlaseStudentLessonPlan.test.ts');
  console.log('\nPilnas rankinis planas: test_proklase_finance_bugs.md\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
