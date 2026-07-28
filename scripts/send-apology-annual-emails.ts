/**
 * Send apology + annual installment email to parents who paid 50€ fee but never got LAŠKAS B.
 *
 * Usage:
 *   npx tsx scripts/send-apology-annual-emails.ts           # dry-run
 *   npx tsx scripts/send-apology-annual-emails.ts --send    # send for real
 */
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import handler from '../api/send-email.ts';
import {
  isSplitContractFeeInstallment,
} from '../api/_lib/schoolBookingInvite.ts';

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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(env.VITE_SUPABASE_URL!, serviceKey);

async function sendEmail(label: string, body: Record<string, unknown>) {
  if (!SEND) {
    console.log('[dry-run]', label, '→', body.type, 'to', (body as any).to);
    return;
  }
  const req = {
    method: 'POST',
    headers: { 'x-internal-key': serviceKey },
    body,
  };
  const res = {
    status: (code: number) => ({
      json: (data: unknown) => {
        if (code >= 400) throw new Error(`${label}: ${JSON.stringify(data)}`);
        console.log('✓', label);
      },
    }),
  };
  await handler(req as any, res as any);
}

async function main() {
  const { data: contracts, error } = await sb
    .from('school_contracts')
    .select(
      'id, annual_fee, organization_id, archived_at, student:students(full_name, email, payer_email, payer_name), organizations(name, email, features), installments:school_payment_installments(id, installment_number, amount, due_date, payment_status)',
    )
    .is('archived_at', null)
    .is('additional_fee_amount', null);

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(SEND ? '=== SEND MODE ===' : '=== DRY RUN (pass --send) ===\n');

  let count = 0;
  for (const contract of contracts || []) {
    const installments = [...((contract as any).installments || [])].sort(
      (a: any, b: any) => a.installment_number - b.installment_number,
    );
    const feeRow = installments.find(
      (i: any) =>
        isSplitContractFeeInstallment(i, contract, installments) && i.payment_status === 'paid',
    );
    if (!feeRow) continue;

    const nextPending = installments.find(
      (i: any) => i.installment_number > 1 && i.payment_status === 'pending',
    );
    if (!nextPending) continue;

    const st = (contract as any).student || {};
    const org = (contract as any).organizations || {};
    const recipient = String(st.payer_email || st.email || '').trim();
    if (!recipient.includes('@')) continue;

    const orgFeatures =
      org.features && typeof org.features === 'object' && !Array.isArray(org.features)
        ? org.features
        : {};
    const contactEmail =
      orgFeatures.contact_email ||
      orgFeatures.school_contract_signing_email ||
      org.email ||
      '';

    const label = `${st.full_name} → ${recipient} (#${nextPending.installment_number} ${nextPending.amount}€)`;
    console.log(label);

    await sendEmail(label, {
      type: 'school_installment_request',
      to: recipient,
      data: {
        schoolName: org.name || '',
        schoolEmail: org.email || '',
        contactEmail,
        studentName: st.full_name || '',
        parentName: st.payer_name || st.full_name || '',
        recipientName: st.payer_name || st.full_name || '',
        installmentNumber: nextPending.installment_number,
        totalInstallments: installments.length,
        amount: Number(nextPending.amount).toFixed(2),
        dueDate: nextPending.due_date
          ? new Date(nextPending.due_date).toLocaleDateString('lt-LT')
          : '—',
        installmentId: nextPending.id,
        contractAnnualFee: Number((contract as any).annual_fee || 0).toFixed(2),
        organizationId: (contract as any).organization_id,
        apologyForMissingEmail: true,
      },
    });
    count += 1;
  }

  console.log(`\n--- ${count} email(s) ${SEND ? 'sent' : 'would send'} ---`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
