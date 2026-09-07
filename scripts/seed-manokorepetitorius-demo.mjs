/**
 * Idempotent demo org for „Mano Korepetitorius“ sales demo.
 *
 * Usage: node scripts/seed-manokorepetitorius-demo.mjs
 * Requires: .env with VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DEMO = {
  orgId: 'c1a00000-7e57-4000-8000-000000000001',
  slug: 'manokorepetitorius',
  name: 'Mano Korepetitorius',
  email: 'manokorepetitorius.demo.admin@tutlio.lt',
  brandColor: '#4F33B2',
  brandColorSecondary: '#68AE4A',
  password: 'TutlioQaDemo2026!',
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
    tutorChem: {
      id: 'c1a00000-7e57-4000-8000-000000000004',
      email: 'manokorepetitorius.demo.tutor2@tutlio.lt',
      fullName: 'Demo Korepetitorius Petras',
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
      grade: '8 klasė',
      linkedUserId: 'c1a00000-7e57-4000-8000-0000000000a1',
    },
    {
      id: 'c1a00000-7e57-4000-8000-000000000006',
      fullName: 'Demo Mokinė Gabija',
      email: 'manokorepetitorius.demo.student2@tutlio.lt',
      grade: '6 klasė',
      linkedUserId: 'c1a00000-7e57-4000-8000-0000000000a2',
    },
    {
      id: 'c1a00000-7e57-4000-8000-000000000007',
      fullName: 'Demo Mokinys Nojus',
      email: null,
      grade: '10 klasė',
      linkedUserId: null,
    },
    {
      id: 'c1a00000-7e57-4000-8000-000000000008',
      fullName: 'Demo Mokinė Emilija',
      email: 'manokorepetitorius.demo.student3@tutlio.lt',
      grade: '10 klasė',
      linkedUserId: null,
      tutorKey: 'tutorChem',
    },
  ],
  subjects: [
    { id: 'c1a00000-7e57-4000-8000-000000000011', name: 'Matematika', tutorKey: 'tutor' },
    { id: 'c1a00000-7e57-4000-8000-000000000012', name: 'Anglų kalba', tutorKey: 'tutor' },
    { id: 'c1a00000-7e57-4000-8000-000000000013', name: 'Lietuvių kalba', tutorKey: 'tutor' },
    { id: 'c1a00000-7e57-4000-8000-000000000014', name: 'Chemija', tutorKey: 'tutorChem' },
  ],
};

function loadEnv() {
  const env = {};
  for (const file of ['.env', '.env.local']) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
  if (!env.VITE_SUPABASE_URL && !env.SUPABASE_URL) {
    throw new Error('Missing .env or .env.local with Supabase keys');
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

async function uploadLogo(supabase, orgId) {
  const logoPath = join(ROOT, 'public', 'demo', 'manokorepetitorius-logo.png');
  if (!existsSync(logoPath)) {
    console.warn('Logo file missing at public/demo/manokorepetitorius-logo.png — skipping upload');
    return null;
  }
  const buffer = readFileSync(logoPath);
  const storagePath = `org-logos/${orgId}/manokorepetitorius-demo.png`;
  const { error } = await supabase.storage.from('blog-images').upload(storagePath, buffer, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) {
    console.warn(`logo upload skipped: ${error.message}`);
    return null;
  }
  const { data } = supabase.storage.from('blog-images').getPublicUrl(storagePath);
  return data.publicUrl;
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
    { id: 'c1a00000-7e57-4000-8000-000000000021', start: d1, end: e1, topic: 'Matematika', studentId: DEMO.students[0].id, tutorKey: 'tutor' },
    { id: 'c1a00000-7e57-4000-8000-000000000022', start: d2, end: e2, topic: 'Anglų kalba', studentId: DEMO.students[1].id, tutorKey: 'tutor' },
    { id: 'c1a00000-7e57-4000-8000-000000000023', start: d2, end: e2, topic: 'Chemija', studentId: DEMO.students[3].id, tutorKey: 'tutorChem' },
  ];
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env');

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  console.log('Using Supabase:', url);

  console.log('Uploading logo…');
  const logoUrl = await uploadLogo(supabase, DEMO.orgId);

  const features = {
    custom_branding: true,
    hide_powered_by: true,
    public_name: 'Mano Korepetitorius',
    contact_email: DEMO.email,
    email_team_signature: 'Mano Korepetitoriaus komanda',
    email_sender_name: 'Mano Korepetitorius',
    login_description:
      'Individualus dėmesys kiekvienam mokiniui. Patyrę ir kruopščiai atrinkti korepetitoriai — gyvai Vilniuje ir nuotoliu visoje Lietuvoje.',
    manual_payments: false,
    per_student_payment_override: true,
    org_admin_calendar_view: true,
    org_admin_calendar_full_control: true,
  };

  console.log('Upserting organization…');
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
      logo_url: logoUrl,
      brand_color: DEMO.brandColor,
      brand_color_secondary: DEMO.brandColorSecondary,
      preferred_locale: 'lt',
      enable_per_lesson: true,
      enable_prepaid_packages: true,
      enable_monthly_billing: false,
      features,
    },
    { onConflict: 'id' },
  );
  if (orgErr) throw new Error(`org: ${orgErr.message}`);

  console.log('Creating auth users…');
  for (const u of Object.values(DEMO.users)) {
    await ensureAuthUser(supabase, { ...u, password: DEMO.password });
  }

  console.log('Upserting profiles…');
  const profiles = [
    { ...DEMO.users.admin, organization_id: DEMO.orgId },
    {
      ...DEMO.users.tutor,
      organization_id: DEMO.orgId,
      enable_manual_student_payments: false,
    },
    {
      ...DEMO.users.tutorChem,
      organization_id: DEMO.orgId,
      enable_manual_student_payments: false,
    },
    { ...DEMO.users.student1, organization_id: DEMO.orgId },
    { ...DEMO.users.student2, organization_id: DEMO.orgId },
  ].map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.fullName,
    organization_id: u.organization_id,
    ...(u.enable_manual_student_payments !== undefined
      ? { enable_manual_student_payments: u.enable_manual_student_payments }
      : {}),
  }));

  const { error: profErr } = await supabase.from('profiles').upsert(profiles, { onConflict: 'id' });
  if (profErr) throw new Error(`profiles: ${profErr.message}`);

  const { error: adminErr } = await supabase.from('organization_admins').upsert(
    { user_id: DEMO.users.admin.id, organization_id: DEMO.orgId },
    { onConflict: 'user_id' },
  );
  if (adminErr) throw new Error(`organization_admins: ${adminErr.message}`);

  console.log('Upserting students…');
  for (const s of DEMO.students) {
    const tutorId = DEMO.users[s.tutorKey || 'tutor'].id;
    const { error } = await supabase.from('students').upsert(
      {
        id: s.id,
        tutor_id: tutorId,
        organization_id: DEMO.orgId,
        full_name: s.fullName,
        email: s.email,
        grade: s.grade,
        linked_user_id: s.linkedUserId,
        payer_name: s.fullName,
        payer_email: s.email,
        phone: '+37060000001',
        invite_code: `MK${s.id.slice(-4).toUpperCase()}`,
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`student ${s.fullName}: ${error.message}`);
  }

  console.log('Upserting subjects…');
  for (const sub of DEMO.subjects) {
    const { error } = await supabase.from('subjects').upsert(
      { id: sub.id, name: sub.name, tutor_id: DEMO.users[sub.tutorKey || 'tutor'].id },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`subject ${sub.name}: ${error.message}`);
  }

  console.log('Upserting demo sessions…');
  for (const sess of sessionTimes()) {
    const { error } = await supabase.from('sessions').upsert(
      {
        id: sess.id,
        tutor_id: DEMO.users[sess.tutorKey || 'tutor'].id,
        student_id: sess.studentId,
        start_time: sess.start.toISOString(),
        end_time: sess.end.toISOString(),
        status: 'active',
        paid: false,
        payment_status: 'unpaid',
        price: 25,
        topic: sess.topic,
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`session: ${error.message}`);
  }

  const appUrl = 'http://localhost:3000';
  console.log('\n=== Mano Korepetitorius demo ready ===\n');
  console.log(`Company admin:     ${appUrl}/company/login?org=${DEMO.slug}`);
  console.log(`Password (all):    ${DEMO.password}\n`);
  console.log('Admin:     ', DEMO.users.admin.email);
  console.log('Tutor math:', DEMO.users.tutor.email);
  console.log('Tutor chem:', DEMO.users.tutorChem.email);
  console.log('Student:   ', DEMO.users.student1.email);
  console.log('Student2:  ', DEMO.users.student2.email);
  console.log('\nQA: Emilija (10 klasė) assigned only to Petras/Chemija — add Ona/Matematika from the card or schedule.');
  console.log('\nOrg id:', DEMO.orgId);
  if (logoUrl) console.log('Logo:  ', logoUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
