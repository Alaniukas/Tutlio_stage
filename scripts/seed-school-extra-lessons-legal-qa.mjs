/**
 * QA seed for extra-lessons 14-day withdrawal / click-wrap.
 * Demo Mokykla only. Emails (offer links) → alaniukasa@gmail.com.
 *
 *   ENV_FILE=.env.local node scripts/seed-school-extra-lessons-legal-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DEMO_ORG = 'c3a00000-7e57-4000-8000-000000000001';
const TUTOR_ID = 'c3a00000-7e57-4000-8000-000000000003';
const PARENT_USER_ID = 'c3a00000-7e57-4000-8000-0000000000e0';
const PARENT_LOGIN = 'demo-mokykla.extra.parent@tutlio.lt';
const PARENT_PASSWORD = 'TutlioQaDemo2026!';
const QA_MAIL = 'alaniukasa@gmail.com';

const IDS = {
  group: 'c3a00000-7e57-4000-8000-0000000000e8',
  slot: 'c3a00000-7e57-4000-8000-0000000000e9',
  template: 'c3a00000-7e57-4000-8000-0000000000ea',
  students: {
    within14: 'c3a00000-7e57-4000-8000-0000000000e1',
    after14: 'c3a00000-7e57-4000-8000-0000000000e2',
    sparse: 'c3a00000-7e57-4000-8000-0000000000e3',
    withdraw: 'c3a00000-7e57-4000-8000-0000000000e4',
    terminate: 'c3a00000-7e57-4000-8000-0000000000e5',
  },
  contracts: {
    within14: 'c3a00000-7e57-4000-8000-0000000000eb',
    after14: 'c3a00000-7e57-4000-8000-0000000000ec',
    sparse: 'c3a00000-7e57-4000-8000-0000000000ed',
    withdraw: 'c3a00000-7e57-4000-8000-0000000000ee',
    terminate: 'c3a00000-7e57-4000-8000-0000000000ef',
  },
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
      env[m[1]] = v;
    }
    console.log('Loaded env from', path);
    break;
  }
  return env;
}

function vilniusYmd(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

function addDays(ymd, days) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function randomToken() {
  return `${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 48);
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
  if (error) {
    const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const hit = listed.data?.users?.find((u) => String(u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) {
      const { error: upd } = await supabase.auth.admin.updateUserById(hit.id, {
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (upd) throw new Error(`updateUser existing ${email}: ${upd.message}`);
      return hit.id;
    }
    throw new Error(`createUser ${email}: ${error.message}`);
  }
  return data.user.id;
}

function defaultBody() {
  return [
    'PAPILDOMŲ PAMOKŲ SUTARTIS (QA)',
    'Sutarties Nr. {{sutarties_nr}}',
    'Mokinys: {{vaiko_vardas_pavarde}}',
    'Paslauga: {{paslaugos_pavadinimas}}',
    'Grafikas: {{savaites_dienos_ir_laikas}}',
    'Pradžia: {{pradzios_data}}  Pabaiga: {{pabaigos_data_ar_mokslo_metu_pabaiga}}',
    'Kaina: {{kaina}} EUR. Orientacinė mėnesio kaina: {{orientacine_menesio_kaina}} EUR.',
    'Tėvas/globėjas: {{tevo_globejo_vardas_pavarde}} {{tevo_el_pastas}}',
    'Naudotojo ID: {{naudotojo_ID}}',
    'QA tekstas pakankamai ilgas, kad click-wrap puslapis rodytų visą redakciją prieš užsakymą su prievole sumokėti.',
  ].join('\n');
}

function baseOrder({ startDate, serviceName, sparse = false }) {
  return {
    service_name: serviceName,
    service_type: 'group',
    platform: sparse ? '' : 'Google Meet',
    duration_minutes: 45,
    schedule_label: sparse ? '' : 'Antradieniais 16:00–16:45',
    start_date: startDate,
    end_date: '2027-06-13',
    unit_price_eur: 18,
    base_lessons_per_month: 8,
    indicative_monthly_eur: 144,
    revision_label: 'QA-legal-v1',
    group_id: IDS.group,
    group_name: 'QA Legal Matematika',
    vat_status: 'PVM neapmokestinama',
    school_email: 'demo-mokykla.demo.admin@tutlio.lt',
    school_phone: '+37060000000',
    data_protection_contact: 'demo-mokykla.demo.admin@tutlio.lt',
    schedule_slots: sparse ? [] : [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
    individual_cancel_terms: '',
  };
}

async function upsertToken(supabase, contractId) {
  const token = 'legalqa' + randomToken();
  await supabase.from('school_contract_completion_tokens').delete().eq('contract_id', contractId);
  const { error } = await supabase.from('school_contract_completion_tokens').insert({
    contract_id: contractId,
    token,
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString(),
  });
  if (error) throw new Error(`token ${contractId}: ${error.message}`);
  return token;
}

async function sendResend(env, { subject, html }) {
  const key = env.RESEND_API_KEY;
  const from = env.FROM_EMAIL || env.RESEND_FROM || 'Tutlio <hello@tutlio.lt>';
  if (!key) {
    console.warn('RESEND_API_KEY missing — skip email to', QA_MAIL);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [QA_MAIL], subject, html }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.warn('Resend failed', res.status, body.slice(0, 400));
    return false;
  }
  console.log('Email sent to', QA_MAIL, body.slice(0, 200));
  return true;
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  if (String(url).includes('xklzjhfztjxltrdkplog')) {
    throw new Error('Wrong Supabase project (dead). Use .env.local / .env.vercel.stage');
  }
  console.log('Supabase host:', String(url).replace(/^https?:\/\//, '').split('/')[0]);

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const today = vilniusYmd();
  const startWithin = addDays(today, 3);
  const startAfter = addDays(today, 21);
  const bodyText = defaultBody();

  const { data: org, error: orgErr } = await supabase.from('organizations').select('features, name').eq('id', DEMO_ORG).maybeSingle();
  if (orgErr) throw new Error(`organizations: ${orgErr.message}`);
  if (!org) throw new Error('Demo Mokykla missing — run seed-qa-demo-orgs.mjs first');
  await supabase.from('organizations').update({
    features: {
      ...(org.features || {}),
      school_extra_lessons_contract: true,
      school_class_groups: true,
      school_lesson_recordings: true,
      school_teacher_labels: true,
    },
  }).eq('id', DEMO_ORG);

  const parentUserId = await ensureAuthUser(supabase, {
    id: PARENT_USER_ID,
    email: PARENT_LOGIN,
    fullName: 'QA Extra Tėvas',
    password: PARENT_PASSWORD,
  });

  const { data: parentProfile, error: ppErr } = await supabase
    .from('parent_profiles')
    .upsert(
      { user_id: parentUserId, full_name: 'QA Extra Tėvas', email: PARENT_LOGIN, phone: '+37060000999' },
      { onConflict: 'user_id' },
    )
    .select('id')
    .single();
  if (ppErr || !parentProfile) throw new Error(`parent_profiles: ${ppErr?.message || 'no row'}`);

  const students = [
    { id: IDS.students.within14, full_name: 'QA Legal Per 14 d.', grade: '5 klasė' },
    { id: IDS.students.after14, full_name: 'QA Legal Po 14 d.', grade: '6 klasė' },
    { id: IDS.students.sparse, full_name: 'QA Legal Tušti laukai', grade: '4 klasė' },
    { id: IDS.students.withdraw, full_name: 'QA Legal Atsisakymas', grade: '5 klasė' },
    { id: IDS.students.terminate, full_name: 'QA Legal Nutraukimas', grade: '7 klasė' },
  ];

  for (const s of students) {
    const { error } = await supabase.from('students').upsert({
      id: s.id,
      full_name: s.full_name,
      email: `qa.legal.${s.id.slice(-4)}@tutlio.lt`,
      grade: s.grade,
      school_year: '2026/2027',
      enrollment_status: 'active',
      municipality: 'Vilnius',
      media_publicity_consent: 'agree',
      payer_name: 'QA Extra Tėvas',
      payer_email: QA_MAIL,
      payer_phone: '+37060000999',
      tutor_id: TUTOR_ID,
      organization_id: DEMO_ORG,
      parent_user_id: parentUserId,
    }, { onConflict: 'id' });
    if (error) throw new Error(`student ${s.full_name}: ${error.message}`);
    await supabase.from('parent_students').upsert(
      { parent_id: parentProfile.id, student_id: s.id },
      { onConflict: 'parent_id,student_id' },
    );
  }

  const { error: gErr } = await supabase.from('school_class_groups').upsert({
    id: IDS.group,
    organization_id: DEMO_ORG,
    tutor_id: TUTOR_ID,
    name: 'QA Legal Matematika',
    school_year_start: '2026-09-01',
    school_year_end: '2027-06-13',
    platform: 'Google Meet',
    duration_minutes: 45,
    meeting_link: 'https://meet.google.com/qa-legal-math',
  }, { onConflict: 'id' });
  if (gErr) throw new Error(`group: ${gErr.message}`);

  await supabase.from('school_class_group_slots').upsert({
    id: IDS.slot,
    group_id: IDS.group,
    weekday: 2,
    start_time: '16:00',
    end_time: '16:45',
  }, { onConflict: 'id' });

  for (const sid of Object.values(IDS.students)) {
    await supabase.from('school_class_group_members').upsert(
      { group_id: IDS.group, student_id: sid },
      { onConflict: 'group_id,student_id' },
    );
  }

  await supabase.from('school_contract_templates').upsert({
    id: IDS.template,
    organization_id: DEMO_ORG,
    name: 'Papildomų pamokų sutartis (QA legal)',
    body: bodyText,
    annual_fee_default: 0,
    is_default: false,
  }, { onConflict: 'id' });

  async function upsertPending({ id, studentId, number, order }) {
    const filled = bodyText
      .replaceAll('{{sutarties_nr}}', number)
      .replaceAll('{{vaiko_vardas_pavarde}}', students.find((s) => s.id === studentId)?.full_name || '')
      .replaceAll('{{paslaugos_pavadinimas}}', order.service_name);
    const { error } = await supabase.from('school_contracts').upsert({
      id,
      organization_id: DEMO_ORG,
      student_id: studentId,
      template_id: IDS.template,
      contract_number: number,
      filled_body: filled,
      annual_fee: 144,
      signing_status: 'sent',
      sent_at: new Date().toISOString(),
      kind: 'extra_lessons',
      order_snapshot: order,
      revision_label: 'QA-legal-v1',
      base_lessons_per_month: 8,
      unit_price_eur: 18,
      class_group_id: IDS.group,
    }, { onConflict: 'id' });
    if (error) throw new Error(`contract ${number}: ${error.message}`);
    return upsertToken(supabase, id);
  }

  const tokenWithin = await upsertPending({
    id: IDS.contracts.within14,
    studentId: IDS.students.within14,
    number: 'PP-LEGAL-WITHIN14',
    order: baseOrder({ startDate: startWithin, serviceName: 'QA Matematika (per 14 d.)' }),
  });
  const tokenAfter = await upsertPending({
    id: IDS.contracts.after14,
    studentId: IDS.students.after14,
    number: 'PP-LEGAL-AFTER14',
    order: baseOrder({ startDate: startAfter, serviceName: 'QA Matematika (po 14 d.)' }),
  });
  const tokenSparse = await upsertPending({
    id: IDS.contracts.sparse,
    studentId: IDS.students.sparse,
    number: 'PP-LEGAL-SPARSE',
    order: baseOrder({ startDate: '', serviceName: 'QA Matematika (tušti laukai)', sparse: true }),
  });

  const shownYes =
    'Noriu, kad vaikas galėtų pradėti lankyti pamokas iš karto. Suprantu, kad per pirmąsias 14 dienų atsisakęs Sutarties turėsiu sumokėti už iki Sutarties atsisakymo jau suteiktas pamokas.';

  const { error: wErr } = await supabase.from('school_contracts').upsert({
    id: IDS.contracts.withdraw,
    organization_id: DEMO_ORG,
    student_id: IDS.students.withdraw,
    template_id: IDS.template,
    contract_number: 'PP-LEGAL-WITHDRAW',
    filled_body: `${bodyText}\n\nACCEPTED WITHDRAW QA`,
    annual_fee: 144,
    signing_status: 'signed',
    sent_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    kind: 'extra_lessons',
    order_snapshot: baseOrder({ startDate: startWithin, serviceName: 'QA Atsisakymas' }),
    revision_label: 'QA-legal-v1',
    base_lessons_per_month: 8,
    unit_price_eur: 18,
    class_group_id: IDS.group,
    accepted_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    accepted_terms: true,
    start_within_14_days: true,
    start_within_14_status: 'yes',
    start_within_14_shown_text: shownYes,
    start_within_14_chosen_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    accepted_by_user_id: parentUserId,
    recording_consent: true,
    document_sha256: 'qa-legal-withdraw-sha',
  }, { onConflict: 'id' });
  if (wErr) throw new Error(`withdraw contract: ${wErr.message}`);

  const { error: tErr } = await supabase.from('school_contracts').upsert({
    id: IDS.contracts.terminate,
    organization_id: DEMO_ORG,
    student_id: IDS.students.terminate,
    template_id: IDS.template,
    contract_number: 'PP-LEGAL-TERMINATE',
    filled_body: `${bodyText}\n\nACCEPTED TERMINATE QA`,
    annual_fee: 144,
    signing_status: 'signed',
    sent_at: new Date(Date.now() - 86400000 * 25).toISOString(),
    kind: 'extra_lessons',
    order_snapshot: baseOrder({ startDate: addDays(today, -30), serviceName: 'QA Nutraukimas' }),
    revision_label: 'QA-legal-v1',
    base_lessons_per_month: 8,
    unit_price_eur: 18,
    class_group_id: IDS.group,
    accepted_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    accepted_terms: true,
    start_within_14_days: false,
    start_within_14_status: 'no',
    start_within_14_shown_text: shownYes,
    start_within_14_chosen_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    accepted_by_user_id: parentUserId,
    recording_consent: false,
    document_sha256: 'qa-legal-terminate-sha',
  }, { onConflict: 'id' });
  if (tErr) throw new Error(`terminate contract: ${tErr.message}`);

  const appUrl = (env.APP_URL || env.VITE_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const urls = {
    within14: `${appUrl}/school-extra-lessons-accept?token=${tokenWithin}`,
    after14: `${appUrl}/school-extra-lessons-accept?token=${tokenAfter}`,
    sparse: `${appUrl}/school-extra-lessons-accept?token=${tokenSparse}`,
  };

  const html = `
    <p>QA papildomų pamokų sutarčių nuorodos (Demo Mokykla).</p>
    <ul>
      <li><a href="${urls.within14}">PP-LEGAL-WITHIN14</a> — 14 d. checkbox turi būti matomas (pradžia ${startWithin})</li>
      <li><a href="${urls.after14}">PP-LEGAL-AFTER14</a> — checkbox paslėptas (pradžia ${startAfter})</li>
      <li><a href="${urls.sparse}">PP-LEGAL-SPARSE</a> — tėvas pildo tuščius laukus</li>
    </ul>
    <p>School admin: demo-mokykla.demo.admin@tutlio.lt / TutlioQaDemo2026! — ${appUrl}/school/login</p>
    <p>Tėvas: ${PARENT_LOGIN} / TutlioQaDemo2026! — ${appUrl}/login</p>
    <p>Portale: PP-LEGAL-WITHDRAW (Atsisakyti) ir PP-LEGAL-TERMINATE (Nutraukti).</p>
  `;
  await sendResend(env, { subject: 'Tutlio QA — papildomų pamokų sutarčių nuorodos', html });

  console.log('\n=== LEGAL QA READY ===');
  console.log('School admin:', 'demo-mokykla.demo.admin@tutlio.lt / TutlioQaDemo2026!');
  console.log('Tutor:       ', 'demo-mokykla.demo.tutor@tutlio.lt / TutlioQaDemo2026!');
  console.log('Parent:      ', `${PARENT_LOGIN} / ${PARENT_PASSWORD}`);
  console.log('Emails:      ', QA_MAIL);
  console.log('Accept WITHIN14:\n ', urls.within14);
  console.log('Accept AFTER14:\n ', urls.after14);
  console.log('Accept SPARSE:\n ', urls.sparse);
  console.log('Test plan: docs/SCHOOL_EXTRA_LESSONS_LEGAL_TEST_PLAN.md');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
