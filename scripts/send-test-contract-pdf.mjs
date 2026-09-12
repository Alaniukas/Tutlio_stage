/**
 * One-off: render a random school contract template with FAKE data, convert to PDF,
 * email to alaniukasa@gmail.com. No DB writes — nothing appears in school UI.
 *
 * Usage: node scripts/send-test-contract-pdf.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { buildSchoolContractTemplatePayload } from '../api/_lib/schoolContractTemplatePayload.js';
import { extractSchoolContractStoragePath, SCHOOL_CONTRACTS_BUCKET } from '../api/_lib/schoolContractPdfPath.js';

function loadEnv(file) {
  try {
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
  } catch {
    return {};
  }
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.vercel.prod') };
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const apiBase = (env.APP_URL || 'https://www.tutlio.lt').replace(/\/$/, '');

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey);
const TO_EMAIL = 'alaniukasa@gmail.com';
const stamp = Date.now();

const CONTRACT_SELECT =
  'id, contract_number, annual_fee, organization_id, template:school_contract_templates(pdf_url, name), organizations(name, entity_type)';

const { count, error: countErr } = await sb
  .from('school_contracts')
  .select('id', { count: 'exact', head: true })
  .eq('signing_status', 'sent')
  .not('template_id', 'is', null);

if (countErr || !count) {
  console.error('No contracts found', countErr?.message);
  process.exit(1);
}

const offset = Math.floor(Math.random() * count);
const { data: rows, error: pickErr } = await sb
  .from('school_contracts')
  .select(CONTRACT_SELECT)
  .eq('signing_status', 'sent')
  .not('template_id', 'is', null)
  .range(offset, offset);

if (pickErr || !rows?.[0]) {
  console.error('Pick failed', pickErr?.message);
  process.exit(1);
}

const source = rows[0];
const orgEntityType = String(source.organizations?.entity_type || '').trim().toLowerCase();
const isSchoolOrg = orgEntityType === 'school';

const fakeStudent = {
  full_name: 'Testas Testauskas',
  email: 'testas.testauskas@example.com',
  phone: '+37060000111',
  payer_name: 'Fake Tėvas Testauskas',
  payer_email: 'fake.tevas@example.com',
  payer_phone: '+37060000222',
  payer_personal_code: '39001010000',
  student_address: 'Testų g. 99',
  student_city: 'Vilnius',
  child_birth_date: '2015-03-15',
  parent_secondary_name: 'Fake Mama Testauskienė',
  parent_secondary_email: 'fake.mama@example.com',
  parent_secondary_phone: '+37060000333',
  parent_secondary_personal_code: '48501020000',
  parent_secondary_address: 'Testų g. 99, Vilnius',
  media_publicity_consent: isSchoolOrg ? 'agree' : null,
};

const fakeContractNumber = `SUT-TEST-${stamp}`;
console.log('Source template from contract:', source.contract_number, '→', source.template?.name);
console.log('Fake contract number:', fakeContractNumber);
console.log('School org:', isSchoolOrg, '| org:', source.organizations?.name);

const templatePayload = buildSchoolContractTemplatePayload({
  contractNumber: fakeContractNumber,
  annualFee: source.annual_fee,
  schoolName: source.organizations?.name,
  mediaPublicityConsent: fakeStudent.media_publicity_consent,
  student: fakeStudent,
  includeMediaConsentFlags: isSchoolOrg,
});

const templatePath = extractSchoolContractStoragePath(String(source.template?.pdf_url || ''));
const { data: signed, error: signErr } = await sb.storage.from(SCHOOL_CONTRACTS_BUCKET).createSignedUrl(templatePath, 300);
if (signErr || !signed?.signedUrl) {
  console.error('Template sign failed', signErr?.message);
  process.exit(1);
}

const templateRes = await fetch(signed.signedUrl);
if (!templateRes.ok) {
  console.error('Template download failed', templateRes.status);
  process.exit(1);
}
const templateBuf = Buffer.from(await templateRes.arrayBuffer());

const zip = new PizZip(templateBuf);
const doc = new Docxtemplater(zip, {
  delimiters: { start: '{{', end: '}}' },
  paragraphLoop: true,
  linebreaks: true,
});
doc.render(templatePayload);
const renderedDocx = Buffer.from(doc.getZip().generate({ type: 'uint8array' }));
console.log('DOCX rendered:', Math.round(renderedDocx.length / 1024), 'KB');

const convRes = await fetch(`${apiBase}/api/convert-docx-to-pdf`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fileBase64: renderedDocx.toString('base64') }),
});
const convJson = await convRes.json().catch(() => ({}));
if (!convRes.ok || !convJson.pdfBase64) {
  console.error('Convert failed', convRes.status, convJson.error || convJson);
  process.exit(1);
}
const pdfB64 = convJson.pdfBase64;
console.log('PDF converted:', Math.round(Buffer.from(pdfB64, 'base64').length / 1024), 'KB');

const emailRes = await fetch(`${apiBase}/api/send-email`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-internal-key': serviceKey,
  },
  body: JSON.stringify({
    type: 'custom_html_announcement',
    to: TO_EMAIL,
    locale: 'lt',
    data: {
      subject: `[TEST] Sutarties PDF — ${fakeContractNumber} (fake data, ne DB)`,
      bodyHtml: `
        <p>Tai <strong>testinis</strong> sutarties PDF su <strong>fake</strong> duomenimis.</p>
        <p>Šaltinio šablonas: <em>${source.template?.name || '—'}</em> (iš sutarties ${source.contract_number}).</p>
        <p><strong>Į DB nieko neįrašyta</strong> — mokyklos sąsajoje šios sutarties nematysi.</p>
        <p>Fake mokinys: ${fakeStudent.full_name}<br/>Fake tėvas: ${fakeStudent.payer_name}</p>
      `,
    },
    attachments: [{ filename: `${fakeContractNumber}.pdf`, content: pdfB64 }],
  }),
});

if (!emailRes.ok) {
  const errText = await emailRes.text().catch(() => '');
  console.error('Email failed', emailRes.status, errText.slice(0, 400));
  process.exit(1);
}

const emailJson = await emailRes.json().catch(() => ({}));
console.log('Email sent to', TO_EMAIL, '| Resend id:', emailJson.id || '(none)');
