// ─── Vercel Serverless: Stripe Checkout Session Creator ────────────────────────
// POST /api/stripe-checkout
// Body: { sessionId: string, payerEmail?: string }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { soloTutorUsesManualStudentPayments } from './_lib/soloManualStudentPayments.js';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { schoolInstallmentCheckoutCents } from './_lib/schoolInstallmentStripe.js';

// Stripe/platform fee helpers inlined (same as create-package-checkout) — ./_lib imports have caused Vercel bundle/runtime failures.
const STRIPE_FEE_PERCENT = 0.015;
const STRIPE_FEE_FIXED_EUR = 0.25;
const PLATFORM_FEE_PERCENT = 0.02;

function customerTotalEur(lessonPriceEur: number): number {
    const platformFeeEur = lessonPriceEur * PLATFORM_FEE_PERCENT;
    return (lessonPriceEur + platformFeeEur + STRIPE_FEE_FIXED_EUR) / (1 - STRIPE_FEE_PERCENT);
}

function lessonCheckoutBreakdownCents(lessonPriceEur: number): { baseCents: number; feesCents: number } {
    const totalEur = customerTotalEur(lessonPriceEur);
    const totalCents = Math.round(totalEur * 100);
    const baseCents = Math.round(lessonPriceEur * 100);
    const feesCents = totalCents - baseCents;
    return { baseCents, feesCents };
}

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await verifyRequestAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const body = (req.body || {}) as { sessionId?: string; payerEmail?: string; penaltyAmount?: number };
        const sessionId = body.sessionId;
        const payerEmail = body.payerEmail;
        const penaltyAmountOverride = body.penaltyAmount;
        if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

        const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!stripeSecretKey) {
            return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });
        }
        if (!supabaseUrl || !serviceRoleKey) {
            return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
        }

        const { default: Stripe } = await import('stripe');
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' as any });
        const supabase = createClient(supabaseUrl, serviceRoleKey);

        // 1. Fetch the session with student (including credit_balance), tutor, and org data
        const { data: session, error: sessionErr } = await supabase
            .from('sessions')
            .select(`
                id, price, topic, student_id, tutor_id, start_time,
                students!inner(id, full_name, payment_payer, payer_email, payer_name, payer_phone, credit_balance),
                profiles!sessions_tutor_id_fkey(
                    stripe_account_id, stripe_onboarding_complete,
                    payment_timing, payment_deadline_hours, organization_id,
                    full_name,
                    subscription_plan, manual_subscription_exempt, enable_manual_student_payments
                )
            `)
            .eq('id', sessionId)
            .single();

        if (sessionErr || !session) {
            return res.status(404).json({ error: 'Session not found', details: sessionErr?.message });
        }

        const tutor = session.profiles as any;
        const student = session.students as any;

        if (!tutor?.organization_id && soloTutorUsesManualStudentPayments(tutor)) {
            return res.status(400).json({
                error:
                    'This tutor uses manual student payments; Stripe checkout for lessons is not available.',
            });
        }

        // 2. Determine which Stripe account to charge (org or individual tutor).
        /** School-type orgs: payer pays lesson price exactly; fees absorbed via application_fee on Connect. */
        let useSchoolOrgAbsorbedFees = false;
        let stripeAccountId: string | null = null;
        let ownerName = tutor?.full_name || 'Korepetitorius';

        if (tutor?.organization_id) {
            const { data: org } = await supabase
                .from('organizations')
                .select('stripe_account_id, stripe_onboarding_complete, name, entity_type')
                .eq('id', tutor.organization_id)
                .single();

            if (!org?.stripe_onboarding_complete) {
                return res.status(400).json({ error: 'Organization Stripe account is not connected.' });
            }
            stripeAccountId = org.stripe_account_id;
            ownerName = org.name || ownerName;
            useSchoolOrgAbsorbedFees = (org as { entity_type?: string }).entity_type === 'school';
        } else {
            if (!tutor?.stripe_onboarding_complete) {
                return res.status(400).json({ error: 'Tutor Stripe account is not connected.' });
            }
            stripeAccountId = tutor.stripe_account_id;
        }

        if (!stripeAccountId) {
            return res.status(400).json({ error: 'Stripe paskyra nerasta.' });
        }

        // 3. Amounts: if penaltyAmount is provided, charge that instead of full price
        const isPenaltyPayment = typeof penaltyAmountOverride === 'number' && penaltyAmountOverride > 0;
        const rawPriceEur = isPenaltyPayment ? penaltyAmountOverride : (session.price ?? 25);

        // 3a. Apply student credit balance (only for regular lesson payments, not penalties)
        const creditBalance = !isPenaltyPayment ? Number(student?.credit_balance || 0) : 0;
        const creditToApply = Math.min(creditBalance, rawPriceEur);
        const basePriceEur = rawPriceEur - creditToApply;

        // If credit fully covers the lesson, mark as paid directly
        if (basePriceEur <= 0 && creditToApply > 0) {
            await supabase
                .from('students')
                .update({ credit_balance: Math.max(0, creditBalance - creditToApply) })
                .eq('id', session.student_id);
            await supabase
                .from('sessions')
                .update({
                    paid: true,
                    payment_status: 'paid',
                    credit_applied_amount: creditToApply,
                })
                .eq('id', sessionId);
            return res.status(200).json({ creditFullyCovered: true, creditApplied: creditToApply });
        }

        // Store pending credit amount on session (deducted from balance after payment confirmation)
        if (creditToApply > 0) {
            await supabase
                .from('sessions')
                .update({ credit_applied_amount: creditToApply })
                .eq('id', sessionId);
        }

        // 4. Determine customer email (payer or student)
        const customerEmail = payerEmail || student?.payer_email || undefined;

        const itemName = isPenaltyPayment
            ? 'Vėlyvo atšaukimo bauda'
            : (session.topic || 'Pamoka');
        const creditNote = creditToApply > 0 ? ` (kreditas -€${creditToApply.toFixed(2)})` : '';
        const itemDesc = isPenaltyPayment
            ? `Vėlyvo atšaukimo bauda – ${ownerName}`
            : `Pamoka – ${ownerName}${creditNote}`;

        // 5. Checkout — school org Connect: single line item + application_fee; else legacy two-line payer gross-up.
        let checkoutSession;
        if (useSchoolOrgAbsorbedFees) {
            const { chargeCents, transferToSchoolCents } = schoolInstallmentCheckoutCents(basePriceEur);
            const applicationFeeCents = chargeCents - transferToSchoolCents;
            if (chargeCents < 50 || applicationFeeCents < 1 || applicationFeeCents >= chargeCents) {
                return res.status(400).json({
                    error: 'Netinkama suma mokėjimo sesijai (per mažai arba suma sugadinta po kreditų).',
                });
            }
            checkoutSession = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: customerEmail,
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: itemName,
                                description: itemDesc,
                            },
                            unit_amount: chargeCents,
                        },
                        quantity: 1,
                    },
                ],
                payment_intent_data: {
                    application_fee_amount: applicationFeeCents,
                    transfer_data: {
                        destination: stripeAccountId as string,
                    },
                    metadata: {
                        tutlio_session_id: sessionId,
                        is_penalty_payment: isPenaltyPayment ? 'true' : 'false',
                        tutlio_school_org_absorbed: 'true',
                    },
                },
                metadata: {
                    tutlio_session_id: sessionId,
                    is_penalty_payment: isPenaltyPayment ? 'true' : 'false',
                    tutlio_school_org_absorbed: 'true',
                },
                success_url: `${APP_URL}/stripe-success?tutlio_session=${sessionId}&checkout_session={CHECKOUT_SESSION_ID}`,
                cancel_url: `${APP_URL}/student/sessions`,
            });
        } else {
            const { baseCents, feesCents } = lessonCheckoutBreakdownCents(basePriceEur);
            const transferToConnectedCents = baseCents;
            checkoutSession = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: customerEmail,
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: itemName,
                                description: itemDesc,
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
                    transfer_data: {
                        destination: stripeAccountId,
                        amount: transferToConnectedCents,
                    },
                    metadata: {
                        tutlio_session_id: sessionId,
                        is_penalty_payment: isPenaltyPayment ? 'true' : 'false',
                    },
                },
                metadata: {
                    tutlio_session_id: sessionId,
                    is_penalty_payment: isPenaltyPayment ? 'true' : 'false',
                },
                success_url: `${APP_URL}/stripe-success?tutlio_session=${sessionId}&checkout_session={CHECKOUT_SESSION_ID}`,
                cancel_url: `${APP_URL}/student/sessions`,
            });
        }

        // 6. Save the Stripe session ID on the lesson
        await supabase
            .from('sessions')
            .update({ stripe_checkout_session_id: checkoutSession.id })
            .eq('id', sessionId);

        return res.status(200).json({ url: checkoutSession.url, creditApplied: creditToApply });
    } catch (err: any) {
        console.error('stripe-checkout error:', err);
        return res.status(500).json({ error: err.message });
    }
}
