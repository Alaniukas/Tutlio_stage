import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

function load(f) {
  return Object.fromEntries(
    readFileSync(f, 'utf8')
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

const env = { ...load('.env'), ...load('.env.vercel.prod') };
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const emails = [
  'egle.s@icloud.com',
  'justa.stasiskiene@gmail.com',
  'dainalight1@gmail.com',
  'e.jusaitiene@gmail.com',
].map((e) => e.toLowerCase());

const orFilter = emails.map((e) => `email.ilike.${e},payer_email.ilike.${e}`).join(',');

const { data: students, error } = await sb
  .from('students')
  .select('id, full_name, email, payer_email, payer_name, organization_id, organizations(name)')
  .or(orFilter);

if (error) {
  console.error(error);
  process.exit(1);
}

const studentIds = (students || []).map((s) => s.id);
let contracts = [];
if (studentIds.length) {
  const { data, error: cErr } = await sb
    .from('school_contracts')
    .select(
      'id, contract_number, signing_status, annual_fee, additional_fee_amount, additional_fee_purpose, completion_submitted_at, signed_at, archived_at, created_at, student_id, installments:school_payment_installments(id, installment_number, amount, due_date, payment_status, stripe_checkout_session_id, paid_at)',
    )
    .in('student_id', studentIds)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (cErr) {
    console.error(cErr);
    process.exit(1);
  }
  contracts = data || [];
}

const byStudent = new Map();
for (const c of contracts) byStudent.set(c.student_id, [...(byStudent.get(c.student_id) || []), c]);

for (const email of emails) {
  const matches = (students || []).filter((s) =>
    [s.email, s.payer_email].map((x) => String(x || '').toLowerCase()).includes(email),
  );
  console.log('\n=== ' + email + ' ===');
  if (!matches.length) {
    console.log('  Nerasta mokinių');
    continue;
  }
  for (const s of matches) {
    console.log('  Mokinys:', s.full_name);
    console.log('    student email:', s.email);
    console.log('    payer:', s.payer_name, '<' + s.payer_email + '>');
    console.log('    org:', s.organizations?.name);
    const cs = byStudent.get(s.id) || [];
    if (!cs.length) {
      console.log('  Sutarčių: 0');
      continue;
    }
    for (const c of cs) {
      const inst = [...(c.installments || [])].sort((a, b) => a.installment_number - b.installment_number);
      const extraOnFirst = Number(c.additional_fee_amount || 0);
      console.log('  ---');
      console.log('  Sutartis:', c.contract_number, '| id:', c.id);
      console.log('  Status:', c.signing_status);
      console.log('  annual_fee:', c.annual_fee, '| additional_fee:', c.additional_fee_amount, c.additional_fee_purpose || '');
      console.log('  completion_submitted_at:', c.completion_submitted_at || '—');
      console.log('  signed_at:', c.signed_at || '—');
      console.log('  Įmokos (' + inst.length + '):');
      for (const i of inst) {
        const checkoutEur = Number(i.amount) + (i.installment_number === 1 && extraOnFirst > 0 ? extraOnFirst : 0);
        console.log(
          '    #' +
            i.installment_number +
            ': db_amount=' +
            i.amount +
            ' checkout~' +
            checkoutEur +
            '€ status=' +
            i.payment_status +
            ' due=' +
            (i.due_date || '—') +
            (i.paid_at ? ' paid=' + i.paid_at : ''),
        );
      }
      if (inst.length === 1 && extraOnFirst > 0) {
        console.log('  → Dabar: viena įmoka, checkout rodo 300+50=' + (Number(inst[0].amount) + extraOnFirst) + '€ vienu mokėjimu');
      }
    }
  }
}
