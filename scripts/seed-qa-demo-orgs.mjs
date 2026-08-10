/**
 * Seeds three QA demo organizations with correct flags and fake data:
 *   1. Paprasta įmonė (company, minimal flags) — manokorepetitorius
 *   2. Pro Klasė QA (company, full intake flags + dynamic pricing)
 *   3. Demo mokykla (school, contracts flow, no Pro Klasė flags)
 *
 * Usage: node scripts/seed-qa-demo-orgs.mjs
 * Requires: .env with VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PASSWORD = 'TutlioQaDemo2026!';

const DYNAMIC_PRICING_ROWS = [
  { grade_min: 1, grade_max: 8, lessons_per_week: 3, price: 22 },
  { grade_min: 9, grade_max: 10, lessons_per_week: 3, price: 24 },
  { grade_min: 11, grade_max: 12, lessons_per_week: 3, price: 26 },
  { grade_min: 1, grade_max: 8, lessons_per_week: 2, price: 25 },
  { grade_min: 9, grade_max: 10, lessons_per_week: 2, price: 27 },
  { grade_min: 11, grade_max: 12, lessons_per_week: 2, price: 29 },
  { grade_min: 1, grade_max: 8, lessons_per_week: 1, price: 27 },
  { grade_min: 9, grade_max: 10, lessons_per_week: 1, price: 29 },
  { grade_min: 11, grade_max: 12, lessons_per_week: 1, price: 31 },
];

/** Mirrors production `proklase` (3422031d-6e21-424d-980b-35a9c6d7b8f1) — keep in sync with prod DB. */
const PRO_KLASE_FEATURES = {
  perlas_finance: false,
  custom_branding: true,
  manual_payments: false,
  monthly_packages: true,
  full_student_edit: true,
  trial_lesson_topic: 'Bandomoji pamoka',
  flexible_invitations: true,
  student_card_booking: true,
  trial_followup_alert: true,
  extra_lessons_billing: true,
  student_payments_page: true,
  trial_comment_required: true,
  trial_lesson_price_eur: 10,
  trial_reservation_flow: true,
  tutor_frequency_search: true,
  auto_trial_first_lesson: true,
  disable_student_booking: true,
  disable_waitlist: true,
  hide_trial_offer_button: true,
  org_admin_calendar_view: true,
  post_trial_auto_package: true,
  hide_admin_lesson_prices: true,
  package_reservation_flow: true,
  student_schedule_overview: true,
  trial_lesson_comment_mode: 'internal_only',
  contact_student_tutor_email: 'show',
  contact_student_tutor_phone: 'show',
  contact_tutor_student_email: 'both',
  contact_tutor_student_phone: 'both',
  invoice_detailed_line_items: true,
  per_student_payment_override: true,
  student_availability_profile: true,
  trial_creation_payment_email: true,
  trial_lesson_duration_minutes: 45,
  enable_manual_student_payments: false,
  package_payment_deadline_hours: 24,
  notify_tutors_on_student_assign: false,
  org_admin_calendar_full_control: true,
  trial_reservation_deadline_hours: 24,
  tutor_lesson_status_confirmation: true,
  disable_student_reschedule_cancel: true,
};

const PLAIN_COMPANY_FEATURES = {
  custom_branding: true,
  manual_payments: false,
  per_student_payment_override: true,
  org_admin_calendar_view: true,
};

const SCHOOL_FEATURES = {
  custom_branding: true,
  manual_payments: false,
  org_admin_calendar_view: true,
  org_admin_calendar_full_control: true,
  school_contract_esign: false,
};

const ORGS = [
  {
    key: 'plain',
    label: 'Paprasta įmonė (org admin)',
    orgId: 'c1a00000-7e57-4000-8000-000000000001',
    slug: 'manokorepetitorius',
    name: 'Mano Korepetitorius',
    entityType: 'company',
    brandColor: '#E1557D',
    brandColorSecondary: '#4B0091',
    logoFile: 'manokorepetitorius-logo.png',
    adminLoginPath: '/company/login',
    features: {
      ...PLAIN_COMPANY_FEATURES,
      public_name: 'Mano Korepetitorius',
      contact_email: 'manokorepetitorius.demo.admin@tutlio.lt',
    },
    enablePerLesson: true,
    enablePrepaidPackages: true,
    enableMonthlyBilling: false,
    withDynamicPricing: false,
    withProKlaseSubjects: false,
    withRecurring: false,
    withSchoolContracts: false,
    users: {
      admin: {
        id: 'c1a00000-7e57-4000-8000-000000000002',
        email: 'manokorepetitorius.demo.admin@tutlio.lt',
        fullName: 'Mano Korepetitorius Admin',
      },
      tutor: {
        id: 'c1a00000-7e57-4000-8000-000000000003',
        email: 'manokorepetitorius.demo.tutor@tutlio.lt',
        fullName: 'Demo Korepetitorė Ona',
      },
      student1: {
        id: 'c1a00000-7e57-4000-8000-0000000000a1',
        email: 'manokorepetitorius.demo.student@tutlio.lt',
        fullName: 'Demo Mokinys Lukas',
      },
      student2: {
        id: 'c1a00000-7e57-4000-8000-0000000000a2',
        email: 'manokorepetitorius.demo.student2@tutlio.lt',
        fullName: 'Demo Mokinė Gabija',
      },
    },
    students: [
      {
        id: 'c1a00000-7e57-4000-8000-000000000005',
        fullName: 'Demo Mokinys Lukas',
        email: 'manokorepetitorius.demo.student@tutlio.lt',
        grade: '8 kl.',
        linkedUserId: 'c1a00000-7e57-4000-8000-0000000000a1',
      },
      {
        id: 'c1a00000-7e57-4000-8000-000000000006',
        fullName: 'Demo Mokinė Gabija',
        email: 'manokorepetitorius.demo.student2@tutlio.lt',
        grade: '6 kl.',
        linkedUserId: 'c1a00000-7e57-4000-8000-0000000000a2',
      },
      {
        id: 'c1a00000-7e57-4000-8000-000000000007',
        fullName: 'Demo Mokinys Nojus',
        email: null,
        grade: '10 kl.',
        linkedUserId: null,
      },
    ],
    subjects: [
      { id: 'c1a00000-7e57-4000-8000-000000000011', name: 'Matematika' },
      { id: 'c1a00000-7e57-4000-8000-000000000012', name: 'Anglų kalba' },
      { id: 'c1a00000-7e57-4000-8000-000000000013', name: 'Lietuvių kalba' },
    ],
    sessionIds: ['c1a00000-7e57-4000-8000-000000000021', 'c1a00000-7e57-4000-8000-000000000022'],
  },
  {
    key: 'proklase',
    label: 'Pro Klasė QA',
    orgId: 'b0a00000-7e57-4000-8000-000000000001',
    slug: 'proklase-qa',
    name: 'Pro Klasė QA Demo',
    entityType: 'company',
    brandColor: '#4B0091',
    brandColorSecondary: '#E1557D',
    logoFile: null,
    adminLoginPath: '/company/login',
    features: {
      ...PRO_KLASE_FEATURES,
      public_name: 'Pro Klasė QA',
      contact_email: 'proklase.qa.admin@tutlio.lt',
    },
    enablePerLesson: false,
    enablePrepaidPackages: true,
    enableMonthlyBilling: false,
    withDynamicPricing: true,
    withProKlaseSubjects: true,
    withRecurring: true,
    withSchoolContracts: false,
    users: {
      admin: {
        id: 'b0a00000-7e57-4000-8000-000000000002',
        email: 'proklase.qa.admin@tutlio.lt',
        fullName: 'Pro Klasė QA Admin',
      },
      tutor: {
        id: 'b0a00000-7e57-4000-8000-000000000003',
        email: 'proklase.qa.tutor1@tutlio.lt',
        fullName: 'QA Tutorė Ona',
      },
      student1: {
        id: 'b0a00000-7e57-4000-8000-0000000000a1',
        email: 'proklase.qa.student@tutlio.lt',
        fullName: 'Pro QA Mokinys Lukas',
      },
      student2: {
        id: 'b0a00000-7e57-4000-8000-0000000000a2',
        email: 'proklase.qa.student2@tutlio.lt',
        fullName: 'QA Mokinė Emilija',
      },
    },
    students: [
      {
        id: 'b0a00000-7e57-4000-8000-000000000005',
        fullName: 'Pro QA Mokinys Lukas',
        email: 'proklase.qa.student@tutlio.lt',
        grade: '8 kl.',
        linkedUserId: 'b0a00000-7e57-4000-8000-0000000000a1',
        pricingLessonsPerWeek: 2,
      },
      {
        id: 'b0a00000-7e57-4000-8000-000000000006',
        fullName: 'Pro QA Mokinė Gabija',
        email: 'proklase.qa.student2@tutlio.lt',
        grade: '10 kl.',
        linkedUserId: 'b0a00000-7e57-4000-8000-0000000000a2',
        pricingLessonsPerWeek: 1,
      },
      {
        id: 'b0a00000-7e57-4000-8000-000000000007',
        fullName: 'Pro QA Mokinys Nojus',
        email: null,
        grade: '12 kl.',
        linkedUserId: null,
        pricingLessonsPerWeek: 3,
      },
    ],
    subjects: [
      { id: 'b0a00000-7e57-4000-8000-000000000011', name: 'Matematika' },
      { id: 'b0a00000-7e57-4000-8000-000000000012', name: 'Anglų kalba' },
      { id: 'b0a00000-7e57-4000-8000-000000000013', name: 'Bandomasis', is_trial: true },
    ],
    sessionIds: ['b0a00000-7e57-4000-8000-000000000021', 'b0a00000-7e57-4000-8000-000000000022'],
    recurringId: 'b0a00000-7e57-4000-8000-000000000041',
  },
  {
    key: 'school',
    label: 'Demo mokykla (school admin)',
    orgId: 'c3a00000-7e57-4000-8000-000000000001',
    slug: 'demo-mokykla',
    name: 'Demo Mokykla',
    entityType: 'school',
    brandColor: '#1E3A5F',
    brandColorSecondary: '#4A90D9',
    logoFile: null,
    adminLoginPath: '/school/login',
    features: {
      ...SCHOOL_FEATURES,
      public_name: 'Demo Mokykla',
      contact_email: 'demo-mokykla.demo.admin@tutlio.lt',
    },
    enablePerLesson: false,
    enablePrepaidPackages: false,
    enableMonthlyBilling: false,
    withDynamicPricing: false,
    withProKlaseSubjects: false,
    withRecurring: false,
    withSchoolContracts: true,
    users: {
      admin: {
        id: 'c3a00000-7e57-4000-8000-000000000002',
        email: 'demo-mokykla.demo.admin@tutlio.lt',
        fullName: 'Demo Mokykla Admin',
      },
      tutor: {
        id: 'c3a00000-7e57-4000-8000-000000000003',
        email: 'demo-mokykla.demo.tutor@tutlio.lt',
        fullName: 'Demo Mokykla Korepetitorė',
      },
      student1: {
        id: 'c3a00000-7e57-4000-8000-0000000000a1',
        email: 'demo-mokykla.demo.student@tutlio.lt',
        fullName: 'Mokykla Mokinys Lukas',
      },
      student2: {
        id: 'c3a00000-7e57-4000-8000-0000000000a2',
        email: 'demo-mokykla.demo.student2@tutlio.lt',
        fullName: 'Mokykla Mokinė Gabija',
      },
    },
    students: [
      {
        id: 'c3a00000-7e57-4000-8000-000000000005',
        fullName: 'Mokykla Mokinys Lukas',
        email: 'demo-mokykla.demo.student@tutlio.lt',
        grade: '5 kl.',
        linkedUserId: 'c3a00000-7e57-4000-8000-0000000000a1',
        payerName: 'Mama Vardenė',
        payerEmail: 'demo-mokykla.parent1@tutlio.lt',
        payerPersonalCode: '39001010000',
        parentSecondaryName: 'Tata Vardenis',
        parentSecondaryEmail: 'demo-mokykla.parent2@tutlio.lt',
        parentSecondaryPhone: '+37060000099',
        childBirthDate: '2015-03-15',
        studentAddress: 'Gedimino g. 1',
        studentCity: 'Vilnius',
      },
      {
        id: 'c3a00000-7e57-4000-8000-000000000006',
        fullName: 'Mokykla Mokinė Gabija',
        email: 'demo-mokykla.demo.student2@tutlio.lt',
        grade: '7 kl.',
        linkedUserId: 'c3a00000-7e57-4000-8000-0000000000a2',
        payerName: 'Mama Gabijė',
        payerEmail: 'demo-mokykla.parent3@tutlio.lt',
        payerPersonalCode: '48505151234',
        childBirthDate: '2013-08-20',
        studentAddress: 'Konstitucijos pr. 12',
        studentCity: 'Vilnius',
      },
      {
        id: 'c3a00000-7e57-4000-8000-000000000007',
        fullName: 'Mokykla Mokinys Nojus',
        email: null,
        grade: '9 kl.',
        linkedUserId: null,
        payerName: 'Mama Nojė',
        payerEmail: 'demo-mokykla.parent4@tutlio.lt',
        payerPersonalCode: '49001019999',
        childBirthDate: '2011-11-11',
        studentAddress: 'Žirmūnų g. 5',
        studentCity: 'Vilnius',
      },
    ],
    subjects: [
      { id: 'c3a00000-7e57-4000-8000-000000000011', name: 'Matematika' },
      { id: 'c3a00000-7e57-4000-8000-000000000012', name: 'Anglų kalba' },
    ],
    sessionIds: ['c3a00000-7e57-4000-8000-000000000021', 'c3a00000-7e57-4000-8000-000000000022'],
    contractTemplateId: 'c3a00000-7e57-4000-8000-000000000050',
    contractId: 'c3a00000-7e57-4000-8000-000000000051',
  },
];

function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) throw new Error('Missing .env in project root');
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

async function ensureAuthUser(supabase, { id, email, fullName, password }) {
  const { data: existing } = await supabase.auth.admin.getUserById(id);
  if (existing?.user) {
    const { error } = await supabase.auth.admin.updateUserById(id, {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`updateUser ${email}: ${error.message}`);
    return id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    id,
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}

async function uploadLogo(supabase, orgId, logoFile) {
  if (!logoFile) return null;
  const logoPath = join(ROOT, 'public', 'demo', logoFile);
  if (!existsSync(logoPath)) {
    console.warn(`Logo missing: public/demo/${logoFile}`);
    return null;
  }
  const buffer = readFileSync(logoPath);
  const storagePath = `org-logos/${orgId}/${logoFile}`;
  const { error } = await supabase.storage.from('blog-images').upload(storagePath, buffer, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) {
    console.warn(`logo upload skipped (${error.message})`);
    return null;
  }
  const { data } = supabase.storage.from('blog-images').getPublicUrl(storagePath);
  return data.publicUrl;
}

function sessionTimes(org, studentIndex0, studentIndex1) {
  const now = new Date();
  const d1 = new Date(now);
  d1.setDate(d1.getDate() + 2);
  d1.setHours(16, 0, 0, 0);
  const e1 = new Date(d1);
  e1.setHours(17, 0, 0, 0);
  const d2 = new Date(now);
  d2.setDate(d2.getDate() + 4);
  d2.setHours(14, 30, 0, 0);
  const e2 = new Date(d2);
  e2.setHours(15, 30, 0, 0);
  return [
    {
      id: org.sessionIds[0],
      start: d1,
      end: e1,
      topic: 'Matematika',
      studentId: org.students[studentIndex0].id,
    },
    {
      id: org.sessionIds[1],
      start: d2,
      end: e2,
      topic: org.entityType === 'school' ? 'Anglų kalba' : 'Anglų kalba',
      studentId: org.students[studentIndex1].id,
    },
  ];
}

async function ensureOrgAdmin(supabase, userId, orgId) {
  const { error: adminErr } = await supabase.from('organization_admins').upsert(
    { user_id: userId, organization_id: orgId },
    { onConflict: 'user_id,organization_id' },
  );
  if (adminErr && adminErr.code !== '42P10') {
    await supabase.from('organization_admins').delete().eq('user_id', userId);
    const { error: ins } = await supabase.from('organization_admins').insert({
      user_id: userId,
      organization_id: orgId,
    });
    if (ins) throw new Error(`organization_admins: ${ins.message}`);
  }
}

async function seedOrg(supabase, org) {
  console.log(`\n── ${org.label} (${org.slug}) ──`);

  const logoUrl = await uploadLogo(supabase, org.orgId, org.logoFile);

  const { error: orgErr } = await supabase.from('organizations').upsert(
    {
      id: org.orgId,
      name: org.name,
      email: org.users.admin.email,
      status: 'active',
      entity_type: org.entityType,
      tutor_license_count: 5,
      tutor_limit: 9999,
      slug: org.slug,
      logo_url: logoUrl,
      brand_color: org.brandColor,
      brand_color_secondary: org.brandColorSecondary,
      preferred_locale: 'lt',
      enable_per_lesson: org.enablePerLesson,
      enable_prepaid_packages: org.enablePrepaidPackages,
      enable_monthly_billing: org.enableMonthlyBilling,
      features: org.features,
    },
    { onConflict: 'id' },
  );
  if (orgErr) throw new Error(`org ${org.slug}: ${orgErr.message}`);

  for (const u of Object.values(org.users)) {
    await ensureAuthUser(supabase, { ...u, password: PASSWORD });
  }

  const profiles = [
    { ...org.users.admin, organization_id: org.orgId },
    {
      ...org.users.tutor,
      organization_id: org.orgId,
      enable_manual_student_payments: false,
    },
    { ...org.users.student1, organization_id: org.orgId },
    { ...org.users.student2, organization_id: org.orgId },
  ].map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.fullName,
    organization_id: u.organization_id,
    enable_manual_student_payments: u.enable_manual_student_payments ?? false,
  }));

  const { error: profErr } = await supabase.from('profiles').upsert(profiles, { onConflict: 'id' });
  if (profErr) throw new Error(`profiles ${org.slug}: ${profErr.message}`);

  await ensureOrgAdmin(supabase, org.users.admin.id, org.orgId);

  for (const s of org.students) {
    const row = {
      id: s.id,
      tutor_id: org.users.tutor.id,
      organization_id: org.orgId,
      full_name: s.fullName,
      email: s.email,
      grade: s.grade,
      linked_user_id: s.linkedUserId,
      payer_name: s.payerName ?? s.fullName,
      payer_email: s.payerEmail ?? s.email,
      phone: '+37060000001',
      ...(s.payerPersonalCode ? { payer_personal_code: s.payerPersonalCode } : {}),
      ...(s.parentSecondaryName ? { parent_secondary_name: s.parentSecondaryName } : {}),
      ...(s.parentSecondaryEmail ? { parent_secondary_email: s.parentSecondaryEmail } : {}),
      ...(s.parentSecondaryPhone ? { parent_secondary_phone: s.parentSecondaryPhone } : {}),
      ...(s.childBirthDate ? { child_birth_date: s.childBirthDate } : {}),
      ...(s.studentAddress ? { student_address: s.studentAddress } : {}),
      ...(s.studentCity ? { student_city: s.studentCity } : {}),
      ...(s.pricingLessonsPerWeek ? { pricing_lessons_per_week: s.pricingLessonsPerWeek } : {}),
    };
    const { error } = await supabase.from('students').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`student ${s.fullName}: ${error.message}`);
  }

  for (const sub of org.subjects) {
    const { error } = await supabase.from('subjects').upsert(
      {
        id: sub.id,
        name: sub.name,
        tutor_id: org.users.tutor.id,
        ...(sub.is_trial ? { is_trial: true } : {}),
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`subject ${sub.name}: ${error.message}`);
  }

  for (const sess of sessionTimes(org, 0, 1)) {
    const { error } = await supabase.from('sessions').upsert(
      {
        id: sess.id,
        tutor_id: org.users.tutor.id,
        student_id: sess.studentId,
        start_time: sess.start.toISOString(),
        end_time: sess.end.toISOString(),
        status: 'active',
        paid: false,
        payment_status: 'unpaid',
        price: org.withDynamicPricing ? null : 25,
        topic: sess.topic,
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`session: ${error.message}`);
  }

  if (org.withDynamicPricing) {
    for (let i = 0; i < DYNAMIC_PRICING_ROWS.length; i++) {
      const row = DYNAMIC_PRICING_ROWS[i];
      const pricingId = `${org.orgId.slice(0, 8)}-7e57-4000-8000-${String(i + 31).padStart(12, '0')}`;
      const { error } = await supabase.from('organization_dynamic_pricing').upsert(
        {
          id: pricingId,
          organization_id: org.orgId,
          ...row,
        },
        { onConflict: 'organization_id,grade_min,grade_max,lessons_per_week' },
      );
      if (error) throw new Error(`dynamic pricing: ${error.message}`);
    }
  }

  if (org.withRecurring && org.recurringId) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 14);
    const { error } = await supabase.from('recurring_individual_sessions').upsert(
      {
        id: org.recurringId,
        tutor_id: org.users.tutor.id,
        student_id: org.students[0].id,
        subject_id: org.subjects[0].id,
        day_of_week: 2,
        start_time: '16:00:00',
        end_time: '17:00:00',
        start_date: startDate.toISOString().slice(0, 10),
        topic: 'Matematika',
        active: true,
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`recurring session: ${error.message}`);
  }

  if (org.withSchoolContracts) {
    const templateBody =
      'Mokymo sutartis tarp {{org_name}} ir mokinio {{student_name}}. Metinis mokestis: {{annual_fee}} EUR.';

    const { error: tErr } = await supabase.from('school_contract_templates').upsert(
      {
        id: org.contractTemplateId,
        organization_id: org.orgId,
        name: 'Standartinė mokymo sutartis',
        body: templateBody,
        annual_fee_default: 1200,
        is_default: true,
      },
      { onConflict: 'id' },
    );
    if (tErr) throw new Error(`contract template: ${tErr.message}`);

    const filledBody = templateBody
      .replace('{{org_name}}', org.name)
      .replace('{{student_name}}', org.students[0].fullName)
      .replace('{{annual_fee}}', '1200');

    const { error: cErr } = await supabase.from('school_contracts').upsert(
      {
        id: org.contractId,
        organization_id: org.orgId,
        template_id: org.contractTemplateId,
        student_id: org.students[0].id,
        filled_body: filledBody,
        annual_fee: 1200,
        signing_status: 'draft',
        contract_number: 'DEMO-2026-001',
      },
      { onConflict: 'id' },
    );
    if (cErr) throw new Error(`school contract: ${cErr.message}`);
  }

  console.log(`  ✓ ${org.slug} seeded`);
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env');

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const appUrl = (env.APP_URL || env.VITE_APP_URL || 'https://tutlio.lt').replace(/\/$/, '');

  for (const org of ORGS) {
    await seedOrg(supabase, org);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  QA DEMO PRISIJUNGIMAI — slaptažodis visiems:', PASSWORD);
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const org of ORGS) {
    console.log(`【${org.label}】`);
    console.log(`  Slug:           ${org.slug}`);
    console.log(`  Org ID:         ${org.orgId}`);
    console.log(`  entity_type:    ${org.entityType}`);
    console.log(`  Admin login:    ${appUrl}${org.adminLoginPath}`);
    console.log(`  Whitelabel:     ${appUrl}/login?org=${org.slug}`);
    console.log(`  Admin:          ${org.users.admin.email}`);
    console.log(`  Korepetitorius: ${org.users.tutor.email}`);
    console.log(`  Mokinys 1:      ${org.users.student1.email}`);
    console.log(`  Mokinys 2:      ${org.users.student2.email}`);
    console.log('');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
