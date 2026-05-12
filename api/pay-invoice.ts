// ─── Vercel Serverless: Pay Invoice (on-demand Stripe Checkout) ─────────────
// GET /api/pay-invoice?batch=BILLING_BATCH_ID
//
// Public endpoint (no auth required). When a payer clicks the payment link in
// their email, this creates a fresh Stripe Checkout Session (which won't
// expire for 24h) and redirects the browser straight to it.
// This replaces the old approach of embedding a Stripe Checkout URL directly
// in the email, which expired after 24 hours.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { schoolInstallmentCheckoutCents } from './_lib/schoolInstallmentStripe.js';
import { tutorUsesManualStudentPayments } from './_lib/soloManualStudentPayments.js';

const STRIPE_FEE_PERCENT = 0.015;
const STRIPE_FEE_FIXED_EUR = 0.25;
const PLATFORM_FEE_PERCENT = 0.02;

function customerTotalEur(basePriceEur: number): number {
    const platformFeeEur = basePriceEur * PLATFORM_FEE_PERCENT;
    return (basePriceEur + platformFeeEur + STRIPE_FEE_FIXED_EUR) / (1 - STRIPE_FEE_PERCENT);
}

function lessonCheckoutBreakdownCents(basePriceEur: number): { baseCents: number; feesCents: number } {
    const totalEur = customerTotalEur(basePriceEur);
    const totalCents = Math.round(totalEur * 100);
    const baseCents = Math.round(basePriceEur * 100);
    const feesCents = totalCents - baseCents;
    return { baseCents, feesCents };
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const batchId = typeof req.query.batch === 'string' ? req.query.batch.trim() : '';
    if (!batchId) {
        return res.status(400).json({ error: 'Missing batch parameter' });
    }

    try {
        // 1. Fetch billing batch
        const { data: batch, error: batchErr } = await supabase
            .from('billing_batches')
            .select('id, tutor_id, period_start_date, period_end_date, total_amount, paid, payment_status, payer_email, payer_name, stripe_checkout_session_id')
            .eq('id', batchId)
            .single();

        if (batchErr || !batch) {
            return res.status(404).send(errorPage('Sąskaita nerasta', 'Patikrinkite nuorodą arba kreipkitės į korepetitorių.'));
        }

        // 2. Already paid — show friendly message
        if (batch.paid || batch.payment_status === 'paid') {
            return res.status(200).send(errorPage('Sąskaita jau apmokėta ✓', 'Ši sąskaita jau buvo apmokėta. Jokių papildomų veiksmų nereikia.'));
        }

        // 3. Fetch tutor profile
        const { data: tutor, error: tutorErr } = await supabase
            .from('profiles')
            .select('id, full_name, stripe_account_id, stripe_onboarding_complete, organization_id, subscription_plan, manual_subscription_exempt, enable_manual_student_payments')
            .eq('id', batch.tutor_id)
            .single();

        if (tutorErr || !tutor) {
            return res.status(500).send(errorPage('Klaida', 'Nepavyko rasti korepetitoriaus informacijos.'));
        }

        // 4. Manual payment tutors — redirect to student sessions page
        if (tutorUsesManualStudentPayments(tutor)) {
            return res.redirect(302, `${APP_URL}/student/sessions`);
        }

        // 5. Determine Stripe account
        let stripeAccountId: string | null = null;
        let ownerName = tutor.full_name || 'Korepetitorius';
        let useSchoolOrgAbsorbedFees = false;

        if (tutor.organization_id) {
            const { data: org } = await supabase
                .from('organizations')
                .select('stripe_account_id, stripe_onboarding_complete, name, entity_type')
                .eq('id', tutor.organization_id)
                .single();

            if (!org?.stripe_onboarding_complete || !org.stripe_account_id) {
                return res.status(500).send(errorPage('Klaida', 'Organizacijos mokėjimo paskyra nėra prijungta.'));
            }
            stripeAccountId = org.stripe_account_id;
            ownerName = org.name || ownerName;
            useSchoolOrgAbsorbedFees = (org as { entity_type?: string }).entity_type === 'school';
        } else {
            if (!(tutor as any).stripe_onboarding_complete || !(tutor as any).stripe_account_id) {
                return res.status(500).send(errorPage('Klaida', 'Korepetitoriaus mokėjimo paskyra nėra prijungta.'));
            }
            stripeAccountId = (tutor as any).stripe_account_id;
        }

        // 6. Try to reuse existing Stripe session if still open
        if (batch.stripe_checkout_session_id) {
            try {
                const existing = await stripe.checkout.sessions.retrieve(batch.stripe_checkout_session_id);
                if (existing.status === 'open' && existing.url) {
                    return res.redirect(303, existing.url);
                }
            } catch {
                // expired or invalid — create a new one below
            }
        }

        // 7. Fetch sessions in batch for price breakdown
        const { data: batchSessions } = await supabase
            .from('billing_batch_sessions')
            .select('session_id, session_price')
            .eq('billing_batch_id', batchId);

        const sessionCount = (batchSessions || []).length;
        const totalLessonPrice = Number(batch.total_amount);

        const startDate = new Date(batch.period_start_date);
        const endDate = new Date(batch.period_end_date);
        const periodText = `${startDate.toLocaleDateString('lt-LT')} - ${endDate.toLocaleDateString('lt-LT')}`;

        // 8. Create new Stripe Checkout Session
        let checkoutSession: Stripe.Checkout.Session;

        if (useSchoolOrgAbsorbedFees) {
            const { chargeCents, transferToSchoolCents } = schoolInstallmentCheckoutCents(totalLessonPrice);
            const applicationFeeCents = chargeCents - transferToSchoolCents;

            checkoutSession = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: batch.payer_email,
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: `Pamokos (${sessionCount}) – ${periodText}`,
                            description: `Invoice – ${ownerName}`,
                        },
                        unit_amount: chargeCents,
                    },
                    quantity: 1,
                }],
                payment_intent_data: {
                    application_fee_amount: applicationFeeCents,
                    transfer_data: { destination: stripeAccountId! },
                    metadata: { tutlio_billing_batch_id: batchId, tutor_id: batch.tutor_id, tutlio_school_org_absorbed: 'true' },
                },
                metadata: { tutlio_billing_batch_id: batchId, tutor_id: batch.tutor_id, tutlio_school_org_absorbed: 'true' },
                success_url: `${APP_URL}/student/sessions?invoice_paid=true&billing_batch_id=${batchId}&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${APP_URL}/student/sessions`,
            });
        } else {
            let baseCents = 0;
            let feesCents = 0;
            for (const s of (batchSessions || [])) {
                const b = lessonCheckoutBreakdownCents(Number(s.session_price) || 0);
                baseCents += b.baseCents;
                feesCents += b.feesCents;
            }

            checkoutSession = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: batch.payer_email,
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `Pamokos (${sessionCount}) – ${periodText}`,
                                description: `Invoice – ${ownerName}`,
                            },
                            unit_amount: baseCents,
                        },
                        quantity: 1,
                    },
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: 'Platformos administravimo mokestis',
                                description: 'Platform administration and payment processing fee',
                            },
                            unit_amount: feesCents,
                        },
                        quantity: 1,
                    },
                ],
                payment_intent_data: {
                    transfer_data: { destination: stripeAccountId!, amount: baseCents },
                    metadata: { tutlio_billing_batch_id: batchId, tutor_id: batch.tutor_id },
                },
                metadata: { tutlio_billing_batch_id: batchId, tutor_id: batch.tutor_id },
                success_url: `${APP_URL}/student/sessions?invoice_paid=true&billing_batch_id=${batchId}&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${APP_URL}/student/sessions`,
            });
        }

        // 9. Update billing batch with new session ID
        await supabase
            .from('billing_batches')
            .update({ stripe_checkout_session_id: checkoutSession.id })
            .eq('id', batchId);

        // 10. Redirect to Stripe Checkout
        return res.redirect(303, checkoutSession.url!);

    } catch (err: any) {
        console.error('[pay-invoice] Error:', err);
        return res.status(500).send(errorPage('Klaida', 'Nepavyko sukurti mokėjimo sesijos. Bandykite dar kartą arba kreipkitės į korepetitorių.'));
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
