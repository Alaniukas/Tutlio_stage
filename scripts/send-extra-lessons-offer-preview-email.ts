/**
 * Send preview of school_contract_extra_offer email (extra-lessons offer).
 * Usage: npx tsx scripts/send-extra-lessons-offer-preview-email.ts
 */
import { readFileSync, existsSync } from 'fs';
import handler from '../api/send-email.ts';

function loadEnvFile(file: string) {
  if (!existsSync(file)) return {};
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

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local'), ...loadEnvFile('.env.vercel.stage') };
for (const [k, v] of Object.entries(env)) {
  if (v && process.env[k] == null) process.env[k] = v;
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const TO = 'alaniukasa@gmail.com';
const LAISVI_ORG = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

const sample = {
  schoolName: 'VšĮ „Laisvi vaikai"',
  schoolEmail: 'irminta@laisvivaikai.lt',
  contactEmail: 'irminta@laisvivaikai.lt',
  studentName: 'QA Peržiūra Extra',
  parentName: 'QA Tėvas Peržiūrai',
  contractNumber: 'PP-PREVIEW-TEST',
  acceptUrl: 'http://localhost:3000/school-extra-lessons-accept?token=legalqawithin14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  serviceName: 'Matematika (grupinė)',
  schedule: 'Antradieniais 16:00–16:45',
  startDate: '2026-09-08',
  endDate: '2027-06-13',
  unitPrice: '6.00',
  monthlyPrice: '24.00',
  organizationId: LAISVI_ORG,
};

async function sendOne() {
  let statusCode = 500;
  let body: unknown = null;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
    setHeader() {
      return this;
    },
  };

  await handler(
    {
      method: 'POST',
      body: {
        type: 'school_contract_extra_offer',
        to: TO,
        locale: 'lt',
        data: sample,
      },
      headers: {
        'content-type': 'application/json',
        'x-internal-key': serviceKey,
      },
      query: {},
    } as never,
    res as never,
    undefined as never,
  );

  console.log('Status:', statusCode, body);
  if (statusCode !== 200) process.exit(1);
  console.log(`Sent extra-lessons offer preview to ${TO}`);
}

sendOne().catch((err) => {
  console.error(err);
  process.exit(1);
});
