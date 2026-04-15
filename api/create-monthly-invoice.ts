// ─── Vercel Serverless: Create Monthly Invoice/Billing Batch ──────────────────
// POST /api/create-monthly-invoice
// Body: { tutorId, periodStartDate, periodEndDate, paymentDeadlineDays, sessionIds }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';

// Stripe/platform fee helpers (inlined to avoid _lib import issues on Vercel)
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
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await verifyRequestAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const { tutorId, periodStartDate, periodEndDate, paymentDeadlineDays, sessionIds } = req.body as {
        tutorId: string;
        periodStartDate: string; // YYYY-MM-DD
        periodEndDate: string;   // YYYY-MM-DD
        paymentDeadlineDays: number;
        sessionIds: string[];
    };

    if (!tutorId || !periodStartDate || !periodEndDate || !paymentDeadlineDays || !sessionIds?.length) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate date range (max 45 days)
    const startDate = new Date(periodStartDate);
    const endDate = new Date(periodEndDate);
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff > 45) {
        return res.status(400).json({ error: 'Period cannot exceed 45 days' });
    }

    if (daysDiff < 0) {
        return res.status(400).json({ error: 'End date must be later than start date' });
    }

    if (paymentDeadlineDays <= 0 || paymentDeadlineDays > 90) {
        return res.status(400).json({ error: 'Payment deadline must be between 1 and 90 days' });
    }

    try {
        // 1. Fetch tutor data
        const { data: tutor, error: tutorErr } = await supabase
            .from('profiles')
            .select('id, full_name, stripe_account_id, stripe_onboarding_complete, organization_id')
            .eq('id', tutorId)
            .single();

        if (tutorErr || !tutor) {
            return res.status(404).json({ error: 'Korepetitorius nerastas', details: tutorErr?.message });
        }

        // 2. Fetch sessions
        const { data: sessions, error: sessionsErr } = await supabase
            .from('sessions')
            .select(`
                id, price, start_time, tutor_id, student_id, subject_id,
                students!inner(id, full_name, email, payment_payer, payer_email, payer_name),
                subjects(name)
            `)
            .in('id', sessionIds)
            .eq('tutor_id', tutorId)
            .neq('status', 'cancelled')
            .eq('paid', false)
            .is('payment_batch_id', null)
            .is('lesson_package_id', null)
            .lte('start_time', new Date().toISOString());

        if (sessionsErr || !sessions || sessions.length === 0) {
            return res.status(400).json({ error: 'No eligible unpaid sessions found', details: sessionsErr?.message });
        }

        // 3. Group sessions by payer email (one invoice per payer)
        const sessionsByPayer = new Map<string, any[]>();

        for (const session of sessions) {
            const student = session.students as any;
            const payerEmail = student.payer_email || student.email;

            if (!payerEmail) {
                console.warn(`[create-monthly-invoice] Skipping session ${session.id} - no payer email`);
                continue;
            }

            if (!sessionsByPayer.has(payerEmail)) {
                sessionsByPayer.set(payerEmail, []);
            }
            sessionsByPayer.get(payerEmail)!.push(session);
        }

        if (sessionsByPayer.size === 0) {
            return res.status(400).json({ error: 'No sessions found with payer email' });
        }

        // 4. Determine Stripe account (org or tutor)
        let stripeAccountId: string | null = null;
        let ownerName = tutor.full_name || 'Korepetitorius';

        if (tutor.organization_id) {
            const { data: org } = await supabase
                .from('organizations')
                .select('stripe_account_id, stripe_onboarding_complete, name')
                .eq('id', tutor.organization_id)
                .single();

            if (!org?.stripe_onboarding_complete) {
                return res.status(400).json({ error: 'Organization Stripe account is not connected' });
            }
            stripeAccountId = org.stripe_account_id;
            ownerName = org.name || ownerName;
        } else {
            if (!tutor.stripe_onboarding_complete) {
                return res.status(400).json({ error: 'Tutor Stripe account is not connected' });
            }
            stripeAccountId = tutor.stripe_account_id;
        }

        if (!stripeAccountId) {
            return res.status(400).json({ error: 'Stripe paskyra nerasta' });
        }

        // 5. Create billing batch and checkout for EACH payer
        const results = [];

        for (const [payerEmail, payerSessions] of sessionsByPayer.entries()) {
            const firstSession = payerSessions[0];
            const student = firstSession.students as any;
            const payerName = student.payer_name || student.full_name;

            // Calculate total (per lesson – same fee logic as stripe-checkout)
            const totalLessonPrice = payerSessions.reduce((sum, s) => sum + (s.price || 0), 0);
            const lessonCount = payerSessions.length;
            let baseCents = 0;
            let feesCents = 0;
            for (const s of payerSessions) {
                const b = lessonCheckoutBreakdownCents(Number(s.price) || 0);
                baseCents += b.baseCents;
                feesCents += b.feesCents;
            }
            const totalCents = baseCents + feesCents;
            const totalWithFeesEur = totalCents / 100;
            const transferToConnectedCents = baseCents;

            // Calculate payment deadline
            const paymentDeadlineDate = new Date();
            paymentDeadlineDate.setDate(paymentDeadlineDate.getDate() + paymentDeadlineDays);

            // Create billing batch
            const { data: billingBatch, error: batchErr } = await supabase
                .from('billing_batches')
                .insert({
                    tutor_id: tutorId,
                    period_start_date: periodStartDate,
                    period_end_date: periodEndDate,
                    payment_deadline_days: paymentDeadlineDays,
                    payment_deadline_date: paymentDeadlineDate.toISOString(),
                    total_amount: totalLessonPrice,
                    paid: false,
                    payment_status: 'pending',
                    payer_email: payerEmail,
                    payer_name: payerName,
                    sent_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (batchErr || !billingBatch) {
                console.error('[create-monthly-invoice] Error creating batch:', batchErr);
                continue;
            }

            // Link sessions to batch
            const batchSessionInserts = payerSessions.map(s => ({
                billing_batch_id: billingBatch.id,
                session_id: s.id,
                session_date: s.start_time,
                session_price: s.price || 0,
            }));

            const { error: junctionErr } = await supabase
                .from('billing_batch_sessions')
                .insert(batchSessionInserts);
            if (junctionErr) {
                console.error(`[create-monthly-invoice] billing_batch_sessions insert failed for batch ${billingBatch.id}:`, junctionErr);
                await supabase.from('billing_batches').delete().eq('id', billingBatch.id);
                continue;
            }

            // Update sessions with batch reference
            const sessionIdsForBatch = payerSessions.map(s => s.id);
            await supabase
                .from('sessions')
                .update({ payment_batch_id: billingBatch.id })
                .in('id', sessionIdsForBatch);

            // Create Stripe Checkout
            const periodText = `${startDate.toLocaleDateString('lt-LT')} - ${endDate.toLocaleDateString('lt-LT')}`;

            let checkoutSession: Stripe.Checkout.Session;
            try {
                checkoutSession = await stripe.checkout.sessions.create({
                    mode: 'payment',
                    customer_email: payerEmail,
                    payment_method_types: ['card'],
                    line_items: [
                        {
                            price_data: {
                                currency: 'eur',
                                product_data: {
                                    name: `Pamokos (${lessonCount}) – ${periodText}`,
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
                        transfer_data: {
                            destination: stripeAccountId,
                            amount: transferToConnectedCents,
                        },
                        metadata: {
                            tutlio_billing_batch_id: billingBatch.id,
                            tutor_id: tutorId,
                        },
                    },
                    metadata: {
                        tutlio_billing_batch_id: billingBatch.id,
                        tutor_id: tutorId,
                    },
                    success_url: `${APP_URL}/student/sessions?invoice_paid=true&billing_batch_id=${billingBatch.id}&session_id={CHECKOUT_SESSION_ID}`,
                    cancel_url: `${APP_URL}/student/sessions`,
                });
            } catch (stripeErr: any) {
                console.error(`[create-monthly-invoice] Stripe checkout failed for ${payerEmail}, rolling back batch ${billingBatch.id}:`, stripeErr);
                await supabase.from('sessions').update({ payment_batch_id: null }).in('id', sessionIdsForBatch);
                await supabase.from('billing_batch_sessions').delete().eq('billing_batch_id', billingBatch.id);
                await supabase.from('billing_batches').delete().eq('id', billingBatch.id);
                continue;
            }

            // Save Stripe checkout session ID
            await supabase
                .from('billing_batches')
                .update({ stripe_checkout_session_id: checkoutSession.id })
                .eq('id', billingBatch.id);

            // Prepare session details for email
            const sessionsForEmail = payerSessions.map(s => {
                const sessionDate = new Date(s.start_time);
                const subject = s.subjects as any;
                return {
                    date: sessionDate.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' }),
                    time: sessionDate.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }),
                    subject: subject?.name || '–',
                    price: (s.price || 0).toFixed(2),
                };
            });

            // Send invoice email (non-blocking)
            if (checkoutSession.url) {
                try {
                    await fetch(`${APP_URL}/api/send-email`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
                        body: JSON.stringify({
                            type: 'monthly_invoice',
                            to: payerEmail,
                            data: {
                                recipientName: payerName,
                                studentName: student.full_name,
                                tutorName: ownerName,
                                periodText,
                                sessions: sessionsForEmail,
                                totalAmount: totalWithFeesEur.toFixed(2),
                                paymentDeadline: paymentDeadlineDate.toLocaleDateString('lt-LT', {
                                    year: 'numeric',
                                    month: '2-digit',
                                    day: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                }),
                                paymentLink: checkoutSession.url,
                            },
                        }),
                    });
                } catch (e) {
                    console.error('[create-monthly-invoice] Error sending email:', e);
                }
            }

            results.push({
                batchId: billingBatch.id,
                payerEmail,
                sessionsCount: lessonCount,
                totalAmount: totalLessonPrice,
                checkoutUrl: checkoutSession.url,
            });

            console.log(`[create-monthly-invoice] Created batch ${billingBatch.id} for ${payerEmail} with ${lessonCount} sessions`);

            // Auto-generate S.F. if invoice profile exists
            try {
                await autoGenerateSF(tutorId, billingBatch.id, periodStartDate, periodEndDate, payerSessions, payerName, payerEmail, tutor);
            } catch (sfErr) {
                console.error('[create-monthly-invoice] S.F. auto-generation failed (non-blocking):', sfErr);
            }
        }

        return res.status(200).json({
            success: true,
            batches: results,
            totalBatches: results.length,
        });
    } catch (err: any) {
        console.error('create-monthly-invoice error:', err);
        return res.status(500).json({ error: err.message });
    }
}

async function autoGenerateSF(
    tutorId: string,
    billingBatchId: string,
    periodStart: string,
    periodEnd: string,
    sessions: any[],
    payerName: string,
    payerEmail: string,
    tutor: any
) {
    let invoiceProfile: any = null;
    if (tutor.organization_id) {
        const { data: orgProf } = await supabase
            .from('invoice_profiles')
            .select('*')
            .eq('organization_id', tutor.organization_id)
            .maybeSingle();
        invoiceProfile = orgProf;
    }
    if (!invoiceProfile) {
        const { data: userProf } = await supabase.from('invoice_profiles').select('*').eq('user_id', tutorId).maybeSingle();
        invoiceProfile = userProf;
    }

    if (!invoiceProfile) return;

    const isCompany = ['mb', 'uab', 'ii'].includes(invoiceProfile.entity_type);
    const sellerName = isCompany ? invoiceProfile.business_name : tutor.full_name;

    const sellerSnapshot = {
        name: sellerName || 'Korepetitorius',
        entityType: invoiceProfile.entity_type,
        companyCode: invoiceProfile.company_code || undefined,
        vatCode: invoiceProfile.vat_code || undefined,
        address: invoiceProfile.address || undefined,
        activityNumber: invoiceProfile.activity_number || undefined,
        personalCode: invoiceProfile.personal_code || undefined,
        contactEmail: invoiceProfile.contact_email || undefined,
        contactPhone: invoiceProfile.contact_phone || undefined,
    };

    const buyerSnapshot = {
        name: payerName || 'Mokinys',
        email: payerEmail || undefined,
    };

    const totalAmount = sessions.reduce((sum, s) => sum + (s.price || 0), 0);
    const series = invoiceProfile.invoice_series || 'SF';
    const num = invoiceProfile.next_invoice_number || 1;
    const invoiceNumber = `${series}-${String(num).padStart(3, '0')}`;

    await supabase
        .from('invoice_profiles')
        .update({ next_invoice_number: num + 1, updated_at: new Date().toISOString() })
        .eq('id', invoiceProfile.id);

    const { data: invoice } = await supabase
        .from('invoices')
        .insert({
            invoice_number: invoiceNumber,
            issued_by_user_id: tutorId,
            organization_id: tutor.organization_id ?? null,
            seller_snapshot: sellerSnapshot,
            buyer_snapshot: buyerSnapshot,
            issue_date: new Date().toISOString().slice(0, 10),
            period_start: periodStart,
            period_end: periodEnd,
            grouping_type: 'single',
            subtotal: totalAmount,
            total_amount: totalAmount,
            status: 'issued',
            billing_batch_id: billingBatchId,
        })
        .select('id')
        .single();

    if (!invoice) return;

    const subjectMap = new Map<string, { name: string; sessions: any[] }>();
    for (const s of sessions) {
        const subjectName = (s.subjects as any)?.name || 'Pamoka';
        if (!subjectMap.has(subjectName)) subjectMap.set(subjectName, { name: subjectName, sessions: [] });
        subjectMap.get(subjectName)!.sessions.push(s);
    }

    const lineItems = Array.from(subjectMap.values()).map(group => {
        const total = group.sessions.reduce((sum, s) => sum + (s.price || 0), 0);
        const avg = group.sessions.length > 0 ? total / group.sessions.length : 0;
        return {
            invoice_id: invoice.id,
            description: `${group.name} - korepetavimo paslaugos`,
            quantity: group.sessions.length,
            unit_price: Math.round(avg * 100) / 100,
            total_price: Math.round(total * 100) / 100,
            session_ids: group.sessions.map((s: any) => s.id),
        };
    });

    await supabase.from('invoice_line_items').insert(lineItems);

    console.log(`[create-monthly-invoice] Auto-generated S.F. ${invoiceNumber} for batch ${billingBatchId}`);
}
