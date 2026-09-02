/**
 * Idempotent sales demo for the Haarlem bijlesbedrijf (Nada El Abouti).
 * Company org — not school, not Pro Klasė. Dutch names, Haarlem, ~10 docenten.
 *
 *   node scripts/seed-haarlem-bijles-demo.mjs
 *
 * Reads .env.local then .env.vercel.stage then .env.
 * Prints the target Supabase URL before writing.
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

const ADMIN = { id: id(2), email: 'haarlem.demo.admin@tutlio.lt', fullName: 'Nada El Abouti' };

const TUTORS = [
  { id: id(3), email: 'haarlem.demo.tutor@tutlio.lt', fullName: 'Sanne de Vries', phone: '+31 6 12345601', pay: 28, subject: 'Wiskunde' },
  { id: id(4), email: 'haarlem.demo.tutor2@tutlio.lt', fullName: 'Thomas Bakker', phone: '+31 6 12345602', pay: 26, subject: 'Engels' },
  { id: id(5), email: 'haarlem.demo.tutor3@tutlio.lt', fullName: 'Femke Jansen', phone: '+31 6 12345603', pay: 26, subject: 'Nederlands' },
  { id: id(6), email: 'haarlem.demo.tutor4@tutlio.lt', fullName: 'Daan Visser', phone: '+31 6 12345604', pay: 27, subject: 'Natuurkunde' },
  { id: id(7), email: 'haarlem.demo.tutor5@tutlio.lt', fullName: 'Lieke Hendriks', phone: '+31 6 12345605', pay: 25, subject: 'Biologie' },
  { id: id(8), email: 'haarlem.demo.tutor6@tutlio.lt', fullName: 'Bram Meijer', phone: '+31 6 12345606', pay: 24, subject: 'Wiskunde' },
  { id: id(9), email: 'haarlem.demo.tutor7@tutlio.lt', fullName: 'Isa van Dijk', phone: '+31 6 12345607', pay: 24, subject: 'Engels' },
  { id: id(10), email: 'haarlem.demo.tutor8@tutlio.lt', fullName: 'Sem de Boer', phone: '+31 6 12345608', pay: 25, subject: 'Geschiedenis' },
  { id: id(11), email: 'haarlem.demo.tutor9@tutlio.lt', fullName: 'Eva Kuiper', phone: '+31 6 12345609', pay: 23, subject: 'Nederlands' },
  { id: id(12), email: 'haarlem.demo.tutor10@tutlio.lt', fullName: 'Lars Smit', phone: '+31 6 12345610', pay: 24, subject: 'Wiskunde' },
];

const STUDENTS = [
  { id: id(101), tutor: 0, name: 'Finn de Groot', grade: 'groep 7', subject: 'Wiskunde', payer: 'Marieke de Groot' },
  { id: id(102), tutor: 0, name: 'Tess Bakker', grade: 'groep 8', subject: 'Wiskunde', payer: 'Paul Bakker' },
  { id: id(103), tutor: 0, name: 'Milan Vos', grade: '2 havo', subject: 'Wiskunde', payer: 'Sandra Vos' },
  { id: id(104), tutor: 1, name: 'Noor Hendriks', grade: '3 vwo', subject: 'Engels', payer: 'Anne Hendriks' },
  { id: id(105), tutor: 1, name: 'Sem Jansen', grade: 'groep 6', subject: 'Engels', payer: 'Karen Jansen' },
  { id: id(106), tutor: 2, name: 'Emma Visser', grade: '4 havo', subject: 'Nederlands', payer: 'Peter Visser' },
  { id: id(107), tutor: 2, name: 'Bram Kuiper', grade: 'groep 8', subject: 'Nederlands', payer: 'Linda Kuiper' },
  { id: id(108), tutor: 3, name: 'Isa Meijer', grade: '5 vwo', subject: 'Natuurkunde', payer: 'Johan Meijer' },
  { id: id(109), tutor: 4, name: 'Daan de Boer', grade: '4 vwo', subject: 'Biologie', payer: 'Sophie de Boer' },
  { id: id(110), tutor: 5, name: 'Lieke Smit', grade: 'groep 7', subject: 'Wiskunde', payer: 'Mark Smit' },
  { id: id(111), tutor: 5, name: 'Lars van Dijk', grade: '3 havo', subject: 'Wiskunde', payer: 'Eva van Dijk' },
  { id: id(112), tutor: 6, name: 'Sara El Idrissi', grade: '2 vwo', subject: 'Engels', payer: 'Nadia El Idrissi' },
  { id: id(113), tutor: 0, name: 'Julian Peters', grade: 'groep 8', subject: 'Wiskunde', payer: 'Helen Peters' },
  { id: id(114), tutor: 0, name: 'Fleur Willems', grade: 'groep 7', subject: 'Wiskunde', payer: 'Tom Willems' },
  { id: id(115), tutor: 1, name: 'Omar Benali', grade: '5 havo', subject: 'Engels', payer: 'Fatima Benali' },
  { id: id(116), tutor: 7, name: 'Anna Visser', grade: 'groep 8', subject: 'Geschiedenis', payer: 'Hans Visser' },
  { id: id(117), tutor: 8, name: 'Koen de Wit', grade: '3 havo', subject: 'Nederlands', payer: 'Carla de Wit' },
  { id: id(118), tutor: 9, name: 'Nina Bosch', grade: '2 vwo', subject: 'Wiskunde', payer: 'Rik Bosch' },
  { id: id(119), tutor: 3, name: 'Tim de Lange', grade: '6 vwo', subject: 'Natuurkunde', payer: 'Inge de Lange' },
  { id: id(120), tutor: 4, name: 'Roos Hartman', grade: '5 havo', subject: 'Biologie', payer: 'Gert Hartman' },
  { id: id(121), tutor: 6, name: 'Yara Hassan', grade: '4 vwo', subject: 'Engels', payer: 'Amina Hassan' },
  { id: id(122), tutor: 0, name: 'Max de Vries', grade: 'groep 6', subject: 'Wiskunde', payer: 'Sanne de Vries sr.' },
  { id: id(123), tutor: 1, name: 'Lotte Smit', grade: 'groep 7', subject: 'Engels', payer: 'Erik Smit' },
  { id: id(124), tutor: 2, name: 'Jesse Mulder', grade: '1 havo', subject: 'Nederlands', payer: 'Monique Mulder' },
  { id: id(125), tutor: 5, name: 'Sophie Vos', grade: 'groep 8', subject: 'Wiskunde', payer: 'Daan Vos' },
];

const NOTE_POOL = [
  'Goed tempo vandaag. Ouders mogen dit in het dossier zien.',
  'Huiswerk was incompleet; volgende les eerst herhalen.',
  'Zelfvertrouwen groeit. Korte extra oefening meegegeven.',
  'Concentratie zakte na 40 minuten. Volgende keer kortere blokken.',
  'Toets volgende week — extra oefenopgaven gestuurd naar de organisatie.',
  'Leerling was goed voorbereid. Geen bijzonderheden.',
  'Vraagt of we naar 2× per week kunnen. Graag intern afstemmen.',
  'Sterke les. Cijfergevoel gaat de goede kant op.',
];

/** August–September 2026 is CEST (UTC+2). */
function ams(y, mo, d, h, min) {
  return new Date(Date.UTC(y, mo - 1, d, h - 2, min, 0)).toISOString();
}

function ymdFromMonday(y, mo, d, addDays) {
  const dt = new Date(Date.UTC(y, mo - 1, d + addDays));
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function slotForStudent(localIdx, studentId) {
  if (studentId === id(102)) return { day: 4, hour: 15, minute: 30 };
  return { day: 1 + (localIdx % 5), hour: 15 + Math.floor(localIdx / 5), minute: 0 };
}

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

async function upsert(supabase, table, row, onConflict = 'id') {
  const { error } = await supabase.from(table).upsert(row, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  console.log('Target Supabase:', url);

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  await upsert(supabase, 'organizations', {
    id: ORG_ID,
    name: 'Bijles Haarlem',
    email: ADMIN.email,
    status: 'active',
    entity_type: 'company',
    tutor_license_count: 10,
    tutor_limit: 9999,
    slug: SLUG,
    brand_color: '#0F766E',
    brand_color_secondary: '#F59E0B',
    preferred_locale: 'nl',
    enable_per_lesson: true,
    enable_prepaid_packages: true,
    enable_monthly_billing: false,
    default_company_commission_percent: 26,
    features: {
      custom_branding: true,
      hide_powered_by: true,
      public_name: 'Bijles Haarlem',
      contact_email: ADMIN.email,
      email_team_signature: 'Team Bijles Haarlem',
      email_sender_name: 'Bijles Haarlem',
      login_description:
        'Bijles in Haarlem voor de basisschool en middelbare school. Individuele lessen en kleine groepen, met één overzicht voor roosters, aanwezigheid en docenten.',
      org_admin_calendar_view: true,
      org_admin_calendar_full_control: true,
      tutor_lesson_status_confirmation: true,
      student_schedule_overview: true,
      full_student_edit: true,
      student_card_booking: true,
      flexible_invitations: true,
      per_student_payment_override: true,
      school_teacher_labels: true,
    },
  });

  const authIds = {};
  authIds.admin = await ensureAuthUser(supabase, ADMIN);
  for (const t of TUTORS) {
    authIds[t.id] = await ensureAuthUser(supabase, t);
  }

  await upsert(supabase, 'profiles', {
    id: authIds.admin,
    email: ADMIN.email,
    full_name: ADMIN.fullName,
    organization_id: ORG_ID,
    preferred_locale: 'nl',
    phone: '+31 6 12345000',
  });
  await upsert(supabase, 'organization_admins', { user_id: authIds.admin, organization_id: ORG_ID }, 'user_id');

  for (const t of TUTORS) {
    const uid = authIds[t.id];
    await upsert(supabase, 'profiles', {
      id: uid,
      email: t.email,
      full_name: t.fullName,
      organization_id: ORG_ID,
      preferred_locale: 'nl',
      phone: t.phone,
      has_active_license: true,
      company_commission_percent: t.pay,
      personal_meeting_link: 'https://meet.google.com/haarlem-demo',
      teaching_notes: `${t.subject} · Haarlem · individueel en kleine groep`,
    });
  }

  const subjectByTutor = {};
  const groupSubjectId = id(250);
  for (let i = 0; i < TUTORS.length; i++) {
    const t = TUTORS[i];
    const sid = id(201 + i);
    subjectByTutor[t.id] = sid;
    await upsert(supabase, 'subjects', {
      id: sid,
      tutor_id: authIds[t.id],
      name: t.subject,
      price: 42,
      duration_minutes: 60,
      is_group: false,
    });
  }
  await upsert(supabase, 'subjects', {
    id: groupSubjectId,
    tutor_id: authIds[TUTORS[0].id],
    name: 'Wiskunde groep',
    price: 28,
    duration_minutes: 60,
    is_group: true,
    max_students: 4,
  });

  const comments = {
    [id(101)]: 'Finn oefent extra met breuken. Ouders willen volgende maand 2× per week.',
    [id(102)]: 'Tess is goed voorbereid; Cito-rekenen gaat vooruit.',
    [id(103)]: 'Milan mist soms huiswerk. Sanne noteert dit na elke les.',
    [id(104)]: 'Noor werkt naar eindexamen Engels. Mondeling is sterk, schrijven nog zwak.',
    [id(108)]: 'Isa zit in examenjaar natuurkunde. Extra aandacht voor elektriciteit.',
    [id(112)]: 'Sara wisselt soms van tijdstip vanwege sport. Flexibel inplannen.',
    [id(119)]: 'Tim oefent eindexamen natuurkunde; cijfer van 6,2 naar 7,1.',
    [id(121)]: 'Yara schrijft al sterkere essays. Mondeling nog oefenen.',
  };

  const cities = ['Haarlem', 'Haarlem', 'Heemstede', 'Bloemendaal', 'Haarlem', 'Overveen'];
  for (let si = 0; si < STUDENTS.length; si++) {
    const s = STUDENTS[si];
    const tutor = TUTORS[s.tutor];
    await upsert(supabase, 'students', {
      id: s.id,
      tutor_id: authIds[tutor.id],
      organization_id: ORG_ID,
      full_name: s.name,
      email: null,
      grade: s.grade,
      payer_name: s.payer,
      payer_email: 'haarlem.demo.ouder@tutlio.lt',
      phone: `+31 6 2000${String(1000 + si).slice(-4)}`,
      student_city: cities[si % cities.length],
      student_address: 'Grote Markt 1',
      admin_comment: comments[s.id] || null,
      admin_comment_visible_to_tutor: Boolean(comments[s.id]),
    });
  }

  const sanne = authIds[TUTORS[0].id];
  const nowMs = Date.now();
  const WEEK_MONDAYS = [
    [2026, 8, 17],
    [2026, 8, 24],
    [2026, 8, 31],
    [2026, 9, 7],
    [2026, 9, 14],
  ];
  const localIdxByStudent = {};
  for (const s of STUDENTS) {
    localIdxByStudent[s.id] = STUDENTS.filter((x) => x.tutor === s.tutor).findIndex((x) => x.id === s.id);
  }

  const sessions = [];

  for (let si = 0; si < STUDENTS.length; si++) {
    const s = STUDENTS[si];
    const tutorAuth = authIds[TUTORS[s.tutor].id];
    const subjectId = subjectByTutor[TUTORS[s.tutor].id];
    const slot = slotForStudent(localIdxByStudent[s.id], s.id);
    for (let w = 0; w < WEEK_MONDAYS.length; w++) {
      if (s.id === id(102) && w === 2) continue;
      const [yy, mm, dd] = WEEK_MONDAYS[w];
      const date = ymdFromMonday(yy, mm, dd, slot.day - 1);
      const start = ams(date.y, date.mo, date.d, slot.hour, slot.minute);
      const endH = slot.minute === 30 && slot.hour === 15 ? 16 : slot.hour + 1;
      const endM = slot.minute;
      const end = ams(date.y, date.mo, date.d, endH, endM);
      const startMs = Date.parse(start);
      const endMs = Date.parse(end);
      let status = 'active';
      let paid = startMs < nowMs;
      let comment = null;
      if (s.id === id(103) && w === 2) {
        status = 'no_show';
        paid = false;
        comment = 'Milan is niet verschenen. Ouders zijn op de hoogte.';
      } else if (s.id === id(111) && w === 1) {
        status = 'cancelled';
        paid = false;
        comment = 'Afgezegd door ouders (ziek). Slot vrijgehouden in het rooster.';
      } else if (endMs < nowMs - 2 * 3600000) {
        status = 'completed';
        paid = true;
        comment = NOTE_POOL[(si + w) % NOTE_POOL.length];
      } else if (startMs < nowMs && endMs >= nowMs) {
        status = 'active';
        paid = true;
      } else {
        status = 'active';
        paid = w !== 3 || si % 7 !== 0;
      }
      sessions.push({
        id: id(600 + si * 8 + w),
        tutor: tutorAuth,
        student: s.id,
        subject: subjectId,
        start,
        end,
        status,
        paid,
        price: 42,
        topic: s.subject,
        comment,
      });
    }
  }

  const groupStudents = [id(113), id(114), id(101)];
  const GROUP_WEDNESDAYS = [
    [2026, 8, 19],
    [2026, 8, 26],
    [2026, 9, 2],
    [2026, 9, 9],
    [2026, 9, 16],
  ];
  for (let g = 0; g < GROUP_WEDNESDAYS.length; g++) {
    const [yy, mm, dd] = GROUP_WEDNESDAYS[g];
    const start = ams(yy, mm, dd, 16, 0);
    const end = ams(yy, mm, dd, 17, 0);
    const past = Date.parse(end) < nowMs;
    for (let i = 0; i < groupStudents.length; i++) {
      sessions.push({
        id: id(820 + g * 3 + i),
        tutor: sanne,
        student: groupStudents[i],
        subject: groupSubjectId,
        start,
        end,
        status: past ? 'completed' : 'active',
        paid: past || g === 2,
        price: 28,
        topic: 'Wiskunde · kleine groep',
        comment: past ? 'Kleine groep: breuken en verhoudingen. Tempo was goed.' : null,
        spots: 1,
      });
    }
  }

  // Showcase: Tess donderdag 3 sept 15:30 (na de Meet 13:45).
  sessions.push({
    id: id(308),
    tutor: sanne,
    student: id(102),
    subject: subjectByTutor[TUTORS[0].id],
    start: ams(2026, 9, 3, 15, 30),
    end: ams(2026, 9, 3, 16, 30),
    status: 'active',
    paid: true,
    price: 42,
    topic: 'Wiskunde',
    comment: null,
  });

  for (const sess of sessions) {
    const noShow = sess.status === 'no_show';
    const completed = sess.status === 'completed';
    await upsert(supabase, 'sessions', {
      id: sess.id,
      tutor_id: sess.tutor,
      student_id: sess.student,
      subject_id: sess.subject,
      start_time: sess.start,
      end_time: sess.end,
      status: sess.status,
      paid: sess.paid,
      payment_status: sess.paid ? 'confirmed' : 'unpaid',
      price: sess.price,
      topic: sess.topic,
      tutor_comment: sess.comment,
      show_comment_to_student: false,
      available_spots: sess.spots ?? null,
      meeting_link: 'https://meet.google.com/haarlem-demo',
      tutor_joined_at: completed || noShow ? new Date(Date.parse(sess.start) - 120000).toISOString() : null,
      student_joined_at: completed ? new Date(Date.parse(sess.start) + 60000).toISOString() : null,
      status_confirmed_at: completed || noShow ? new Date(Date.parse(sess.end) + 300000).toISOString() : null,
      status_confirmed_by: completed || noShow ? sess.tutor : null,
    });
  }

  let availN = 401;
  for (const t of TUTORS) {
    const tutorId = authIds[t.id];
    for (const day of [1, 2, 3, 4, 5]) {
      await upsert(supabase, 'availability', {
        id: id(availN++),
        tutor_id: tutorId,
        day_of_week: day,
        start_time: '15:00:00',
        end_time: '20:00:00',
        is_recurring: true,
        subject_ids: [],
        public_bookable: false,
      });
    }
  }

  const recurring = [
    { n: 501, tutor: 0, student: id(102), day: 4, start: '15:30:00', end: '16:30:00', topic: 'Wiskunde' },
    { n: 502, tutor: 0, student: id(101), day: 1, start: '15:00:00', end: '16:00:00', topic: 'Wiskunde' },
    { n: 503, tutor: 1, student: id(104), day: 5, start: '15:00:00', end: '16:00:00', topic: 'Engels' },
    { n: 504, tutor: 2, student: id(106), day: 2, start: '15:00:00', end: '16:00:00', topic: 'Nederlands' },
    { n: 505, tutor: 3, student: id(108), day: 3, start: '15:00:00', end: '16:00:00', topic: 'Natuurkunde' },
  ];
  for (const r of recurring) {
    await upsert(supabase, 'recurring_individual_sessions', {
      id: id(r.n),
      tutor_id: authIds[TUTORS[r.tutor].id],
      student_id: r.student,
      subject_id: subjectByTutor[TUTORS[r.tutor].id],
      day_of_week: r.day,
      start_time: r.start,
      end_time: r.end,
      start_date: '2026-08-01',
      topic: r.topic,
      active: true,
    });
  }

  async function upsertPackage(row, items) {
    await upsert(supabase, 'lesson_packages', row);
    await supabase.from('lesson_package_items').delete().eq('package_id', row.id);
    const { error } = await supabase.from('lesson_package_items').insert(items);
    if (error) throw new Error(`lesson_package_items: ${error.message}`);
  }

  const pkgDefs = [
    { n: 860, student: id(101), tutor: 0, paid: true, lessons: 8, done: 4 },
    { n: 861, student: id(102), tutor: 0, paid: true, lessons: 8, done: 3 },
    { n: 862, student: id(104), tutor: 1, paid: true, lessons: 10, done: 5 },
    { n: 863, student: id(106), tutor: 2, paid: true, lessons: 6, done: 2 },
    { n: 864, student: id(115), tutor: 1, paid: false, lessons: 8, done: 0 },
  ];
  for (const p of pkgDefs) {
    const tutorAuth = authIds[TUTORS[p.tutor].id];
    const subjectId = subjectByTutor[TUTORS[p.tutor].id];
    const available = p.lessons - p.done;
    await upsertPackage({
      id: id(p.n),
      tutor_id: tutorAuth,
      student_id: p.student,
      subject_id: subjectId,
      price_per_lesson: 42,
      total_lessons: p.lessons,
      available_lessons: available,
      reserved_lessons: 0,
      completed_lessons: p.done,
      total_price: p.lessons * 42,
      paid: p.paid,
      payment_status: p.paid ? 'paid' : 'pending',
      paid_at: p.paid ? '2026-08-20T10:00:00.000Z' : null,
      payment_method: 'stripe',
      active: p.paid,
      billing_period_start: '2026-08-01',
      billing_period_end: '2026-09-30',
      expires_at: '2026-09-30T21:59:59.000Z',
    }, [{
      package_id: id(p.n),
      subject_id: subjectId,
      total_lessons: p.lessons,
      available_lessons: available,
      reserved_lessons: 0,
      completed_lessons: p.done,
      price_per_lesson: 42,
      total_price: p.lessons * 42,
      position: 0,
    }]);
  }

  await upsert(supabase, 'invoice_profiles', {
    id: id(870),
    organization_id: ORG_ID,
    entity_type: 'mb',
    business_name: 'Bijles Haarlem',
    company_code: 'NL12345678',
    address: 'Grote Markt 2, 2011 RD Haarlem',
    contact_email: ADMIN.email,
    contact_phone: '+31 6 12345000',
    invoice_series: 'BH',
    next_invoice_number: 3,
    bank_name: 'ING',
    iban: 'NL12INGB0001234567',
  });

  const sellerSnap = {
    name: 'Bijles Haarlem',
    entityType: 'mb',
    companyCode: 'NL12345678',
    address: 'Grote Markt 2, 2011 RD Haarlem',
    contactEmail: ADMIN.email,
    contactPhone: '+31 6 12345000',
  };
  const invoices = [
    { n: 871, number: 'BH-2026-08-01', date: '2026-08-31', start: '2026-08-01', end: '2026-08-31', amount: 1260, buyer: 'Marieke de Groot', desc: 'Pakket wiskunde · Finn de Groot (8 lessen)' },
    { n: 872, number: 'BH-2026-08-02', date: '2026-08-31', start: '2026-08-01', end: '2026-08-31', amount: 840, buyer: 'Anne Hendriks', desc: 'Pakket Engels · Noor Hendriks (10 lessen, deel augustus)' },
  ];
  for (const inv of invoices) {
    await upsert(supabase, 'invoices', {
      id: id(inv.n),
      invoice_number: inv.number,
      issued_by_user_id: authIds.admin,
      organization_id: ORG_ID,
      seller_snapshot: sellerSnap,
      buyer_snapshot: { name: inv.buyer, email: 'haarlem.demo.ouder@tutlio.lt' },
      issue_date: inv.date,
      period_start: inv.start,
      period_end: inv.end,
      grouping_type: 'single',
      subtotal: inv.amount,
      total_amount: inv.amount,
      status: 'paid',
      origin: 'generated',
    });
    await supabase.from('invoice_line_items').delete().eq('invoice_id', id(inv.n));
    const { error: liErr } = await supabase.from('invoice_line_items').insert({
      invoice_id: id(inv.n),
      description: inv.desc,
      quantity: 1,
      unit_price: inv.amount,
      total_price: inv.amount,
      session_ids: [],
    });
    if (liErr) throw new Error(`invoice_line_items: ${liErr.message}`);
  }

  await supabase.from('sessions').delete().in('id', [
    id(301), id(302), id(303), id(304), id(305), id(306), id(307), id(309),
    id(320), id(321), id(322),
  ]);

  const appUrl = (env.VITE_APP_URL || env.APP_URL || 'https://tutlio.com').replace(/\/$/, '');
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  BIJLES HAARLEM DEMO — wachtwoord:', PASSWORD);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Org:     Bijles Haarlem   slug:', SLUG);
  console.log('  Org ID: ', ORG_ID);
  console.log('  Admin:  ', `${appUrl}/company/login`);
  console.log('           ', ADMIN.email);
  console.log('  Docent: ', TUTORS[0].email, '(Sanne de Vries — wiskunde)');
  console.log('           ', TUTORS[1].email, '(Thomas Bakker — Engels)');
  console.log('  Whitelabel login:', `${appUrl}/login?org=${SLUG}`);
  console.log('  Data: 25 leerlingen, ~5 weken lessen, pakketten, 2 facturen.');
  console.log('  Do 3 sept 15:30 Tess (na Meet 13:45). Groep wo 16:00.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
