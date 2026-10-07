/**
 * Demo Mokykla QA: sutarčių juodraščiai, galiojimo datos, pagination (>20), darbo kalendorius.
 * Tik org c3a00000-7e57-4000-8000-000000000001.
 *
 * Usage:
 *   node scripts/seed-demo-school-contracts-calendar-qa.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ORG_ID = 'c3a00000-7e57-4000-8000-000000000001';
const TEMPLATE_ANNUAL = 'c3a00000-7e57-4000-8000-000000000050';
const TEMPLATE_EXTRA = 'c3a00000-7e57-4000-8000-0000000000a3';
const TUTOR_ID = 'c3a00000-7e57-4000-8000-000000000003';

const STUDENTS = [
  'c3a00000-7e57-4000-8000-000000000005',
  'c3a00000-7e57-4000-8000-000000000006',
  'c3a00000-7e57-4000-8000-000000000007',
  'c3a00000-7e57-4000-8000-000000000008',
  'c3a00000-7e57-4000-8000-000000000009',
  'c3a00000-7e57-4000-8000-000000000010',
  'c3a00000-7e57-4000-8000-0000000000c1',
  'c3a00000-7e57-4000-8000-0000000000c6',
];

const SHOWCASE = {
  annualDraft: 'c3a00000-7e57-4000-8000-0000000000d0',
  extraDraft: 'c3a00000-7e57-4000-8000-0000000000d1',
};

const PAGINATION_FIRST = 0xd2;
const PAGINATION_COUNT = 28;

function loadEnv() {
  const path = join(ROOT, process.env.ENV_FILE || '.env');
  if (!existsSync(path)) throw new Error(`Missing env file: ${path}`);
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

function schoolYearDates() {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    start: `${y + 1}-09-01`,
    end: `${y + 2}-06-30`,
  };
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  if (!url.includes('cuhciqwmqfuajeeqjjbm')) {
    console.warn('Warning: expected prod/stage ref cuhciqwmqfuajeeqjjbm in URL');
  }

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name, features')
    .eq('id', ORG_ID)
    .maybeSingle();
  if (orgErr || !org) throw new Error(orgErr?.message || 'Demo Mokykla org not found');

  const features = org.features && typeof org.features === 'object' ? { ...org.features } : {};
  features.school_extra_lessons_contract = true;
  features.school_org_calendar = {
    include_lt_public_holidays: true,
    custom_closed_dates: [
      `${new Date().getFullYear()}-10-31`,
      `${new Date().getFullYear()}-12-23`,
    ],
  };

  const { error: featErr } = await supabase.from('organizations').update({ features }).eq('id', ORG_ID);
  if (featErr) throw new Error(`features: ${featErr.message}`);

  const { start, end } = schoolYearDates();
  const extraSnapshot = {
    service_name: 'Matematika (grupė) — QA juodraštis',
    service_type: 'group',
    platform: 'Google Meet',
    duration_minutes: 45,
    schedule_label: 'Antradieniais 17:00',
    schedule_slots: [{ weekday: 2, start_time: '17:00', end_time: '17:45' }],
    start_date: start,
    end_date: end,
    unit_price_eur: 12,
    base_lessons_per_month: 8,
    indicative_monthly_eur: 96,
    group_name: 'Demo grupė QA',
    tutor_name: 'Demo mokytojas',
  };

  const showcaseRows = [
    {
      id: SHOWCASE.annualDraft,
      organization_id: ORG_ID,
      template_id: TEMPLATE_ANNUAL,
      student_id: STUDENTS[0],
      filled_body: 'Metinės sutarties juodraštis — dar neišsiųsta tėvams.',
      annual_fee: 1180,
      signing_status: 'draft',
      sent_at: null,
      contract_number: 'DEMO-DRAFT-ANNUAL',
      media_publicity_consent: 'agree',
      kind: 'annual',
      archived_at: null,
    },
    {
      id: SHOWCASE.extraDraft,
      organization_id: ORG_ID,
      template_id: TEMPLATE_EXTRA,
      student_id: STUDENTS[1],
      filled_body: 'Papildomų užsiėmimų juodraštis — galiojimo datos iš order_snapshot.',
      annual_fee: 96,
      unit_price_eur: 12,
      base_lessons_per_month: 8,
      signing_status: 'draft',
      sent_at: null,
      contract_number: 'DEMO-DRAFT-EXTRA',
      kind: 'extra_lessons',
      order_snapshot: extraSnapshot,
      archived_at: null,
    },
  ];

  const fillerRows = [];
  for (let i = 0; i < PAGINATION_COUNT; i++) {
    const hex = (PAGINATION_FIRST + i).toString(16);
    const id = `c3a00000-7e57-4000-8000-0000000000${hex.padStart(2, '0')}`;
    const studentId = STUDENTS[i % STUDENTS.length];
    const isExtra = i % 3 === 0;
    const status = i % 5 === 0 ? 'draft' : i % 7 === 0 ? 'signed' : 'sent';
    fillerRows.push({
      id,
      organization_id: ORG_ID,
      template_id: isExtra ? TEMPLATE_EXTRA : TEMPLATE_ANNUAL,
      student_id: studentId,
      filled_body: `QA pagination sutartis #${i + 1}`,
      annual_fee: isExtra ? 84 : 1000 + i * 10,
      signing_status: status,
      sent_at: status === 'draft' ? null : new Date(Date.now() - i * 86400000).toISOString(),
      signed_at: status === 'signed' ? new Date(Date.now() - i * 43200000).toISOString() : null,
      contract_number: `DEMO-PAGE-${String(i + 1).padStart(3, '0')}`,
      kind: isExtra ? 'extra_lessons' : 'annual',
      unit_price_eur: isExtra ? 12 : null,
      base_lessons_per_month: isExtra ? 7 : null,
      order_snapshot: isExtra ? {
        ...extraSnapshot,
        service_name: `Papildomas QA #${i + 1}`,
        start_date: start,
        end_date: end,
      } : null,
      archived_at: null,
    });
  }

  for (const row of [...showcaseRows, ...fillerRows]) {
    const { error } = await supabase.from('school_contracts').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`contract ${row.contract_number}: ${error.message}`);
  }

  const { count } = await supabase
    .from('school_contracts')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ORG_ID)
    .is('staff_document_type', null)
    .is('archived_at', null)
    .neq('party_kind', 'teacher');

  console.log('Demo Mokykla contracts + calendar seed OK.');
  console.log('');
  console.log('Org:', org.name);
  console.log('Active student contracts (approx):', count);
  console.log('Showcase:');
  console.log('  Annual draft:', SHOWCASE.annualDraft, '→ DEMO-DRAFT-ANNUAL');
  console.log('  Extra draft:', SHOWCASE.extraDraft, '→ DEMO-DRAFT-EXTRA (Galioja nuo', start, ')');
  console.log('Calendar closures:', features.school_org_calendar.custom_closed_dates.join(', '));
  console.log('');
  console.log('Login: http://localhost:3000/school/login');
  console.log('  demo-mokykla.demo.admin@tutlio.lt / TutlioQaDemo2026!');
  console.log('Check: /school/contracts (pagination), /school/settings (darbo kalendorius)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
