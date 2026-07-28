/**
 * Send live fee-split test emails (real installment IDs) to a test inbox.
 * Usage: npx tsx scripts/send-fee-split-live-test-emails.ts
 */
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
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
const SCHOOL = 'Mokykla be sienų „Laisvi vaikai"';
const CONTACT = 'irminta@laisvivaikai.lt';
const FEE_DUE = '2026-07-31';

const sb = createClient(env.VITE_SUPABASE_URL!, serviceKey);

/** Test with Daina / Deimilė — single-child, clearest 50€ + 300€ case */
const CONTRACT_ID = '6334d244-7bb3-45f6-88ce-21484ff906f5';

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

const { data: contract, error: cErr } = await sb
  .from('school_contracts')
  .select(
    'id, annual_fee, organization_id, student:students(full_name, payer_name), installments:school_payment_installments(id, installment_number, amount, due_date, payment_status)',
  )
  .eq('id', CONTRACT_ID)
  .maybeSingle();

if (cErr || !contract) {
  console.error('Contract not found:', cErr?.message);
  process.exit(1);
}

const installments = [...(contract.installments || [])].sort(
  (a: any, b: any) => a.installment_number - b.installment_number,
);
const feeRow = installments.find((i: any) => i.installment_number === 1);
const annualRow =
  installments.find((i: any) => i.installment_number === 2 && i.payment_status === 'pending') ||
  installments.find((i: any) => i.payment_status === 'pending' && i.installment_number !== 1);

if (!feeRow || !annualRow) {
  console.error('Expected fee #1 and annual #2 installments. Current:', installments);
  process.exit(1);
}

const studentName = (contract.student as any)?.full_name || 'Mokinys';
const orgId = contract.organization_id;

console.log('Installments:', installments.map((i: any) => `#${i.installment_number} ${i.amount}€ id=${i.id}`).join(' | '));

await sendOne('LAŠKAS A — sutarties mokestis 50€', {
  type: 'school_contract_fee_due',
  to: TO,
  locale: 'lt',
  data: {
    schoolName: SCHOOL,
    schoolEmail: CONTACT,
    contactEmail: CONTACT,
    studentName,
    amount: Number(feeRow.amount).toFixed(2),
    dueDate: FEE_DUE,
    feePurpose: 'Sutarties mokestis',
    hadPriorPaymentEmail: true,
    installmentId: feeRow.id,
    organizationId: orgId,
  },
});

await sendOne('LAŠKAS B — atnaujinta metinio įmoka', {
  type: 'school_installment_request',
  to: TO,
  locale: 'lt',
  data: {
    schoolName: SCHOOL,
    schoolEmail: CONTACT,
    contactEmail: CONTACT,
    studentName,
    installmentNumber: annualRow.installment_number,
    totalInstallments: installments.length,
    amount: Number(annualRow.amount).toFixed(2),
    dueDate: annualRow.due_date
      ? new Date(annualRow.due_date).toLocaleDateString('lt-LT')
      : '—',
    contractAnnualFee: Number(contract.annual_fee || 0).toFixed(2),
    scheduleUpdated: true,
    installmentId: annualRow.id,
    organizationId: orgId,
  },
});

console.log('\nSent 2 live test emails to', TO);
