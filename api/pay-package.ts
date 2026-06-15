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
import { marketFromRequest } from './_lib/market.js';
import { chargeCurrency, lessonCheckoutBreakdownCents, checkoutBaseMetadata } from './_lib/marketMoney.js';
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

    const packageId = typeof req.query.package === 'string' ? req.query.package.trim() : '';
    if (!packageId) return res.status(400).send(errorPage('Klaida', 'Trūksta paketo identifikatoriaus.'));

    try {
        // 1. Fetch package with student + tutor (subject pulled from items below)
        const { data: pkg, error: pkgErr } = await supabase
            .from('lesson_packages')
            .select(`
                id, tutor_id, student_id, subject_id, total_lessons, price_per_lesson, total_price,
                paid, payment_status, stripe_checkout_session_id, payment_method,
                students!inner(id, full_name, email, payer_email, payer_name, payment_payer),
                profiles!lesson_packages_tutor_id_fkey(
                    stripe_account_id, stripe_onboarding_complete, organization_id, full_name,
                    subscription_plan, manual_subscription_exempt, enable_manual_student_payments
                )
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

        if (pkg.payment_method === 'manual') {
            return res.redirect(302, `${appOrigin}/student/sessions`);
        }

        // 1b. Fetch items to rebuild per-subject Stripe line items
        const { data: itemsRaw } = await supabase
            .from('lesson_package_items')
            .select('id, subject_id, total_lessons, price_per_lesson, position, subjects!inner(name)')
            .eq('package_id', packageId)
            .order('position', { ascending: true });

        type ItemForCheckout = { subjectName: string; totalLessons: number; pricePerLesson: number };
        const items: ItemForCheckout[] = (itemsRaw || []).map((row: any) => ({
            subjectName: (row.subjects?.name as string) || 'Pamoka',
            totalLessons: Number(row.total_lessons) || 0,
            pricePerLesson: Number(row.price_per_lesson) || 0,
        }));
        if (items.length === 0) {
            return res.status(500).send(errorPage('Klaida', 'Paketas neturi pamokų sąrašo.'));
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
        const basePriceEur = Number(pkg.total_price);
        const customerEmail = student?.payer_email || student?.email || undefined;

        // 5. Build per-subject Stripe line items
        const itemLineItems = items.map((it) => ({
            price_data: {
                currency: currency as const,
                product_data: {
                    name: `${it.totalLessons} × ${it.subjectName}`,
                    description: `Mokymo paslaugos. Paslaugos teikėjas: ${ownerName}`,
                },
                unit_amount: Math.round(it.pricePerLesson * 100),
            },
            quantity: it.totalLessons,
        }));

        const metadataBase = {
            tutlio_package_id: packageId,
            tutor_id: pkg.tutor_id,
            student_id: pkg.student_id,
            ...(pkg.subject_id ? { subject_id: pkg.subject_id } : {}),
        };

        let checkoutSession: Stripe.Checkout.Session;

        if (useSchoolOrgAbsorbedFees) {
            const { chargeCents, transferToSchoolCents } = schoolInstallmentCheckoutCents(basePriceEur, market);
            const applicationFeeCents = chargeCents - transferToSchoolCents;
            checkoutSession = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: customerEmail,
                payment_method_types: ['card'],
                line_items: itemLineItems,
                payment_intent_data: {
                    application_fee_amount: applicationFeeCents,
                    transfer_data: { destination: stripeAccountId! },
                    metadata: { ...metadataBase, tutlio_school_org_absorbed: 'true' },
                },
                metadata: { ...metadataBase, tutlio_school_org_absorbed: 'true' },
                success_url: `${appOrigin}/package-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${appOrigin}/package-cancelled`,
            });
        } else {
            const { baseCents, feesCents } = lessonCheckoutBreakdownCents(basePriceEur, market);
            checkoutSession = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: customerEmail,
                payment_method_types: ['card'],
                line_items: [
                    ...itemLineItems,
                    { price_data: { currency, product_data: { name: 'Platformos administravimo mokestis', description: 'Paslaugos teikėjas: MB „Tutlio“' }, unit_amount: feesCents }, quantity: 1 },
                ],
                payment_intent_data: {
                    transfer_data: { destination: stripeAccountId!, amount: baseCents },
                    metadata: metadataBase,
                },
                metadata: { ...metadataBase, ...checkoutBaseMetadata(basePriceEur, market) },
                success_url: `${appOrigin}/package-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${appOrigin}/package-cancelled`,
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
