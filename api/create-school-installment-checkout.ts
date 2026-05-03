import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { verifyRequestAuth } from './_lib/auth.js';
import { schoolInstallmentCheckoutCents } from './_lib/schoolInstallmentStripe.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

/** Match `api/stripe-connect.ts` — mixed API versions caused opaque Stripe failures with Connect accounts. */
const STRIPE_API_VERSION = '2026-02-25.clover' as any;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeKey || !supabaseUrl || !serviceRoleKey) {
    return json(res, 500, { error: 'Server misconfigured' });
  }

  const auth = await verifyRequestAuth(req);
  if (!auth || auth.isInternal || !auth.userId) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: admin } = await supabase
    .from('organization_admins')
    .select('organization_id')
    .eq('user_id', auth.userId)
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

  const { data: orgStripe } = await supabase
    .from('organizations')
    .select('stripe_account_id, stripe_onboarding_complete')
    .eq('id', admin.organization_id)
    .maybeSingle();

  if (!orgStripe?.stripe_onboarding_complete || !orgStripe.stripe_account_id) {
    return json(res, 400, {
      error: 'Prijunkite Stripe paskyrą mokyklei (Finance), kad mokėtojai galėtų mokėti kortele.',
    });
  }

  if (installment.payment_status === 'paid') {
    return json(res, 400, { error: 'Already paid' });
  }

  const student = contract.student;
  const org = contract.org;
  const payerEmail = student?.payer_email || student?.email;

  if (!payerEmail) return json(res, 400, { error: 'No payer email on student' });

  const baseEur = Number(installment.amount);
  const { chargeCents, transferToSchoolCents } = schoolInstallmentCheckoutCents(baseEur);

  if (chargeCents < 50 || transferToSchoolCents < 1) {
    return json(res, 400, { error: 'Įmokos suma per mažai operacijai su kortele.' });
  }

  const destinationAcct = String(orgStripe.stripe_account_id).trim();
  if (!/^acct_/i.test(destinationAcct)) {
    return json(res, 400, { error: 'Neteisingas mokyklos Stripe Connect ID. Prisijunkite prie Finansų ir per naujo prijunkite Stripe.' });
  }

  const applicationFeeCents = chargeCents - transferToSchoolCents;
  if (applicationFeeCents < 1 || applicationFeeCents >= chargeCents) {
    return json(res, 400, { error: 'Neteisingas mokesčių skaidymas įmokai.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: payerEmail,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            unit_amount: chargeCents,
            product_data: {
              name: `${org?.name || 'Mokykla'} — Įmoka #${installment.installment_number}`,
              description: `Metinio mokesčio įmoka: ${student?.full_name || 'Mokinys'}`,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: {
          destination: destinationAcct,
        },
        metadata: {
          tutlio_school_installment_id: installment.id,
          tutlio_school_contract_id: contract.id,
          tutlio_student_id: contract.student_id,
        },
      },
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
  } catch (e: any) {
    const msg =
      (typeof e?.raw?.message === 'string' && e.raw.message) ||
      (typeof e?.message === 'string' && e.message) ||
      'Nepavyko sukurti Stripe Checkout sesijos';
    const code = typeof e?.code === 'string' ? e.code : e?.raw?.code;
    console.error('[create-school-installment-checkout] Stripe:', code, msg, e?.raw ?? '');
    return json(res, 502, {
      error: String(msg).slice(0, 400),
      code: code ?? undefined,
    });
  }
  } catch (Fatal: unknown) {
    const m = Fatal instanceof Error ? Fatal.message : String(Fatal);
    console.error('[create-school-installment-checkout] fatal', m, Fatal);
    return json(res, 500, { error: m.slice(0, 400), message: m.slice(0, 400) });
  }
}
