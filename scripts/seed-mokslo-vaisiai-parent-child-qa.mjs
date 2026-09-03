/**
 * Demo Mokslo vaisiai — tėvo + mokinio QA paskyros (local/stage).
 *
 * - Tėvas su vienu placeholder vaiku → /parent/settings (pridėti vaiką / kvietimas)
 * - Mokinys su linked_user_id → /student/settings (negali trinti paskyros)
 * - Nepanaudotas parent_invite → /parent-register (pilnas tėvo registracijos srautas)
 *
 * Usage:
 *   node scripts/seed-mokslo-vaisiai-finance-access-qa.mjs   # jei demo org dar nėra
 *   node scripts/seed-mokslo-vaisiai-parent-child-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'TutlioQaDemo2026!';

const ORG_ID = 'c1b00000-7e57-4000-8000-000000000001';
const TUTOR_ID = 'c1b00000-7e57-4000-8000-000000000004';

const PARENT_USER = {
  id: 'c1b00000-7e57-4000-8000-000000000041',
  email: 'mokslovaisiai.demo.parent-qa@tutlio.lt',
  fullName: 'Demo Tėvas Petras',
};
const STUDENT_USER = {
  id: 'c1b00000-7e57-4000-8000-000000000042',
  email: 'mokslovaisiai.demo.student-qa@tutlio.lt',
  fullName: 'Demo Mokinys Mantas',
};
/** Placeholder vaikas po „Pirmiau tėvą“ admin kvietimo */
const PLACEHOLDER_CHILD = {
  id: 'c1b00000-7e57-4000-8000-000000000043',
  fullName: 'Laukiama registracijos',
};
/** Registruotas MV mokinys — archiveParentOnly QA */
const REGISTERED_STUDENT = {
  id: 'c1b00000-7e57-4000-8000-000000000044',
  fullName: 'Demo Mokinys Mantas',
  email: STUDENT_USER.email,
  grade: '9 klasė',
};
/** Nepanaudotas tėvo kvietimas — pilnam parent-register srautui */
const FRESH_INVITE = {
  id: 'c1b00000-7e57-4000-8000-000000000045',
  studentId: 'c1b00000-7e57-4000-8000-000000000046',
  token: 'mvqa-parent-fresh-token',
  code: 'MVPETR1',
  parentEmail: 'mokslovaisiai.demo.parent-fresh@tutlio.lt',
  parentName: 'Demo Naujas Tėvas',
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

async function ensureAuthUser(supabase, { id, email, fullName }) {
  const { data: existing } = await supabase.auth.admin.getUserById(id);
  if (existing?.user) {
    const { error } = await supabase.auth.admin.updateUserById(id, {
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: id === PARENT_USER.id ? 'parent' : 'student' },
    });
    if (error) throw new Error(`updateUser ${email}: ${error.message}`);
    return id;
  }
  const { error } = await supabase.auth.admin.createUser({
    id,
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: id === PARENT_USER.id ? 'parent' : 'student' },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return id;
}

async function upsert(supabase, table, row) {
  const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Need VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local');

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: org } = await supabase.from('organizations').select('id, slug').eq('id', ORG_ID).maybeSingle();
  if (!org) {
    throw new Error('Demo MV org missing — run: node scripts/seed-mokslo-vaisiai-finance-access-qa.mjs');
  }

  await ensureAuthUser(supabase, PARENT_USER);
  await ensureAuthUser(supabase, STUDENT_USER);

  const { data: parentProfile, error: ppErr } = await supabase
    .from('parent_profiles')
    .upsert(
      {
        user_id: PARENT_USER.id,
        full_name: PARENT_USER.fullName,
        email: PARENT_USER.email,
        phone: '+37060000441',
      },
      { onConflict: 'user_id' },
    )
    .select('id')
    .single();
  if (ppErr || !parentProfile) throw new Error(`parent_profiles: ${ppErr?.message || 'no row'}`);

  await upsert(supabase, 'students', {
    id: PLACEHOLDER_CHILD.id,
    tutor_id: TUTOR_ID,
    organization_id: ORG_ID,
    full_name: PLACEHOLDER_CHILD.fullName,
    email: null,
    linked_user_id: null,
    parent_user_id: PARENT_USER.id,
    payer_name: PARENT_USER.fullName,
    payer_email: PARENT_USER.email,
    payment_payer: 'parent',
    enrollment_status: 'active',
    invite_code: 'MVQA43',
  });

  await upsert(supabase, 'students', {
    id: REGISTERED_STUDENT.id,
    tutor_id: TUTOR_ID,
    organization_id: ORG_ID,
    full_name: REGISTERED_STUDENT.fullName,
    email: REGISTERED_STUDENT.email,
    grade: REGISTERED_STUDENT.grade,
    linked_user_id: STUDENT_USER.id,
    parent_user_id: PARENT_USER.id,
    payer_name: PARENT_USER.fullName,
    payer_email: PARENT_USER.email,
    payment_payer: 'parent',
    phone: '+37060000442',
    enrollment_status: 'active',
    invite_code: 'MVQA44',
  });

  for (const studentId of [PLACEHOLDER_CHILD.id, REGISTERED_STUDENT.id]) {
    const { error: psErr } = await supabase.from('parent_students').upsert(
      { parent_id: parentProfile.id, student_id: studentId },
      { onConflict: 'parent_id,student_id' },
    );
    if (psErr) throw new Error(`parent_students ${studentId}: ${psErr.message}`);
  }

  await upsert(supabase, 'students', {
    id: FRESH_INVITE.studentId,
    tutor_id: TUTOR_ID,
    organization_id: ORG_ID,
    full_name: 'Laukiama registracijos',
    email: null,
    linked_user_id: null,
    parent_user_id: null,
    payer_name: FRESH_INVITE.parentName,
    payer_email: FRESH_INVITE.parentEmail,
    payment_payer: 'parent',
    enrollment_status: 'active',
    invite_code: 'MVQA46',
  });

  const { error: invErr } = await supabase.from('parent_invites').upsert(
    {
      id: FRESH_INVITE.id,
      token: FRESH_INVITE.token,
      code: FRESH_INVITE.code,
      parent_email: FRESH_INVITE.parentEmail,
      parent_name: FRESH_INVITE.parentName,
      student_id: FRESH_INVITE.studentId,
      used: false,
    },
    { onConflict: 'id' },
  );
  if (invErr) throw new Error(`parent_invites: ${invErr.message}`);

  const appUrl = (env.APP_URL || env.VITE_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  MOKSLO VAISIAI DEMO — tėvo / mokinio QA');
  console.log('  Slaptažodis visiems:', PASSWORD);
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Org: ${ORG_ID} (${org.slug})`);
  console.log('');
  console.log('1) Tėvas (jau prisijungęs, vaikų valdymas):');
  console.log(`   ${appUrl}/login`);
  console.log(`   ${PARENT_USER.email}`);
  console.log(`   → ${appUrl}/parent/settings — pridėti vaiką / pakviesti / archyvuoti`);
  console.log('');
  console.log('2) Mokinys (negali trinti paskyros):');
  console.log(`   ${appUrl}/login`);
  console.log(`   ${STUDENT_USER.email}`);
  console.log(`   → ${appUrl}/student/settings — „Pavojinga zona“ rodo tik info tekstą`);
  console.log('');
  console.log('3) Naujas tėvas (parent-register srautas nuo nulio):');
  console.log(`   ${appUrl}/parent-register?token=${FRESH_INVITE.token}`);
  console.log(`   El. paštas: ${FRESH_INVITE.parentEmail}`);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
