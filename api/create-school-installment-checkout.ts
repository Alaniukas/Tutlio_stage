import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeKey || !supabaseUrl || !serviceRoleKey) {
    return json(res, 500, { error: 'Server misconfigured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const userClient = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY || serviceRoleKey);
  const { data: { user }, error: userErr } = await userClient.auth.getUser(authHeader.replace('Bearer ', ''));
  if (userErr || !user) return json(res, 401, { error: 'Invalid token' });

  const { data: admin } = await supabase
    .from('organization_admins')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!admin?.organization_id) return json(res, 403, { error: 'Not a school admin' });

  const { installmentId } = req.body as { installmentId?: string; returnPath?: string };
  if (!installmentId) return json(res, 400, { error: 'installmentId is required' });
  const publicSuccessBase = '/school-payment-success';

  const { data: installment } = await supabase
    .from('school_payment_installments')
    .select('*, contract:school_contracts(*, student:students(full_name, email, payer_email, payer_name), org:organizations(name, email))')
    .eq('id', installmentId)
    .maybeSingle();

  if (!installment) return json(res, 404, { error: 'Installment not found' });

  const contract = installment.contract as any;
  if (!contract || contract.organization_id !== admin.organization_id) {
    return json(res, 403, { error: 'Installment does not belong to your school' });
  }

  if (installment.payment_status === 'paid') {
    return json(res, 400, { error: 'Already paid' });
  }

  const student = contract.student;
  const org = contract.org;
  const payerEmail = student?.payer_email || student?.email;

  if (!payerEmail) return json(res, 400, { error: 'No payer email on student' });

  const amountCents = Math.round(Number(installment.amount) * 100);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: payerEmail,
    line_items: [
      {
        price_data: {
          currency: 'eur',
          unit_amount: amountCents,
          product_data: {
            name: `${org?.name || 'Mokykla'} — Įmoka #${installment.installment_number}`,
            description: `Metinio mokesčio įmoka: ${student?.full_name || 'Mokinys'}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      tutlio_school_installment_id: installment.id,
      tutlio_school_contract_id: contract.id,
      tutlio_student_id: contract.student_id,
    },
    success_url: `${APP_URL}${publicSuccessBase}?success=1&installment=${installment.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}${publicSuccessBase}?cancelled=1&installment=${installment.id}`,
  });

  await supabase
    .from('school_payment_installments')
    .update({ stripe_checkout_session_id: session.id })
    .eq('id', installment.id);

  return json(res, 200, { url: session.url, sessionId: session.id });
}
