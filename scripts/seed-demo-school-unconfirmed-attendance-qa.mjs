/**
 * Demo Mokykla only — fake Laisvi-vaikai-style attendance cases.
 * Does not touch production VšĮ Laisvi vaikai.
 *
 * Creates October group occurrences plus a 2026-09-03 historical occurrence
 * so "Nepatvirtintas lankomumas" can be checked against real join evidence.
 *
 * Usage (PowerShell):
 *   node scripts/seed-demo-school-unconfirmed-attendance-qa.mjs
 *
 * Login after seed:
 *   http://localhost:3000/school/login
 *   demo-mokykla.demo.admin@tutlio.lt / TutlioQaDemo2026!
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PASSWORD = 'TutlioQaDemo2026!';

const DEMO_ORG = 'c3a00000-7e57-4000-8000-000000000001';
const ADMIN_ID = 'c3a00000-7e57-4000-8000-000000000002';
const TUTOR_ID = 'c3a00000-7e57-4000-8000-000000000003';
const SUBJECT_ID = 'c3a00000-7e57-4000-8000-000000000011';

const IDS = {
  group: 'c3a00000-7e57-4000-8000-0000000000e1',
  slot: 'c3a00000-7e57-4000-8000-0000000000e2',
  lukas: 'c3a00000-7e57-4000-8000-000000000005',
  gabija: 'c3a00000-7e57-4000-8000-000000000006',
  nojus: 'c3a00000-7e57-4000-8000-000000000007',
  oct1MissedLukas: 'c3a00000-7e57-4000-8000-0000000000e3',
  oct1JoinedGabija: 'c3a00000-7e57-4000-8000-0000000000e4',
  oct1UnmarkedNojus: 'c3a00000-7e57-4000-8000-0000000000e5',
  oct1ConfirmedGabija: 'c3a00000-7e57-4000-8000-0000000000e6',
  oct8MissedLukas: 'c3a00000-7e57-4000-8000-0000000000ea',
  oct8MissedGabija: 'c3a00000-7e57-4000-8000-0000000000eb',
  oct15MissedNojus: 'c3a00000-7e57-4000-8000-0000000000ec',
  oct15JoinedLukas: 'c3a00000-7e57-4000-8000-0000000000ed',
  sepMissedLookalike: 'c3a00000-7e57-4000-8000-0000000000e7',
  sepJoinedLookalike: 'c3a00000-7e57-4000-8000-0000000000e8',
  sepUnmarked: 'c3a00000-7e57-4000-8000-0000000000e9',
};

const MEET = 'https://meet.google.com/qa-unconfirmed-attendance';

/** KPI counts only sessions that already started (start_time <= now) in the current month. */
function qaSessionWindow(index) {
  const now = Date.now();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const endMs = now - (2 + index * 6) * 3600000;
  let startMs = endMs - 45 * 60 * 1000;
  if (startMs < monthStart.getTime()) {
    const fallback = new Date(monthStart);
    fallback.setHours(6 + index, 0, 0, 0);
    startMs = fallback.getTime();
  }
  const start = new Date(startMs);
  const end = new Date(startMs + 45 * 60 * 1000);
  const tutorJoin = new Date(startMs + 60 * 1000);
  const studentJoin = new Date(startMs + 2 * 60 * 1000);
  const confirmed = new Date(endMs + 5 * 60 * 1000);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    tutorJoin: tutorJoin.toISOString(),
    studentJoin: studentJoin.toISOString(),
    confirmed: confirmed.toISOString(),
  };
}

function historyWindow() {
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  start.setDate(3);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 45 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function loadEnv() {
  const path = join(ROOT, process.env.ENV_FILE || '.env');
  if (!existsSync(path)) throw new Error(`Missing env file: ${path}`);
  const env = { ...process.env };
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  console.log('Loaded env from', path);
  return env;
}

async function ensureAuthUser(supabase, { id, email, fullName }) {
  const { data: existing } = await supabase.auth.admin.getUserById(id);
  if (existing?.user) {
    const { error } = await supabase.auth.admin.updateUserById(id, {
      email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`updateUser ${email}: ${error.message}`);
    return;
  }
  const { error } = await supabase.auth.admin.createUser({
    id, email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
}

function sessionRow(partial) {
  return {
    tutor_id: TUTOR_ID,
    subject_id: SUBJECT_ID,
    class_group_id: IDS.group,
    meeting_link: MEET,
    price: 0,
    school_billing_kind: 'base',
    topic: 'QA lankomumas',
    ...partial,
  };
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  if (url.includes('xklzjhfztjxltrdkplog')) {
    throw new Error('This env still points at the retired Supabase project. Fix VITE_SUPABASE_URL in .env.');
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: org, error: orgError } = await supabase.from('organizations')
    .select('id, slug, entity_type, features').eq('id', DEMO_ORG).maybeSingle();
  if (orgError || !org || org.entity_type !== 'school') {
    throw new Error('Demo Mokykla was not found. Run scripts/seed-qa-demo-orgs.mjs first.');
  }

  await ensureAuthUser(supabase, {
    id: ADMIN_ID, email: 'demo-mokykla.demo.admin@tutlio.lt', fullName: 'Demo Mokykla Admin',
  });
  await ensureAuthUser(supabase, {
    id: TUTOR_ID, email: 'demo-mokykla.demo.tutor@tutlio.lt', fullName: 'Demo Mokykla Korepetitorė',
  });

  const features = {
    ...(org.features && typeof org.features === 'object' ? org.features : {}),
    school_join_no_show: true,
    tutor_lesson_status_confirmation: true,
    school_teacher_labels: true,
    school_class_groups: true,
    school_contract_esign: true,
    school_staff_documents: true,
    school_extra_lessons_contract: true,
    school_lesson_recordings: true,
  };
  const { error: featureError } = await supabase.from('organizations')
    .update({ features }).eq('id', DEMO_ORG);
  if (featureError) throw new Error(`features: ${featureError.message}`);

  const { error: groupError } = await supabase.from('school_class_groups').upsert({
    id: IDS.group,
    organization_id: DEMO_ORG,
    tutor_id: TUTOR_ID,
    subject_id: SUBJECT_ID,
    name: 'QA lankomumas',
    school_year_start: '2026-09-01',
    school_year_end: '2027-06-15',
    platform: 'Google Meet',
    duration_minutes: 45,
    meeting_link: MEET,
  }, { onConflict: 'id' });
  if (groupError) throw new Error(`group: ${groupError.message}`);

  const { error: slotError } = await supabase.from('school_class_group_slots').upsert({
    id: IDS.slot, group_id: IDS.group, weekday: 4, start_time: '06:00', end_time: '06:45',
  }, { onConflict: 'id' });
  if (slotError) throw new Error(`slot: ${slotError.message}`);

  for (const studentId of [IDS.lukas, IDS.gabija, IDS.nojus]) {
    const { error } = await supabase.from('school_class_group_members')
      .upsert({ group_id: IDS.group, student_id: studentId }, { onConflict: 'group_id,student_id' });
    if (error) throw new Error(`member ${studentId}: ${error.message}`);
  }

  const g1 = qaSessionWindow(0);
  const g2 = qaSessionWindow(1);
  const g3 = qaSessionWindow(2);
  const ind = qaSessionWindow(3);
  const hist = historyWindow();

  const rows = [
    // Grupė 1 — Lukas neatvyko, Gabija prisijungė (tas pats užsiėmimas, skirtingi vaikai)
    sessionRow({
      id: IDS.oct1MissedLukas,
      student_id: IDS.lukas,
      start_time: g1.start,
      end_time: g1.end,
      status: 'no_show',
      no_show_reason: 'missed_join',
      tutor_joined_at: g1.tutorJoin,
      student_joined_at: null,
      status_confirmed_at: null,
      topic: 'QA · grupė 1 · Lukas neatvyko (sistema mato)',
    }),
    sessionRow({
      id: IDS.oct1JoinedGabija,
      student_id: IDS.gabija,
      start_time: g1.start,
      end_time: g1.end,
      status: 'completed',
      no_show_reason: null,
      tutor_joined_at: g1.tutorJoin,
      student_joined_at: g1.studentJoin,
      status_confirmed_at: null,
      topic: 'QA · grupė 1 · Gabija prisijungė',
    }),
    sessionRow({
      id: IDS.oct1UnmarkedNojus,
      student_id: IDS.nojus,
      start_time: g1.start,
      end_time: g1.end,
      status: 'active',
      no_show_reason: null,
      tutor_joined_at: null,
      student_joined_at: null,
      status_confirmed_at: null,
      topic: 'QA · grupė 1 · niekas neprisijungė (neįeina į nepatvirtintą)',
    }),
    sessionRow({
      id: IDS.oct1ConfirmedGabija,
      student_id: IDS.gabija,
      start_time: ind.start,
      end_time: ind.end,
      status: 'completed',
      no_show_reason: null,
      tutor_joined_at: ind.tutorJoin,
      student_joined_at: ind.studentJoin,
      status_confirmed_at: ind.confirmed,
      class_group_id: null,
      topic: 'QA · individualus · patvirtintas dalyvavimas',
    }),
    sessionRow({
      id: IDS.oct8MissedLukas,
      student_id: IDS.lukas,
      start_time: g2.start,
      end_time: g2.end,
      status: 'no_show',
      no_show_reason: 'missed_join',
      tutor_joined_at: g2.tutorJoin,
      student_joined_at: null,
      status_confirmed_at: null,
      topic: 'QA · grupė 2 · Lukas vėl neatvyko',
    }),
    sessionRow({
      id: IDS.oct8MissedGabija,
      student_id: IDS.gabija,
      start_time: g2.start,
      end_time: g2.end,
      status: 'no_show',
      no_show_reason: 'missed_join',
      tutor_joined_at: g2.tutorJoin,
      student_joined_at: null,
      status_confirmed_at: null,
      topic: 'QA · grupė 2 · Gabija neatvyko',
    }),
    sessionRow({
      id: IDS.oct15MissedNojus,
      student_id: IDS.nojus,
      start_time: g3.start,
      end_time: g3.end,
      status: 'no_show',
      no_show_reason: 'missed_join',
      tutor_joined_at: g3.tutorJoin,
      student_joined_at: null,
      status_confirmed_at: null,
      topic: 'QA · grupė 3 · Nojus neatvyko',
    }),
    sessionRow({
      id: IDS.oct15JoinedLukas,
      student_id: IDS.lukas,
      start_time: ind.start,
      end_time: ind.end,
      status: 'completed',
      no_show_reason: null,
      tutor_joined_at: ind.tutorJoin,
      student_joined_at: ind.studentJoin,
      status_confirmed_at: ind.confirmed,
      class_group_id: null,
      topic: 'QA · individualus · Lukas patvirtintas',
    }),
    sessionRow({
      id: IDS.sepMissedLookalike,
      student_id: IDS.lukas,
      start_time: hist.start,
      end_time: hist.end,
      status: 'active',
      no_show_reason: null,
      tutor_joined_at: null,
      student_joined_at: null,
      status_confirmed_at: null,
      topic: 'QA · praeito mėn. istorija be join įrodymų',
    }),
    sessionRow({
      id: IDS.sepJoinedLookalike,
      student_id: IDS.gabija,
      start_time: hist.start,
      end_time: hist.end,
      status: 'active',
      no_show_reason: null,
      tutor_joined_at: null,
      student_joined_at: null,
      status_confirmed_at: null,
      topic: 'QA · praeito mėn. istorija be join įrodymų',
    }),
    sessionRow({
      id: IDS.sepUnmarked,
      student_id: IDS.nojus,
      start_time: hist.start,
      end_time: hist.end,
      status: 'active',
      no_show_reason: null,
      tutor_joined_at: null,
      student_joined_at: null,
      status_confirmed_at: null,
      topic: 'QA · praeito mėn. istorija be join įrodymų',
    }),
  ];

  for (const row of rows) {
    const { error } = await supabase.from('sessions').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`session ${row.id}: ${error.message}`);
  }

  console.log('\nDemo Mokykla unconfirmed-attendance QA seeded.');
  console.log('Admin:    http://localhost:3000/school/login');
  console.log('          demo-mokykla.demo.admin@tutlio.lt');
  console.log('Teacher:  http://localhost:3000/login');
  console.log('          demo-mokykla.demo.tutor@tutlio.lt');
  console.log('Password:', PASSWORD);
  console.log('\nExpected current-month KPI (Apžvalga / Statistika):');
  console.log('  Įvyko ≈ 4  (3 grupės + 1 individualus — datos pritaikytos prie „dabar“)');
  console.log('  Nepatvirtintas lankomumas = 4  (Lukas×2, Gabija×1, Nojus×1)');
  console.log('  Dalyvavo vaikai ≥ 1  (Gabija prisijungė grupėje 1; + patvirtinti individualūs)');
  console.log('  Lankomumas % = tik patvirtinti (neatvykę nepatvirtinti ≠ 0% automatiškai)');
  console.log('  Grupėje 1: Gabija dalyvavo + Lukas nepatvirtintas — skirtingi vaikai, ne tas pats!');
  console.log('\nEnv: naudok tik .env su cuhciqwmqfuajeeqjjbm (ne seną xklzjhfztjxltrdkplog).');
  console.log('Hard refresh (Ctrl+Shift+R) after seed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
