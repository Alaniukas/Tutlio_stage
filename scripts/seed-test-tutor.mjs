/**
 * Seeds a single INDIVIDUAL tutor (no organization) into the TEST database so
 * the solo-tutor paths can be exercised end to end: login → dashboard →
 * subjects → availability → a student.
 *
 * Deliberately scoped to the solo-tutor case, which the existing
 * seed-qa-demo-orgs.mjs does not cover (it seeds organizations only).
 *
 * Usage:
 *   TEST_TUTOR_EMAIL=you+test@example.com \
 *   TEST_TUTOR_PASSWORD='<choose-one>' \
 *   node scripts/seed-test-tutor.mjs
 *
 * Reads TEST_SUPABASE_URL + TEST_SUPABASE_SERVICE_ROLE_KEY from .env.local so
 * it can never touch production by accident. Idempotent: re-running updates the
 * existing rows instead of duplicating them.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv() {
  const p = join(ROOT, '.env.local');
  if (!existsSync(p)) throw new Error('.env.local not found');
  const out = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

const PROD_REF = 'cuhciqwmqfuajeeqjjbm';

async function main() {
  const env = loadEnv();
  const url = env.TEST_SUPABASE_URL;
  const key = env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('TEST_SUPABASE_URL and TEST_SUPABASE_SERVICE_ROLE_KEY required in .env.local');

  // Hard guard: this script must never run against production.
  if (url.includes(PROD_REF)) {
    throw new Error('TEST_SUPABASE_URL points at PRODUCTION — refusing to seed.');
  }

  const email = process.env.TEST_TUTOR_EMAIL;
  const password = process.env.TEST_TUTOR_PASSWORD;
  if (!email || !password) {
    throw new Error('Set TEST_TUTOR_EMAIL and TEST_TUTOR_PASSWORD in the environment (not in a file).');
  }
  if (password.length < 8) throw new Error('TEST_TUTOR_PASSWORD must be at least 8 characters.');

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  console.log(`→ target: ${url.replace('https://', '').replace('.supabase.co', '')}`);

  // Fail early and clearly if the schema was never applied.
  const probe = await supabase.from('profiles').select('id').limit(1);
  if (probe.error) {
    throw new Error(
      `Cannot read public.profiles (${probe.error.message}).\n` +
      '   The schema is not applied. Run supabase/schema.sql, then `supabase db push`, then re-run this script.',
    );
  }

  // 1. Auth user (idempotent: reuse if the email already exists).
  let userId;
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Test Tutor' },
  });

  if (created.error) {
    const already = /already|exists|registered/i.test(created.error.message);
    if (!already) throw created.error;
    // Find the existing user by paging the admin list.
    let page = 1;
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const hit = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
      if (hit) { userId = hit.id; break; }
      if (data.users.length < 200) throw new Error(`User ${email} reported as existing but not found.`);
      page += 1;
    }
    // Reset the password so the caller's value is always the working one.
    const upd = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (upd.error) throw upd.error;
    console.log('✓ auth user existed — password reset');
  } else {
    userId = created.data.user.id;
    console.log('✓ auth user created');
  }

  // 2. Profile. A trigger on auth.users may have created it already, so upsert.
  //    organization_id stays NULL — that is what makes this an INDIVIDUAL tutor.
  const profile = {
    id: userId,
    email,
    full_name: 'Test Tutor',
    organization_id: null,
    cancellation_hours: 24,
    preferred_locale: 'lt',
  };
  const up = await supabase.from('profiles').upsert(profile, { onConflict: 'id' }).select('id').maybeSingle();
  if (up.error) throw up.error;
  console.log('✓ profile ready (organization_id = NULL → individual tutor)');

  // 3. A subject, so the calendar and booking screens have something to show.
  const existingSubject = await supabase
    .from('subjects').select('id').eq('tutor_id', userId).eq('name', 'Matematika').maybeSingle();
  let subjectId = existingSubject.data?.id;
  if (!subjectId) {
    const ins = await supabase.from('subjects')
      .insert({ tutor_id: userId, name: 'Matematika', duration_minutes: 60, price: 30, color: '#4338ca' })
      .select('id').single();
    if (ins.error) throw ins.error;
    subjectId = ins.data.id;
    console.log('✓ subject created (Matematika, 60 min, €30)');
  } else {
    console.log('✓ subject already present');
  }

  // 4. Recurring weekday availability, so free slots exist to book.
  const days = [1, 2, 3, 4, 5];
  for (const d of days) {
    const has = await supabase.from('availability')
      .select('id').eq('tutor_id', userId).eq('day_of_week', d).eq('start_time', '16:00:00').maybeSingle();
    if (has.data?.id) continue;
    const ins = await supabase.from('availability').insert({
      tutor_id: userId, day_of_week: d, start_time: '16:00:00', end_time: '20:00:00', is_recurring: true,
    });
    if (ins.error) throw ins.error;
  }
  console.log('✓ availability: Mon–Fri 16:00–20:00 (recurring)');

  // 5. A student assigned to this tutor.
  const stuEmail = `student.${email}`;
  const existingStudent = await supabase
    .from('students').select('id').eq('tutor_id', userId).eq('email', stuEmail).maybeSingle();
  if (!existingStudent.data?.id) {
    const ins = await supabase.from('students').insert({
      full_name: 'Testas Mokinys',
      email: stuEmail,
      tutor_id: userId,
      payment_model: 'per_lesson',
      grade: '10',
    }).select('id').single();
    if (ins.error) throw ins.error;
    console.log('✓ student created (Testas Mokinys, grade 10)');
  } else {
    console.log('✓ student already present');
  }

  console.log('\nDone. Sign in at http://localhost:3000/login → "Korepetitorius"');
  console.log(`  email: ${email}`);
  console.log('  password: (the TEST_TUTOR_PASSWORD you supplied)');
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
