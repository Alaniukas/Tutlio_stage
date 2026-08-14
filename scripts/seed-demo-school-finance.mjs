/**
 * Seeds Demo Mokykla (school QA org) with contracts + payment installments.
 * Only touches org c3a00000-7e57-4000-8000-000000000001 (demo-mokykla).
 *
 * Usage: node scripts/seed-demo-school-finance.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PASSWORD = 'TutlioQaDemo2026!';
const ORG_ID = 'c3a00000-7e57-4000-8000-000000000001';
const TEMPLATE_ID = 'c3a00000-7e57-4000-8000-000000000050';
const ADMIN_ID = 'c3a00000-7e57-4000-8000-000000000002';
const TUTOR_ID = 'c3a00000-7e57-4000-8000-000000000003';

const STUDENTS = {
  lukas: 'c3a00000-7e57-4000-8000-000000000005',
  gabija: 'c3a00000-7e57-4000-8000-000000000006',
  nojus: 'c3a00000-7e57-4000-8000-000000000007',
};

const CONTRACTS = {
  draft: 'c3a00000-7e57-4000-8000-000000000051',
  sent: 'c3a00000-7e57-4000-8000-000000000052',
  signedPartial: 'c3a00000-7e57-4000-8000-000000000053',
  signedOverdue: 'c3a00000-7e57-4000-8000-000000000054',
  signedNoSchedule: 'c3a00000-7e57-4000-8000-000000000055',
};

const INSTALLMENTS = {
  partialPaid: 'c3a00000-7e57-4000-8000-000000000061',
  partialPending: 'c3a00000-7e57-4000-8000-000000000062',
  overduePaid: 'c3a00000-7e57-4000-8000-000000000071',
  overdueLate: 'c3a00000-7e57-4000-8000-000000000072',
  overdueFuture: 'c3a00000-7e57-4000-8000-000000000073',
};

const DEMO_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R>>endobj
4 0 obj<</Length 55>>stream
BT /F1 14 Tf 72 720 Td (Demo pasirasyta sutartis - Demo Mokykla) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
320
%%EOF`,
  'utf8',
);

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

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function dateDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function ensureAuthUser(supabase, { id, email, fullName }) {
  const { data: existing } = await supabase.auth.admin.getUserById(id);
  if (existing?.user) {
    const { error } = await supabase.auth.admin.updateUserById(id, {
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`updateUser ${email}: ${error.message}`);
    return;
  }
  const { error } = await supabase.auth.admin.createUser({
    id,
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
}

async function uploadDemoSignedPdf(supabase, contractId, studentSlug) {
  const path = `${ORG_ID}/signed/${contractId}-${studentSlug}-demo.pdf`;
  const { error } = await supabase.storage.from('school-contracts').upload(path, DEMO_PDF, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw new Error(`storage upload ${contractId}: ${error.message}`);
  return path;
}

async function ensureDemoSchoolBase(supabase) {
  const adminEmail = 'demo-mokykla.demo.admin@tutlio.lt';
  const tutorEmail = 'demo-mokykla.demo.tutor@tutlio.lt';

  await ensureAuthUser(supabase, { id: ADMIN_ID, email: adminEmail, fullName: 'Demo Mokykla Admin' });
  await ensureAuthUser(supabase, { id: TUTOR_ID, email: tutorEmail, fullName: 'Demo Mokykla Korepetitorė' });

  const { error: orgErr } = await supabase.from('organizations').upsert(
    {
      id: ORG_ID,
      name: 'Demo Mokykla',
      email: adminEmail,
      status: 'active',
      entity_type: 'school',
      tutor_license_count: 5,
      tutor_limit: 9999,
      slug: 'demo-mokykla',
      brand_color: '#1E3A5F',
      brand_color_secondary: '#4A90D9',
      preferred_locale: 'lt',
      enable_per_lesson: false,
      enable_prepaid_packages: false,
      enable_monthly_billing: false,
      features: {
        custom_branding: true,
        manual_payments: false,
        org_admin_calendar_view: true,
        org_admin_calendar_full_control: true,
        school_contract_esign: false,
        public_name: 'Demo Mokykla',
        contact_email: adminEmail,
      },
    },
    { onConflict: 'id' },
  );
  if (orgErr) throw new Error(`org: ${orgErr.message}`);

  const { error: profErr } = await supabase.from('profiles').upsert(
    [
      { id: ADMIN_ID, email: adminEmail, full_name: 'Demo Mokykla Admin', organization_id: ORG_ID },
      { id: TUTOR_ID, email: tutorEmail, full_name: 'Demo Mokykla Korepetitorė', organization_id: ORG_ID },
    ],
    { onConflict: 'id' },
  );
  if (profErr) throw new Error(`profiles: ${profErr.message}`);

  const { error: adminErr } = await supabase.from('organization_admins').upsert({
    user_id: ADMIN_ID,
    organization_id: ORG_ID,
  }, { onConflict: 'user_id' });
  if (adminErr) throw new Error(`organization_admins: ${adminErr.message}`);

  const studentRows = [
    {
      id: STUDENTS.lukas,
      tutor_id: TUTOR_ID,
      organization_id: ORG_ID,
      full_name: 'Mokykla Mokinys Lukas',
      email: 'demo-mokykla.demo.student@tutlio.lt',
      grade: '5 kl.',
      payer_name: 'Mama Vardenė',
      payer_email: 'demo-mokykla.parent1@tutlio.lt',
      payer_personal_code: '39001010000',
      child_birth_date: '2015-03-15',
      student_address: 'Gedimino g. 1',
      student_city: 'Vilnius',
    },
    {
      id: STUDENTS.gabija,
      tutor_id: TUTOR_ID,
      organization_id: ORG_ID,
      full_name: 'Mokykla Mokinė Gabija',
      email: 'demo-mokykla.demo.student2@tutlio.lt',
      grade: '7 kl.',
      payer_name: 'Mama Gabijė',
      payer_email: 'demo-mokykla.parent3@tutlio.lt',
      payer_personal_code: '48505151234',
      child_birth_date: '2013-08-20',
      student_address: 'Konstitucijos pr. 12',
      student_city: 'Vilnius',
    },
    {
      id: STUDENTS.nojus,
      tutor_id: TUTOR_ID,
      organization_id: ORG_ID,
      full_name: 'Mokykla Mokinys Nojus',
      email: null,
      grade: '9 kl.',
      payer_name: 'Mama Nojė',
      payer_email: 'demo-mokykla.parent4@tutlio.lt',
      payer_personal_code: '49001019999',
      child_birth_date: '2011-11-11',
      student_address: 'Žirmūnų g. 5',
      student_city: 'Vilnius',
    },
  ];
  for (const row of studentRows) {
    const { error } = await supabase.from('students').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`student ${row.full_name}: ${error.message}`);
  }

  const { error: tErr } = await supabase.from('school_contract_templates').upsert(
    {
      id: TEMPLATE_ID,
      organization_id: ORG_ID,
      name: 'Standartinė mokymo sutartis',
      body: 'Mokymo sutartis tarp {{org_name}} ir mokinio {{student_name}}. Metinis mokestis: {{annual_fee}} EUR.',
      annual_fee_default: 1200,
      is_default: true,
    },
    { onConflict: 'id' },
  );
  if (tErr) throw new Error(`template: ${tErr.message}`);
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env');

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log('Ensuring Demo Mokykla org + users…');
  await ensureDemoSchoolBase(supabase);

  console.log('Seeding contracts + installments…');

  const contractIds = Object.values(CONTRACTS);
  const installmentIds = Object.values(INSTALLMENTS);

  await supabase.from('school_payment_installments').delete().in('id', installmentIds);
  await supabase.from('school_payment_installments').delete().in('contract_id', contractIds);

  const signedPartialPath = await uploadDemoSignedPdf(supabase, CONTRACTS.signedPartial, 'lukas');
  const signedOverduePath = await uploadDemoSignedPdf(supabase, CONTRACTS.signedOverdue, 'nojus');
  const signedNoSchedulePath = await uploadDemoSignedPdf(supabase, CONTRACTS.signedNoSchedule, 'gabija');

  const contracts = [
    {
      id: CONTRACTS.draft,
      organization_id: ORG_ID,
      template_id: TEMPLATE_ID,
      student_id: STUDENTS.lukas,
      filled_body: 'Juodraštis — Lukas. Metinis mokestis 1200 EUR.',
      annual_fee: 1200,
      signing_status: 'draft',
      contract_number: 'DEMO-2026-001',
    },
    {
      id: CONTRACTS.sent,
      organization_id: ORG_ID,
      template_id: TEMPLATE_ID,
      student_id: STUDENTS.gabija,
      filled_body: 'Išsiųsta sutartis — Gabija. Įkelkite rankiniu būdu pasirašytą kopiją.',
      annual_fee: 1100,
      signing_status: 'sent',
      sent_at: isoDaysAgo(5),
      contract_number: 'DEMO-2026-002',
    },
    {
      id: CONTRACTS.signedPartial,
      organization_id: ORG_ID,
      template_id: TEMPLATE_ID,
      student_id: STUDENTS.lukas,
      filled_body: 'Pasirašyta sutartis — Lukas. Viena įmoka sumokėta, viena laukia.',
      annual_fee: 1200,
      signing_status: 'signed',
      signed_at: isoDaysAgo(40),
      sent_at: isoDaysAgo(45),
      signed_contract_url: signedPartialPath,
      signed_uploaded_at: isoDaysAgo(40),
      contract_number: 'DEMO-2026-003',
    },
    {
      id: CONTRACTS.signedOverdue,
      organization_id: ORG_ID,
      template_id: TEMPLATE_ID,
      student_id: STUDENTS.nojus,
      filled_body: 'Pasirašyta sutartis — Nojus. Viena įmoka vėluoja.',
      annual_fee: 900,
      signing_status: 'signed',
      signed_at: isoDaysAgo(60),
      sent_at: isoDaysAgo(65),
      signed_contract_url: signedOverduePath,
      signed_uploaded_at: isoDaysAgo(60),
      contract_number: 'DEMO-2026-004',
    },
    {
      id: CONTRACTS.signedNoSchedule,
      organization_id: ORG_ID,
      template_id: TEMPLATE_ID,
      student_id: STUDENTS.gabija,
      filled_body: 'Pasirašyta sutartis — Gabija. Mokėjimo grafikas dar nesukurtas.',
      annual_fee: 1050,
      signing_status: 'signed',
      signed_at: isoDaysAgo(10),
      sent_at: isoDaysAgo(12),
      signed_contract_url: signedNoSchedulePath,
      signed_uploaded_at: isoDaysAgo(10),
      contract_number: 'DEMO-2026-005',
    },
  ];

  const { error: cErr } = await supabase.from('school_contracts').upsert(contracts, { onConflict: 'id' });
  if (cErr) throw new Error(`contracts: ${cErr.message}`);

  const installments = [
    {
      id: INSTALLMENTS.partialPaid,
      contract_id: CONTRACTS.signedPartial,
      installment_number: 1,
      amount: 600,
      due_date: dateDaysFromNow(-30),
      payment_status: 'paid',
      stripe_checkout_session_id: 'cs_demo_school_lukas_paid',
      paid_at: isoDaysAgo(28),
    },
    {
      id: INSTALLMENTS.partialPending,
      contract_id: CONTRACTS.signedPartial,
      installment_number: 2,
      amount: 600,
      due_date: dateDaysFromNow(30),
      payment_status: 'pending',
      stripe_checkout_session_id: null,
      paid_at: null,
    },
    {
      id: INSTALLMENTS.overduePaid,
      contract_id: CONTRACTS.signedOverdue,
      installment_number: 1,
      amount: 300,
      due_date: dateDaysFromNow(-90),
      payment_status: 'paid',
      stripe_checkout_session_id: null,
      paid_at: isoDaysAgo(85),
    },
    {
      id: INSTALLMENTS.overdueLate,
      contract_id: CONTRACTS.signedOverdue,
      installment_number: 2,
      amount: 300,
      due_date: dateDaysFromNow(-20),
      payment_status: 'overdue',
      stripe_checkout_session_id: null,
      paid_at: null,
    },
    {
      id: INSTALLMENTS.overdueFuture,
      contract_id: CONTRACTS.signedOverdue,
      installment_number: 3,
      amount: 300,
      due_date: dateDaysFromNow(45),
      payment_status: 'pending',
      stripe_checkout_session_id: null,
      paid_at: null,
    },
  ];

  const { error: iErr } = await supabase.from('school_payment_installments').upsert(installments, { onConflict: 'id' });
  if (iErr) throw new Error(`installments: ${iErr.message}`);

  const appUrl = 'http://localhost:3000';

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  DEMO MOKYKLA — testiniai duomenys paruošti');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Admin:       demo-mokykla.demo.admin@tutlio.lt`);
  console.log(`  Slaptažodis: ${PASSWORD}`);
  console.log('');
  console.log('  Sutartys:');
  console.log('    DEMO-2026-001  juodraštis (Lukas)');
  console.log('    DEMO-2026-002  išsiųsta — bandykite „Įkelti pasirašytą (foto/PDF)“');
  console.log('    DEMO-2026-003  pasirašyta, 1/2 įmokų sumokėta (Stripe)');
  console.log('    DEMO-2026-004  pasirašyta, vėluojanti įmoka (Nojus)');
  console.log('    DEMO-2026-005  pasirašyta, be mokėjimo grafiko (Gabija)');
  console.log('');
  console.log('  Nuorodos:');
  console.log(`    ${appUrl}/school/login`);
  console.log(`    ${appUrl}/school/contracts`);
  console.log(`    ${appUrl}/school/finance?tab=payments`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
