/**
 * Demo Mokykla — Laisvi vaikai backlog QA (permokos, S.F., mixed sessions, tutor rekvizitai).
 * Tik org c3a00000-7e57-4000-8000-000000000001.
 *
 * Paleisk po bazinių seed:
 *   node scripts/seed-qa-demo-orgs.mjs
 *   node scripts/seed-school-extra-lessons-qa.mjs
 *   node scripts/seed-demo-school-unconfirmed-attendance-qa.mjs
 *   node scripts/seed-demo-school-backlog-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ORG_ID = 'c3a00000-7e57-4000-8000-000000000001';
const TUTOR_ID = 'c3a00000-7e57-4000-8000-000000000003';
const ADMIN_ID = 'c3a00000-7e57-4000-8000-000000000002';
const STUDENTS = {
  lukas: 'c3a00000-7e57-4000-8000-000000000005',
  gabija: 'c3a00000-7e57-4000-8000-000000000006',
  nojus: 'c3a00000-7e57-4000-8000-000000000007',
};
const GROUP_ID = 'c3a00000-7e57-4000-8000-0000000000e1';
const EXTRA_CONTRACT = 'c3a00000-7e57-4000-8000-0000000000a6';
const SUBJECT_GROUP = 'c3a00000-7e57-4000-8000-000000000011';
const SUBJECT_INDIVIDUAL = 'c3a00000-7e57-4000-8000-000000000012';

const IDS = {
  paidInvoiceSep: 'c3a00000-7e57-4000-8000-0000000000f1',
  paidInvoiceAug: 'c3a00000-7e57-4000-8000-0000000000f2',
  groupConfirmed: 'c3a00000-7e57-4000-8000-0000000000f3',
  individualConfirmed: 'c3a00000-7e57-4000-8000-0000000000f4',
  individualUnconfirmed: 'c3a00000-7e57-4000-8000-0000000000f5',
  atRiskGroup: 'c3a00000-7e57-4000-8000-0000000000f6',
  atRiskSlot: 'c3a00000-7e57-4000-8000-0000000000f7',
};

function loadEnv() {
  const path = join(ROOT, process.env.ENV_FILE || '.env');
  if (!existsSync(path)) throw new Error(`Missing env file: ${path}`);
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

function monthBounds(offset = 0) {
  const start = new Date();
  start.setDate(1);
  start.setMonth(start.getMonth() + offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setDate(0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function sessionWindow(daysAgo, durationMin = 45) {
  const end = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  end.setHours(10, 0, 0, 0);
  const start = new Date(end.getTime() - durationMin * 60 * 1000);
  return { start, end };
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: org } = await supabase.from('organizations').select('features').eq('id', ORG_ID).maybeSingle();
  if (!org) throw new Error('Demo Mokykla nerasta — paleisk seed-qa-demo-orgs.mjs');

  const features = { ...(org.features || {}), school_extra_lessons_contract: true, school_class_groups: true, tutor_lesson_status_confirmation: true };
  await supabase.from('organizations').update({ features }).eq('id', ORG_ID);

  const tutorProfile = {
    user_id: TUTOR_ID,
    organization_id: null,
    entity_type: 'individual',
    business_name: 'Demo Mokytojas UAB',
    company_code: '305000001',
    address: 'Gedimino pr. 1, Vilnius',
    contact_email: 'demo-mokykla.demo.tutor@tutlio.lt',
    contact_phone: '+37060000003',
    invoice_series: 'DM',
    next_invoice_number: 101,
    updated_at: new Date().toISOString(),
  };
  const { data: existingTutorProfile } = await supabase
    .from('invoice_profiles')
    .select('id')
    .eq('user_id', TUTOR_ID)
    .is('organization_id', null)
    .maybeSingle();
  if (existingTutorProfile?.id) {
    await supabase.from('invoice_profiles').update(tutorProfile).eq('id', existingTutorProfile.id);
  } else {
    await supabase.from('invoice_profiles').insert(tutorProfile);
  }

  const orgProfile = {
    organization_id: ORG_ID,
    user_id: null,
    entity_type: 'mb',
    business_name: 'Demo Mokykla MB',
    company_code: '305000099',
    address: 'Konstitucijos pr. 1, Vilnius',
    contact_email: 'demo-mokykla.demo.admin@tutlio.lt',
    contact_phone: '+37060000002',
    invoice_series: 'DMO',
    next_invoice_number: 501,
    updated_at: new Date().toISOString(),
  };
  const { data: existingOrgProfile } = await supabase
    .from('invoice_profiles')
    .select('id')
    .eq('organization_id', ORG_ID)
    .maybeSingle();
  if (existingOrgProfile?.id) {
    await supabase.from('invoice_profiles').update(orgProfile).eq('id', existingOrgProfile.id);
  } else {
    await supabase.from('invoice_profiles').insert(orgProfile);
  }

  await supabase.from('profiles').update({
    company_commission_percent: 45,
    company_individual_commission_percent: 35,
  }).eq('id', TUTOR_ID);

  const sep = monthBounds(-1);
  const aug = monthBounds(-2);
  const current = monthBounds(0);

  await supabase.from('school_monthly_invoices').upsert([
    {
      id: IDS.paidInvoiceSep,
      organization_id: ORG_ID,
      contract_id: EXTRA_CONTRACT,
      student_id: STUDENTS.lukas,
      period_start: sep.start,
      period_end: sep.end,
      unit_price_eur: 18,
      base_lessons: 4,
      base_amount_eur: 72,
      extra_lessons: 0,
      extra_amount_eur: 0,
      total_eur: 72,
      credit_applied_eur: 0,
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      paid_via: 'manual',
      invoice_number: 'DMO-00501',
      due_date: sep.end,
    },
    {
      id: IDS.paidInvoiceAug,
      organization_id: ORG_ID,
      contract_id: EXTRA_CONTRACT,
      student_id: STUDENTS.gabija,
      period_start: aug.start,
      period_end: aug.end,
      unit_price_eur: 18,
      base_lessons: 4,
      base_amount_eur: 72,
      extra_lessons: 0,
      extra_amount_eur: 0,
      total_eur: 72,
      credit_applied_eur: 0,
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      paid_via: 'manual',
      invoice_number: 'DMO-00502',
      due_date: aug.end,
    },
  ], { onConflict: 'id' });

  const groupOcc = sessionWindow(5);
  const individualConfirmed = sessionWindow(8);
  const individualUnconfirmed = sessionWindow(3);

  await supabase.from('sessions').upsert([
    {
      id: IDS.groupConfirmed,
      tutor_id: TUTOR_ID,
      student_id: STUDENTS.lukas,
      subject_id: SUBJECT_GROUP,
      class_group_id: GROUP_ID,
      start_time: groupOcc.start.toISOString(),
      end_time: groupOcc.end.toISOString(),
      status: 'completed',
      school_billing_kind: 'extra',
      meeting_link: 'https://meet.google.com/demo-group-confirmed',
      tutor_joined_at: new Date(groupOcc.start.getTime() + 30_000).toISOString(),
      student_joined_at: new Date(groupOcc.start.getTime() + 90_000).toISOString(),
      status_confirmed_at: groupOcc.end.toISOString(),
      status_confirmed_by: TUTOR_ID,
      price: 18,
    },
    {
      id: IDS.individualConfirmed,
      tutor_id: TUTOR_ID,
      student_id: STUDENTS.nojus,
      subject_id: SUBJECT_INDIVIDUAL,
      start_time: individualConfirmed.start.toISOString(),
      end_time: individualConfirmed.end.toISOString(),
      status: 'completed',
      school_billing_kind: 'extra',
      meeting_link: 'https://meet.google.com/demo-individual-confirmed',
      tutor_joined_at: new Date(individualConfirmed.start.getTime() + 20_000).toISOString(),
      student_joined_at: new Date(individualConfirmed.start.getTime() + 80_000).toISOString(),
      status_confirmed_at: individualConfirmed.end.toISOString(),
      status_confirmed_by: ADMIN_ID,
      price: 20,
    },
    {
      id: IDS.individualUnconfirmed,
      tutor_id: TUTOR_ID,
      student_id: STUDENTS.gabija,
      subject_id: SUBJECT_INDIVIDUAL,
      start_time: individualUnconfirmed.start.toISOString(),
      end_time: individualUnconfirmed.end.toISOString(),
      status: 'completed',
      school_billing_kind: 'extra',
      meeting_link: 'https://meet.google.com/demo-individual-unconfirmed',
      tutor_joined_at: new Date(individualUnconfirmed.start.getTime() + 20_000).toISOString(),
      student_joined_at: new Date(individualUnconfirmed.start.getTime() + 70_000).toISOString(),
      status_confirmed_at: null,
      status_confirmed_by: null,
      price: 20,
    },
  ], { onConflict: 'id' });

  const slotDate = new Date();
  slotDate.setDate(slotDate.getDate() + 4);
  const weekday = slotDate.getDay() === 0 ? 7 : slotDate.getDay();
  const slotStart = '16:00:00';

  await supabase.from('school_class_groups').upsert({
    id: IDS.atRiskGroup,
    organization_id: ORG_ID,
    tutor_id: TUTOR_ID,
    name: 'QA Grupė rizika (1/2)',
    minimum_active_students: 2,
    duration_minutes: 45,
    is_active: true,
    suspension_started_at: null,
    minimum_risk_warning_occurrence_at: null,
  }, { onConflict: 'id' });

  await supabase.from('school_class_group_slots').upsert({
    id: IDS.atRiskSlot,
    group_id: IDS.atRiskGroup,
    weekday,
    start_time: slotStart,
    end_time: '16:45:00',
  }, { onConflict: 'id' });

  await supabase.from('school_class_group_members').upsert({
    group_id: IDS.atRiskGroup,
    student_id: STUDENTS.lukas,
    joined_at: new Date().toISOString(),
  }, { onConflict: 'group_id,student_id' });

  console.log('\n=== Demo Mokykla backlog QA seed ===');
  console.log('Login: http://localhost:3000/school/login');
  console.log('  demo-mokykla.demo.admin@tutlio.lt / TutlioQaDemo2026!');
  console.log('\nPermokos: 2 apmokėtos S.F. (Lukas rugsėjis, Gabija rugpjūtis)');
  console.log('Mokytojo S.F.: tutor invoice_profiles su DM serija');
  console.log('Užsiėmimai: 1 grupinis patvirtintas + 1 individualus patvirtintas + 1 nepatvirtintas');
  console.log('Grupės rizika: QA Grupė rizika (1/2), slotas po ~4 d.');
  console.log(`Einamasis mėnuo S.F. peržiūrai: ${current.start} – ${current.end}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
