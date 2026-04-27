import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

function ymdInVilnius(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value || '1970';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

function plusDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey || !stripeKey) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });
  const today = new Date();
  const dueIn3 = ymdInVilnius(plusDays(today, 3));
  const dueIn1 = ymdInVilnius(plusDays(today, 1));

  const { data: installments, error } = await supabase
    .from('school_payment_installments')
    .select('id, contract_id, installment_number, amount, due_date, payment_status, reminder_3d_sent_at, reminder_1d_sent_at, contract:school_contracts(id, student_id, organization_id, archived_at, student:students(full_name, email, payer_email, payer_name), org:organizations(name, email))')
    .eq('payment_status', 'pending')
    .in('due_date', [dueIn3, dueIn1]);

  if (error) return res.status(500).json({ error: error.message });
  if (!installments?.length) return res.status(200).json({ sent: 0 });

  let sent = 0;
  for (const inst of installments as any[]) {
    const is3d = inst.due_date === dueIn3;
    const alreadySent = is3d ? !!inst.reminder_3d_sent_at : !!inst.reminder_1d_sent_at;
    if (alreadySent || inst.payment_status !== 'pending' || inst.contract?.archived_at) continue;

    const student = inst.contract?.student;
    const org = inst.contract?.org;
    const recipient = student?.payer_email || student?.email;
    if (!recipient) continue;
    const { count: totalInstallments } = await supabase
      .from('school_payment_installments')
      .select('id', { count: 'exact', head: true })
      .eq('contract_id', inst.contract_id);

    const amountCents = Math.round(Number(inst.amount) * 100);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: recipient,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: amountCents,
            product_data: {
              name: `${org?.name || 'Mokykla'} — Įmoka #${inst.installment_number}`,
              description: `Metinio mokesčio įmoka: ${student?.full_name || 'Mokinys'}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        tutlio_school_installment_id: inst.id,
        tutlio_school_contract_id: inst.contract_id,
        tutlio_student_id: inst.contract?.student_id,
      },
      success_url: `${APP_URL}/school/contracts?success=1&installment=${inst.id}`,
      cancel_url: `${APP_URL}/school/contracts?cancelled=1`,
    });

    await supabase
      .from('school_payment_installments')
      .update({ stripe_checkout_session_id: session.id })
      .eq('id', inst.id);

    await fetch(`${APP_URL}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceRoleKey },
      body: JSON.stringify({
        type: 'school_installment_request',
        to: recipient,
        data: {
          schoolName: org?.name || '',
          schoolEmail: org?.email || '',
          studentName: student?.full_name || '',
          parentName: student?.payer_name || student?.full_name || '',
          recipientName: student?.payer_name || student?.full_name || '',
          installmentNumber: inst.installment_number,
          totalInstallments: totalInstallments || undefined,
          amount: Number(inst.amount).toFixed(2),
          dueDate: new Date(inst.due_date).toLocaleDateString('lt-LT'),
          paymentUrl: session.url,
        },
      }),
    });

    await supabase
      .from('school_payment_installments')
      .update(is3d ? { reminder_3d_sent_at: new Date().toISOString() } : { reminder_1d_sent_at: new Date().toISOString() })
      .eq('id', inst.id);
    sent += 1;
  }

  return res.status(200).json({ sent });
}
