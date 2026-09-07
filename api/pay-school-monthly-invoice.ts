// ─── Vercel Serverless: Pay School Monthly Invoice (on-demand Stripe Checkout) ─
// GET /api/pay-school-monthly-invoice?invoice=INVOICE_ID&t=TOKEN
//
// Public endpoint for the "Apmokėti" button in the monthly extra-lessons
// invoice email. No Tutlio account is needed: the signed token authorizes
// exactly this invoice. Mirrors api/pay-school-installment.ts (annual
// contract installments): Stripe Checkout with a Connect transfer to the
// school, Tutlio fee on top, webhook + success page mark the row paid.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { schoolInstallmentCheckoutCents } from './_lib/schoolInstallmentStripe.js';
import { marketFromRequest } from './_lib/market.js';
import { chargeCurrency } from './_lib/marketMoney.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { verifyPublicLinkToken } from './_lib/publicLinkToken.js';
import { monthLabelLt } from './_lib/schoolMonthlyInvoiceEmail.js';

/** Connect accounts need this API version (matches api/stripe-connect.ts). */
const STRIPE_API_VERSION = '2026-02-25.clover' as any;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION });
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const market = marketFromRequest(req);
  const currency = chargeCurrency(market);
  const appOrigin = publicOriginFromRequest(req);

  const invoiceId = typeof req.query.invoice === 'string' ? req.query.invoice.trim() : '';
  const token = typeof req.query.t === 'string' ? req.query.t.trim() : '';
  if (!invoiceId) return res.status(400).send(errorPage('Klaida', 'Trūksta sąskaitos identifikatoriaus.'));
  if (!verifyPublicLinkToken('monthly-invoice', invoiceId, token)) {
    return res.status(403).send(errorPage('Nuoroda negalioja', 'Patikrinkite nuorodą el. laiške arba kreipkitės į mokyklą.'));
  }

  try {
    const { data: invoice, error: invoiceErr } = await supabase
      .from('school_monthly_invoices')
      .select(
        '*, contract:school_contracts(id, contract_number, archived_at, student:students(full_name, email, payer_email, payer_name)), org:organizations(name, email, stripe_account_id, stripe_onboarding_complete)',
      )
      .eq('id', invoiceId)
      .maybeSingle();

    if (invoiceErr || !invoice) {
      console.error('[pay-school-monthly-invoice] invoice not found', invoiceId, invoiceErr?.message ?? null);
      return res.status(404).send(errorPage('Sąskaita nerasta', 'Patikrinkite nuorodą arba kreipkitės į mokyklą.'));
    }
    if (invoice.payment_status === 'paid') {
      return res.status(200).send(errorPage('Sąskaita jau apmokėta ✓', 'Ši sąskaita jau buvo apmokėta. Jokių papildomų veiksmų nereikia.'));
    }
    if (invoice.payment_status === 'cancelled') {
      return res.status(200).send(errorPage('Sąskaita atšaukta', 'Ši sąskaita nebegalioja. Kreipkitės į mokyklą, jei turite klausimų.'));
    }

    const contract = invoice.contract as any;
    if (contract?.archived_at) {
      return res.status(400).send(errorPage('Sutartis nebegalioja', 'Ši sutartis archyvuota. Kreipkitės į mokyklą.'));
    }
    const student = contract?.student;
    const org = invoice.org as any;

    const totalEur = Math.round(Number(invoice.total_eur) * 100) / 100;
    if (!(totalEur > 0)) {
      return res.status(400).send(errorPage('Klaida', 'Sąskaitos suma neteisinga. Kreipkitės į mokyklą.'));
    }

    if (!org?.stripe_onboarding_complete || !org.stripe_account_id) {
      return res.status(400).send(errorPage('Mokėjimas dar neparuoštas', 'Mokykla dar neprijungė mokėjimų paskyros. Kreipkitės į mokyklą.'));
    }
    const destinationAcct = String(org.stripe_account_id).trim();
    if (!/^acct_/i.test(destinationAcct)) {
      return res.status(400).send(errorPage('Klaida', 'Neteisingas mokyklos Stripe Connect ID. Kreipkitės į mokyklą.'));
    }

    const { chargeCents, transferToSchoolCents } = schoolInstallmentCheckoutCents(totalEur, market);
    if (chargeCents < 50 || transferToSchoolCents < 1) {
      return res.status(400).send(errorPage('Klaida', 'Sąskaitos suma per maža operacijai su kortele.'));
    }
    const applicationFeeCents = chargeCents - transferToSchoolCents;
    if (applicationFeeCents < 1 || applicationFeeCents >= chargeCents) {
      return res.status(400).send(errorPage('Klaida', 'Neteisingas mokesčių skaidymas sąskaitai.'));
    }

    // Reuse an open Checkout with the same amount; otherwise expire and recreate.
    const existingCheckoutId = String((invoice as any).stripe_checkout_session_id || '').trim();
    if (existingCheckoutId) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(existingCheckoutId);
        if (existing.status === 'open' && existing.url && existing.amount_total === chargeCents) {
          return res.redirect(303, existing.url);
        }
        if (existing.status === 'open') {
          await stripe.checkout.sessions.expire(existingCheckoutId).catch(() => {});
        }
      } catch {
        // expired or invalid — create a new one below
      }
    }

    const periodLabel = monthLabelLt(String(invoice.period_start));
    const baseLessons = Number(invoice.base_lessons || 0);
    const extraLessons = Number(invoice.extra_lessons || 0);
    const description = [
      `Mokinys: ${student?.full_name || 'Mokinys'}`,
      baseLessons > 0 ? `${baseLessons} pamok. bazė` : '',
      extraLessons > 0 ? `${extraLessons} papild. pamok.` : '',
    ].filter(Boolean).join(' · ');

    const metadata = {
      tutlio_school_monthly_invoice_id: invoice.id,
      tutlio_school_contract_id: invoice.contract_id,
      tutlio_student_id: invoice.student_id,
    };

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: student?.payer_email || student?.email || undefined,
      line_items: [{
        price_data: {
          currency,
          unit_amount: chargeCents,
          product_data: {
            name: `${org?.name || 'Mokykla'} — Papildomų pamokų sąskaita (${periodLabel})`,
            description,
          },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: { destination: destinationAcct },
        metadata,
      },
      metadata,
      success_url: `${appOrigin}/school-payment-success?success=1&monthly=${invoice.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/school-payment-success?cancelled=1&monthly=${invoice.id}`,
    });

    // Bookkeeping column may lag behind the migration on a fresh deploy — never block the payer on it.
    await supabase
      .from('school_monthly_invoices')
      .update({ stripe_checkout_session_id: checkoutSession.id })
      .eq('id', invoice.id)
      .then(({ error }) => {
        if (error) console.warn('[pay-school-monthly-invoice] could not store checkout id', error.message);
      });

    return res.redirect(303, checkoutSession.url!);
  } catch (err: any) {
    console.error('[pay-school-monthly-invoice] Error:', err?.code, err?.message, err?.raw ?? '');
    return res.status(500).send(errorPage('Klaida', 'Nepavyko sukurti mokėjimo sesijos. Bandykite dar kartą.'));
  }
}

function errorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="lt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} – Tutlio</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; }
    .card { max-width: 440px; padding: 40px; text-align: center; background: #fff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    h1 { font-size: 22px; margin-bottom: 12px; }
    p { font-size: 15px; color: #64748b; line-height: 1.6; }
  </style>
</head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body>
</html>`;
}
