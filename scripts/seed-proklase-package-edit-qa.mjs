/**
 * Seeds Pro Klasė QA rows needed to test unpaid package edit + legal PDFs.
 * Requires seed-qa-demo-orgs.mjs to have been run first.
 *
 * Usage: node scripts/seed-proklase-package-edit-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ORG_ID = 'b0a00000-7e57-4000-8000-000000000001';
const TUTOR_ID = 'b0a00000-7e57-4000-8000-000000000003';
const STUDENT_LUKAS = 'b0a00000-7e57-4000-8000-000000000005';
const SUBJECT_MATH = 'b0a00000-7e57-4000-8000-000000000011';
const PKG_PENDING = 'b0a00000-7e57-4000-8000-000000000071';
const PKG_PAID = 'b0a00000-7e57-4000-8000-000000000072';
const PKG_STALE = 'b0a00000-7e57-4000-8000-000000000073';
const STUDENT_INVITE = 'b0a00000-7e57-4000-8000-000000000008';
const INVITE_CODE = 'PKQA01';
const PARENT_INVITE_ID = 'b0a00000-7e57-4000-8000-000000000081';
const PARENT_TOKEN = 'b0a00000-7e57-4000-8000-000000000082';
const PARENT_CODE = 'PKPAR1';

function loadEnv() {
  const out = {};
  for (const name of ['.env.local', '.env']) {
    const p = join(ROOT, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (out[m[1]] == null || out[m[1]] === '') out[m[1]] = v;
    }
  }
  return out;
}

async function upsertPackage(supabase, row, items) {
  const { error } = await supabase.from('lesson_packages').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`package ${row.id}: ${error.message}`);
  await supabase.from('lesson_package_items').delete().eq('package_id', row.id);
  if (items?.length) {
    const { error: itemErr } = await supabase.from('lesson_package_items').insert(items);
    if (itemErr) throw new Error(`package items ${row.id}: ${itemErr.message}`);
  }
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: org } = await supabase.from('organizations').select('id, slug').eq('id', ORG_ID).maybeSingle();
  if (!org) throw new Error('Pro Klasė QA org missing — run node scripts/seed-qa-demo-orgs.mjs first');

  const now = new Date();
  const septStart = `${now.getUTCFullYear()}-09-01`;
  const septEnd = `${now.getUTCFullYear()}-09-30`;
  const staleCreated = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();

  const basePkg = {
    tutor_id: TUTOR_ID,
    student_id: STUDENT_LUKAS,
    subject_id: SUBJECT_MATH,
    price_per_lesson: 25,
    reserved_lessons: 0,
    completed_lessons: 0,
    payment_method: 'stripe',
    active: false,
    billing_period_start: septStart,
    billing_period_end: septEnd,
    expires_at: `${septEnd}T23:59:59.999Z`,
  };

  await upsertPackage(supabase, {
    ...basePkg,
    id: PKG_PENDING,
    total_lessons: 8,
    available_lessons: 8,
    total_price: 200,
    paid: false,
    payment_status: 'pending',
    created_at: now.toISOString(),
  }, [{
    package_id: PKG_PENDING,
    subject_id: SUBJECT_MATH,
    total_lessons: 8,
    available_lessons: 8,
    reserved_lessons: 0,
    completed_lessons: 0,
    price_per_lesson: 25,
    total_price: 200,
    position: 0,
  }]);

  await upsertPackage(supabase, {
    ...basePkg,
    id: PKG_PAID,
    total_lessons: 8,
    available_lessons: 8,
    total_price: 200,
    paid: true,
    payment_status: 'paid',
    paid_at: now.toISOString(),
    active: true,
    created_at: now.toISOString(),
  }, [{
    package_id: PKG_PAID,
    subject_id: SUBJECT_MATH,
    total_lessons: 8,
    available_lessons: 8,
    reserved_lessons: 0,
    completed_lessons: 0,
    price_per_lesson: 25,
    total_price: 200,
    position: 0,
  }]);

  await upsertPackage(supabase, {
    ...basePkg,
    id: PKG_STALE,
    total_lessons: 8,
    available_lessons: 8,
    total_price: 200,
    paid: false,
    payment_status: 'pending',
    created_at: staleCreated,
  }, [{
    package_id: PKG_STALE,
    subject_id: SUBJECT_MATH,
    total_lessons: 8,
    available_lessons: 8,
    reserved_lessons: 0,
    completed_lessons: 0,
    price_per_lesson: 25,
    total_price: 200,
    position: 0,
  }]);

  const { error: stuErr } = await supabase.from('students').upsert({
    id: STUDENT_INVITE,
    tutor_id: TUTOR_ID,
    organization_id: ORG_ID,
    full_name: 'Pro QA Mokinys Registracijai',
    email: 'proklase.qa.invitee@tutlio.lt',
    grade: '7 kl.',
    linked_user_id: null,
    invite_code: INVITE_CODE,
    payer_name: 'Mama Registracija',
    payer_email: 'proklase.qa.parent-invite@tutlio.lt',
    phone: '+37060000008',
    pricing_lessons_per_week: 2,
  }, { onConflict: 'id' });
  if (stuErr) throw new Error(`invite student: ${stuErr.message}`);

  const { error: invErr } = await supabase.from('parent_invites').upsert({
    id: PARENT_INVITE_ID,
    token: PARENT_TOKEN,
    code: PARENT_CODE,
    parent_email: 'proklase.qa.parent-invite@tutlio.lt',
    parent_name: 'Pro QA Tėvas',
    student_id: STUDENT_LUKAS,
    used: false,
  }, { onConflict: 'id' });
  if (invErr) throw new Error(`parent invite: ${invErr.message}`);

  const appUrl = (env.VITE_APP_URL || env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  console.log('Pro Klasė QA package/legal seed OK');
  console.log(`  Pending 8-lesson package: ${PKG_PENDING} (Lukas)`);
  console.log(`  Paid control package:     ${PKG_PAID}`);
  console.log(`  Stale 8d pending:         ${PKG_STALE}`);
  console.log(`  Student invite:           ${appUrl}/book/${INVITE_CODE}`);
  console.log(`  Parent invite:            ${appUrl}/parent-register?token=${PARENT_TOKEN}`);
  console.log(`  Parent manual code:       ${PARENT_CODE} / proklase.qa.parent-invite@tutlio.lt`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
