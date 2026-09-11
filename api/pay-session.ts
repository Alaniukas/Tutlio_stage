// ─── Vercel Serverless: Pay Session (on-demand Stripe Checkout) ─────────────
// GET /api/pay-session?session=SESSION_ID
//
// Public endpoint (no auth). When a payer clicks the payment link in their
// email, this creates a fresh Stripe Checkout Session and redirects the
// browser to it. Replaces embedding Stripe URLs directly in emails.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { tutorUsesManualStudentPayments } from './_lib/soloManualStudentPayments.js';
import { schoolInstallmentCheckoutCents } from './_lib/schoolInstallmentStripe.js';
import { marketFromRequest } from './_lib/market.js';
import {
  chargeCurrency,
  lessonCheckoutBreakdownCents,
  checkoutBaseMetadata,
  creditNote,
  orgFeeProfile,
  type OrgFeeProfile,
} from './_lib/marketMoney.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const market = marketFromRequest(req);
    const currency = chargeCurrency(market);
    const appOrigin = publicOriginFromRequest(req);

    const sessionId = typeof req.query.session === 'string' ? req.query.session.trim() : '';
    if (!sessionId) return res.status(400).send(errorPage('Klaida', 'Trūksta pamokos identifikatoriaus.'));

    try {
        // 1. Fetch session with student + tutor
        const { data: session, error: sessionErr } = await supabase
            .from('sessions')
            .select(`
                id, price, topic, student_id, tutor_id, start_time, paid, payment_status,
                stripe_checkout_session_id,
                students!inner(id, full_name, payment_payer, payer_email, payer_name, credit_balance, payment_model),
                profiles!sessions_tutor_id_fkey(
                    stripe_account_id, stripe_onboarding_complete, organization_id, full_name,
                    subscription_plan, manual_subscription_exempt, enable_manual_student_payments
                )
            `)
            .eq('id', sessionId)
            .single();

        if (sessionErr || !session) {
            return res.status(404).send(errorPage('Pamoka nerasta', 'Patikrinkite nuorodą arba kreipkitės į korepetitorių.'));
        }

        if (session.paid || session.payment_status === 'paid') {
            return res.status(200).send(errorPage('Pamoka jau apmokėta ✓', 'Ši pamoka jau buvo apmokėta. Jokių papildomų veiksmų nereikia.'));
        }

        const tutor = session.profiles as any;
        const student = session.students as any;

        const studentPaymentModelRaw = String(student?.payment_model || '').trim();
        const allowsPerLessonPayment =
            !studentPaymentModelRaw ||
            studentPaymentModelRaw
                .split(',')
                .map((part: string) => part.trim())
                .includes('per_lesson');

        if (!allowsPerLessonPayment) {
            return res.status(400).send(
                errorPage(
                    'Apmokėjimas nereikalingas',
                    'Šiam mokiniui taikomas mėnesinis arba paketinis atsiskaitymas. Pamoką apmokėsite gavę mėnesinę sąskaitą.',
                ),
            );
        }

        if (tutorUsesManualStudentPayments(tutor)) {
            return res.redirect(302, `${appOrigin}/student/sessions`);
        }

        // 2. Determine Stripe account
        let stripeAccountId: string | null = null;
        let ownerName = tutor?.full_name || 'Korepetitorius';
        let useSchoolOrgAbsorbedFees = false;
        let feeProfile: OrgFeeProfile | null = null;

        if (tutor?.organization_id) {
            const { data: org } = await supabase
                .from('organizations')
                .select('stripe_account_id, stripe_onboarding_complete, name, entity_type, slug')
                .eq('id', tutor.organization_id)
                .single();
            if (!org?.stripe_onboarding_complete || !org.stripe_account_id) {
                return res.status(500).send(errorPage('Klaida', 'Organizacijos mokėjimo paskyra nėra prijungta.'));
            }
            stripeAccountId = org.stripe_account_id;
            ownerName = org.name || ownerName;
            feeProfile = orgFeeProfile((org as { slug?: string | null }).slug) ?? orgFeeProfile(tutor.organization_id);
            // A custom org fee profile is always charged on top (payer pays the fee), even for schools.
            useSchoolOrgAbsorbedFees = (org as { entity_type?: string }).entity_type === 'school' && !feeProfile;
        } else {
            if (!tutor?.stripe_onboarding_complete || !tutor?.stripe_account_id) {
                return res.status(500).send(errorPage('Klaida', 'Korepetitoriaus mokėjimo paskyra nėra prijungta.'));
            }
            stripeAccountId = tutor.stripe_account_id;
        }

        // 3. Calculate price (apply credit balance)
        const rawPriceEur = session.price ?? 25;
        const creditBalance = Number(student?.credit_balance || 0);
        const creditToApply = Math.min(creditBalance, rawPriceEur);
        const basePriceEur = rawPriceEur - creditToApply;

        if (basePriceEur <= 0 && creditToApply > 0) {
            await supabase.from('students').update({ credit_balance: Math.max(0, creditBalance - creditToApply) }).eq('id', session.student_id);
            await supabase.from('sessions').update({ paid: true, payment_status: 'paid', credit_applied_amount: creditToApply }).eq('id', sessionId);
            return res.status(200).send(errorPage('Pamoka apmokėta ✓', 'Pamoka buvo apmokėta naudojant turimą kreditą.'));
        }

        // Expected Stripe total (in cents) for the CURRENT price/credit.
        let expectedTotalCents: number;
        if (useSchoolOrgAbsorbedFees) {
            expectedTotalCents = schoolInstallmentCheckoutCents(basePriceEur, market).chargeCents;
        } else {
            const breakdown = lessonCheckoutBreakdownCents(basePriceEur, market, feeProfile);
            expectedTotalCents = breakdown.baseCents + breakdown.feesCents;
        }

        // 4. Reuse the existing Stripe session only if it is still open AND its amount matches
        //    the current price. If the lesson price changed after the checkout was created
        //    (e.g. the tutor extended a single lesson into a double one and raised the price),
        //    the stale session is expired so the payer is charged the up-to-date amount
        //    instead of the old, smaller one.
        if (session.stripe_checkout_session_id) {
            try {
                const existing = await stripe.checkout.sessions.retrieve(session.stripe_checkout_session_id);
                if (existing.status === 'open' && existing.url && existing.amount_total === expectedTotalCents) {
                    return res.redirect(303, existing.url);
                }
                if (existing.status === 'open') {
                    await stripe.checkout.sessions.expire(session.stripe_checkout_session_id).catch(() => {});
                }
            } catch {
                // expired or invalid — create new below
            }
        }

        if (creditToApply > 0) {
            await supabase.from('sessions').update({ credit_applied_amount: creditToApply }).eq('id', sessionId);
        }

        const customerEmail = student?.payer_email || undefined;
        const itemName = session.topic || 'Pamoka';
        const creditNoteStr = creditToApply > 0 ? creditNote(creditToApply, market) : '';
        const itemDesc = `Mokymo paslaugos. Paslaugos teikėjas: ${ownerName}${creditNoteStr}`;

        // 5. Create Stripe Checkout Session
        let checkoutSession: Stripe.Checkout.Session;

        if (useSchoolOrgAbsorbedFees) {
            const { chargeCents, transferToSchoolCents } = schoolInstallmentCheckoutCents(basePriceEur, market);
            const applicationFeeCents = chargeCents - transferToSchoolCents;
            checkoutSession = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: customerEmail,
                payment_method_types: ['card'],
                line_items: [{ price_data: { currency, product_data: { name: itemName, description: itemDesc }, unit_amount: chargeCents }, quantity: 1 }],
                payment_intent_data: {
                    application_fee_amount: applicationFeeCents,
                    transfer_data: { destination: stripeAccountId! },
                    metadata: { tutlio_session_id: sessionId, tutlio_school_org_absorbed: 'true' },
                },
                metadata: { tutlio_session_id: sessionId, tutlio_school_org_absorbed: 'true' },
                success_url: `${appOrigin}/stripe-success?tutlio_session=${sessionId}&checkout_session={CHECKOUT_SESSION_ID}`,
                cancel_url: `${appOrigin}/student/sessions`,
            });
        } else {
            const { baseCents, feesCents } = lessonCheckoutBreakdownCents(basePriceEur, market, feeProfile);
            checkoutSession = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: customerEmail,
                payment_method_types: ['card'],
                line_items: [
                    { price_data: { currency, product_data: { name: itemName, description: itemDesc }, unit_amount: baseCents }, quantity: 1 },
                    { price_data: { currency, product_data: { name: 'Platformos administravimo mokestis', description: 'Paslaugos teikėjas: MB „Tutlio“' }, unit_amount: feesCents }, quantity: 1 },
                ],
                payment_intent_data: {
                    transfer_data: { destination: stripeAccountId!, amount: baseCents },
                    metadata: { tutlio_session_id: sessionId },
                },
                metadata: { tutlio_session_id: sessionId, ...checkoutBaseMetadata(baseCents / 100, market) },
                success_url: `${appOrigin}/stripe-success?tutlio_session=${sessionId}&checkout_session={CHECKOUT_SESSION_ID}`,
                cancel_url: `${appOrigin}/student/sessions`,
            });
        }

        // 6. Update session with new checkout session ID
        await supabase.from('sessions').update({ stripe_checkout_session_id: checkoutSession.id }).eq('id', sessionId);

        return res.redirect(303, checkoutSession.url!);
    } catch (err: any) {
        console.error('[pay-session] Error:', err);
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
