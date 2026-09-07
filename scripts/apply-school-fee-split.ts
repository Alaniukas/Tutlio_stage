/**
 * Split embedded 50€ contract fee into a dedicated installment per contract.
 *
 * For each contract with additional_fee_amount = 50:
 * - Clear additional_fee_amount (stops double-charge at checkout)
 * - Insert new 50€ installment #1 due 2026-07-31 (fee-only contracts skip insert)
 * - Reduce first pending installment by 50€ and renumber existing rows
 * - Clear stripe_checkout_session_id on affected pending rows
 *
 * Usage:
 *   npx tsx scripts/apply-school-fee-split.ts          # dry-run
 *   npx tsx scripts/apply-school-fee-split.ts --apply   # execute
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

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
const FEE_EUR = 50;
const FEE_DUE = '2026-07-31';
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
  annual_fee: number;
  additional_fee_amount: number | null;
  additional_fee_purpose: string | null;
  signing_status: string;
  student: { full_name: string; payer_email: string | null } | null;
  installments: Installment[];
};

async function main() {
  const { data: contracts, error } = await sb
    .from('school_contracts')
    .select(
      'id, contract_number, annual_fee, additional_fee_amount, additional_fee_purpose, signing_status, archived_at, student:students(full_name, payer_email), installments:school_payment_installments(id, installment_number, amount, due_date, payment_status, stripe_checkout_session_id)',
    )
    .is('archived_at', null)
    .gt('additional_fee_amount', 0);

  if (error) {
    console.error(error);
    process.exit(1);
  }

  const rows = (contracts || []) as ContractRow[];
  if (!rows.length) {
    console.log('No contracts with additional_fee_amount > 0.');
    return;
  }

  console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY RUN (pass --apply to execute) ===\n');

  const results: Array<{
    contractId: string;
    contractNumber: string;
    studentName: string;
    feeOnly: boolean;
    feeInstallmentId?: string;
    annualInstallmentId?: string;
  }> = [];

  for (const contract of rows) {
    const extra = Number(contract.additional_fee_amount || 0);
    if (extra <= 0) continue;

    const installments = [...(contract.installments || [])].sort(
      (a, b) => a.installment_number - b.installment_number,
    );
    const studentName = contract.student?.full_name || '—';
    const contractNumber = contract.contract_number || contract.id.slice(0, 8);
    const annualFee = Number(contract.annual_fee || 0);
    const feeOnly = annualFee <= 0;

    console.log(`\n${contractNumber} | ${studentName} | signing=${contract.signing_status}`);
    console.log(`  additional_fee=${extra} | annual_fee=${annualFee} | installments=${installments.length}`);

    if (feeOnly) {
      console.log('  → fee-only: clear additional_fee + stripe sessions on pending rows');
      if (APPLY) {
        await sb
          .from('school_contracts')
          .update({ additional_fee_amount: null })
          .eq('id', contract.id);
        await sb
          .from('school_payment_installments')
          .update({ stripe_checkout_session_id: null })
          .eq('contract_id', contract.id)
          .eq('payment_status', 'pending');
      }
      const feeRow = installments.find((i) => i.payment_status === 'pending') || installments[0];
      results.push({
        contractId: contract.id,
        contractNumber,
        studentName,
        feeOnly: true,
        feeInstallmentId: feeRow?.id,
      });
      continue;
    }

    const firstPending = installments.find((i) => i.payment_status === 'pending');
    if (!firstPending) {
      console.log('  → SKIP: no pending installments');
      continue;
    }

    const newFirstAmount = Number(firstPending.amount) - extra;
    if (newFirstAmount <= 0) {
      console.error(`  → ABORT: first pending amount ${firstPending.amount} cannot be reduced by ${extra}`);
      process.exit(1);
    }

    console.log(`  → split: new fee #1 ${FEE_EUR}€; #${firstPending.installment_number} ${firstPending.amount} → ${newFirstAmount}`);

    if (!APPLY) {
      results.push({
        contractId: contract.id,
        contractNumber,
        studentName,
        feeOnly: false,
      });
      continue;
    }

    // Bump installment numbers to avoid unique constraint clashes.
    for (const inst of installments) {
      const { error: renumErr } = await sb
        .from('school_payment_installments')
        .update({ installment_number: inst.installment_number + RENUMBER_OFFSET })
        .eq('id', inst.id);
      if (renumErr) {
        console.error('  renumber bump failed:', renumErr.message);
        process.exit(1);
      }
    }

    const bumpedFirstId = firstPending.id;
    const { error: reduceErr } = await sb
      .from('school_payment_installments')
      .update({
        amount: newFirstAmount,
        stripe_checkout_session_id: null,
      })
      .eq('id', bumpedFirstId);
    if (reduceErr) {
      console.error('  reduce failed:', reduceErr.message);
      process.exit(1);
    }

    const { data: feeInsert, error: insertErr } = await sb
      .from('school_payment_installments')
      .insert({
        contract_id: contract.id,
        installment_number: 1,
        amount: FEE_EUR,
        due_date: FEE_DUE,
        payment_status: 'pending',
      })
      .select('id')
      .single();
    if (insertErr || !feeInsert) {
      console.error('  insert fee failed:', insertErr?.message);
      process.exit(1);
    }

    for (const inst of installments) {
      const { error: finalRenErr } = await sb
        .from('school_payment_installments')
        .update({ installment_number: inst.installment_number + 1 })
        .eq('id', inst.id);
      if (finalRenErr) {
        console.error('  final renumber failed:', finalRenErr.message);
        process.exit(1);
      }
    }

    await sb
      .from('school_payment_installments')
      .update({ stripe_checkout_session_id: null })
      .eq('contract_id', contract.id)
      .eq('payment_status', 'pending')
      .neq('id', feeInsert.id);

    await sb
      .from('school_contracts')
      .update({ additional_fee_amount: null })
      .eq('id', contract.id);

    const { data: afterRows } = await sb
      .from('school_payment_installments')
      .select('id, installment_number, amount, payment_status')
      .eq('contract_id', contract.id)
      .order('installment_number');

    const annualRow = (afterRows || []).find(
      (r) => r.installment_number === 2 && r.payment_status === 'pending',
    );

    console.log('  ✓ done:', (afterRows || []).map((r) => `#${r.installment_number}=${r.amount}€`).join(', '));

    results.push({
      contractId: contract.id,
      contractNumber,
      studentName,
      feeOnly: false,
      feeInstallmentId: feeInsert.id,
      annualInstallmentId: annualRow?.id,
    });
  }

  console.log('\n--- Summary ---');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
