/**
 * Send corrected payment emails after stale fee-split reminders.
 * Dry-run by default — pass --send to deliver, --preview to alaniukasa@gmail.com first.
 *
 * Usage:
 *   npx tsx scripts/send-corrected-payment-emails.ts
 *   npx tsx scripts/send-corrected-payment-emails.ts --preview --send
 *   npx tsx scripts/send-corrected-payment-emails.ts --send
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
const PREVIEW = process.argv.includes('--preview');
const PREVIEW_TO = 'alaniukasa@gmail.com';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(env.VITE_SUPABASE_URL!, serviceKey);

/** installmentId + correction note shown in yellow box */
const TARGETS: Array<{ installmentId: string; correctedPaymentNote: string }> = [
  {
    installmentId: 'cf7dae19-9415-4069-b489-ac441e5ca528', // Gubinaitė Danielė #1
    correctedPaymentNote:
      'Atsiprašome — ankstesniame laiške buvo nurodytas visas metinis mokestis vienu mokėjimu. Jūsų sutartyje mokestis mokamas dalimis. Žemiau — grafikas ir pirmos įmokos nuoroda. Jei kiltų klausimų, rašykite mums.',
  },
];

async function sendEmail(label: string, body: Record<string, unknown>) {
  const to = (body as any).to;
  if (!SEND) {
    console.log('[dry-run]', label, '→', body.type, 'to', to);
    return;
  }
  const req = { method: 'POST', headers: { 'x-internal-key': serviceKey }, body };
  const res = {
    status: (code: number) => ({
      json: (data: unknown) => {
        if (code >= 400) throw new Error(`${label}: ${JSON.stringify(data)}`);
        console.log('✓', label, '→', to);
      },
    }),
  };
  await handler(req as any, res as any);
}

async function buildPayload(installmentId: string, correctedPaymentNote: string, overrideTo?: string) {
  const { data: inst, error } = await sb
    .from('school_payment_installments')
    .select(
      'id, installment_number, amount, due_date, payment_status, contract:school_contracts(id, organization_id, annual_fee, additional_fee_amount, additional_fee_purpose, student:students(full_name, payer_email, payer_name), organizations(name, email, features))',
    )
    .eq('id', installmentId)
    .maybeSingle();

  if (error || !inst) throw new Error(`Installment not found: ${installmentId} ${error?.message || ''}`);
  if (inst.payment_status === 'paid') throw new Error(`Already paid: ${installmentId}`);

  const contract = (inst as any).contract;
  const st = contract?.student || {};
  const org = contract?.organizations || {};
  const recipient = String(overrideTo || st.payer_email || st.email || '').trim();
  if (!recipient.includes('@')) throw new Error(`No recipient for ${installmentId}`);

  const orgFeatures =
    org.features && typeof org.features === 'object' && !Array.isArray(org.features) ? org.features : {};
  const contactEmail =
    orgFeatures.contact_email || orgFeatures.school_contract_signing_email || org.email || '';

  const { count: totalInstallments } = await sb
    .from('school_payment_installments')
    .select('id', { count: 'exact', head: true })
    .eq('contract_id', contract.id);

  const { data: allInstallments } = await sb
    .from('school_payment_installments')
    .select('installment_number, amount, due_date, payment_status')
    .eq('contract_id', contract.id)
    .order('installment_number');

  const installments =
    (allInstallments || []).length > 1
      ? (allInstallments || []).map((row) => ({
          number: row.installment_number,
          amount: Number(row.amount).toFixed(2),
          dueDate: row.due_date ? new Date(row.due_date).toLocaleDateString('lt-LT') : '—',
          paid: row.payment_status === 'paid',
        }))
      : [];

  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';
  const payUrl = `${appUrl}/api/pay-school-installment?installment=${inst.id}`;

  return {
    label: `${st.full_name} → ${recipient} (#${inst.installment_number} ${inst.amount}€)`,
    payUrl,
    body: {
      type: 'school_installment_request',
      to: recipient,
      data: {
        schoolName: org.name || '',
        schoolEmail: org.email || '',
        contactEmail,
        studentName: st.full_name || '',
        parentName: st.payer_name || st.full_name || '',
        recipientName: st.payer_name || st.full_name || '',
        installmentNumber: inst.installment_number,
        totalInstallments: totalInstallments || undefined,
        amount: Number(inst.amount).toFixed(2),
        dueDate: inst.due_date ? new Date(inst.due_date).toLocaleDateString('lt-LT') : '—',
        installmentId: inst.id,
        contractAnnualFee: Number(contract.annual_fee || 0).toFixed(2),
        additionalFeeAmount:
          Number(contract.additional_fee_amount || 0) > 0
            ? Number(contract.additional_fee_amount).toFixed(2)
            : undefined,
        additionalFeePurpose: contract.additional_fee_purpose || undefined,
        organizationId: contract.organization_id,
        correctedPaymentNote,
        ...(installments.length > 1 ? { installments } : {}),
      },
    },
  };
}

async function main() {
  console.log(SEND ? (PREVIEW ? '=== PREVIEW SEND ===' : '=== SEND MODE ===') : '=== DRY RUN (pass --send) ===\n');

  for (const target of TARGETS) {
    const { label, payUrl, body } = await buildPayload(
      target.installmentId,
      target.correctedPaymentNote,
      PREVIEW ? PREVIEW_TO : undefined,
    );
    console.log(label);
    console.log('  pay:', payUrl);
    if (PREVIEW && SEND) {
      console.log('  (preview copy to', PREVIEW_TO + ')');
    }
    await sendEmail(label, body);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
