// ─── Vercel Serverless: Pay Package (on-demand Stripe Checkout) ─────────────
// GET /api/pay-package?package=PACKAGE_ID
//
// Public endpoint (no auth). When a payer clicks the payment link in their
// email, this creates a fresh Stripe Checkout Session and redirects the
// browser to it. Replaces embedding Stripe URLs directly in emails.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { tutorUsesManualStudentPayments } from './_lib/soloManualStudentPayments.js';
import { schoolInstallmentCheckoutCents } from './_lib/schoolInstallmentStripe.js';

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

    const packageId = typeof req.query.package === 'string' ? req.query.package.trim() : '';
    if (!packageId) return res.status(400).send(errorPage('Klaida', 'Trūksta paketo identifikatoriaus.'));

    try {
        // 1. Fetch package with student + tutor + subject
        const { data: pkg, error: pkgErr } = await supabase
            .from('lesson_packages')
            .select(`
                id, tutor_id, student_id, subject_id, total_lessons, price_per_lesson, total_price,
                paid, payment_status, stripe_checkout_session_id, payment_method,
                students!inner(id, full_name, email, payer_email, payer_name, payment_payer),
                profiles!lesson_packages_tutor_id_fkey(
                    stripe_account_id, stripe_onboarding_complete, organization_id, full_name,
                    subscription_plan, manual_subscription_exempt, enable_manual_student_payments
                ),
                subjects!inner(name)
            `)
            .eq('id', packageId)
            .single();

        if (pkgErr || !pkg) {
            return res.status(404).send(errorPage('Paketas nerastas', 'Patikrinkite nuorodą arba kreipkitės į korepetitorių.'));
        }

        if (pkg.paid || pkg.payment_status === 'paid') {
            return res.status(200).send(errorPage('Paketas jau apmokėtas ✓', 'Šis paketas jau buvo apmokėtas. Jokių papildomų veiksmų nereikia.'));
        }

        const tutor = pkg.profiles as any;
        const student = pkg.students as any;
        const subject = pkg.subjects as any;

        if (pkg.payment_method === 'manual') {
            return res.redirect(302, `${APP_URL}/student/sessions`);
        }

        // 2. Determine Stripe account
        let stripeAccountId: string | null = null;
        let ownerName = tutor?.full_name || 'Korepetitorius';
        let useSchoolOrgAbsorbedFees = false;

        if (tutor?.organization_id) {
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
            if (!tutor?.stripe_onboarding_complete || !tutor?.stripe_account_id) {
                return res.status(500).send(errorPage('Klaida', 'Korepetitoriaus mokėjimo paskyra nėra prijungta.'));
            }
            stripeAccountId = tutor.stripe_account_id;
        }

        // 3. Try to reuse existing Stripe session if still open
        if (pkg.stripe_checkout_session_id) {
            try {
                const existing = await stripe.checkout.sessions.retrieve(pkg.stripe_checkout_session_id);
                if (existing.status === 'open' && existing.url) {
                    return res.redirect(303, existing.url);
                }
            } catch {
                // expired or invalid — create new below
            }
        }

        // 4. Calculate amounts
        const totalLessons = pkg.total_lessons;
        const basePriceEur = Number(pkg.total_price);
        const customerEmail = student?.payer_email || student?.email || undefined;

        // 5. Create Stripe Checkout Session
        let checkoutSession: Stripe.Checkout.Session;

        if (useSchoolOrgAbsorbedFees) {
            const { chargeCents, transferToSchoolCents } = schoolInstallmentCheckoutCents(basePriceEur);
            const applicationFeeCents = chargeCents - transferToSchoolCents;
            checkoutSession = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: customerEmail,
                payment_method_types: ['card'],
                line_items: [{ price_data: { currency: 'eur', product_data: { name: `${totalLessons} lessons – ${subject.name}`, description: `Package – ${ownerName}` }, unit_amount: chargeCents }, quantity: 1 }],
                payment_intent_data: {
                    application_fee_amount: applicationFeeCents,
                    transfer_data: { destination: stripeAccountId! },
                    metadata: { tutlio_package_id: packageId, tutor_id: pkg.tutor_id, student_id: pkg.student_id, subject_id: pkg.subject_id, tutlio_school_org_absorbed: 'true' },
                },
                metadata: { tutlio_package_id: packageId, tutor_id: pkg.tutor_id, student_id: pkg.student_id, subject_id: pkg.subject_id, tutlio_school_org_absorbed: 'true' },
                success_url: `${APP_URL}/package-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${APP_URL}/package-cancelled`,
            });
        } else {
            const { baseCents, feesCents } = lessonCheckoutBreakdownCents(basePriceEur);
            checkoutSession = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: customerEmail,
                payment_method_types: ['card'],
                line_items: [
                    { price_data: { currency: 'eur', product_data: { name: `${totalLessons} lessons – ${subject.name}`, description: `Package – ${ownerName}` }, unit_amount: baseCents }, quantity: 1 },
                    { price_data: { currency: 'eur', product_data: { name: 'Platformos administravimo mokestis', description: 'Tutlio platform fee and payment processing' }, unit_amount: feesCents }, quantity: 1 },
                ],
                payment_intent_data: {
                    transfer_data: { destination: stripeAccountId!, amount: baseCents },
                    metadata: { tutlio_package_id: packageId, tutor_id: pkg.tutor_id, student_id: pkg.student_id, subject_id: pkg.subject_id },
                },
                metadata: { tutlio_package_id: packageId, tutor_id: pkg.tutor_id, student_id: pkg.student_id, subject_id: pkg.subject_id },
                success_url: `${APP_URL}/package-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${APP_URL}/package-cancelled`,
            });
        }

        // 6. Update package with new checkout session ID
        await supabase.from('lesson_packages').update({ stripe_checkout_session_id: checkoutSession.id }).eq('id', packageId);

        return res.redirect(303, checkoutSession.url!);
    } catch (err: any) {
        console.error('[pay-package] Error:', err);
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
