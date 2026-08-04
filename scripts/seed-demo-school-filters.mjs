/**
 * Seeds Demo Mokykla with data for school contract/student filter + Excel export QA.
 * Patches org c3a00000-7e57-4000-8000-000000000001 only.
 *
 * Usage: node scripts/seed-demo-school-filters.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ORG_ID = 'c3a00000-7e57-4000-8000-000000000001';
const TEMPLATE_ID = 'c3a00000-7e57-4000-8000-000000000050';
const TUTOR_ID = 'c3a00000-7e57-4000-8000-000000000003';

const STUDENTS = {
  lukas: 'c3a00000-7e57-4000-8000-000000000005',
  gabija: 'c3a00000-7e57-4000-8000-000000000006',
  nojus: 'c3a00000-7e57-4000-8000-000000000007',
  rasa: 'c3a00000-7e57-4000-8000-000000000008',
  mantas: 'c3a00000-7e57-4000-8000-000000000009',
  egle: 'c3a00000-7e57-4000-8000-000000000010',
};

const CONTRACTS = {
  lukasIncomplete: 'c3a00000-7e57-4000-8000-000000000051',
  gabijaAwaitingSchool: 'c3a00000-7e57-4000-8000-000000000052',
  lukasSigned: 'c3a00000-7e57-4000-8000-000000000053',
  nojusAwaitingParents: 'c3a00000-7e57-4000-8000-000000000054',
  gabijaSigned: 'c3a00000-7e57-4000-8000-000000000055',
  rasaSigned: 'c3a00000-7e57-4000-8000-000000000056',
};

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

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const studentRows = [
    {
      id: STUDENTS.lukas,
      tutor_id: TUTOR_ID,
      organization_id: ORG_ID,
      full_name: 'Mokykla Mokinys Lukas',
      email: 'demo-mokykla.demo.student@tutlio.lt',
      grade: '5 klasė',
      payer_name: 'Mama Vardenė',
      payer_email: 'demo-mokykla.parent1@tutlio.lt',
      payer_phone: null,
      payer_personal_code: '39001010000',
      child_birth_date: '2015-03-15',
      student_address: 'Gedimino g. 1',
      student_city: 'Vilnius',
      media_publicity_consent: 'agree',
    },
    {
      id: STUDENTS.gabija,
      tutor_id: TUTOR_ID,
      organization_id: ORG_ID,
      full_name: 'Mokykla Mokinė Gabija',
      email: 'demo-mokykla.demo.student2@tutlio.lt',
      grade: '7 klasė',
      payer_name: 'Mama Gabijė',
      payer_email: 'demo-mokykla.parent3@tutlio.lt',
      payer_phone: '+37061111111',
      payer_personal_code: '48505151234',
      child_birth_date: '2013-08-20',
      student_address: 'Konstitucijos pr. 12',
      student_city: 'Vilnius',
      media_publicity_consent: 'disagree',
    },
    {
      id: STUDENTS.nojus,
      tutor_id: TUTOR_ID,
      organization_id: ORG_ID,
      full_name: 'Mokykla Mokinys Nojus',
      email: null,
      grade: '9 klasė',
      payer_name: 'Mama Nojė',
      payer_email: 'demo-mokykla.parent4@tutlio.lt',
      payer_phone: '+37062222222',
      payer_personal_code: '49001019999',
      child_birth_date: '2011-11-11',
      student_address: 'Žirmūnų g. 5',
      student_city: 'Vilnius',
      media_publicity_consent: null,
    },
    {
      id: STUDENTS.rasa,
      tutor_id: TUTOR_ID,
      organization_id: ORG_ID,
      full_name: 'Demo Mokinė Rasė',
      email: 'demo-mokykla.demo.student3@tutlio.lt',
      grade: '11 klasė',
      payer_name: 'Tėtis Rasė',
      payer_email: 'demo-mokykla.parent5@tutlio.lt',
      payer_phone: '+37063333333',
      payer_personal_code: '38001015555',
      child_birth_date: '2009-04-04',
      student_address: 'Savanorių pr. 20',
      student_city: 'Kaunas',
      media_publicity_consent: 'agree',
    },
    {
      id: STUDENTS.mantas,
      tutor_id: TUTOR_ID,
      organization_id: ORG_ID,
      full_name: 'Demo Mokinys Mantas',
      email: null,
      grade: '3 klasė',
      payer_name: 'Mama Mantė',
      payer_email: 'demo-mokykla.parent6@tutlio.lt',
      payer_phone: '+37064444444',
      payer_personal_code: '49001016666',
      child_birth_date: '2017-06-06',
      student_address: 'Vokiečių g. 3',
      student_city: 'Vilnius',
      media_publicity_consent: 'disagree',
    },
    {
      id: STUDENTS.egle,
      tutor_id: TUTOR_ID,
      organization_id: ORG_ID,
      full_name: 'Demo Mokinė Eglė',
      email: null,
      grade: '1 klasė',
      payer_name: 'Mama Eglė',
      payer_email: 'demo-mokykla.parent7@tutlio.lt',
      payer_phone: '+37065555555',
      payer_personal_code: '49001017777',
      child_birth_date: '2019-09-09',
      student_address: 'Pilies g. 7',
      student_city: 'Vilnius',
      media_publicity_consent: null,
    },
  ];

  for (const row of studentRows) {
    const { error } = await supabase.from('students').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`student ${row.full_name}: ${error.message}`);
  }

  const contracts = [
    {
      id: CONTRACTS.lukasIncomplete,
      organization_id: ORG_ID,
      template_id: TEMPLATE_ID,
      student_id: STUDENTS.lukas,
      filled_body: 'Neužpildyti duomenys — Lukas (trūksta tel. ir atvaizdo sutikimo).',
      annual_fee: 1200,
      signing_status: 'sent',
      sent_at: isoDaysAgo(3),
      contract_number: 'DEMO-FILT-001',
      media_publicity_consent: null,
      archived_at: null,
    },
    {
      id: CONTRACTS.gabijaAwaitingSchool,
      organization_id: ORG_ID,
      template_id: TEMPLATE_ID,
      student_id: STUDENTS.gabija,
      filled_body: 'Laukia mokyklos parašo — Gabija.',
      annual_fee: 1100,
      signing_status: 'awaiting_school_signature',
      sent_at: isoDaysAgo(7),
      completion_submitted_at: isoDaysAgo(2),
      contract_number: 'DEMO-FILT-002',
      media_publicity_consent: 'disagree',
      archived_at: null,
    },
    {
      id: CONTRACTS.nojusAwaitingParents,
      organization_id: ORG_ID,
      template_id: TEMPLATE_ID,
      student_id: STUDENTS.nojus,
      filled_body: 'Pasirašyta mokyklos — laukia tėvų — Nojus.',
      annual_fee: 900,
      signing_status: 'signed_by_school',
      sent_at: isoDaysAgo(10),
      completion_submitted_at: isoDaysAgo(8),
      contract_number: 'DEMO-FILT-003',
      media_publicity_consent: null,
      archived_at: null,
    },
    {
      id: CONTRACTS.lukasSigned,
      organization_id: ORG_ID,
      template_id: TEMPLATE_ID,
      student_id: STUDENTS.lukas,
      filled_body: 'Pasirašyta sutartis — Lukas (antras įrašas, senesnis).',
      annual_fee: 1200,
      signing_status: 'signed',
      signed_at: isoDaysAgo(40),
      sent_at: isoDaysAgo(45),
      contract_number: 'DEMO-2026-003',
      media_publicity_consent: 'agree',
      archived_at: isoDaysAgo(1),
    },
    {
      id: CONTRACTS.gabijaSigned,
      organization_id: ORG_ID,
      template_id: TEMPLATE_ID,
      student_id: STUDENTS.gabija,
      filled_body: 'Pasirašyta sutartis — Gabija (archyvuota).',
      annual_fee: 1050,
      signing_status: 'signed',
      signed_at: isoDaysAgo(90),
      sent_at: isoDaysAgo(95),
      contract_number: 'DEMO-2026-005',
      media_publicity_consent: 'disagree',
      archived_at: isoDaysAgo(30),
    },
    {
      id: CONTRACTS.rasaSigned,
      organization_id: ORG_ID,
      template_id: TEMPLATE_ID,
      student_id: STUDENTS.rasa,
      filled_body: 'Pasirašyta sutartis — Rasė.',
      annual_fee: 1300,
      signing_status: 'signed',
      signed_at: isoDaysAgo(20),
      sent_at: isoDaysAgo(25),
      contract_number: 'DEMO-FILT-004',
      media_publicity_consent: 'agree',
      archived_at: null,
    },
  ];

  for (const row of contracts) {
    const { error } = await supabase.from('school_contracts').upsert(row, { onConflict: 'id' });
    if (error) throw new Error(`contract ${row.contract_number}: ${error.message}`);
  }

  console.log('Demo Mokykla filter seed OK.');
  console.log('');
  console.log('Expected filter counts (contracts, active only):');
  console.log('  Visos: 4');
  console.log('  Nepasirašyta m-klos: 1 (Gabija)');
  console.log('  Nepasirašyta tėvų: 1 (Nojus)');
  console.log('  Neužpildyti duomenys: 1 (Lukas)');
  console.log('  Pasirašytos: 1 (Rasė)');
  console.log('');
  console.log('Students: 6 with grades 1/3/5/7/9/11 klasė, consent agree/disagree/unknown mix');
  console.log('Login: demo-mokykla.demo.admin@tutlio.lt / TutlioQaDemo2026!');
  console.log('URLs: /school/login → /school/contracts, /school/students');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
