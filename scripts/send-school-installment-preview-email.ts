/**
 * Send preview of fixed school_installment_request email (local template only).
 * Usage: npx tsx scripts/send-school-installment-preview-email.ts
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

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.vercel.prod') };
for (const [k, v] of Object.entries(env)) {
  if (v && process.env[k] == null) process.env[k] = v;
}

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const TO = 'alaniukasa@gmail.com';

const samples = [
  {
    label: 'Elena — Timotiejus (įmoka #1, 90€ = 40+50)',
    data: {
      schoolName: 'Mokykla be sienų „Laisvi vaikai"',
      schoolEmail: 'irminta@laisvivaikai.lt',
      contactEmail: 'irminta@laisvivaikai.lt',
      studentName: 'Jusaitis Timotiejus',
      parentName: 'Elena Jusaitienė',
      recipientName: 'Elena Jusaitienė',
      installmentNumber: 1,
      totalInstallments: 3,
      amount: '90.00',
      dueDate: '2026-08-30',
      additionalFeeAmount: '50.00',
      additionalFeePurpose: 'Sutarties mokestis',
      contractAnnualFee: '240.00',
      installmentId: 'preview-timotiejus-90',
      organizationId: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
    },
  },
  {
    label: 'Daina — Deimilė (viena įmoka 350€ = 300+50)',
    data: {
      schoolName: 'Mokykla be sienų „Laisvi vaikai"',
      schoolEmail: 'irminta@laisvivaikai.lt',
      contactEmail: 'irminta@laisvivaikai.lt',
      studentName: 'Baltranaitė Deimilė Austėja',
      parentName: 'Daina Maslauskaitė',
      recipientName: 'Daina Maslauskaitė',
      installmentNumber: 1,
      totalInstallments: 1,
      amount: '350.00',
      dueDate: '2026-07-23',
      additionalFeeAmount: '50.00',
      additionalFeePurpose: 'Sutarties mokestis',
      contractAnnualFee: '300.00',
      installmentId: 'preview-deimile-350',
      organizationId: '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
    },
  },
];

async function sendOne(label: string, data: Record<string, unknown>) {
  let statusCode = 500;
  let responseBody = '';
  const res = {
    statusCode: 200,
    setHeader() {},
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      responseBody = JSON.stringify(payload);
      return this;
    },
    end(payload?: string) {
      if (payload != null) responseBody = payload;
    },
  };

  await handler(
    {
      method: 'POST',
      headers: { 'x-internal-key': serviceKey, 'content-type': 'application/json' },
      body: {
        type: 'school_installment_request',
        to: TO,
        locale: 'lt',
        data,
      },
    } as any,
    res as any,
  );

  console.log(label, '→', statusCode, responseBody);
  if (statusCode !== 200) process.exit(1);
}

for (const sample of samples) {
  await sendOne(sample.label, sample.data);
}

console.log('Sent preview emails to', TO);
