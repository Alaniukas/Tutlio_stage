/**
 * Preview both school fee-split emails locally.
 * Usage: npx tsx scripts/send-fee-split-email-previews.ts
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
const ORG = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
const SCHOOL = 'Mokykla be sienų „Laisvi vaikai"';
const CONTACT = 'irminta@laisvivaikai.lt';

const emails = [
  {
    label: '1/2 Daina — LAŠKAS A: sutarties mokestis 50€ (jau buvo senas mokėjimo laiškas)',
    body: {
      type: 'school_contract_fee_due',
      to: TO,
      locale: 'lt',
      data: {
        schoolName: SCHOOL,
        schoolEmail: CONTACT,
        contactEmail: CONTACT,
        studentName: 'Baltranaitė Deimilė Austėja',
        parentName: 'Daina Maslauskaitė',
        recipientName: 'Daina Maslauskaitė',
        amount: '50.00',
        dueDate: '2026-07-31',
        feePurpose: 'Sutarties mokestis',
        hadPriorPaymentEmail: true,
        installmentId: 'preview-fee-daina-50',
        organizationId: ORG,
      },
    },
  },
  {
    label: '2/2 Daina — LAŠKAS B: atnaujinta metinio mokesčio įmoka 300€',
    body: {
      type: 'school_installment_request',
      to: TO,
      locale: 'lt',
      data: {
        schoolName: SCHOOL,
        schoolEmail: CONTACT,
        contactEmail: CONTACT,
        studentName: 'Baltranaitė Deimilė Austėja',
        parentName: 'Daina Maslauskaitė',
        recipientName: 'Daina Maslauskaitė',
        installmentNumber: 1,
        totalInstallments: 1,
        amount: '300.00',
        dueDate: '2026-08-30',
        contractAnnualFee: '300.00',
        scheduleUpdated: true,
        installmentId: 'preview-metinis-daina-300',
        organizationId: ORG,
      },
    },
  },
];

async function sendOne(label: string, body: Record<string, unknown>) {
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
      body,
    } as any,
    res as any,
  );

  console.log(label, '→', statusCode, responseBody);
  if (statusCode !== 200) process.exit(1);
}

for (const email of emails) {
  await sendOne(email.label, email.body);
}

console.log('\nSent 2 preview emails to', TO);
