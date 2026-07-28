/**
 * Preview apology + annual installment email (LAŠKAS B with apology) to test inbox.
 *
 * Usage:
 *   npx tsx scripts/send-apology-annual-email-preview.ts
 *   npx tsx scripts/send-apology-annual-email-preview.ts --send
 *   npx tsx scripts/send-apology-annual-email-preview.ts --send --installment-id=<uuid>
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
const PREVIEW_TO = 'alaniukasa@gmail.com';
const DEFAULT_INSTALLMENT_ID = '407d56c2-be3d-46b7-ac81-46279d79b422'; // Jolita — real pay link

const installmentArg = process.argv.find((a) => a.startsWith('--installment-id='));
const INSTALLMENT_ID = installmentArg
  ? installmentArg.slice('--installment-id='.length).trim()
  : DEFAULT_INSTALLMENT_ID;

const sb = createClient(env.VITE_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: inst, error } = await sb
    .from('school_payment_installments')
    .select(
      'id, installment_number, amount, due_date, contract:school_contracts(id, organization_id, annual_fee, student:students(full_name, payer_email, payer_name), organizations(name, email, features))',
    )
    .eq('id', INSTALLMENT_ID)
    .maybeSingle();

  if (error || !inst) {
    console.error('Installment not found:', error?.message || INSTALLMENT_ID);
    process.exit(1);
  }

  const contract = (inst as any).contract;
  const student = contract?.student || {};
  const org = contract?.organizations || {};
  const orgFeatures =
    org.features && typeof org.features === 'object' && !Array.isArray(org.features)
      ? org.features
      : {};
  const contactEmail =
    orgFeatures.contact_email ||
    orgFeatures.school_contract_signing_email ||
    org.email ||
    '';

  const { count: totalInstallments } = await sb
    .from('school_payment_installments')
    .select('id', { count: 'exact', head: true })
    .eq('contract_id', contract.id);

  const body = {
    type: 'school_installment_request',
    to: PREVIEW_TO,
    data: {
      schoolName: org.name || '',
      schoolEmail: org.email || '',
      contactEmail,
      studentName: student.full_name || '',
      parentName: student.payer_name || student.full_name || '',
      recipientName: student.payer_name || student.full_name || '',
      installmentNumber: inst.installment_number,
      totalInstallments: totalInstallments || undefined,
      amount: Number(inst.amount).toFixed(2),
      dueDate: inst.due_date ? new Date(inst.due_date).toLocaleDateString('lt-LT') : '—',
      installmentId: inst.id,
      contractAnnualFee: Number(contract.annual_fee || 0).toFixed(2),
      organizationId: contract.organization_id,
      apologyForMissingEmail: true,
    },
  };

  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';
  const payUrl = `${appUrl}/api/pay-school-installment?installmentId=${inst.id}`;

  console.log('Preview recipient:', PREVIEW_TO);
  console.log('Student:', student.full_name);
  console.log('Installment:', `#${inst.installment_number}`, `${inst.amount}€`);
  console.log('Pay link:', payUrl);
  console.log(SEND ? 'Sending…' : '[dry-run] pass --send to deliver');

  if (!SEND) return;

  const req = { method: 'POST', headers: { 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY }, body };
  const res = {
    status: (code: number) => ({
      json: (data: unknown) => {
        if (code >= 400) {
          console.error('send-email failed:', data);
          process.exit(1);
        }
        console.log('✓ Sent:', data);
      },
    }),
  };
  await handler(req as any, res as any);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
