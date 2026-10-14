/**
 * Intelekta attīstības centrs — MK-style demo org (LV UI, fake klientai, mokėjimai).
 *
 *   node scripts/seed-intelektacentrs-demo.mjs
 *
 * Requires .env with VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (cuhciqwmqfuajeeqjjbm).
 * Idempotent — safe to re-run.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PASSWORD = 'TutlioQaDemo2026!';
const LOCALE = 'lv';

const id = (n) => `c6a00000-7e57-4000-8000-${String(n).padStart(12, '0')}`;

/** Mirrors prod Mano Korepetitorius `organizations.features` (2026-03-14). */
const MK_FEATURES = {
  perlas_finance: false,
  custom_branding: true,
  hide_powered_by: true,
  manual_payments: false,
  payer_fee_split: {
    platform_share: 0,
    stripe_fixed_share: 100,
    stripe_percent_share: 65,
  },
  disable_waitlist: false,
  full_student_edit: false,
  flexible_invitations: false,
  pvm_education_invoice: true,
  school_class_groups: false,
  school_join_no_show: false,
  school_contract_esign: false,
  school_teacher_labels: false,
  school_activity_labels: true,
  trial_comment_required: true,
  trial_lesson_price_eur: 15,
  disable_student_booking: false,
  email_footer_powered_by: true,
  org_admin_calendar_view: true,
  trial_lesson_price_mode: 'discount_percent',
  school_lesson_recordings: false,
  trial_comment_after_count: 1,
  trial_lesson_comment_mode: 'internal_only',
  trial_lessons_per_student: 1,
  contact_student_tutor_email: 'show',
  contact_student_tutor_phone: 'show',
  contact_tutor_student_email: 'both',
  contact_tutor_student_phone: 'both',
  invoice_detailed_line_items: false,
  org_tutor_availability_only: false,
  per_student_payment_override: false,
  school_extra_lessons_contract: false,
  trial_lesson_discount_percent: 50,
  trial_lesson_duration_minutes: 60,
  enable_manual_student_payments: false,
  package_payment_deadline_hours: 24,
  notify_tutors_on_student_assign: true,
  org_admin_calendar_full_control: true,
  trial_reservation_deadline_hours: 24,
  tutor_lesson_status_confirmation: false,
  disable_student_reschedule_cancel: false,
  org_payer_fee_split: true,
  trial_lesson_topic: 'Iepazīšanās nodarbība',
  admin_email_opt_out: [],
  parent_email_opt_out: [],
};

const DEMO = {
  orgId: id(1),
  slug: 'intelektacentrs-demo',
  name: 'Intelekta attīstības centrs',
  brandColor: '#6941c6',
  brandColorSecondary: '#4353ff',
  logoFile: 'intelektacentrs-logo.png',
  users: {
    adminClient: {
      id: id(2),
      email: 'trenini@intelektacentrs.lv',
      fullName: 'Intelekta centrs administrācija',
    },
    adminAlanas: {
      id: id(3),
      email: 'alanas@tutlio.com',
      fullName: 'Alanas (Tutlio demo)',
    },
    tutorCognitive: {
      id: id(4),
      email: 'iac.demo.tutor1@tutlio.lt',
      fullName: 'Speciāliste Anna Bērziņa',
    },
    tutorGroup: {
      id: id(5),
      email: 'iac.demo.tutor2@tutlio.lt',
      fullName: 'Speciālists Māris Ozols',
    },
    student1: {
      id: id(101),
      email: 'iac.demo.student1@tutlio.lt',
      fullName: 'Emīlija Kalniņa',
    },
    student2: {
      id: id(102),
      email: 'iac.demo.student2@tutlio.lt',
      fullName: 'Roberts Liepa',
    },
    parent: {
      id: id(103),
      email: 'iac.demo.parent@tutlio.lt',
      fullName: 'Līga Kalniņa',
    },
  },
  students: [
    {
      id: id(10),
      fullName: 'Emīlija Kalniņa',
      email: 'iac.demo.student1@tutlio.lt',
      grade: '8. klase',
      linkedUserKey: 'student1',
      tutorKey: 'tutorCognitive',
      payerName: 'Līga Kalniņa',
      payerEmail: 'iac.demo.parent@tutlio.lt',
      parentUserKey: 'parent',
      phone: '+37120000001',
    },
    {
      id: id(11),
      fullName: 'Roberts Liepa',
      email: 'iac.demo.student2@tutlio.lt',
      grade: '10. klase',
      linkedUserKey: 'student2',
      tutorKey: 'tutorCognitive',
      payerName: 'Līga Kalniņa',
      payerEmail: 'iac.demo.parent@tutlio.lt',
      parentUserKey: 'parent',
      phone: '+37120000002',
    },
    {
      id: id(12),
      fullName: 'Sofija Briede',
      email: null,
      grade: '6. klase',
      linkedUserId: null,
      tutorKey: 'tutorGroup',
      payerName: 'Jānis Briedis',
      payerEmail: 'iac.demo.payer2@tutlio.lt',
      parentUserKey: null,
      phone: '+37120000003',
    },
  ],
  subjects: [
    { id: id(21), name: 'Uzmanības un koncentrācijas treniņi', tutorKey: 'tutorCognitive', duration: 60, price: 28, is_trial: false },
    { id: id(22), name: 'Lasītprasmes nodarbības', tutorKey: 'tutorCognitive', duration: 60, price: 26, is_trial: false },
    { id: id(23), name: 'Apzinātības nodarbības (grupa)', tutorKey: 'tutorGroup', duration: 60, price: 22, is_trial: false },
    { id: id(24), name: 'Iepazīšanās nodarbība', tutorKey: 'tutorCognitive', duration: 60, price: 15, is_trial: true },
  ],
  sessionIds: [id(31), id(32), id(33), id(34), id(35)],
  packageIds: [id(41), id(42)],
  invoiceIds: [id(51), id(52)],
};

const FULL_ADMIN_PERMISSIONS = {
  'dashboard.view': true,
  'tutors.view': true,
  'tutors.edit': true,
  'students.view': true,
  'students.edit': true,
  'sessions.view': true,
  'sessions.edit': true,
  'messages.view': true,
  'messages.edit': true,
  'stats.view': true,
  'finance.view': true,
  'finance.edit': true,
  'contracts.view': true,
  'contracts.edit': true,
  'settings.view': true,
  'settings.edit': true,
};

function loadEnv() {
  const env = { ...process.env };
  for (const rel of ['.env.local', '.env']) {
    const path = join(ROOT, rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (env[m[1]] == null || env[m[1]] === '') env[m[1]] = v;
    }
    break;
  }
  return env;
}

async function ensureAuthUser(supabase, { id: userId, email, fullName }) {
  const { data: existing } = await supabase.auth.admin.getUserById(userId);
  if (existing?.user) {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`updateUser ${email}: ${error.message}`);
    return userId;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    id: userId,
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    const { data: listed } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const hit = listed?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) {
      const { error: upd } = await supabase.auth.admin.updateUserById(hit.id, {
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (upd) throw new Error(`updateUser by email ${email}: ${upd.message}`);
      return hit.id;
    }
    throw new Error(`createUser ${email}: ${error.message}`);
  }
  return data.user.id;
}

async function uploadLogo(supabase, orgId) {
  const logoPath = join(ROOT, 'public', 'demo', DEMO.logoFile);
  if (!existsSync(logoPath)) {
    console.warn(`Logo missing: public/demo/${DEMO.logoFile}`);
    return null;
  }
  const buffer = readFileSync(logoPath);
  const storagePath = `org-logos/${orgId}/${DEMO.logoFile}`;
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

function sessionFixture() {
  const now = new Date();
  const past = (daysAgo, hour, min) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, min, 0, 0);
    return d;
  };
  const future = (daysAhead, hour, min) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, min, 0, 0);
    return d;
  };
  const end = (start) => new Date(start.getTime() + 60 * 60 * 1000);

  return [
    {
      id: DEMO.sessionIds[0],
      start: past(18, 16, 0),
      end: end(past(18, 16, 0)),
      status: 'completed',
      paid: true,
      payment_status: 'paid',
      price: 28,
      topic: 'Uzmanības treniņš',
      studentId: DEMO.students[0].id,
      tutorKey: 'tutorCognitive',
      subjectId: DEMO.subjects[0].id,
      packageId: DEMO.packageIds[0],
    },
    {
      id: DEMO.sessionIds[1],
      start: past(11, 14, 30),
      end: end(past(11, 14, 30)),
      status: 'completed',
      paid: true,
      payment_status: 'paid',
      price: 28,
      topic: 'Uzmanības treniņš',
      studentId: DEMO.students[0].id,
      tutorKey: 'tutorCognitive',
      subjectId: DEMO.subjects[0].id,
      packageId: DEMO.packageIds[0],
    },
    {
      id: DEMO.sessionIds[2],
      start: past(5, 17, 0),
      end: end(past(5, 17, 0)),
      status: 'completed',
      paid: false,
      payment_status: 'unpaid',
      price: 26,
      topic: 'Lasītprasme',
      studentId: DEMO.students[1].id,
      tutorKey: 'tutorCognitive',
      subjectId: DEMO.subjects[1].id,
      packageId: null,
    },
    {
      id: DEMO.sessionIds[3],
      start: future(2, 16, 0),
      end: end(future(2, 16, 0)),
      status: 'active',
      paid: false,
      payment_status: 'unpaid',
      price: 28,
      topic: 'Uzmanības treniņš',
      studentId: DEMO.students[0].id,
      tutorKey: 'tutorCognitive',
      subjectId: DEMO.subjects[0].id,
      packageId: DEMO.packageIds[0],
    },
    {
      id: DEMO.sessionIds[4],
      start: future(4, 11, 0),
      end: end(future(4, 11, 0)),
      status: 'active',
      paid: false,
      payment_status: 'unpaid',
      price: 22,
      topic: 'Apzinātība grupā',
      studentId: DEMO.students[2].id,
      tutorKey: 'tutorGroup',
      subjectId: DEMO.subjects[2].id,
      packageId: null,
    },
  ];
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env');
  console.log('Target Supabase:', url);

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const now = new Date().toISOString();

  const features = {
    ...MK_FEATURES,
    public_name: 'Intelekta attīstības centrs',
    contact_email: 'trenini@intelektacentrs.lv',
    contact_phone: '+371 20680020',
    email_sender_name: 'Intelekta centrs',
    email_team_signature: 'Intelekta attīstības centra komanda',
    login_description:
      'Individuālas un grupu nodarbības bērniem un jauniešiem — uzmanība, lasītprasme, emocionālā inteliģence un kognitīvās spējas. Rīga, Jūrmala, Sigulda un citas filiāles.',
  };

  const logoUrl = await uploadLogo(supabase, DEMO.orgId);

  const { error: orgErr } = await supabase.from('organizations').upsert(
    {
      id: DEMO.orgId,
      name: DEMO.name,
      email: DEMO.users.adminClient.email,
      status: 'active',
      entity_type: 'company',
      tutor_license_count: 8,
      tutor_limit: 9999,
      slug: DEMO.slug,
      logo_url: logoUrl,
      brand_color: DEMO.brandColor,
      brand_color_secondary: DEMO.brandColorSecondary,
      preferred_locale: LOCALE,
      invoice_issuer_mode: 'company',
      enable_per_lesson: false,
      enable_prepaid_packages: true,
      enable_monthly_billing: true,
      features,
    },
    { onConflict: 'id' },
  );
  if (orgErr) throw new Error(`org: ${orgErr.message}`);

  const resolvedUsers = {};
  for (const [key, u] of Object.entries(DEMO.users)) {
    resolvedUsers[key] = await ensureAuthUser(supabase, u);
  }

  const mapId = (key) => resolvedUsers[key] || DEMO.users[key].id;
  const profilesFixed = [
    {
      id: mapId('adminClient'),
      email: DEMO.users.adminClient.email,
      full_name: DEMO.users.adminClient.fullName,
      organization_id: DEMO.orgId,
      preferred_locale: LOCALE,
      manual_subscription_exempt: true,
      enable_manual_student_payments: false,
      has_active_license: false,
      company_commission_by_subject: {},
    },
    {
      id: mapId('adminAlanas'),
      email: DEMO.users.adminAlanas.email,
      full_name: DEMO.users.adminAlanas.fullName,
      organization_id: DEMO.orgId,
      preferred_locale: LOCALE,
      manual_subscription_exempt: true,
      enable_manual_student_payments: false,
      has_active_license: false,
      company_commission_by_subject: {},
    },
    {
      id: mapId('tutorCognitive'),
      email: DEMO.users.tutorCognitive.email,
      full_name: DEMO.users.tutorCognitive.fullName,
      organization_id: DEMO.orgId,
      preferred_locale: LOCALE,
      manual_subscription_exempt: true,
      enable_manual_student_payments: false,
      company_commission_percent: 18,
      company_commission_by_subject: {
        [DEMO.subjects[0].id]: 20,
        [DEMO.subjects[1].id]: 18,
        [DEMO.subjects[3].id]: 15,
      },
      teaching_notes: 'UZM 6–12, LAS 6–10',
      has_active_license: true,
    },
    {
      id: mapId('tutorGroup'),
      email: DEMO.users.tutorGroup.email,
      full_name: DEMO.users.tutorGroup.fullName,
      organization_id: DEMO.orgId,
      preferred_locale: LOCALE,
      manual_subscription_exempt: true,
      enable_manual_student_payments: false,
      company_commission_percent: 20,
      company_commission_by_subject: { [DEMO.subjects[2].id]: 20 },
      teaching_notes: 'GRUPAS 6–12',
      has_active_license: true,
    },
    {
      id: mapId('student1'),
      email: DEMO.users.student1.email,
      full_name: DEMO.users.student1.fullName,
      organization_id: DEMO.orgId,
      preferred_locale: LOCALE,
      manual_subscription_exempt: true,
      enable_manual_student_payments: false,
      has_active_license: false,
      company_commission_by_subject: {},
    },
    {
      id: mapId('student2'),
      email: DEMO.users.student2.email,
      full_name: DEMO.users.student2.fullName,
      organization_id: DEMO.orgId,
      preferred_locale: LOCALE,
      manual_subscription_exempt: true,
      enable_manual_student_payments: false,
      has_active_license: false,
      company_commission_by_subject: {},
    },
    {
      id: mapId('parent'),
      email: DEMO.users.parent.email,
      full_name: DEMO.users.parent.fullName,
      organization_id: null,
      preferred_locale: LOCALE,
      manual_subscription_exempt: true,
      enable_manual_student_payments: false,
      has_active_license: false,
      company_commission_by_subject: {},
    },
  ];

  const { error: profErr } = await supabase.from('profiles').upsert(profilesFixed, { onConflict: 'id' });
  if (profErr) throw new Error(`profiles: ${profErr.message}`);

  const ownerId = mapId('adminClient');
  const alanasId = mapId('adminAlanas');

  const { error: ownerSeatErr } = await supabase.from('organization_admins').upsert(
    {
      user_id: ownerId,
      organization_id: DEMO.orgId,
      role: 'owner',
      permissions: {},
      status: 'active',
      accepted_at: now,
      revoked_at: null,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  );
  if (ownerSeatErr) throw new Error(`owner seat: ${ownerSeatErr.message}`);

  const { error: alanasSeatErr } = await supabase.from('organization_admins').upsert(
    {
      user_id: alanasId,
      organization_id: DEMO.orgId,
      role: 'admin',
      permissions: FULL_ADMIN_PERMISSIONS,
      status: 'active',
      invited_by_user_id: ownerId,
      accepted_at: now,
      revoked_at: null,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  );
  if (alanasSeatErr) throw new Error(`alanas seat: ${alanasSeatErr.message}`);

  const parentId = mapId('parent');
  const { data: parentProfile, error: ppErr } = await supabase
    .from('parent_profiles')
    .upsert(
      {
        user_id: parentId,
        full_name: DEMO.users.parent.fullName,
        email: DEMO.users.parent.email,
        phone: '+37120000000',
      },
      { onConflict: 'user_id' },
    )
    .select('id')
    .single();
  if (ppErr || !parentProfile) throw new Error(`parent_profiles: ${ppErr?.message || 'no row'}`);

  const tutorCognitiveId = mapId('tutorCognitive');
  const tutorGroupId = mapId('tutorGroup');

  for (const s of DEMO.students) {
    const tutorId = s.tutorKey === 'tutorGroup' ? tutorGroupId : tutorCognitiveId;
    const linked = s.linkedUserKey ? mapId(s.linkedUserKey) : null;
    const parentUser = s.parentUserKey ? parentId : null;
    const { error } = await supabase.from('students').upsert(
      {
        id: s.id,
        tutor_id: tutorId,
        organization_id: DEMO.orgId,
        full_name: s.fullName,
        email: s.email,
        grade: s.grade,
        linked_user_id: linked,
        parent_user_id: parentUser,
        payer_name: s.payerName,
        payer_email: s.payerEmail,
        payment_payer: 'parent',
        phone: s.phone,
        invite_code: `IAC${s.id.slice(-4).toUpperCase()}`,
        enrollment_status: 'active',
        payment_model: 'prepaid_packages,monthly_billing',
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`student ${s.fullName}: ${error.message}`);

    if (parentUser && linked) {
      const { error: psErr } = await supabase.from('parent_students').upsert(
        { parent_id: parentProfile.id, student_id: s.id },
        { onConflict: 'parent_id,student_id' },
      );
      if (psErr) throw new Error(`parent_students ${s.id}: ${psErr.message}`);
    }
  }

  for (const sub of DEMO.subjects) {
    const tutorId = sub.tutorKey === 'tutorGroup' ? tutorGroupId : tutorCognitiveId;
    const { error } = await supabase.from('subjects').upsert(
      {
        id: sub.id,
        name: sub.name,
        tutor_id: tutorId,
        duration_minutes: sub.duration,
        price: sub.price,
        ...(sub.is_trial ? { is_trial: true } : {}),
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`subject ${sub.name}: ${error.message}`);
  }

  const issueDate = new Date();
  issueDate.setDate(1);
  const issueStr = issueDate.toISOString().slice(0, 10);

  const { error: inv1Err } = await supabase.from('invoices').upsert(
    {
      id: DEMO.invoiceIds[0],
      organization_id: DEMO.orgId,
      issued_by_user_id: ownerId,
      invoice_number: 'IAC-DEMO-0001',
      seller_snapshot: {
        name: 'SIA Intelekta attīstības centrs (demo)',
        entityType: 'company',
      },
      buyer_snapshot: {
        name: DEMO.students[0].payerName,
        email: DEMO.students[0].payerEmail,
      },
      issue_date: issueStr,
      subtotal: 224,
      total_amount: 224,
      status: 'paid',
      pdf_meta: { currency: 'EUR', paymentSourceType: 'package', paymentSourceId: DEMO.packageIds[0], qaFixture: 'intelektacentrs-demo' },
      created_at: now,
    },
    { onConflict: 'id' },
  );
  if (inv1Err) throw new Error(`invoice paid: ${inv1Err.message}`);

  const { error: inv2Err } = await supabase.from('invoices').upsert(
    {
      id: DEMO.invoiceIds[1],
      organization_id: DEMO.orgId,
      issued_by_user_id: ownerId,
      invoice_number: 'IAC-DEMO-0002',
      seller_snapshot: { name: 'SIA Intelekta attīstības centrs (demo)' },
      buyer_snapshot: {
        name: DEMO.students[1].payerName,
        email: DEMO.students[1].payerEmail,
      },
      issue_date: issueStr,
      subtotal: 26,
      total_amount: 26,
      status: 'issued',
      pdf_meta: { currency: 'EUR', qaFixture: 'intelektacentrs-demo' },
      created_at: now,
    },
    { onConflict: 'id' },
  );
  if (inv2Err) throw new Error(`invoice issued: ${inv2Err.message}`);

  const { error: pkg1Err } = await supabase.from('lesson_packages').upsert(
    {
      id: DEMO.packageIds[0],
      student_id: DEMO.students[0].id,
      tutor_id: tutorCognitiveId,
      subject_id: DEMO.subjects[0].id,
      total_lessons: 8,
      available_lessons: 5,
      reserved_lessons: 1,
      completed_lessons: 2,
      price_per_lesson: 28,
      total_price: 224,
      paid: true,
      payment_status: 'paid',
      paid_at: now,
      active: true,
      manual_sales_invoice_id: DEMO.invoiceIds[0],
      created_at: now,
    },
    { onConflict: 'id' },
  );
  if (pkg1Err) throw new Error(`package paid: ${pkg1Err.message}`);

  const { error: pkg2Err } = await supabase.from('lesson_packages').upsert(
    {
      id: DEMO.packageIds[1],
      student_id: DEMO.students[1].id,
      tutor_id: tutorCognitiveId,
      subject_id: DEMO.subjects[1].id,
      total_lessons: 4,
      available_lessons: 4,
      reserved_lessons: 0,
      completed_lessons: 0,
      price_per_lesson: 26,
      total_price: 104,
      paid: false,
      payment_status: 'pending',
      active: false,
      created_at: now,
    },
    { onConflict: 'id' },
  );
  if (pkg2Err) throw new Error(`package pending: ${pkg2Err.message}`);

  for (const sess of sessionFixture()) {
    const tutorId = sess.tutorKey === 'tutorGroup' ? tutorGroupId : tutorCognitiveId;
    const { error } = await supabase.from('sessions').upsert(
      {
        id: sess.id,
        tutor_id: tutorId,
        student_id: sess.studentId,
        subject_id: sess.subjectId,
        start_time: sess.start.toISOString(),
        end_time: sess.end.toISOString(),
        status: sess.status,
        paid: sess.paid,
        payment_status: sess.payment_status,
        price: sess.price,
        topic: sess.topic,
        ...(sess.packageId ? { lesson_package_id: sess.packageId } : {}),
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`session ${sess.id}: ${error.message}`);
  }

  const invoiceRow = {
    organization_id: DEMO.orgId,
    user_id: null,
    entity_type: 'mb',
    business_name: 'SIA Intelekta attīstības centrs (demo)',
    company_code: '40203456789',
    vat_code: 'LV40203456789',
    address: 'Graudu iela 68C, Rīga, LV-1058',
    contact_email: DEMO.users.adminClient.email,
    contact_phone: '+371 20680020',
    invoice_series: 'IAC',
    bank_name: 'Demo banka',
    iban: 'LV80BANK00004351950000',
    next_invoice_number: 1001,
  };

  const { data: existingInvoice } = await supabase
    .from('invoice_profiles')
    .select('id, next_invoice_number')
    .eq('organization_id', DEMO.orgId)
    .maybeSingle();

  if (existingInvoice?.id) {
    const { error } = await supabase
      .from('invoice_profiles')
      .update({
        ...invoiceRow,
        next_invoice_number: existingInvoice.next_invoice_number || invoiceRow.next_invoice_number,
        updated_at: now,
      })
      .eq('id', existingInvoice.id);
    if (error) throw new Error(`invoice_profiles update: ${error.message}`);
  } else {
    const { error } = await supabase.from('invoice_profiles').insert(invoiceRow);
    if (error) throw new Error(`invoice_profiles insert: ${error.message}`);
  }

  const appUrl = (env.VITE_APP_URL || env.APP_URL || 'https://tutlio.com').replace(/\/$/, '');
  const loginOrg = `${appUrl}/company/login?org=${DEMO.slug}`;

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  INTELEKTA CENTRS DEMO — parole visiem:', PASSWORD);
  console.log('  UI: lv (latviešu) + MK feature set');
  console.log('══════════════════════════════════════════════════════════\n');
  console.log(`Org ID:    ${DEMO.orgId}`);
  console.log(`Slug:      ${DEMO.slug}`);
  console.log(`Admin:     ${loginOrg}`);
  console.log(`           ${DEMO.users.adminClient.email} (īpašnieks)`);
  console.log(`           ${DEMO.users.adminAlanas.email} (admin)`);
  console.log(`Speciālists: ${DEMO.users.tutorCognitive.email}`);
  console.log(`Grupas:    ${DEMO.users.tutorGroup.email}`);
  console.log(`Vecāks:    ${appUrl}/login?org=${DEMO.slug}&portal=parent → ${DEMO.users.parent.email}`);
  console.log('\nBranding: logo no intelektacentrs.lv, krāsas #6941c6 / #4353ff');
  console.log('Fake: 3 bērni, apmaksāts pakete + gaidošs, 2 rēķini, vēsture + nākotnes nodarbības.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
