/**
 * Bijles Haarlem — empty trial org for Nada (NL, 3 lic., manual pay, no fake data).
 *
 *   node scripts/seed-haarlem-bijles-demo.mjs
 *
 * Reads .env.local then .env.vercel.stage then .env.
 * Windows SSL: $env:NODE_TLS_REJECT_UNAUTHORIZED='0' if fetch failed.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PASSWORD = 'TutlioQaDemo2026!';

const id = (n) => `c4a00000-7e57-4000-8000-${String(n).padStart(12, '0')}`;

const ORG_ID = id(1);
const SLUG = 'bijles-haarlem';

const ADMIN = {
  id: id(2),
  email: 'bijlesdetoekomst@outlook.com',
  fullName: 'Nada El Abouti',
};

/** Former demo auth IDs — detach from org, licenses off (not deleted from auth). */
const LEGACY_DEMO_PROFILE_IDS = [
  id(3), id(4), id(5), id(6), id(7), id(8), id(9), id(10), id(11), id(12),
  id(201), id(202),
];

function loadEnv() {
  const env = { ...process.env };
  for (const rel of ['.env.local', '.env.vercel.stage', '.env']) {
    const path = join(ROOT, rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (env[m[1]] == null || env[m[1]] === '') env[m[1]] = v;
    }
    console.log('Loaded env from', rel);
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
  if (!error) return data.user.id;
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

async function upsert(supabase, table, row, onConflict = 'id') {
  const { error } = await supabase.from(table).upsert(row, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function cleanOrgData(supabase) {
  console.log('Wiping all Bijles Haarlem org data (students, tutors, sessions, …)…');

  const { data: tutors } = await supabase.from('profiles').select('id').eq('organization_id', ORG_ID);
  const tutorIds = (tutors || []).map((t) => t.id);
  const { data: students } = await supabase.from('students').select('id').eq('organization_id', ORG_ID);
  const studentIds = (students || []).map((s) => s.id);

  if (studentIds.length) {
    await supabase.from('sessions').delete().in('student_id', studentIds);
    await supabase.from('recurring_individual_sessions').delete().in('student_id', studentIds);
    const { data: pkgs } = await supabase.from('lesson_packages').select('id').in('student_id', studentIds);
    const pkgIds = (pkgs || []).map((p) => p.id);
    if (pkgIds.length) {
      await supabase.from('lesson_package_items').delete().in('package_id', pkgIds);
      await supabase.from('lesson_packages').delete().in('id', pkgIds);
    }
    await supabase.from('students').delete().in('id', studentIds);
  }

  if (tutorIds.length) {
    await supabase.from('sessions').delete().in('tutor_id', tutorIds);
    await supabase.from('recurring_individual_sessions').delete().in('tutor_id', tutorIds);
    await supabase.from('availability').delete().in('tutor_id', tutorIds);
    await supabase.from('subjects').delete().in('tutor_id', tutorIds);
    const { data: tPkgs } = await supabase.from('lesson_packages').select('id').in('tutor_id', tutorIds);
    const tPkgIds = (tPkgs || []).map((p) => p.id);
    if (tPkgIds.length) {
      await supabase.from('lesson_package_items').delete().in('package_id', tPkgIds);
      await supabase.from('lesson_packages').delete().in('id', tPkgIds);
    }
  }

  const { data: groups } = await supabase.from('school_class_groups').select('id').eq('organization_id', ORG_ID);
  const groupIds = (groups || []).map((g) => g.id);
  if (groupIds.length) {
    await supabase.from('school_class_group_members').delete().in('group_id', groupIds);
    await supabase.from('school_class_group_slots').delete().in('group_id', groupIds);
    await supabase.from('school_class_groups').delete().in('id', groupIds);
  }

  const { data: invs } = await supabase.from('invoices').select('id').eq('organization_id', ORG_ID);
  const invIds = (invs || []).map((i) => i.id);
  if (invIds.length) {
    await supabase.from('invoice_line_items').delete().in('invoice_id', invIds);
    await supabase.from('invoices').delete().in('id', invIds);
  }

  await supabase.from('invoice_profiles').delete().eq('organization_id', ORG_ID);

  // Detach every non-admin profile from this org.
  await supabase
    .from('profiles')
    .update({ organization_id: null, has_active_license: false })
    .eq('organization_id', ORG_ID)
    .neq('id', ADMIN.id);

  for (const pid of LEGACY_DEMO_PROFILE_IDS) {
    await supabase
      .from('profiles')
      .update({ organization_id: null, has_active_license: false })
      .eq('id', pid);
  }
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  console.log('Target Supabase:', url);

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  await cleanOrgData(supabase);

  await upsert(supabase, 'organizations', {
    id: ORG_ID,
    name: 'Bijles Haarlem',
    email: ADMIN.email,
    status: 'active',
    entity_type: 'company',
    tutor_license_count: 3,
    tutor_limit: 9999,
    slug: SLUG,
    brand_color: '#0F766E',
    brand_color_secondary: '#F59E0B',
    preferred_locale: 'nl',
    enable_per_lesson: true,
    enable_prepaid_packages: true,
    enable_monthly_billing: false,
    features: {
      custom_branding: true,
      hide_powered_by: true,
      public_name: 'Bijles Haarlem',
      contact_email: ADMIN.email,
      email_team_signature: 'Team Bijles Haarlem',
      email_sender_name: 'Bijles Haarlem',
      manual_payments: true,
      enable_manual_student_payments: true,
      org_admin_calendar_view: true,
      org_admin_calendar_full_control: true,
      school_teacher_labels: true,
    },
  });

  const adminId = await ensureAuthUser(supabase, ADMIN);

  await upsert(supabase, 'profiles', {
    id: adminId,
    email: ADMIN.email,
    full_name: ADMIN.fullName,
    organization_id: null,
    preferred_locale: 'nl',
  });
  await upsert(supabase, 'organization_admins', { user_id: adminId, organization_id: ORG_ID }, 'user_id');

  const appUrl = (env.VITE_APP_URL || env.APP_URL || 'https://tutlio.lt').replace(/\/$/, '');
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  BIJLES HAARLEM — lege trial org');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Org:      Bijles Haarlem   slug:', SLUG);
  console.log('  Org ID:  ', ORG_ID);
  console.log('  Admin:   ', `${appUrl}/company/login`);
  console.log('  E-mail:  ', ADMIN.email);
  console.log('  Wachtw.: ', PASSWORD);
  console.log('  Licenties: 3 (geen docenten/mokiniai/data)');
  console.log('  Flags: manual_payments, NL locale, org kalender full control');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
