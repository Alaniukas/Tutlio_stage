/**
 * Seed a school-contract completion test case for local repro.
 *
 * Usage:
 *   copy production keys to .env (SUPABASE_URL must be cuhciqwmqfuajeeqjjbm…)
 *   docker compose up -d docx-converter
 *   DOCX_CONVERTER_URL=http://localhost:8080 DOCX_CONVERTER_API_KEY=local-dev-key npm run dev
 *   node scripts/seed-school-contract-completion-test.mjs
 *
 * Opens: http://localhost:3000/school-contract-complete?token=…
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';

function loadEnv() {
  const file = process.env.ENV_FILE || '.env';
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        let v = l.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        return [l.slice(0, i), v];
      }),
  );
}

const env = loadEnv();
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const sb = createClient(url, key);
const ORG_ID = process.env.SEED_ORG_ID || '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
const stamp = Date.now();

const { data: template } = await sb
  .from('school_contract_templates')
  .select('id, pdf_url, annual_fee_default')
  .eq('organization_id', ORG_ID)
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

if (!template?.id) {
  console.error('No contract template for org', ORG_ID);
  process.exit(1);
}

const { data: student, error: studentErr } = await sb
  .from('students')
  .insert({
    organization_id: ORG_ID,
    full_name: `Test Completion ${stamp}`,
    payer_name: 'Test Parent',
    payer_email: `completion-test+${stamp}@example.com`,
    payer_phone: '+37060000001',
    payer_personal_code: '39001010000',
    student_address: 'Test g. 1',
    student_city: 'Vilnius',
    child_birth_date: '2015-06-01',
    media_publicity_consent: null,
  })
  .select('id')
  .single();

if (studentErr || !student) {
  console.error('Student insert failed:', studentErr?.message);
  process.exit(1);
}

const contractNumber = `SUT-TEST-${stamp}`;
const { data: contract, error: contractErr } = await sb
  .from('school_contracts')
  .insert({
    organization_id: ORG_ID,
    student_id: student.id,
    template_id: template.id,
    contract_number: contractNumber,
    annual_fee: template.annual_fee_default || 0,
    filled_body: 'Testinė sutartis {{student_name}}.',
    signing_status: 'sent',
    sent_at: new Date().toISOString(),
    pdf_url: null,
  })
  .select('id')
  .single();

if (contractErr || !contract) {
  console.error('Contract insert failed:', contractErr?.message);
  process.exit(1);
}

const token = randomBytes(32).toString('hex');
const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
const { error: tokenErr } = await sb.from('school_contract_completion_tokens').insert({
  contract_id: contract.id,
  token,
  expires_at: expiresAt,
});

if (tokenErr) {
  console.error('Token insert failed:', tokenErr.message);
  process.exit(1);
}

const appUrl = (env.APP_URL || env.VITE_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
console.log('\nSeeded completion test case:');
console.log('  student_id:', student.id);
console.log('  contract_id:', contract.id);
console.log('  contract_number:', contractNumber);
console.log('  token:', token);
console.log('\nOpen:');
console.log(`  ${appUrl}/school-contract-complete?token=${token}`);
console.log('\nEnsure DOCX_CONVERTER_URL points to a working converter (docker compose up docx-converter).');
