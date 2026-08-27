/**
 * Seeds Demo Mokykla (+ optional Laisvi vaikai template) for school extra-lessons QA.
 * - Uploads DOCX as permanent "Papildomų pamokų sutartis" template
 * - Creates students across enrollment statuses / municipalities / debt
 * - Class group + slots + members
 * - Pending extra-lessons contract with accept token URL
 * - Past session (missed join) + monthly invoice row
 * - Offer / accept emails go to alaniukasa@gmail.com (payer_email)
 *
 * Usage:
 *   ENV_FILE=.env.local node scripts/seed-school-extra-lessons-qa.mjs
 *   ENV_FILE=.env.vercel.stage node scripts/seed-school-extra-lessons-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash, randomUUID } from 'crypto';
import mammoth from 'mammoth';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DEMO_ORG = 'c3a00000-7e57-4000-8000-000000000001';
const LAISVI_ORG = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
const TUTOR_ID = 'c3a00000-7e57-4000-8000-000000000003';

const DOCX_CANDIDATES = [
  process.env.EXTRA_LESSONS_DOCX,
  join(ROOT, 'docs', 'Tutlio_papildomu_pamoku_sutartis_pataisyta.docx'),
  'c:/Users/Alanas/Downloads/Tutlio_papildomu_pamoku_sutartis_pataisyta (1).docx',
].filter(Boolean);

const IDS = {
  group: 'c3a00000-7e57-4000-8000-0000000000a1',
  slot: 'c3a00000-7e57-4000-8000-0000000000a2',
  templateDemo: 'c3a00000-7e57-4000-8000-0000000000a3',
  templateLaisvi: 'c3a00000-7e57-4000-8000-0000000000a4',
  contractPending: 'c3a00000-7e57-4000-8000-0000000000a5',
  contractAccepted: 'c3a00000-7e57-4000-8000-0000000000a6',
  sessionMissed: 'c3a00000-7e57-4000-8000-0000000000a7',
  sessionJoined: 'c3a00000-7e57-4000-8000-0000000000a8',
  monthlyInv: 'c3a00000-7e57-4000-8000-0000000000a9',
  recording: 'c3a00000-7e57-4000-8000-0000000000aa',
  students: {
    activeVilnius: 'c3a00000-7e57-4000-8000-0000000000c1',
    activeKaunasDebt: 'c3a00000-7e57-4000-8000-0000000000c2',
    future: 'c3a00000-7e57-4000-8000-0000000000c3',
    left: 'c3a00000-7e57-4000-8000-0000000000c4',
    graduated: 'c3a00000-7e57-4000-8000-0000000000c5',
    activeKlaipeda: 'c3a00000-7e57-4000-8000-0000000000c6',
  },
};

function loadEnv() {
  const candidates = [
    process.env.ENV_FILE,
    '.env.local',
    '.env.vercel.stage',
    '.env',
  ].filter(Boolean);
  const env = { ...process.env };
  for (const rel of candidates) {
    const path = rel.includes('/') || rel.includes('\\') ? rel : join(ROOT, rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!env[m[1]]) env[m[1]] = v;
    }
    console.log('Loaded env from', path);
    break;
  }
  return env;
}

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function randomToken() {
  return `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
}

async function uploadTemplate(supabase, { orgId, templateId, bytes, bodyText }) {
  const path = `${orgId}/templates/papildomu-pamoku-sutartis-${templateId}.docx`;
  const { error: upErr } = await supabase.storage.from('school-contracts').upload(path, bytes, {
    upsert: true,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  if (upErr) console.warn('storage upload', orgId, upErr.message);

  const { data: pub } = supabase.storage.from('school-contracts').getPublicUrl(path);
  const row = {
    id: templateId,
    organization_id: orgId,
    name: 'Papildomų pamokų sutartis (DOCX)',
    body: bodyText,
    annual_fee_default: 0,
    is_default: false,
    pdf_url: pub.publicUrl,
  };
  const { error } = await supabase.from('school_contract_templates').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`template upsert ${orgId}: ${error.message}`);
  return { path, publicUrl: pub.publicUrl };
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  if (String(url).includes('xklzjhfztjxltrdkplog')) {
    throw new Error('Wrong Supabase project (dead). Use .env.local / .env.vercel.stage (cuhciqwmqfuajeeqjjbm)');
  }

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const docxPath = DOCX_CANDIDATES.find((p) => existsSync(p));
  if (!docxPath) throw new Error('DOCX not found. Set EXTRA_LESSONS_DOCX or place file in Downloads.');
  const bytes = readFileSync(docxPath);
  const extracted = await mammoth.extractRawText({ buffer: bytes });
  const bodyText = String(extracted.value || '').trim();
  if (bodyText.length < 500) throw new Error('DOCX text extraction too short');
  console.log('DOCX:', docxPath, 'chars:', bodyText.length);

  // Feature flags (idempotent)
  for (const orgId of [DEMO_ORG, LAISVI_ORG]) {
    const { data: org } = await supabase.from('organizations').select('features').eq('id', orgId).maybeSingle();
    const features = {
      ...(org?.features || {}),
      school_extra_lessons_contract: true,
      school_class_groups: true,
      school_join_no_show: true,
      school_teacher_labels: true,
      school_lesson_recordings: true,
    };
    await supabase.from('organizations').update({ features }).eq('id', orgId);
  }

  await uploadTemplate(supabase, {
    orgId: DEMO_ORG,
    templateId: IDS.templateDemo,
    bytes,
    bodyText,
  });
  await uploadTemplate(supabase, {
    orgId: LAISVI_ORG,
    templateId: IDS.templateLaisvi,
    bytes,
    bodyText,
  });
  console.log('Templates uploaded for Demo Mokykla + Laisvi vaikai');

  // Ensure tutor profile exists for Demo
  const { data: tutor } = await supabase.from('profiles').select('id').eq('id', TUTOR_ID).maybeSingle();
  if (!tutor) {
    console.warn('Demo tutor missing — run seed-qa-demo-orgs.mjs first. Continuing with students only if tutor_id nullable.');
  }

  const students = [
    {
      id: IDS.students.activeVilnius,
      full_name: 'QA Aktyvus Vilnius',
      email: 'qa.school.active.vilnius@tutlio.lt',
      grade: '5 klasė',
      school_year: '2026/2027',
      enrollment_status: 'active',
      municipality: 'Vilnius',
      media_publicity_consent: 'agree',
      payer_name: 'Tėvas Vilnius',
      payer_email: 'alaniukasa@gmail.com',
      payer_phone: '+37060000001',
      has_debt_manual: false,
    },
    {
      id: IDS.students.activeKaunasDebt,
      full_name: 'QA Aktyvus Kaunas Skola',
      email: 'qa.school.active.kaunas@tutlio.lt',
      grade: '7 klasė',
      school_year: '2026/2027',
      enrollment_status: 'active',
      municipality: 'Kaunas',
      media_publicity_consent: 'disagree',
      payer_name: 'Mama Kaunas',
      payer_email: 'alaniukasa@gmail.com',
      payer_phone: '+37060000002',
      has_debt_manual: true,
    },
    {
      id: IDS.students.future,
      full_name: 'QA Būsimas Klaipėda',
      email: 'qa.school.future@tutlio.lt',
      grade: '3 klasė',
      school_year: '2027/2028',
      enrollment_status: 'future',
      municipality: 'Klaipėda',
      media_publicity_consent: null,
      payer_name: 'Tėvas Future',
      payer_email: 'alaniukasa@gmail.com',
      payer_phone: '+37060000003',
      has_debt_manual: false,
    },
    {
      id: IDS.students.left,
      full_name: 'QA Išėjęs Šiauliai',
      email: 'qa.school.left@tutlio.lt',
      grade: '6 klasė',
      school_year: '2026/2027',
      enrollment_status: 'left',
      municipality: 'Šiauliai',
      media_publicity_consent: 'agree',
      payer_name: 'Mama Left',
      payer_email: 'alaniukasa@gmail.com',
      payer_phone: '+37060000004',
      exit_date: '2026-03-15',
      exit_reason: 'chose_other_school',
      exit_note: 'Perėjo į kitą mokyklą (QA)',
      has_debt_manual: true,
    },
    {
      id: IDS.students.graduated,
      full_name: 'QA Baigęs Panevėžys',
      email: 'qa.school.graduated@tutlio.lt',
      grade: '10 klasė',
      school_year: '2025/2026',
      enrollment_status: 'graduated',
      municipality: 'Panevėžys',
      media_publicity_consent: 'agree',
      payer_name: 'Tėvas Grad',
      payer_email: 'alaniukasa@gmail.com',
      payer_phone: '+37060000005',
      exit_date: '2026-06-13',
      exit_reason: 'other',
      exit_note: 'Baigė programą',
      has_debt_manual: false,
    },
    {
      id: IDS.students.activeKlaipeda,
      full_name: 'QA Aktyvus Klaipėda Extra',
      email: 'qa.school.active.klaipeda@tutlio.lt',
      grade: '4 klasė',
      school_year: '2026/2027',
      enrollment_status: 'active',
      municipality: 'Klaipėda',
      media_publicity_consent: 'agree',
      payer_name: 'Mama Extra',
      payer_email: 'alaniukasa@gmail.com',
      payer_phone: '+37060000006',
      has_debt_manual: false,
    },
  ];

  for (const s of students) {
    const row = {
      ...s,
      tutor_id: TUTOR_ID,
      organization_id: DEMO_ORG,
    };
    const { error } = await supabase.from('students').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`student ${s.full_name}: ${error.message}`);
  }
  console.log('Students upserted:', students.length);

  // Class group
  const { error: gErr } = await supabase.from('school_class_groups').upsert({
    id: IDS.group,
    organization_id: DEMO_ORG,
    tutor_id: TUTOR_ID,
    name: 'QA Matematika 5kl (grupė)',
    school_year_start: '2026-09-01',
    school_year_end: '2027-06-13',
    platform: 'Google Meet',
    duration_minutes: 45,
    meeting_link: 'https://meet.google.com/qa-school-math-demo',
  }, { onConflict: 'id' });
  if (gErr) throw new Error(`group: ${gErr.message}`);

  await supabase.from('school_class_group_slots').upsert({
    id: IDS.slot,
    group_id: IDS.group,
    weekday: 2,
    start_time: '16:00',
    end_time: '16:45',
  }, { onConflict: 'id' });

  for (const sid of [IDS.students.activeVilnius, IDS.students.activeKlaipeda, IDS.students.activeKaunasDebt]) {
    await supabase.from('school_class_group_members').upsert({
      group_id: IDS.group,
      student_id: sid,
    }, { onConflict: 'group_id,student_id' });
  }

  // Pending extra-lessons contract + accept token
  const orderPending = {
    service_name: 'QA Matematika 5kl',
    service_type: 'group',
    platform: 'Google Meet',
    duration_minutes: 45,
    schedule_label: 'Antradieniais 16:00–16:45',
    start_date: '2026-09-01',
    end_date: '2027-06-13',
    unit_price_eur: 18,
    base_lessons_per_month: 8,
    indicative_monthly_eur: 144,
    revision_label: 'QA-v1',
    group_id: IDS.group,
    group_name: 'QA Matematika 5kl (grupė)',
    vat_status: 'PVM neapmokestinama',
    school_email: 'demo-mokykla.demo.admin@tutlio.lt',
    school_phone: '',
    data_protection_contact: 'demo-mokykla.demo.admin@tutlio.lt',
    schedule_slots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
    individual_cancel_terms: '',
  };

  const filledPending = bodyText
    .replaceAll('{{sutarties_nr}}', 'PP-QA-PENDING')
    .replaceAll('{{vaiko_vardas_pavarde}}', 'QA Aktyvus Vilnius')
    .replaceAll('{{paslaugos_pavadinimas}}', orderPending.service_name);

  const { error: c1 } = await supabase.from('school_contracts').upsert({
    id: IDS.contractPending,
    organization_id: DEMO_ORG,
    student_id: IDS.students.activeVilnius,
    template_id: IDS.templateDemo,
    contract_number: 'PP-QA-PENDING',
    filled_body: filledPending,
    annual_fee: 144,
    signing_status: 'sent',
    sent_at: new Date().toISOString(),
    kind: 'extra_lessons',
    order_snapshot: orderPending,
    revision_label: 'QA-v1',
    base_lessons_per_month: 8,
    unit_price_eur: 18,
    class_group_id: IDS.group,
  }, { onConflict: 'id' });
  if (c1) throw new Error(`contract pending: ${c1.message}`);

  const acceptToken = 'qaextra' + randomToken().slice(0, 40);
  await supabase.from('school_contract_completion_tokens').delete().eq('contract_id', IDS.contractPending);
  await supabase.from('school_contract_completion_tokens').insert({
    contract_id: IDS.contractPending,
    token: acceptToken,
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString(),
  });

  // Accepted contract for billing student
  const orderAccepted = {
    ...orderPending,
    service_name: 'QA Klaipėda Extra',
    group_id: IDS.group,
  };
  const acceptedBody = `${filledPending}\n\nACCEPTED QA`;
  const { error: c2 } = await supabase.from('school_contracts').upsert({
    id: IDS.contractAccepted,
    organization_id: DEMO_ORG,
    student_id: IDS.students.activeKlaipeda,
    template_id: IDS.templateDemo,
    contract_number: 'PP-QA-ACCEPTED',
    filled_body: acceptedBody,
    annual_fee: 144,
    signing_status: 'signed',
    sent_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    kind: 'extra_lessons',
    order_snapshot: orderAccepted,
    revision_label: 'QA-v1',
    base_lessons_per_month: 8,
    unit_price_eur: 18,
    class_group_id: IDS.group,
    accepted_at: new Date(Date.now() - 86400000 * 9).toISOString(),
    accepted_terms: true,
    start_within_14_days: true,
    recording_consent: true,
    document_sha256: sha256Hex(acceptedBody),
  }, { onConflict: 'id' });
  if (c2) throw new Error(`contract accepted: ${c2.message}`);

  // Sessions: one missed join (past), one joined
  const startMissed = new Date(Date.now() - 1000 * 60 * 60 * 26);
  const endMissed = new Date(startMissed.getTime() + 45 * 60 * 1000);
  await supabase.from('sessions').upsert({
    id: IDS.sessionMissed,
    tutor_id: TUTOR_ID,
    student_id: IDS.students.activeKaunasDebt,
    start_time: startMissed.toISOString(),
    end_time: endMissed.toISOString(),
    status: 'active',
    class_group_id: IDS.group,
    school_billing_kind: 'extra',
    meeting_link: 'https://meet.google.com/qa-missed',
    tutor_joined_at: new Date(startMissed.getTime() + 30 * 1000).toISOString(),
    student_joined_at: null,
  }, { onConflict: 'id' });

  const startJoined = new Date(Date.now() - 1000 * 60 * 60 * 50);
  const endJoined = new Date(startJoined.getTime() + 45 * 60 * 1000);
  await supabase.from('sessions').upsert({
    id: IDS.sessionJoined,
    tutor_id: TUTOR_ID,
    student_id: IDS.students.activeKlaipeda,
    start_time: startJoined.toISOString(),
    end_time: endJoined.toISOString(),
    status: 'completed',
    class_group_id: IDS.group,
    school_billing_kind: 'extra',
    meeting_link: 'https://meet.google.com/qa-joined',
    tutor_joined_at: new Date(startJoined.getTime() + 20 * 1000).toISOString(),
    student_joined_at: new Date(startJoined.getTime() + 60 * 1000).toISOString(),
  }, { onConflict: 'id' });

  // Unpaid monthly invoice (= auto debt)
  const periodStart = new Date();
  periodStart.setDate(1);
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  periodEnd.setDate(0);
  await supabase.from('school_monthly_invoices').upsert({
    id: IDS.monthlyInv,
    organization_id: DEMO_ORG,
    contract_id: IDS.contractAccepted,
    student_id: IDS.students.activeKlaipeda,
    period_start: periodStart.toISOString().slice(0, 10),
    period_end: periodEnd.toISOString().slice(0, 10),
    unit_price_eur: 18,
    base_lessons: 8,
    base_amount_eur: 144,
    extra_lessons: 1,
    extra_amount_eur: 18,
    total_eur: 162,
    extra_session_ids: [IDS.sessionJoined],
    payment_status: 'pending',
    due_date: periodEnd.toISOString().slice(0, 10),
  }, { onConflict: 'id' });

  // Recording linked to group
  await supabase.from('school_lesson_recordings').upsert({
    id: IDS.recording,
    organization_id: DEMO_ORG,
    session_id: IDS.sessionJoined,
    drive_file_id: 'qa-drive-file-001',
    drive_file_name: 'QA Matematika 2026-08-24.mp4',
    drive_web_view_link: 'https://drive.google.com/file/d/qa-drive-file-001/view',
    recorded_at: startJoined.toISOString(),
    duration_minutes: 45,
  }, { onConflict: 'id' });
  await supabase.from('school_lesson_recording_groups').upsert({
    recording_id: IDS.recording,
    group_id: IDS.group,
  }, { onConflict: 'recording_id,group_id' });

  const appUrl = (env.APP_URL || env.VITE_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const acceptUrl = `${appUrl}/school-extra-lessons-accept?token=${acceptToken}`;

  console.log('\n=== QA READY ===');
  console.log('Admin login: http://localhost:3000/school/login');
  console.log('  email: demo-mokykla.demo.admin@tutlio.lt');
  console.log('  pass:  TutlioQaDemo2026!');
  console.log('Tutor login: http://localhost:3000/login');
  console.log('  email: demo-mokykla.demo.tutor@tutlio.lt  (if seeded)');
  console.log('  pass:  TutlioQaDemo2026!');
  console.log('Extra accept URL:\n ', acceptUrl);
  console.log('School groups: /school/groups');
  console.log('Recordings:    /school/recordings');
  console.log('Students:      /school/students  (default = Aktyvus only)');
  console.log('Contracts:     /school/contracts → Papildomų pamokų sutartis');
  console.log('QA emails:     alaniukasa@gmail.com (offer / accept / installment)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
