/**
 * České MK-style demo org — PVM faktury, kalendář admina, balíčky, fake data v češtině.
 *
 *   node scripts/seed-czech-mk-demo.mjs
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
const LOCALE = 'cs';

const id = (n) => `c5a00000-7e57-4000-8000-${String(n).padStart(12, '0')}`;

const DEMO = {
  orgId: id(1),
  slug: 'demo-ceske-doucovani',
  name: 'Demo České doučování',
  email: 'czech.demo.admin@tutlio.lt',
  brandColor: '#5C2D91',
  brandColorSecondary: '#D21E56',
  users: {
    admin: {
      id: id(2),
      email: 'czech.demo.admin@tutlio.lt',
      fullName: 'Administrátor Demo',
    },
    tutorMath: {
      id: id(3),
      email: 'czech.demo.tutor@tutlio.lt',
      fullName: 'Lektorka Marie Nováková',
    },
    tutorChem: {
      id: id(4),
      email: 'czech.demo.tutor2@tutlio.lt',
      fullName: 'Lektor Petr Svoboda',
    },
    student1: {
      id: id(101),
      email: 'czech.demo.student@tutlio.lt',
      fullName: 'Student Lukáš Dvořák',
    },
    student2: {
      id: id(102),
      email: 'czech.demo.student2@tutlio.lt',
      fullName: 'Studentka Tereza Horáková',
    },
    parent: {
      id: id(103),
      email: 'czech.demo.parent@tutlio.lt',
      fullName: 'Rodič Jan Horák',
    },
  },
  students: [
    {
      id: id(5),
      fullName: 'Student Lukáš Dvořák',
      email: 'czech.demo.student@tutlio.lt',
      grade: '8. třída',
      linkedUserId: id(101),
      tutorKey: 'tutorMath',
      payerName: 'Rodič Jan Horák',
      payerEmail: 'czech.demo.parent@tutlio.lt',
      parentUserId: id(103),
      phone: '+420601111001',
    },
    {
      id: id(6),
      fullName: 'Studentka Tereza Horáková',
      email: 'czech.demo.student2@tutlio.lt',
      grade: '6. třída',
      linkedUserId: id(102),
      tutorKey: 'tutorMath',
      payerName: 'Rodič Jan Horák',
      payerEmail: 'czech.demo.parent@tutlio.lt',
      parentUserId: id(103),
      phone: '+420601111002',
    },
    {
      id: id(7),
      fullName: 'Student Adam Procházka',
      email: null,
      grade: '10. třída',
      linkedUserId: null,
      tutorKey: 'tutorChem',
      payerName: 'Rodič Jan Horák',
      payerEmail: 'czech.demo.parent@tutlio.lt',
      parentUserId: id(103),
      phone: '+420601111003',
    },
  ],
  subjects: [
    { id: id(11), name: 'Matematika', tutorKey: 'tutorMath', duration: 60, price: 22 },
    { id: id(12), name: 'Anglický jazyk', tutorKey: 'tutorMath', duration: 60, price: 22 },
    { id: id(13), name: 'Český jazyk', tutorKey: 'tutorMath', duration: 60, price: 20 },
    { id: id(14), name: 'Chemie', tutorKey: 'tutorChem', duration: 60, price: 24 },
  ],
  sessionIds: [id(21), id(22), id(23)],
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
    const { data: listed } = await supabase.auth.admin.listUsers({ page: 1, perPage: 500 });
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

function sessionTimes() {
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
    { id: DEMO.sessionIds[0], start: d1, end: e1, topic: 'Matematika', studentId: DEMO.students[0].id, tutorKey: 'tutorMath', subjectId: DEMO.subjects[0].id },
    { id: DEMO.sessionIds[1], start: d2, end: e2, topic: 'Anglický jazyk', studentId: DEMO.students[1].id, tutorKey: 'tutorMath', subjectId: DEMO.subjects[1].id },
    { id: DEMO.sessionIds[2], start: d2, end: e2, topic: 'Chemie', studentId: DEMO.students[2].id, tutorKey: 'tutorChem', subjectId: DEMO.subjects[3].id },
  ];
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env');
  console.log('Target Supabase:', url);

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const features = {
    custom_branding: true,
    hide_powered_by: true,
    email_footer_powered_by: true,
    pvm_education_invoice: true,
    per_student_payment_override: true,
    org_admin_calendar_view: true,
    org_admin_calendar_full_control: true,
    public_name: 'Demo České doučování',
    contact_email: DEMO.email,
    contact_phone: '+420 601 123 456',
    email_team_signature: 'Tým Demo České doučování',
    email_sender_name: 'Demo České doučování',
    login_description:
      'Kvalitní individuální lekce a pozornost každému studentovi. Zkušení lektoré, jasný studijní plán a průběžná komunikace s rodiči — prezenčně v Praze i online po celé České republice.',
  };

  const { error: orgErr } = await supabase.from('organizations').upsert(
    {
      id: DEMO.orgId,
      name: DEMO.name,
      email: DEMO.email,
      status: 'active',
      entity_type: 'company',
      tutor_license_count: 5,
      tutor_limit: 9999,
      slug: DEMO.slug,
      brand_color: DEMO.brandColor,
      brand_color_secondary: DEMO.brandColorSecondary,
      preferred_locale: LOCALE,
      invoice_issuer_mode: 'company',
      enable_per_lesson: true,
      enable_prepaid_packages: true,
      enable_monthly_billing: false,
      features,
    },
    { onConflict: 'id' },
  );
  if (orgErr) throw new Error(`org: ${orgErr.message}`);

  for (const u of Object.values(DEMO.users)) {
    await ensureAuthUser(supabase, u);
  }

  const profileBase = {
    preferred_locale: LOCALE,
    manual_subscription_exempt: true,
  };

  const profiles = [
    { ...DEMO.users.admin, organization_id: DEMO.orgId, enable_manual_student_payments: false, ...profileBase },
    {
      ...DEMO.users.tutorMath,
      organization_id: DEMO.orgId,
      enable_manual_student_payments: false,
      company_commission_percent: 18,
      company_commission_by_subject: {
        [DEMO.subjects[0].id]: 18,
        [DEMO.subjects[1].id]: 18,
        [DEMO.subjects[2].id]: 16,
      },
      teaching_notes: 'MAT 6–9, AJ 5–8',
      ...profileBase,
    },
    {
      ...DEMO.users.tutorChem,
      organization_id: DEMO.orgId,
      enable_manual_student_payments: false,
      company_commission_percent: 20,
      company_commission_by_subject: { [DEMO.subjects[3].id]: 22 },
      teaching_notes: 'CHM 8–12',
      ...profileBase,
    },
    { ...DEMO.users.student1, organization_id: DEMO.orgId, enable_manual_student_payments: false, ...profileBase },
    { ...DEMO.users.student2, organization_id: DEMO.orgId, enable_manual_student_payments: false, ...profileBase },
    { ...DEMO.users.parent, organization_id: null, enable_manual_student_payments: false, ...profileBase },
  ].map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.fullName,
    organization_id: u.organization_id,
    preferred_locale: u.preferred_locale,
    manual_subscription_exempt: u.manual_subscription_exempt,
    enable_manual_student_payments: u.enable_manual_student_payments ?? false,
    company_commission_percent: u.company_commission_percent ?? null,
    company_commission_by_subject: u.company_commission_by_subject ?? {},
    ...(u.teaching_notes ? { teaching_notes: u.teaching_notes } : {}),
  }));

  const { error: profErr } = await supabase.from('profiles').upsert(profiles, { onConflict: 'id' });
  if (profErr) throw new Error(`profiles: ${profErr.message}`);

  const { error: adminErr } = await supabase.from('organization_admins').upsert(
    { user_id: DEMO.users.admin.id, organization_id: DEMO.orgId, role: 'owner', status: 'active' },
    { onConflict: 'user_id' },
  );
  if (adminErr) throw new Error(`organization_admins: ${adminErr.message}`);

  const { data: parentProfile, error: ppErr } = await supabase
    .from('parent_profiles')
    .upsert(
      {
        user_id: DEMO.users.parent.id,
        full_name: DEMO.users.parent.fullName,
        email: DEMO.users.parent.email,
        phone: '+420601111000',
      },
      { onConflict: 'user_id' },
    )
    .select('id')
    .single();
  if (ppErr || !parentProfile) throw new Error(`parent_profiles: ${ppErr?.message || 'no row'}`);

  for (const s of DEMO.students) {
    const tutorId = DEMO.users[s.tutorKey].id;
    const { error } = await supabase.from('students').upsert(
      {
        id: s.id,
        tutor_id: tutorId,
        organization_id: DEMO.orgId,
        full_name: s.fullName,
        email: s.email,
        grade: s.grade,
        linked_user_id: s.linkedUserId,
        parent_user_id: s.parentUserId,
        payer_name: s.payerName,
        payer_email: s.payerEmail,
        payment_payer: 'parent',
        phone: s.phone,
        invite_code: `CZ${s.id.slice(-4).toUpperCase()}`,
        enrollment_status: 'active',
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`student ${s.fullName}: ${error.message}`);

    const { error: psErr } = await supabase.from('parent_students').upsert(
      { parent_id: parentProfile.id, student_id: s.id },
      { onConflict: 'parent_id,student_id' },
    );
    if (psErr) throw new Error(`parent_students ${s.id}: ${psErr.message}`);
  }

  for (const sub of DEMO.subjects) {
    const { error } = await supabase.from('subjects').upsert(
      {
        id: sub.id,
        name: sub.name,
        tutor_id: DEMO.users[sub.tutorKey].id,
        duration_minutes: sub.duration,
        price: sub.price,
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`subject ${sub.name}: ${error.message}`);
  }

  for (const sess of sessionTimes()) {
    const { error } = await supabase.from('sessions').upsert(
      {
        id: sess.id,
        tutor_id: DEMO.users[sess.tutorKey].id,
        student_id: sess.studentId,
        subject_id: sess.subjectId,
        start_time: sess.start.toISOString(),
        end_time: sess.end.toISOString(),
        status: 'active',
        paid: false,
        payment_status: 'unpaid',
        price: 22,
        topic: sess.topic,
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`session: ${error.message}`);
  }

  const invoiceRow = {
    organization_id: DEMO.orgId,
    user_id: null,
    entity_type: 'mb',
    business_name: 'Demo České doučování s.r.o.',
    company_code: '12345678',
    vat_code: 'CZ12345678',
    address: 'Václavské náměstí 1, 110 00 Praha',
    contact_email: DEMO.email,
    contact_phone: '+420 601 123 456',
    invoice_series: 'DD',
    bank_name: 'Demo Banka a.s.',
    iban: 'CZ6508000000192000145399',
    next_invoice_number: 1001,
  };

  const { data: existingInvoice } = await supabase
    .from('invoice_profiles')
    .select('id, next_invoice_number')
    .eq('organization_id', DEMO.orgId)
    .maybeSingle();

  if (existingInvoice?.id) {
    const { error } = await supabase.from('invoice_profiles').update({
      ...invoiceRow,
      next_invoice_number: existingInvoice.next_invoice_number || invoiceRow.next_invoice_number,
      updated_at: new Date().toISOString(),
    }).eq('id', existingInvoice.id);
    if (error) throw new Error(`invoice_profiles update: ${error.message}`);
  } else {
    const { error } = await supabase.from('invoice_profiles').insert(invoiceRow);
    if (error) throw new Error(`invoice_profiles insert: ${error.message}`);
  }

  const appUrl = (env.VITE_APP_URL || env.APP_URL || 'https://tutlio.com').replace(/\/$/, '');
  const loginBase = `${appUrl}/login?org=${DEMO.slug}`;

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  ČESKÉ MK-STYLE DEMO — heslo pro všechny:', PASSWORD);
  console.log('  Jazyk UI: cs (čeština) — org + profily preferred_locale=cs');
  console.log('══════════════════════════════════════════════════════════\n');
  console.log(`Org ID:       ${DEMO.orgId}`);
  console.log(`Slug:         ${DEMO.slug}`);
  console.log(`Admin:        ${appUrl}/company/login?org=${DEMO.slug}`);
  console.log(`              ${DEMO.users.admin.email}`);
  console.log(`Lektor (MAT): ${DEMO.users.tutorMath.email}`);
  console.log(`Lektor (CHM): ${DEMO.users.tutorChem.email}`);
  console.log(`Student 1:    ${loginBase}&portal=student  →  ${DEMO.users.student1.email}`);
  console.log(`Student 2:    ${DEMO.users.student2.email}`);
  console.log(`Rodič:        ${loginBase}&portal=parent  →  ${DEMO.users.parent.email}`);
  console.log('\nFunkce jako MK: PVM faktury, kalendář admina, balíčky, přepsání ceny studenta.');
  console.log('Fake data: česká jména, předměty, třídy (8. třída), telefony +420.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
