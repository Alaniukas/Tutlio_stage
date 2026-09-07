/**
 * Demo Mokykla QA: multi-group tutor calendar, tutor sort list, finance completed sessions.
 *
 * Usage:
 *   node scripts/seed-school-class-groups-calendar-qa.mjs
 *   ENV_FILE=.env.local node scripts/seed-school-class-groups-calendar-qa.mjs
 *
 * Requires seed-qa-demo-orgs.mjs run first.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PASSWORD = 'TutlioQaDemo2026!';

const DEMO_ORG = 'c3a00000-7e57-4000-8000-000000000001';
const TUTOR1 = 'c3a00000-7e57-4000-8000-000000000003';
const SUBJECT_ID = 'c3a00000-7e57-4000-8000-000000000011';

const IDS = {
  tutor2: 'c3a00000-7e57-4000-8000-0000000000b1',
  tutor3: 'c3a00000-7e57-4000-8000-0000000000b2',
  invite1: 'c3a00000-7e57-4000-8000-0000000000b3',
  invite2: 'c3a00000-7e57-4000-8000-0000000000b4',
  invite3: 'c3a00000-7e57-4000-8000-0000000000b5',
  groupLt: 'c3a00000-7e57-4000-8000-0000000000c1',
  groupMath: 'c3a00000-7e57-4000-8000-0000000000c2',
  slotLt: 'c3a00000-7e57-4000-8000-0000000000c3',
  slotMath: 'c3a00000-7e57-4000-8000-0000000000c4',
  studentA: 'c3a00000-7e57-4000-8000-000000000005',
  studentB: 'c3a00000-7e57-4000-8000-000000000006',
  studentC: 'c3a00000-7e57-4000-8000-0000000000c1',
  studentD: 'c3a00000-7e57-4000-8000-0000000000c6',
  sessLtA: 'c3a00000-7e57-4000-8000-0000000000d1',
  sessLtB: 'c3a00000-7e57-4000-8000-0000000000d2',
  sessLtC: 'c3a00000-7e57-4000-8000-0000000000d3',
  sessMathA: 'c3a00000-7e57-4000-8000-0000000000d4',
  sessMathD: 'c3a00000-7e57-4000-8000-0000000000d5',
  sessDoneA: 'c3a00000-7e57-4000-8000-0000000000d6',
  sessDoneB: 'c3a00000-7e57-4000-8000-0000000000d7',
};

function loadEnv() {
  const candidates = [process.env.ENV_FILE, '.env.local', '.env.vercel.stage', '.env'].filter(Boolean);
  const env = { ...process.env };
  for (const rel of candidates) {
    const path = rel.includes('/') || rel.includes('\\') ? rel : join(ROOT, rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!env[m[1]]) env[m[1]] = v;
    }
    console.log('Loaded env from', path);
    break;
  }
  return env;
}

async function ensureAuthUser(supabase, { id, email, fullName, password }) {
  const { data: existing } = await supabase.auth.admin.getUserById(id);
  if (existing?.user) return;
  const { error } = await supabase.auth.admin.createUser({
    id,
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`auth ${email}: ${error.message}`);
}

function nextWeekdayAt(weekday, hour, minute) {
  const now = new Date();
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  while (d.getDay() !== weekday || d <= now) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}


async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const tutors = [
    { id: IDS.tutor2, email: 'demo-mokykla.demo.tutor2@tutlio.lt', fullName: 'Demo Mokytoja Ana', joinedAt: '2025-02-10T10:00:00Z' },
    { id: IDS.tutor3, email: 'demo-mokykla.demo.tutor3@tutlio.lt', fullName: 'Demo Mokytojas Benas', joinedAt: '2026-01-15T10:00:00Z' },
  ];

  for (const tutor of tutors) {
    await ensureAuthUser(supabase, { ...tutor, password: PASSWORD });
    await supabase.from('profiles').upsert({
      id: tutor.id,
      email: tutor.email,
      full_name: tutor.fullName,
      organization_id: DEMO_ORG,
      company_commission_percent: 22,
      has_active_license: true,
    }, { onConflict: 'id' });
  }

  await supabase.from('profiles').update({
    company_commission_percent: 25,
    has_active_license: true,
  }).eq('id', TUTOR1);

  const invites = [
    { id: IDS.invite1, used_by_profile_id: TUTOR1, created_at: '2024-09-01T08:00:00Z', token: 'qa-tutor1-invite' },
    { id: IDS.invite2, used_by_profile_id: IDS.tutor2, created_at: '2025-02-10T10:00:00Z', token: 'qa-tutor2-invite' },
    { id: IDS.invite3, used_by_profile_id: IDS.tutor3, created_at: '2026-01-15T10:00:00Z', token: 'qa-tutor3-invite' },
  ];
  for (const inv of invites) {
    await supabase.from('tutor_invites').upsert({
      id: inv.id,
      organization_id: DEMO_ORG,
      token: inv.token,
      type: 'full',
      used: true,
      used_by_profile_id: inv.used_by_profile_id,
      invitee_name: inv.used_by_profile_id === TUTOR1 ? 'Demo Mokykla Korepetitorė' : null,
      created_at: inv.created_at,
    }, { onConflict: 'id' });
  }

  const groups = [
    {
      id: IDS.groupLt,
      name: 'LT 5 kl.',
      weekday: 2,
      start: '11:00',
      end: '11:45',
      slotId: IDS.slotLt,
      members: [IDS.studentA, IDS.studentB, IDS.studentC],
      meet: 'https://meet.google.com/demo-school-lt5',
    },
    {
      id: IDS.groupMath,
      name: 'Matematika 6 kl.',
      weekday: 2,
      start: '14:00',
      end: '14:45',
      slotId: IDS.slotMath,
      members: [IDS.studentA, IDS.studentD],
      meet: 'https://meet.google.com/demo-school-math6',
    },
  ];

  for (const g of groups) {
    await supabase.from('school_class_groups').upsert({
      id: g.id,
      organization_id: DEMO_ORG,
      tutor_id: TUTOR1,
      subject_id: SUBJECT_ID,
      name: g.name,
      school_year_start: '2026-09-01',
      school_year_end: '2027-06-15',
      platform: 'Google Meet',
      duration_minutes: 45,
      meeting_link: g.meet,
    }, { onConflict: 'id' });
    await supabase.from('school_class_group_slots').upsert({
      id: g.slotId,
      group_id: g.id,
      weekday: g.weekday,
      start_time: g.start,
      end_time: g.end,
    }, { onConflict: 'id' });
    for (const sid of g.members) {
      await supabase.from('school_class_group_members').upsert({
        group_id: g.id,
        student_id: sid,
      }, { onConflict: 'group_id,student_id' });
    }
  }

  const upcomingLt = nextWeekdayAt(2, 11, 0);
  const upcomingMath = nextWeekdayAt(2, 14, 0);
  const completedPast = new Date();
  completedPast.setDate(completedPast.getDate() - 7);
  completedPast.setHours(11, 0, 0, 0);

  const sessionRows = [
    { id: IDS.sessLtA, student_id: IDS.studentA, group: groups[0], start: upcomingLt },
    { id: IDS.sessLtB, student_id: IDS.studentB, group: groups[0], start: upcomingLt },
    { id: IDS.sessLtC, student_id: IDS.studentC, group: groups[0], start: upcomingLt },
    { id: IDS.sessMathA, student_id: IDS.studentA, group: groups[1], start: upcomingMath },
    { id: IDS.sessMathD, student_id: IDS.studentD, group: groups[1], start: upcomingMath },
  ].map(({ id, student_id, group, start }) => {
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    return {
      id,
      tutor_id: TUTOR1,
      student_id,
      subject_id: SUBJECT_ID,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'active',
      meeting_link: group.meet,
      price: 0,
      school_billing_kind: 'base',
      class_group_id: group.id,
      topic: group.name,
      tutor_comment: 'QA: pasiruoškite namų darbus.',
      show_comment_to_student: true,
    };
  });

  for (const [sid, id] of [[IDS.studentA, IDS.sessDoneA], [IDS.studentB, IDS.sessDoneB]]) {
    const end = new Date(completedPast.getTime() + 45 * 60 * 1000);
    sessionRows.push({
      id,
      tutor_id: TUTOR1,
      student_id: sid,
      subject_id: SUBJECT_ID,
      start_time: completedPast.toISOString(),
      end_time: end.toISOString(),
      status: 'completed',
      meeting_link: 'https://meet.google.com/demo-school-lt5',
      price: 0,
      school_billing_kind: 'base',
      class_group_id: IDS.groupLt,
      topic: 'LT 5 kl.',
    });
  }

  for (const row of sessionRows) {
    const { error } = await supabase.from('sessions').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`session ${row.id}: ${error.message}`);
  }

  console.log('\nDemo Mokykla class-group calendar QA seeded.');
  console.log('Admin:  demo-mokykla.demo.admin@tutlio.lt  /school/tutors (sort)');
  console.log('Tutor:  demo-mokykla.demo.tutor@tutlio.lt  /calendar + /finance');
  console.log('Student: demo-mokykla.demo.student@tutlio.lt /student/schedule');
  console.log('Password (all):', PASSWORD);
  console.log('Groups: LT 5 kl. (Tue 11:00), Matematika 6 kl. (Tue 14:00)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
