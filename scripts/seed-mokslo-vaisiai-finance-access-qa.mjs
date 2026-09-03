/**
 * Demo Mokslo vaisiai org for local finance.totals QA.
 *
 * - Owner (Agnė analogue): sees all € totals + Komanda
 * - Operator (info@ analogue): custom role, no finance.totals — same UX as production operator
 * - Fake tutors, sessions, invoices for dashboard / stats / finance pages
 *
 * Usage: node scripts/seed-mokslo-vaisiai-finance-access-qa.mjs
 * Requires .env.local with stage Supabase keys (cuhciqwmqfuajeeqjjbm).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'TutlioQaDemo2026!';

const ORG_ID = 'c1b00000-7e57-4000-8000-000000000001';
const SLUG = 'demo-mokslo-vaisiai';

const OWNER = {
  id: 'c1b00000-7e57-4000-8000-000000000002',
  email: 'mokslovaisiai.demo.agne@tutlio.lt',
  fullName: 'Demo Agnė (savininkė)',
};
const OPERATOR = {
  id: 'c1b00000-7e57-4000-8000-000000000003',
  email: 'mokslovaisiai.demo.info@tutlio.lt',
  fullName: 'Demo Info (administratorė)',
};
const TUTOR1 = {
  id: 'c1b00000-7e57-4000-8000-000000000004',
  email: 'mokslovaisiai.demo.tutor1@tutlio.lt',
  fullName: 'Demo Korepetitorius Ona',
  commission: 12,
};
const TUTOR2 = {
  id: 'c1b00000-7e57-4000-8000-000000000005',
  email: 'mokslovaisiai.demo.tutor2@tutlio.lt',
  fullName: 'Demo Korepetitorius Jonas',
  commission: 14,
};

const STUDENTS = [
  {
    id: 'c1b00000-7e57-4000-8000-000000000006',
    tutorId: TUTOR1.id,
    fullName: 'Demo Mokinys Lukas',
    email: 'mokslovaisiai.demo.student1@tutlio.lt',
    grade: '8 klasė',
    payerEmail: 'alaniukasa@gmail.com',
  },
  {
    id: 'c1b00000-7e57-4000-8000-000000000007',
    tutorId: TUTOR1.id,
    fullName: 'Demo Mokinė Gabija',
    email: 'mokslovaisiai.demo.student2@tutlio.lt',
    grade: '10 klasė',
    payerEmail: 'alaniukasa@gmail.com',
  },
  {
    id: 'c1b00000-7e57-4000-8000-000000000008',
    tutorId: TUTOR2.id,
    fullName: 'Demo Mokinys Nojus',
    email: 'mokslovaisiai.demo.student3@tutlio.lt',
    grade: '6 klasė',
    payerEmail: 'alaniukasa@gmail.com',
  },
];

const SUBJECT_MATH = 'c1b00000-7e57-4000-8000-000000000011';
const SUBJECT_EN = 'c1b00000-7e57-4000-8000-000000000012';

const SESSIONS = {
  paidThisMonth1: 'c1b00000-7e57-4000-8000-000000000021',
  paidThisMonth2: 'c1b00000-7e57-4000-8000-000000000022',
  paidEarlier: 'c1b00000-7e57-4000-8000-000000000023',
  unpaidOverdue: 'c1b00000-7e57-4000-8000-000000000024',
  upcomingPaid: 'c1b00000-7e57-4000-8000-000000000025',
  completedUnpaid: 'c1b00000-7e57-4000-8000-000000000026',
};

const INVOICES = {
  paid: 'c1b00000-7e57-4000-8000-000000000031',
  issued: 'c1b00000-7e57-4000-8000-000000000032',
};
const INVOICE_PROFILE = 'c1b00000-7e57-4000-8000-000000000030';

const OPERATOR_PERMISSIONS = {
  'finance.totals': false,
};

const MV_FEATURES = {
  custom_branding: true,
  hide_powered_by: true,
  per_student_payment_override: true,
  org_admin_calendar_view: true,
  org_admin_calendar_full_control: true,
  public_name: 'Mokslo vaisiai (demo)',
  contact_email: OPERATOR.email,
  contact_phone: '+370 625 21244',
  email_sender_name: 'Mokslo vaisiai demo',
  email_team_signature: 'Mokslo vaisių komanda',
  login_description:
    'Profesionalūs korepetitoriai nuotoliu. Individualus dėmesys kiekvienam mokiniui, patyrę mokytojai ir aiškus mokymosi planas.',
};

function loadEnv() {
  const env = {};
  for (const name of ['.env.local', '.env.vercel.stage', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let value = t.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      env[key] = value;
    }
  }
  return env;
}

function isoAt(dayOffset, hour, minute = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function monthStartIso() {
  const d = new Date();
  d.setDate(1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
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

async function upsert(supabase, table, row) {
  const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function uploadLogo(supabase) {
  const logoPath = join(ROOT, 'public', 'demo', 'mokslo-vaisiai-logo.png');
  if (!existsSync(logoPath)) return null;
  const buffer = readFileSync(logoPath);
  const storagePath = `org-logos/${ORG_ID}/mokslo-vaisiai-demo.png`;
  const { error } = await supabase.storage.from('blog-images').upload(storagePath, buffer, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) {
    console.warn(`logo upload skipped: ${error.message}`);
    return '/demo/mokslo-vaisiai-logo.png';
  }
  const { data } = supabase.storage.from('blog-images').getPublicUrl(storagePath);
  return data.publicUrl;
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local');

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const now = new Date().toISOString();
  const logoUrl = await uploadLogo(supabase);

  await upsert(supabase, 'organizations', {
    id: ORG_ID,
    name: 'Mokslo vaisiai (demo)',
    email: OPERATOR.email,
    status: 'active',
    entity_type: 'company',
    tutor_license_count: 5,
    tutor_limit: 9999,
    slug: SLUG,
    logo_url: logoUrl || '/demo/mokslo-vaisiai-logo.png',
    brand_color: '#124410',
    brand_color_secondary: '#5C2B02',
    preferred_locale: 'lt',
    enable_per_lesson: true,
    enable_prepaid_packages: false,
    enable_monthly_billing: true,
    payment_timing: 'before_lesson',
    payment_deadline_hours: 24,
    features: MV_FEATURES,
  });

  for (const user of [OWNER, OPERATOR, TUTOR1, TUTOR2]) {
    await ensureAuthUser(supabase, user);
  }

  await upsert(supabase, 'profiles', {
    id: OWNER.id,
    email: OWNER.email,
    full_name: OWNER.fullName,
    organization_id: ORG_ID,
  });
  await upsert(supabase, 'profiles', {
    id: OPERATOR.id,
    email: OPERATOR.email,
    full_name: OPERATOR.fullName,
    organization_id: ORG_ID,
  });

  for (const tutor of [TUTOR1, TUTOR2]) {
    await upsert(supabase, 'profiles', {
      id: tutor.id,
      email: tutor.email,
      full_name: tutor.fullName,
      organization_id: ORG_ID,
      company_commission_percent: tutor.commission,
      has_active_license: true,
      payment_timing: 'before_lesson',
      payment_deadline_hours: 24,
      enable_manual_student_payments: false,
    });
  }

  const { error: ownerSeatErr } = await supabase.from('organization_admins').upsert({
    user_id: OWNER.id,
    organization_id: ORG_ID,
    role: 'owner',
    permissions: {},
    status: 'active',
    accepted_at: now,
    revoked_at: null,
    updated_at: now,
  }, { onConflict: 'user_id' });
  if (ownerSeatErr) throw new Error(`owner seat: ${ownerSeatErr.message}`);

  const { error: operatorSeatErr } = await supabase.from('organization_admins').upsert({
    user_id: OPERATOR.id,
    organization_id: ORG_ID,
    role: 'owner',
    permissions: OPERATOR_PERMISSIONS,
    status: 'active',
    invited_by_user_id: OWNER.id,
    accepted_at: now,
    revoked_at: null,
    updated_at: now,
  }, { onConflict: 'user_id' });
  if (operatorSeatErr) throw new Error(`operator seat: ${operatorSeatErr.message}`);

  for (const s of STUDENTS) {
    await upsert(supabase, 'students', {
      id: s.id,
      tutor_id: s.tutorId,
      organization_id: ORG_ID,
      full_name: s.fullName,
      email: s.email,
      grade: s.grade,
      payer_name: `${s.fullName} tėvai`,
      payer_email: s.payerEmail,
      phone: '+37060000001',
    });
  }

  await upsert(supabase, 'subjects', {
    id: SUBJECT_MATH,
    tutor_id: TUTOR1.id,
    name: 'Matematika',
  });
  await upsert(supabase, 'subjects', {
    id: SUBJECT_EN,
    tutor_id: TUTOR2.id,
    name: 'Anglų kalba',
  });

  const thisMonth = monthStartIso();
  const sessionRows = [
    {
      id: SESSIONS.paidThisMonth1,
      tutor_id: TUTOR1.id,
      student_id: STUDENTS[0].id,
      subject_id: SUBJECT_MATH,
      start_time: isoAt(-3, 16),
      end_time: isoAt(-3, 17),
      status: 'completed',
      paid: true,
      payment_status: 'paid',
      price: 28,
      topic: 'Matematika',
    },
    {
      id: SESSIONS.paidThisMonth2,
      tutor_id: TUTOR1.id,
      student_id: STUDENTS[1].id,
      subject_id: SUBJECT_MATH,
      start_time: isoAt(-1, 14),
      end_time: isoAt(-1, 15),
      status: 'completed',
      paid: true,
      payment_status: 'confirmed',
      price: 32,
      topic: 'Matematika',
    },
    {
      id: SESSIONS.paidEarlier,
      tutor_id: TUTOR2.id,
      student_id: STUDENTS[2].id,
      subject_id: SUBJECT_EN,
      start_time: isoAt(-45, 17),
      end_time: isoAt(-45, 18),
      status: 'completed',
      paid: true,
      payment_status: 'paid',
      price: 25,
      topic: 'Anglų kalba',
    },
    {
      id: SESSIONS.unpaidOverdue,
      tutor_id: TUTOR1.id,
      student_id: STUDENTS[0].id,
      subject_id: SUBJECT_MATH,
      start_time: isoAt(-2, 10),
      end_time: isoAt(-2, 11),
      status: 'active',
      paid: false,
      payment_status: 'pending',
      price: 28,
      topic: 'Matematika (neapmokėta)',
    },
    {
      id: SESSIONS.completedUnpaid,
      tutor_id: TUTOR2.id,
      student_id: STUDENTS[2].id,
      subject_id: SUBJECT_EN,
      start_time: isoAt(-5, 11),
      end_time: isoAt(-5, 12),
      status: 'completed',
      paid: false,
      payment_status: 'pending',
      price: 30,
      topic: 'Anglų kalba (baigta, neapmokėta)',
    },
    {
      id: SESSIONS.upcomingPaid,
      tutor_id: TUTOR2.id,
      student_id: STUDENTS[2].id,
      subject_id: SUBJECT_EN,
      start_time: isoAt(3, 15),
      end_time: isoAt(3, 16),
      status: 'active',
      paid: true,
      payment_status: 'paid',
      price: 27,
      topic: 'Anglų kalba',
    },
  ];

  for (const row of sessionRows) {
    await upsert(supabase, 'sessions', row);
  }

  await upsert(supabase, 'invoice_profiles', {
    id: INVOICE_PROFILE,
    organization_id: ORG_ID,
    entity_type: 'ii',
    business_name: 'IĮ Mokslo vaisiai (demo)',
    company_code: '123456789',
    address: 'Demo g. 1, Vilnius',
    contact_email: OPERATOR.email,
    contact_phone: '+370 625 21244',
    invoice_series: 'MV-DEMO',
    next_invoice_number: 3,
    bank_name: 'Swedbank',
    iban: 'LT12 3456 7890 1234 5678',
  });

  const sellerSnap = {
    name: 'IĮ Mokslo vaisiai (demo)',
    entityType: 'ii',
    companyCode: '123456789',
    address: 'Demo g. 1, Vilnius',
    contactEmail: OPERATOR.email,
    contactPhone: '+370 625 21244',
  };

  const periodStart = thisMonth.slice(0, 10);
  const periodEnd = new Date().toISOString().slice(0, 10);

  await upsert(supabase, 'invoices', {
    id: INVOICES.paid,
    invoice_number: 'MV-DEMO-2026-001',
    issued_by_user_id: OWNER.id,
    organization_id: ORG_ID,
    seller_snapshot: sellerSnap,
    buyer_snapshot: { name: 'Lukas tėvai', email: STUDENTS[0].payerEmail },
    issue_date: periodEnd,
    period_start: periodStart,
    period_end: periodEnd,
    grouping_type: 'single',
    subtotal: 120,
    total_amount: 120,
    status: 'paid',
    origin: 'generated',
  });

  await upsert(supabase, 'invoices', {
    id: INVOICES.issued,
    invoice_number: 'MV-DEMO-2026-002',
    issued_by_user_id: OWNER.id,
    organization_id: ORG_ID,
    seller_snapshot: sellerSnap,
    buyer_snapshot: { name: 'Gabija tėvai', email: STUDENTS[1].payerEmail },
    issue_date: periodEnd,
    period_start: periodStart,
    period_end: periodEnd,
    grouping_type: 'single',
    subtotal: 85,
    total_amount: 85,
    status: 'issued',
    origin: 'generated',
  });

  for (const [invoiceId, amount, desc] of [
    [INVOICES.paid, 120, 'Mėnesio pamokos · Lukas'],
    [INVOICES.issued, 85, 'Mėnesio pamokos · Gabija (neapmokėta)'],
  ]) {
    await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId);
    const { error: liErr } = await supabase.from('invoice_line_items').insert({
      invoice_id: invoiceId,
      description: desc,
      quantity: 1,
      unit_price: amount,
      total_price: amount,
      session_ids: [],
    });
    if (liErr) throw new Error(`invoice_line_items: ${liErr.message}`);
  }

  const appUrl = (env.APP_URL || env.VITE_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  MOKSLO VAISIAI DEMO — finance.totals QA');
  console.log('  Slaptažodis visiems:', PASSWORD);
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Org ID:     ${ORG_ID}`);
  console.log(`Slug:       ${SLUG}`);
  console.log(`Login:      ${appUrl}/company/login`);
  console.log(`Whitelabel: ${appUrl}/login?org=${SLUG}`);
  console.log('');
  console.log('Savininkė (matosi € totalai + visą komandą):');
  console.log(`  ${OWNER.email}`);
  console.log('');
  console.log('Antra savininkė (be € suvestinių, nemato pirmos savininkės Komandoje):');
  console.log(`  ${OPERATOR.email}`);
  console.log('');
  console.log('Fake duomenys: ~60 € šį mėn., ~85 € viso + S.F. 120 € apmokėta, 85 € išrašyta');
  console.log('Neapmokėtos pamokos: Reikia dėmesio bloke\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
