/**
 * Reset Demo Mokykla film logins + create Mokslo vaisiai demo student/parent.
 * Production org only for these two orgs. Idempotent.
 *
 *   node scripts/seed-film-demo-logins.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PASSWORD = 'TutlioQaDemo2026!';

const SCHOOL_ORG = 'c3a00000-7e57-4000-8000-000000000001';
const SCHOOL_TUTOR = 'c3a00000-7e57-4000-8000-000000000003';
const SCHOOL_ADMIN = 'c3a00000-7e57-4000-8000-000000000002';
const SCHOOL_STUDENT_USER = 'c3a00000-7e57-4000-8000-0000000000a1';
const SCHOOL_STUDENT_ROW = 'c3a00000-7e57-4000-8000-000000000005';
const SCHOOL_MATH = 'c3a00000-7e57-4000-8000-000000000011';
const SCHOOL_SESSION = 'c3a00000-7e57-4000-8000-0000000000f8';

const MV_ORG = 'c1f36796-c281-4650-bed2-1bd6874764f1';
const MV_TUTOR = '72a8586b-3380-4b3b-a53e-3d04a80c5038'; // Testinis
const MV_MATH = '3af6630d-aa3f-4feb-9c6e-0d2c0aafc6ad';
const MV_STUDENT_USER = '0df10000-7e57-4000-8000-0000000000a1';
const MV_PARENT_USER = '0df10000-7e57-4000-8000-0000000000e0';
const MV_STUDENT_ROW = '0df10000-7e57-4000-8000-000000000005';
const MV_SESSION = '0df10000-7e57-4000-8000-000000000021';

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
    return id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    id,
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    const { data: listed } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const hit = listed?.users?.find((u) => u.email === email);
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

function nextWeekdayAt(hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7 || 7));
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  if (!url.includes('cuhciqwmqfuajeeqjjbm')) {
    throw new Error('This script is for production Tutlio project only');
  }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  await ensureAuthUser(supabase, {
    id: SCHOOL_ADMIN,
    email: 'demo-mokykla.demo.admin@tutlio.lt',
    fullName: 'Demo Mokykla Admin',
  });
  await ensureAuthUser(supabase, {
    id: SCHOOL_TUTOR,
    email: 'demo-mokykla.demo.tutor@tutlio.lt',
    fullName: 'Demo Mokykla Mokytoja',
  });
  await ensureAuthUser(supabase, {
    id: SCHOOL_STUDENT_USER,
    email: 'demo-mokykla.demo.student@tutlio.lt',
    fullName: 'Mokykla Mokinys Lukas',
  });

  const schoolStart = nextWeekdayAt(16, 0);
  const schoolEnd = new Date(schoolStart.getTime() + 45 * 60 * 1000);
  const { error: schoolSessErr } = await supabase.from('sessions').upsert({
    id: SCHOOL_SESSION,
    tutor_id: SCHOOL_TUTOR,
    student_id: SCHOOL_STUDENT_ROW,
    subject_id: SCHOOL_MATH,
    start_time: schoolStart.toISOString(),
    end_time: schoolEnd.toISOString(),
    status: 'active',
    topic: 'Matematika',
    meeting_link: 'https://meet.google.com/demo-mokykla-film',
  }, { onConflict: 'id' });
  if (schoolSessErr) throw new Error(`school session: ${schoolSessErr.message}`);

  const studentUserId = await ensureAuthUser(supabase, {
    id: MV_STUDENT_USER,
    email: 'mokslovaisiai.demo.student@tutlio.lt',
    fullName: 'Demo Mokinys Ąžuolas',
  });
  const parentUserId = await ensureAuthUser(supabase, {
    id: MV_PARENT_USER,
    email: 'mokslovaisiai.demo.parent@tutlio.lt',
    fullName: 'Demo Mama Rūta',
  });

  const { data: parentProfile, error: ppErr } = await supabase
    .from('parent_profiles')
    .upsert(
      {
        user_id: parentUserId,
        full_name: 'Demo Mama Rūta',
        email: 'mokslovaisiai.demo.parent@tutlio.lt',
        phone: '+37060000111',
      },
      { onConflict: 'user_id' },
    )
    .select('id')
    .single();
  if (ppErr || !parentProfile) throw new Error(`parent_profiles: ${ppErr?.message || 'no row'}`);

  const { error: stuErr } = await supabase.from('students').upsert({
    id: MV_STUDENT_ROW,
    tutor_id: MV_TUTOR,
    organization_id: MV_ORG,
    full_name: 'Demo Mokinys Ąžuolas',
    email: 'mokslovaisiai.demo.student@tutlio.lt',
    grade: '7 klasė',
    linked_user_id: studentUserId,
    parent_user_id: parentUserId,
    payer_name: 'Demo Mama Rūta',
    payer_email: 'mokslovaisiai.demo.parent@tutlio.lt',
    phone: '+37060000112',
    enrollment_status: 'active',
  }, { onConflict: 'id' });
  if (stuErr) throw new Error(`mv student: ${stuErr.message}`);

  const { error: psErr } = await supabase.from('parent_students').upsert(
    { parent_id: parentProfile.id, student_id: MV_STUDENT_ROW },
    { onConflict: 'parent_id,student_id' },
  );
  if (psErr && !String(psErr.message).includes('duplicate')) {
    const { error: ps2 } = await supabase.from('parent_students').insert({
      parent_id: parentProfile.id,
      student_id: MV_STUDENT_ROW,
    });
    if (ps2 && !String(ps2.message).toLowerCase().includes('duplicate')) {
      throw new Error(`parent_students: ${ps2.message}`);
    }
  }

  const mvStart = nextWeekdayAt(17, 0);
  const mvEnd = new Date(mvStart.getTime() + 60 * 60 * 1000);
  const { error: mvSessErr } = await supabase.from('sessions').upsert({
    id: MV_SESSION,
    tutor_id: MV_TUTOR,
    student_id: MV_STUDENT_ROW,
    subject_id: MV_MATH,
    start_time: mvStart.toISOString(),
    end_time: mvEnd.toISOString(),
    status: 'active',
    topic: 'Matematika',
    meeting_link: 'https://meet.google.com/mv-demo-film',
  }, { onConflict: 'id' });
  if (mvSessErr) throw new Error(`mv session: ${mvSessErr.message}`);

  console.log('OK. Password for all film demos:', PASSWORD);
  console.log('Demo Mokykla admin:  https://www.tutlio.lt/school/login  demo-mokykla.demo.admin@tutlio.lt');
  console.log('Demo Mokykla teacher: https://www.tutlio.lt/login         demo-mokykla.demo.tutor@tutlio.lt');
  console.log('Demo Mokykla student: https://www.tutlio.lt/login         demo-mokykla.demo.student@tutlio.lt');
  console.log('Mokslo vaisiai student: https://www.tutlio.lt/login       mokslovaisiai.demo.student@tutlio.lt');
  console.log('Mokslo vaisiai parent:  https://www.tutlio.lt/login       mokslovaisiai.demo.parent@tutlio.lt');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
