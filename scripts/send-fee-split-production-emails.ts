/**
 * Send fee-split emails (LAŠKAS A + B) to affected parents after DB migration.
 *
 * Usage:
 *   npx tsx scripts/send-fee-split-production-emails.ts           # dry-run
 *   npx tsx scripts/send-fee-split-production-emails.ts --send    # send for real
 *   npx tsx scripts/send-fee-split-production-emails.ts --send --only=dainalight1@gmail.com
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

const SEND = process.argv.includes('--send');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY_EMAIL = onlyArg ? onlyArg.slice('--only='.length).trim().toLowerCase() : '';
const FEE_DUE = '2026-07-31';
const ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

/** Payer inboxes agreed for the 50€ split rollout. */
const TARGET_PAYER_EMAILS = [
  'dainalight1@gmail.com',
  'e.jusaitiene@gmail.com',
  'egle.s@icloud.com',
]
  .map((e) => e.toLowerCase())
  .filter((e) => !ONLY_EMAIL || e === ONLY_EMAIL);

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(env.VITE_SUPABASE_URL!, serviceKey);

type Installment = {
  id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  payment_status: string;
};

type ContractRow = {
  id: string;
  contract_number: string | null;
  annual_fee: number;
  signing_status: string;
  student: {
    full_name: string;
    payer_email: string | null;
    payer_name: string | null;
  } | null;
  installments: Installment[];
};

async function sendOne(label: string, body: Record<string, unknown>) {
  if (!SEND) {
    console.log('[dry-run]', label, '→', body.type, 'to', (body as any).to);
    return;
  }

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
  await new Promise((r) => setTimeout(r, 400));
}

const { data: org } = await sb
  .from('organizations')
  .select('name, email, features')
  .eq('id', ORG_ID)
  .maybeSingle();

const features =
  org?.features && typeof org.features === 'object' && !Array.isArray(org.features)
    ? (org.features as Record<string, unknown>)
    : {};
const schoolName =
  (typeof features.public_name === 'string' && features.public_name.trim()) ||
  org?.name ||
  'Mokykla';
const contactEmail =
  (typeof features.contact_email === 'string' && features.contact_email.trim()) ||
  (typeof features.school_contract_signing_email === 'string' && features.school_contract_signing_email.trim()) ||
  org?.email ||
  '';

const orFilter = TARGET_PAYER_EMAILS.map((e) => `payer_email.ilike.${e}`).join(',');
const { data: students, error: stErr } = await sb
  .from('students')
  .select('id, full_name, payer_email, payer_name')
  .eq('organization_id', ORG_ID)
  .or(orFilter);

if (stErr) {
  console.error(stErr);
  process.exit(1);
}

const studentIds = (students || []).map((s) => s.id);
if (!studentIds.length) {
  console.log('No matching students.');
  process.exit(0);
}

const { data: contracts, error: cErr } = await sb
  .from('school_contracts')
  .select(
    'id, contract_number, annual_fee, signing_status, student:students(full_name, payer_email, payer_name), installments:school_payment_installments(id, installment_number, amount, due_date, payment_status)',
  )
  .in('student_id', studentIds)
  .is('archived_at', null);

if (cErr) {
  console.error(cErr);
  process.exit(1);
}

const rows = (contracts || []) as ContractRow[];
console.log(SEND ? '=== SEND MODE ===' : '=== DRY RUN (pass --send to deliver) ===\n');
console.log(`School: ${schoolName} | contact: ${contactEmail}\n`);

let emailCount = 0;

for (const contract of rows) {
  const studentName = contract.student?.full_name || 'Mokinys';
  const to = String(contract.student?.payer_email || '').trim().toLowerCase();
  if (!to || !TARGET_PAYER_EMAILS.includes(to)) continue;

  const installments = [...(contract.installments || [])].sort(
    (a, b) => a.installment_number - b.installment_number,
  );
  const pending = installments.filter((i) => i.payment_status === 'pending');
  if (!pending.length) {
    console.log(`SKIP ${contract.contract_number} | ${studentName} — no pending installments`);
    continue;
  }

  const feeRow = installments.find((i) => {
    if (i.installment_number !== 1 || Number(i.amount) !== 50 || i.payment_status !== 'pending') return false;
    if (String(i.due_date).startsWith('2026-07-31')) return true;
    // Fee-only contract (no annual fee): single 50€ row kept from before migration.
    return Number(contract.annual_fee || 0) <= 0 && installments.length === 1;
  });
  const annualRow =
    installments.find((i) => i.installment_number === 2 && i.payment_status === 'pending') ||
    pending.find((i) => i.installment_number > 1);

  console.log(`\n${contract.contract_number} | ${studentName} → ${to} (${contract.signing_status})`);
  console.log(
    '  installments:',
    installments.map((i) => `#${i.installment_number}=${i.amount}€ ${i.payment_status}`).join(', '),
  );

  if (!feeRow) {
    console.log('  → SKIP: no 50€ fee row (#1, due 2026-07-31) — was this contract migrated?');
    continue;
  }

  const labelBase = `${studentName} (${to})`;

  await sendOne(`${labelBase} — LAŠKAS A: sutarties mokestis 50€`, {
    type: 'school_contract_fee_due',
    to,
    locale: 'lt',
    data: {
      schoolName,
      schoolEmail: org?.email || contactEmail,
      contactEmail,
      studentName,
      amount: Number(feeRow.amount).toFixed(2),
      dueDate: String(feeRow.due_date).startsWith('2026-07-31')
        ? FEE_DUE
        : feeRow.due_date
          ? new Date(feeRow.due_date).toLocaleDateString('lt-LT')
          : FEE_DUE,
      feePurpose: 'Sutarties mokestis',
      hadPriorPaymentEmail: true,
      installmentId: feeRow.id,
      organizationId: ORG_ID,
    },
  });
  emailCount += 1;

  const annualFee = Number(contract.annual_fee || 0);
  if (annualFee > 0 && annualRow) {
    await sendOne(`${labelBase} — LAŠKAS B: metinio įmoka #${annualRow.installment_number}`, {
      type: 'school_installment_request',
      to,
      locale: 'lt',
      data: {
        schoolName,
        schoolEmail: org?.email || contactEmail,
        contactEmail,
        studentName,
        installmentNumber: annualRow.installment_number,
        totalInstallments: installments.length,
        amount: Number(annualRow.amount).toFixed(2),
        dueDate: annualRow.due_date
          ? new Date(annualRow.due_date).toLocaleDateString('lt-LT')
          : '—',
        contractAnnualFee: annualFee.toFixed(2),
        scheduleUpdated: true,
        installmentId: annualRow.id,
        organizationId: ORG_ID,
      },
    });
    emailCount += 1;
  } else {
    console.log('  → fee-only contract: LAŠKAS B skipped');
  }
}

console.log(`\n${SEND ? 'Sent' : 'Would send'} ${emailCount} email(s).`);
