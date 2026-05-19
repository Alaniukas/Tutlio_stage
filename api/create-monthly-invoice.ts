// ─── Vercel Serverless: Create Monthly Invoice/Billing Batch ──────────────────
// POST /api/create-monthly-invoice
// Body: { tutorId, periodStartDate, periodEndDate, paymentDeadlineDays, sessionIds }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { schoolInstallmentCheckoutCents } from './_lib/schoolInstallmentStripe.js';
import {
    tutorUsesManualStudentPayments,
    trimManualPaymentBankDetails,
} from './_lib/soloManualStudentPayments.js';

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

function getEnv(name: string): string | null {
    const v = process.env[name];
    return v && String(v).trim().length > 0 ? String(v) : null;
}

function resolveApiUrl(req: VercelRequest, path: string): string {
    const vu = process.env.VERCEL_URL;
    if (vu && String(vu).trim()) {
        const host = String(vu).replace(/^https?:\/\//, '').replace(/\/$/, '');
        return `https://${host}${path}`;
    }
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
    if (origin) return `${origin.replace(/\/$/, '')}${path}`;
    const base = (getEnv('APP_URL') || getEnv('VITE_APP_URL') || 'http://127.0.0.1:3002').replace(/\/$/, '');
    return `${base}${path}`;
}

async function loadInvoicePdfAttachment(
    invoiceId: string
): Promise<{ invoiceNumber: string; pdfBase64: string } | null> {
    const { data: inv } = await supabase
        .from('invoices')
        .select('invoice_number, pdf_storage_path')
        .eq('id', invoiceId)
        .maybeSingle();
    if (!inv?.pdf_storage_path) return null;

    const { data: blob } = await supabase.storage.from('invoices').download(inv.pdf_storage_path);
    if (!blob) return null;

    const arrayBuf = await blob.arrayBuffer();
    return {
        invoiceNumber: inv.invoice_number,
        pdfBase64: Buffer.from(arrayBuf).toString('base64'),
    };
}

async function generateMonthlySalesInvoicePdf(
    req: VercelRequest,
    opts: {
        tutorId: string;
        billingBatchId: string;
        periodStartDate: string;
        periodEndDate: string;
        sessionIds: string[];
    }
): Promise<{ invoiceNumber: string; pdfBase64: string } | null> {
    try {
        const invRes = await postInternalJson(
            resolveApiUrl(req, '/api/generate-invoice'),
            {
                periodStart: opts.periodStartDate,
                periodEnd: opts.periodEndDate,
                groupingType: 'single',
                tutorId: opts.tutorId,
                sessionIds: opts.sessionIds,
                issuedByUserId: opts.tutorId,
                billingBatchId: opts.billingBatchId,
            },
            20000
        );

        if (!invRes.ok) {
            const errText = await invRes.text().catch(() => '');
            console.error('[create-monthly-invoice] generate-invoice HTTP', invRes.status, errText);
            return null;
        }

        const invData = (await invRes.json().catch(() => null)) as { invoiceIds?: string[] } | null;
        const invoiceId = invData?.invoiceIds?.[0];
        if (!invoiceId) {
            console.error('[create-monthly-invoice] generate-invoice returned no invoice id');
            return null;
        }

        return await loadInvoicePdfAttachment(invoiceId);
    } catch (err) {
        console.error('[create-monthly-invoice] generate-invoice error:', err);
        return null;
    }
}

async function postInternalJson(url: string, payload: unknown, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await verifyRequestAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const { tutorId, periodStartDate, periodEndDate, paymentDeadlineDays, sessionIds, includeSalesInvoice } = req.body as {
        tutorId: string;
        periodStartDate: string; // YYYY-MM-DD
        periodEndDate: string;   // YYYY-MM-DD
        paymentDeadlineDays: number;
        sessionIds: string[];
        /** Default true: issue S.F. and attach PDF to payer email when invoice profile exists */
        includeSalesInvoice?: boolean;
    };
    const shouldIncludeSalesInvoice = includeSalesInvoice !== false;

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
            .select(
                'id, full_name, stripe_account_id, stripe_onboarding_complete, organization_id, subscription_plan, manual_subscription_exempt, enable_manual_student_payments, manual_payment_bank_details',
            )
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

        // 4. Determine Stripe account or manual payment mode
        let stripeAccountId: string | null = null;
        let ownerName = tutor.full_name || 'Korepetitorius';
        let useSchoolOrgAbsorbedFees = false;
        const usesManualStudentPayments = tutorUsesManualStudentPayments(tutor);
        let tutorManualBankDetails = '';

        if (usesManualStudentPayments) {
            tutorManualBankDetails = trimManualPaymentBankDetails(tutor.manual_payment_bank_details);
            if (tutor.organization_id) {
                const { data: org } = await supabase
                    .from('organizations')
                    .select('name')
                    .eq('id', tutor.organization_id)
                    .single();
                if (org?.name) ownerName = org.name;
            }
        } else if (tutor.organization_id) {
            const { data: org } = await supabase
                .from('organizations')
                .select('stripe_account_id, stripe_onboarding_complete, name, entity_type')
                .eq('id', tutor.organization_id)
                .single();

            if (!org?.stripe_onboarding_complete) {
                return res.status(400).json({ error: 'Organization Stripe account is not connected' });
            }
            stripeAccountId = org.stripe_account_id;
            ownerName = org.name || ownerName;
            useSchoolOrgAbsorbedFees = (org as { entity_type?: string }).entity_type === 'school';
        } else {
            if (!(tutor as { stripe_onboarding_complete?: boolean }).stripe_onboarding_complete) {
                return res.status(400).json({ error: 'Tutor Stripe account is not connected' });
            }
            stripeAccountId = (tutor as { stripe_account_id?: string }).stripe_account_id || null;
        }

        if (!stripeAccountId && !usesManualStudentPayments) {
            return res.status(400).json({ error: 'Stripe paskyra nerasta' });
        }

        // 5. Create billing batch and checkout for EACH payer
        const results = [];

        for (const [payerEmail, payerSessions] of sessionsByPayer.entries()) {
            const firstSession = payerSessions[0];
            const student = firstSession.students as any;
            const payerName = student.payer_name || student.full_name;

            const totalLessonPrice = payerSessions.reduce((sum, s) => sum + (s.price || 0), 0);
            const lessonCount = payerSessions.length;

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

            // Stripe Checkout (skipped for solo tutors in manual pupil-payment mode)
            const periodText = `${startDate.toLocaleDateString('lt-LT')} - ${endDate.toLocaleDateString('lt-LT')}`;

            let checkoutSession: Stripe.Checkout.Session | undefined;
            let payerCheckoutTotalEur = totalLessonPrice;
            try {
                if (usesManualStudentPayments) {
                    checkoutSession = undefined;
                    payerCheckoutTotalEur = totalLessonPrice;
                } else if (useSchoolOrgAbsorbedFees) {
                    const { chargeCents, transferToSchoolCents } =
                        schoolInstallmentCheckoutCents(totalLessonPrice);
                    const applicationFeeCents = chargeCents - transferToSchoolCents;
                    if (chargeCents < 50 || applicationFeeCents < 1 || applicationFeeCents >= chargeCents) {
                        throw new Error('Netinkamas mėnesinės sąskaitos sumų skaidymas');
                    }
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
                                tutlio_billing_batch_id: billingBatch.id,
                                tutor_id: tutorId,
                                tutlio_school_org_absorbed: 'true',
                            },
                        },
                        metadata: {
                            tutlio_billing_batch_id: billingBatch.id,
                            tutor_id: tutorId,
                            tutlio_school_org_absorbed: 'true',
                        },
                        success_url: `${APP_URL}/student/sessions?invoice_paid=true&billing_batch_id=${billingBatch.id}&session_id={CHECKOUT_SESSION_ID}`,
                        cancel_url: `${APP_URL}/student/sessions`,
                    });
                    payerCheckoutTotalEur = totalLessonPrice;
                } else if (stripeAccountId) {
                    let baseCents = 0;
                    let feesCents = 0;
                    for (const s of payerSessions) {
                        const b = lessonCheckoutBreakdownCents(Number(s.price) || 0);
                        baseCents += b.baseCents;
                        feesCents += b.feesCents;
                    }
                    const transferToConnectedCents = baseCents;
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
                    payerCheckoutTotalEur = (baseCents + feesCents) / 100;
                } else {
                    throw new Error('[create-monthly-invoice] Missing Stripe account for checkout');
                }
            } catch (stripeErr: any) {
                console.error(`[create-monthly-invoice] Stripe checkout failed for ${payerEmail}, rolling back batch ${billingBatch.id}:`, stripeErr);
                await supabase.from('sessions').update({ payment_batch_id: null }).in('id', sessionIdsForBatch);
                await supabase.from('billing_batch_sessions').delete().eq('billing_batch_id', billingBatch.id);
                await supabase.from('billing_batches').delete().eq('id', billingBatch.id);
                continue;
            }

            if (checkoutSession?.id) {
                await supabase
                    .from('billing_batches')
                    .update({ stripe_checkout_session_id: checkoutSession.id })
                    .eq('id', billingBatch.id);
            }

            // Generate S.F. PDF via shared generate-invoice (same path as lesson packages).
            let sfPdfBase64: string | null = null;
            let sfInvoiceNumber: string | null = null;
            if (shouldIncludeSalesInvoice) {
                console.log(`[create-monthly-invoice] Generating S.F. for batch ${billingBatch.id}, tutor ${tutorId}`);
                const sfResult = await generateMonthlySalesInvoicePdf(req, {
                    tutorId,
                    billingBatchId: billingBatch.id,
                    periodStartDate,
                    periodEndDate,
                    sessionIds: sessionIdsForBatch,
                });
                if (sfResult) {
                    sfPdfBase64 = sfResult.pdfBase64;
                    sfInvoiceNumber = sfResult.invoiceNumber;
                    console.log(`[create-monthly-invoice] S.F. generated: ${sfInvoiceNumber}, pdfBase64 length: ${sfPdfBase64.length}`);
                } else {
                    console.log('[create-monthly-invoice] generate-invoice returned no PDF for batch', billingBatch.id);
                }
            }

            // Safety net: ensure an invoices row exists for this batch so it appears on /invoices.
            {
                const { data: existingInv } = await supabase
                    .from('invoices')
                    .select('id, invoice_number, pdf_storage_path')
                    .eq('billing_batch_id', billingBatch.id)
                    .maybeSingle();
                if (!existingInv) {
                    const fbInvoiceNumber = `BB-${billingBatch.id.slice(0, 8).toUpperCase()}`;
                    const { data: fbInvoice } = await supabase.from('invoices').insert({
                        invoice_number: fbInvoiceNumber,
                        issued_by_user_id: tutorId,
                        organization_id: (tutor as any).organization_id ?? null,
                        seller_snapshot: { name: ownerName || 'Korepetitorius' },
                        buyer_snapshot: { name: payerName || 'Mokinys', email: payerEmail || undefined },
                        issue_date: new Date().toISOString().slice(0, 10),
                        period_start: periodStartDate,
                        period_end: periodEndDate,
                        grouping_type: 'single',
                        subtotal: totalLessonPrice,
                        total_amount: totalLessonPrice,
                        status: 'issued',
                        billing_batch_id: billingBatch.id,
                    }).select('id').single();

                    if (fbInvoice) {
                        const fbLineItems = payerSessions
                            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                            .map(s => {
                                const subjectName = (s.subjects as any)?.name || 'Pamoka';
                                const dt = new Date(s.start_time);
                                const datePart = dt.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' });
                                const timePart = dt.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
                                const studentFullName = (s.students as any)?.full_name || '';
                                const desc = studentFullName
                                    ? `${subjectName} — ${studentFullName} (${datePart} ${timePart})`
                                    : `${subjectName} (${datePart} ${timePart})`;
                                return {
                                    invoice_id: fbInvoice.id,
                                    description: desc,
                                    quantity: 1,
                                    unit_price: Math.round((s.price || 0) * 100) / 100,
                                    total_price: Math.round((s.price || 0) * 100) / 100,
                                    session_ids: [s.id],
                                };
                            });
                        if (fbLineItems.length > 0) {
                            await supabase.from('invoice_line_items').insert(fbLineItems);
                        }
                    }
                } else if (shouldIncludeSalesInvoice && existingInv.pdf_storage_path && !sfPdfBase64) {
                    const attached = await loadInvoicePdfAttachment(existingInv.id);
                    if (attached) {
                        sfPdfBase64 = attached.pdfBase64;
                        sfInvoiceNumber = attached.invoiceNumber;
                    }
                }
            }

            // Prepare session details for email (sorted oldest → newest)
            const sessionsForEmail = [...payerSessions]
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                .map(s => {
                    const sessionDate = new Date(s.start_time);
                    const subject = s.subjects as any;
                    return {
                        date: sessionDate.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' }),
                        time: sessionDate.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }),
                        subject: subject?.name || '–',
                        price: (s.price || 0).toFixed(2),
                    };
                });

            const platformFeesEur = payerCheckoutTotalEur - totalLessonPrice;

            // Send invoice email with optional S.F. PDF attachment.
            // Use /api/pay-invoice redirect URL so the link never expires
            // (a fresh Stripe Checkout Session is created when the payer clicks).
            const stablePaymentLink = `${APP_URL}/api/pay-invoice?batch=${billingBatch.id}`;
            const monthlyEmailOk = usesManualStudentPayments ? true : Boolean(checkoutSession?.url || checkoutSession?.id);
            if (monthlyEmailOk) {
                try {
                    const invoiceOrgId = (tutor as any).organization_id || null;
                    const deadlineStr = paymentDeadlineDate.toLocaleDateString('lt-LT', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    });
                    const emailData = usesManualStudentPayments
                        ? {
                              recipientName: payerName,
                              studentName: student.full_name,
                              tutorName: ownerName,
                              periodText,
                              sessions: sessionsForEmail,
                              lessonsTotal: totalLessonPrice.toFixed(2),
                              platformFees: platformFeesEur > 0 ? platformFeesEur.toFixed(2) : undefined,
                              totalAmount: payerCheckoutTotalEur.toFixed(2),
                              paymentDeadline: deadlineStr,
                              manualPaymentInstructions: true,
                              bankDetails: tutorManualBankDetails || undefined,
                              paymentLink: `${APP_URL}/student/sessions`,
                              ...(invoiceOrgId ? { organizationId: invoiceOrgId } : {}),
                          }
                        : {
                              recipientName: payerName,
                              studentName: student.full_name,
                              tutorName: ownerName,
                              periodText,
                              sessions: sessionsForEmail,
                              lessonsTotal: totalLessonPrice.toFixed(2),
                              platformFees: platformFeesEur > 0 ? platformFeesEur.toFixed(2) : undefined,
                              totalAmount: payerCheckoutTotalEur.toFixed(2),
                              paymentDeadline: deadlineStr,
                              paymentLink: stablePaymentLink,
                              ...(invoiceOrgId ? { organizationId: invoiceOrgId } : {}),
                          };
                    const emailPayload: Record<string, unknown> = {
                        type: 'monthly_invoice',
                        to: payerEmail,
                        data: emailData,
                    };
                    if (sfPdfBase64 && sfInvoiceNumber) {
                        (emailPayload as any).attachments = [{ filename: `${sfInvoiceNumber}.pdf`, content: sfPdfBase64 }];
                        console.log(`[create-monthly-invoice] Attaching S.F. PDF ${sfInvoiceNumber} to email for ${payerEmail}`);
                    }
                    const emailUrl = resolveApiUrl(req, '/api/send-email');
                    const emailRes = await postInternalJson(emailUrl, emailPayload, 20000);
                    if (!emailRes.ok) {
                        const body = await emailRes.text().catch(() => '');
                        console.error(`[create-monthly-invoice] send-email HTTP ${emailRes.status}:`, body);
                    }
                } catch (e) {
                    console.error('[create-monthly-invoice] Error sending email:', e);
                }
            }

            results.push({
                batchId: billingBatch.id,
                payerEmail,
                sessionsCount: lessonCount,
                totalAmount: totalLessonPrice,
                checkoutUrl: checkoutSession?.url ?? null,
            });

            console.log(`[create-monthly-invoice] Created batch ${billingBatch.id} for ${payerEmail} with ${lessonCount} sessions`);
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
