/**
 * Revert fee-split for unsigned contracts where the 50€ fee installment is still pending.
 * Restores bundled checkout: first installment amount + 50€, additional_fee_amount = 50.
 *
 * Usage:
 *   npx tsx scripts/revert-school-fee-split-unsigned.ts          # dry-run
 *   npx tsx scripts/revert-school-fee-split-unsigned.ts --apply  # execute
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import {
  SPLIT_CONTRACT_FEE_DUE,
  SPLIT_CONTRACT_FEE_EUR,
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

const APPLY = process.argv.includes('--apply');
const RENUMBER_OFFSET = 100;

const sb = createClient(env.VITE_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

type Installment = {
  id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  payment_status: string;
  stripe_checkout_session_id: string | null;
};

type ContractRow = {
  id: string;
  contract_number: string | null;
  signing_status: string;
  additional_fee_amount: number | null;
  additional_fee_purpose: string | null;
  student: { full_name: string; payer_email: string | null } | null;
  installments: Installment[];
};

function isSplitFeeRow(inst: Installment): boolean {
  return (
    inst.installment_number === 1 &&
    Math.abs(Number(inst.amount) - SPLIT_CONTRACT_FEE_EUR) < 0.01 &&
    inst.due_date === SPLIT_CONTRACT_FEE_DUE
  );
}

async function main() {
  const { data: contracts, error } = await sb
    .from('school_contracts')
    .select(
      'id, contract_number, signing_status, additional_fee_amount, additional_fee_purpose, archived_at, student:students(full_name, payer_email), installments:school_payment_installments(id, installment_number, amount, due_date, payment_status, stripe_checkout_session_id)',
    )
    .is('archived_at', null)
    .is('additional_fee_amount', null);

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY RUN (pass --apply to execute) ===\n');

  let reverted = 0;
  for (const contract of (contracts || []) as ContractRow[]) {
    const installments = [...(contract.installments || [])].sort(
      (a, b) => a.installment_number - b.installment_number,
    );
    const feeRow = installments.find(isSplitFeeRow);
    if (!feeRow) continue;
    if (contract.signing_status === 'signed') continue;
    if (feeRow.payment_status !== 'pending') continue;

    const remaining = installments.filter((i) => i.id !== feeRow.id);
    if (!remaining.length) {
      console.log(`SKIP ${contract.contract_number || contract.id}: no annual installments`);
      continue;
    }

    const wasFirstAnnual = remaining.find((i) => i.installment_number === 2) || remaining[0];
    const studentName = contract.student?.full_name || '—';
    const newFirstAmount = Number(wasFirstAnnual.amount) + SPLIT_CONTRACT_FEE_EUR;

    console.log(
      `\n${contract.contract_number || contract.id.slice(0, 8)} | ${studentName} | signing=${contract.signing_status}`,
    );
    console.log(
      `  revert: delete fee #1 (${SPLIT_CONTRACT_FEE_EUR}€); #${wasFirstAnnual.installment_number} ${wasFirstAnnual.amount} → ${newFirstAmount}€ bundled`,
    );

    if (!APPLY) {
      reverted += 1;
      continue;
    }

    const { error: delErr } = await sb.from('school_payment_installments').delete().eq('id', feeRow.id);
    if (delErr) {
      console.error('  delete fee failed:', delErr.message);
      process.exit(1);
    }

    for (const inst of remaining) {
      const { error: bumpErr } = await sb
        .from('school_payment_installments')
        .update({ installment_number: inst.installment_number + RENUMBER_OFFSET })
        .eq('id', inst.id);
      if (bumpErr) {
        console.error('  bump failed:', bumpErr.message);
        process.exit(1);
      }
    }

    const { error: mergeErr } = await sb
      .from('school_payment_installments')
      .update({
        installment_number: 1,
        amount: newFirstAmount,
        stripe_checkout_session_id: null,
      })
      .eq('id', wasFirstAnnual.id);
    if (mergeErr) {
      console.error('  merge failed:', mergeErr.message);
      process.exit(1);
    }

    for (const inst of remaining) {
      if (inst.id === wasFirstAnnual.id) continue;
      const { error: renumErr } = await sb
        .from('school_payment_installments')
        .update({ installment_number: inst.installment_number - 1 })
        .eq('id', inst.id);
      if (renumErr) {
        console.error('  renumber failed:', renumErr.message);
        process.exit(1);
      }
    }

    await sb
      .from('school_payment_installments')
      .update({ stripe_checkout_session_id: null })
      .eq('contract_id', contract.id)
      .eq('payment_status', 'pending');

    await sb
      .from('school_contracts')
      .update({
        additional_fee_amount: SPLIT_CONTRACT_FEE_EUR,
        additional_fee_purpose: contract.additional_fee_purpose || 'Sutarties mokestis',
      })
      .eq('id', contract.id);

    const { data: afterRows } = await sb
      .from('school_payment_installments')
      .select('installment_number, amount, payment_status')
      .eq('contract_id', contract.id)
      .order('installment_number');

    console.log(
      '  ✓ done:',
      (afterRows || []).map((r) => `#${r.installment_number}=${r.amount}€`).join(', '),
    );
    reverted += 1;
  }

  console.log(`\n--- ${reverted} contract(s) ${APPLY ? 'reverted' : 'would revert'} ---`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
