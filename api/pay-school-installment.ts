// ─── Vercel Serverless: Pay School Installment (on-demand Stripe Checkout) ───
// GET /api/pay-school-installment?installment=INSTALLMENT_ID
//
// Public endpoint (no auth). When a payer clicks the "Pay now" link in their
// email or in the student/parent dashboard, this creates (or reuses) a Stripe
// Checkout Session for the school contract installment and redirects the browser
// to it. Mirrors api/pay-session.ts (per-lesson payments) so parents/students get
// the same self-service flow for contract installments.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { schoolInstallmentCheckoutCents } from './_lib/schoolInstallmentStripe.js';
import { marketFromRequest } from './_lib/market.js';
import { chargeCurrency } from './_lib/marketMoney.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';

/** Connect accounts need this API version (matches api/stripe-connect.ts) — mixed versions caused opaque failures. */
const STRIPE_API_VERSION = '2026-02-25.clover' as any;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION });
const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const market = marketFromRequest(req);
    const currency = chargeCurrency(market);
    const appOrigin = publicOriginFromRequest(req);

    const installmentId = typeof req.query.installment === 'string' ? req.query.installment.trim() : '';
    if (!installmentId) return res.status(400).send(errorPage('Klaida', 'Trūksta įmokos identifikatoriaus.'));

    try {
        // 1. Fetch installment + contract + student + org
        const { data: installment, error: installmentErr } = await supabase
            .from('school_payment_installments')
            .select(
                '*, contract:school_contracts(*, student:students(full_name, email, payer_email, payer_name), org:organizations(name, email, stripe_account_id, stripe_onboarding_complete))',
            )
            .eq('id', installmentId)
            .maybeSingle();

        if (installmentErr || !installment) {
            // Distinguish a query/DB error from a genuinely missing row — a "not found"
            // here often means the API is pointed at a different Supabase project than
            // the one that holds the installment (dev/test/prod mismatch).
            console.error(
                '[pay-school-installment] Installment not found',
                JSON.stringify({
                    installmentId,
                    supabaseHost: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/^https?:\/\//, '').slice(0, 40),
                    queryError: installmentErr?.message ?? null,
                }),
            );
            return res.status(404).send(errorPage('Įmoka nerasta', 'Patikrinkite nuorodą arba kreipkitės į mokyklą.'));
        }

        if (installment.payment_status === 'paid') {
            return res.status(200).send(errorPage('Įmoka jau apmokėta ✓', 'Ši įmoka jau buvo apmokėta. Jokių papildomų veiksmų nereikia.'));
        }

        const contract = installment.contract as any;
        if (!contract) {
            return res.status(404).send(errorPage('Sutartis nerasta', 'Patikrinkite nuorodą arba kreipkitės į mokyklą.'));
        }
        if (contract.archived_at) {
            return res.status(400).send(errorPage('Sutartis nebegalioja', 'Ši sutartis archyvuota. Kreipkitės į mokyklą.'));
        }

        const student = contract.student;
        const org = contract.org;

        // 2. School must have a connected Stripe (Connect) account to receive funds
        if (!org?.stripe_onboarding_complete || !org.stripe_account_id) {
            return res.status(400).send(errorPage('Mokėjimas dar neparuoštas', 'Mokykla dar neprijungė mokėjimų paskyros. Kreipkitės į mokyklą.'));
        }

        const payerEmail = student?.payer_email || student?.email || undefined;

        // 3. Compute amounts + fee split (see api/_lib/schoolInstallmentStripe.ts)
        const baseEur = Number(installment.amount);
        const extraEurRaw = Number(contract?.additional_fee_amount || 0);
        const extraEur = installment.installment_number === 1 && extraEurRaw > 0 ? extraEurRaw : 0;
        const fixedEur = Math.max(0, baseEur - extraEur);
        const { chargeCents, transferToSchoolCents } = schoolInstallmentCheckoutCents(baseEur, market);

        if (chargeCents < 50 || transferToSchoolCents < 1) {
            return res.status(400).send(errorPage('Klaida', 'Įmokos suma per maža operacijai su kortele.'));
        }

        const destinationAcct = String(org.stripe_account_id).trim();
        if (!/^acct_/i.test(destinationAcct)) {
            return res.status(400).send(errorPage('Klaida', 'Neteisingas mokyklos Stripe Connect ID. Kreipkitės į mokyklą.'));
        }

        const applicationFeeCents = chargeCents - transferToSchoolCents;
        if (applicationFeeCents < 1 || applicationFeeCents >= chargeCents) {
            return res.status(400).send(errorPage('Klaida', 'Neteisingas mokesčių skaidymas įmokai.'));
        }

        // 4. Reuse the existing open Checkout session only if its amount still matches
        //    the current charge; otherwise expire it and create a fresh one.
        if (installment.stripe_checkout_session_id) {
            try {
                const existing = await stripe.checkout.sessions.retrieve(installment.stripe_checkout_session_id);
                if (existing.status === 'open' && existing.url && existing.amount_total === chargeCents) {
                    return res.redirect(303, existing.url);
                }
                if (existing.status === 'open') {
                    await stripe.checkout.sessions.expire(installment.stripe_checkout_session_id).catch(() => {});
                }
            } catch {
                // expired or invalid — create a new one below
            }
        }

        // 5. Build line items (fixed + optional first-installment extra fee)
        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
        if (fixedEur > 0) {
            lineItems.push({
                price_data: {
                    currency,
                    unit_amount: Math.round(fixedEur * 100),
                    product_data: {
                        name: `${org?.name || 'Mokykla'} — Metinis mokestis`,
                        description: `Metinio mokesčio įmoka: ${student?.full_name || 'Mokinys'}`,
                    },
                },
                quantity: 1,
            });
        }
        if (extraEur > 0) {
            const purpose = String(contract?.additional_fee_purpose || '').trim() || 'Papildomas mokestis';
            lineItems.push({
                price_data: {
                    currency,
                    unit_amount: Math.round(extraEur * 100),
                    product_data: {
                        name: `${org?.name || 'Mokykla'} — Papildomas mokestis`,
                        description: purpose,
                    },
                },
                quantity: 1,
            });
        }
        if (lineItems.length === 0) {
            lineItems.push({
                price_data: {
                    currency,
                    unit_amount: chargeCents,
                    product_data: {
                        name: `${org?.name || 'Mokykla'} — Įmoka #${installment.installment_number}`,
                        description: `Metinio mokesčio įmoka: ${student?.full_name || 'Mokinys'}`,
                    },
                },
                quantity: 1,
            });
        }

        const metadata = {
            tutlio_school_installment_id: installment.id,
            tutlio_school_contract_id: contract.id,
            tutlio_student_id: contract.student_id,
        };

        // 6. Create Stripe Checkout Session (Connect transfer to the school)
        const checkoutSession = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: payerEmail,
            line_items: lineItems,
            payment_intent_data: {
                application_fee_amount: applicationFeeCents,
                transfer_data: { destination: destinationAcct },
                metadata,
            },
            metadata,
            success_url: `${appOrigin}/school-payment-success?success=1&installment=${installment.id}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${appOrigin}/school-payment-success?cancelled=1&installment=${installment.id}`,
        });

        await supabase
            .from('school_payment_installments')
            .update({ stripe_checkout_session_id: checkoutSession.id })
            .eq('id', installment.id);

        return res.redirect(303, checkoutSession.url!);
    } catch (err: any) {
        console.error('[pay-school-installment] Error:', err?.code, err?.message, err?.raw ?? '');
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
