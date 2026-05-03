// ─── Vercel Serverless: Create Lesson Package Checkout ────────────────────────
// POST /api/create-package-checkout
// Body: { tutorId, studentId, subjectId, totalLessons, pricePerLesson? }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { soloTutorUsesManualStudentPayments } from './_lib/soloManualStudentPayments.js';
import { schoolInstallmentCheckoutCents } from './_lib/schoolInstallmentStripe.js';

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

function json(res: VercelResponse, status: number, body: unknown) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(status).send(JSON.stringify(body));
}

function getEnv(name: string): string | null {
    const v = process.env[name];
    return v && String(v).trim().length > 0 ? String(v) : null;
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

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

/** Same deployment as this handler (Vercel isolates freeze before fire-and-forget fetch completes). */
function resolveApiUrl(req: VercelRequest, path: '/api/send-email' | '/api/generate-invoice'): string {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const auth = await verifyRequestAuth(req);
    if (!auth?.userId) return json(res, 401, { error: 'Unauthorized' });

    const { tutorId, studentId, subjectId, totalLessons, pricePerLesson: requestedPriceRaw, expiresAt, attachSalesInvoice } = req.body as {
        tutorId: string;
        studentId: string;
        subjectId: string;
        totalLessons: number;
        pricePerLesson?: number;
        expiresAt?: string;
        /** Default true: generate S.F. and attach to payment email when invoice profile exists */
        attachSalesInvoice?: boolean;
    };
    const shouldAttachSf = attachSalesInvoice !== false;

    if (!tutorId || !studentId || !subjectId || !totalLessons) {
        return json(res, 400, { error: 'Missing required fields' });
    }

    if (totalLessons <= 0 || totalLessons > 100) {
        return json(res, 400, { error: 'Lesson count must be between 1 and 100' });
    }

    try {
        const stripeSecretKey = getEnv('STRIPE_SECRET_KEY');
        const supabaseUrl = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
        const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

        if (!stripeSecretKey) {
            return json(res, 500, { error: 'Server configuration error', details: 'STRIPE_SECRET_KEY is not set' });
        }
        if (!supabaseUrl) {
            return json(res, 500, { error: 'Server configuration error', details: 'SUPABASE_URL (or VITE_SUPABASE_URL) is not set' });
        }
        if (!supabaseServiceRoleKey) {
            return json(res, 500, { error: 'Server configuration error', details: 'SUPABASE_SERVICE_ROLE_KEY is not set' });
        }

        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' as any });
        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

        // 1. Fetch tutor, student, and subject data
        const { data: tutor, error: tutorErr } = await supabase
            .from('profiles')
            .select(
                'id, full_name, stripe_account_id, stripe_onboarding_complete, organization_id, subscription_plan, manual_subscription_exempt, enable_manual_student_payments',
            )
            .eq('id', tutorId)
            .single();

        if (tutorErr || !tutor) {
            return json(res, 404, { error: 'Korepetitorius nerastas', details: tutorErr?.message });
        }

        if (!tutor.organization_id && soloTutorUsesManualStudentPayments(tutor)) {
            return json(res, 400, {
                error:
                    'This tutor uses manual (off-platform) student payments only. Send a manual package instead of Stripe checkout.',
            });
        }

        const { data: student, error: studentErr } = await supabase
            .from('students')
            .select('id, full_name, email, payment_payer, payer_email, payer_name')
            .eq('id', studentId)
            .single();

        if (studentErr || !student) {
            return json(res, 404, { error: 'Mokinys nerastas', details: studentErr?.message });
        }

        const { data: subject, error: subjectErr } = await supabase
            .from('subjects')
            .select('id, name, price, duration_minutes')
            .eq('id', subjectId)
            .single();

        if (subjectErr || !subject) {
            return json(res, 404, { error: 'Dalykas nerastas', details: subjectErr?.message });
        }

        // 2. Check for individual pricing override
        const { data: individualPricing } = await supabase
            .from('student_individual_pricing')
            .select('price')
            .eq('student_id', studentId)
            .eq('subject_id', subjectId)
            .single();

        const requestedPrice =
            typeof requestedPriceRaw === 'number' && Number.isFinite(requestedPriceRaw)
                ? requestedPriceRaw
                : null;

        if (requestedPrice !== null && requestedPrice < 0) {
            return json(res, 400, { error: 'Price per lesson cannot be negative' });
        }

        const pricePerLesson = requestedPrice ?? individualPricing?.price ?? subject.price ?? 25;

        // 3. Determine which Stripe account to use (org or tutor)
        let stripeAccountId: string | null = null;
        let ownerName = tutor.full_name || 'Korepetitorius';
        let useSchoolOrgAbsorbedFees = false;

        if (tutor.organization_id) {
            const { data: org } = await supabase
                .from('organizations')
                .select('stripe_account_id, stripe_onboarding_complete, name, entity_type')
                .eq('id', tutor.organization_id)
                .single();

            if (!org?.stripe_onboarding_complete) {
                return json(res, 400, { error: 'Organization Stripe account is not connected' });
            }
            stripeAccountId = org.stripe_account_id;
            ownerName = org.name || ownerName;
            useSchoolOrgAbsorbedFees = org.entity_type === 'school';
        } else {
            if (!tutor.stripe_onboarding_complete) {
                return json(res, 400, { error: 'Tutor Stripe account is not connected' });
            }
            stripeAccountId = tutor.stripe_account_id;
        }

        if (!stripeAccountId) {
            return json(res, 400, { error: 'Stripe paskyra nerasta' });
        }

        // 4. Totals — school org Connect: payer pays package list price only; fees absorbed via application_fee
        const basePriceEur = pricePerLesson * totalLessons;
        const payerChargedTotalEur = useSchoolOrgAbsorbedFees ? basePriceEur : customerTotalEur(basePriceEur);

        // 5. Always create a NEW package record (will be activated after payment)
        // Multiple packages can exist for same student/subject - they'll be used in order
        const { data: lessonPackage, error: packageErr } = await supabase
            .from('lesson_packages')
            .insert({
                tutor_id: tutorId,
                student_id: studentId,
                subject_id: subjectId,
                total_lessons: totalLessons,
                available_lessons: totalLessons, // Initially all available
                reserved_lessons: 0,
                completed_lessons: 0,
                price_per_lesson: pricePerLesson,
                total_price: basePriceEur,
                paid: false,
                payment_status: 'pending',
                active: false,
                payment_method: 'stripe',
                ...(expiresAt ? { expires_at: new Date(expiresAt).toISOString() } : {}),
            })
            .select()
            .single();

        if (packageErr || !lessonPackage) {
            console.error('Error creating package:', packageErr);
            if (packageErr?.code === '42501') {
                return json(res, 500, {
                    error: 'Database permission error',
                    details: 'Missing permissions for lesson_packages table. Apply the latest Supabase migration.',
                });
            }
            return json(res, 500, { error: 'Nepavyko sukurti paketo', details: packageErr?.message });
        }

        // 6. Determine customer email (payer or student)
        const customerEmail = student.payer_email || student.email || undefined;

        // 7. Create Stripe Checkout session
        let checkoutSession: Stripe.Response<Stripe.Checkout.Session>;
        if (useSchoolOrgAbsorbedFees) {
            const { chargeCents, transferToSchoolCents } = schoolInstallmentCheckoutCents(basePriceEur);
            const applicationFeeCents = chargeCents - transferToSchoolCents;
            if (chargeCents < 50 || applicationFeeCents < 1 || applicationFeeCents >= chargeCents) {
                await supabase.from('lesson_packages').delete().eq('id', lessonPackage.id);
                return json(res, 400, {
                    error: 'Netinkama suma paketo apmokėjimui.',
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
                                name: `${totalLessons} lessons – ${subject.name}`,
                                description: `Package – ${ownerName}`,
                            },
                            unit_amount: chargeCents,
                        },
                        quantity: 1,
                    },
                ],
                payment_intent_data: {
                    application_fee_amount: applicationFeeCents,
                    transfer_data: {
                        destination: stripeAccountId,
                    },
                    metadata: {
                        tutlio_package_id: lessonPackage.id,
                        tutor_id: tutorId,
                        student_id: studentId,
                        subject_id: subjectId,
                        tutlio_school_org_absorbed: 'true',
                    },
                },
                metadata: {
                    tutlio_package_id: lessonPackage.id,
                    tutor_id: tutorId,
                    student_id: studentId,
                    subject_id: subjectId,
                    tutlio_school_org_absorbed: 'true',
                },
                success_url: `${APP_URL}/package-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${APP_URL}/package-cancelled`,
            });
        } else {
            const { baseCents, feesCents: feeCents } = lessonCheckoutBreakdownCents(basePriceEur);
            const tutorTransferCents = baseCents;
            checkoutSession = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: customerEmail,
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `${totalLessons} lessons – ${subject.name}`,
                                description: `Package – ${ownerName}`,
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
                                description: 'Tutlio platform fee and payment processing',
                            },
                            unit_amount: feeCents,
                        },
                        quantity: 1,
                    },
                ],
                payment_intent_data: {
                    transfer_data: {
                        destination: stripeAccountId,
                        amount: tutorTransferCents,
                    },
                    metadata: {
                        tutlio_package_id: lessonPackage.id,
                        tutor_id: tutorId,
                        student_id: studentId,
                        subject_id: subjectId,
                    },
                },
                metadata: {
                    tutlio_package_id: lessonPackage.id,
                    tutor_id: tutorId,
                    student_id: studentId,
                    subject_id: subjectId,
                },
                success_url: `${APP_URL}/package-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${APP_URL}/package-cancelled`,
            });
        }

        // 8. Save Stripe checkout session ID to package
        await supabase
            .from('lesson_packages')
            .update({ stripe_checkout_session_id: checkoutSession.id })
            .eq('id', lessonPackage.id);

        // 9. Generate pre-payment invoice (S.F.) and attach PDF to email
        let invoicePdfBase64: string | null = null;
        let invoiceNumber: string | null = null;
        if (shouldAttachSf) {
            try {
                const issuedByUserId = auth.userId!;
                const invRes = await postInternalJson(
                    resolveApiUrl(req, '/api/generate-invoice'),
                    {
                        periodStart: new Date().toISOString().slice(0, 10),
                        periodEnd: new Date().toISOString().slice(0, 10),
                        groupingType: 'single',
                        tutorId,
                        studentId,
                        packageIds: [lessonPackage.id],
                        allowPendingStripePackages: true,
                        issuedByUserId,
                    },
                    20000,
                );
                if (invRes.ok) {
                    const invData = (await invRes.json().catch(() => null)) as any;
                    if (invData?.invoiceIds?.[0]) {
                        const invId = invData.invoiceIds[0];
                        const { data: inv } = await supabase.from('invoices').select('invoice_number, pdf_storage_path').eq('id', invId).single();
                        if (inv?.pdf_storage_path) {
                            invoiceNumber = inv.invoice_number;
                            const { data: blob } = await supabase.storage.from('invoices').download(inv.pdf_storage_path);
                            if (blob) {
                                const arrayBuf = await blob.arrayBuffer();
                                invoicePdfBase64 = Buffer.from(arrayBuf).toString('base64');
                            }
                        }
                    }
                } else {
                    const errText = await invRes.text().catch(() => '');
                    console.error('[create-package-checkout] generate-invoice HTTP', invRes.status, errText);
                }
            } catch (e) {
                console.error('[create-package-checkout] pre-payment invoice error:', e);
            }
        }

        // 10. Send email to payer with package details, payment link, and optional invoice PDF
        let emailSent = false;
        const toEmail = (customerEmail || '').trim();
        if (toEmail && checkoutSession.url) {
            try {
                const emailPayload: Record<string, unknown> = {
                    type: 'prepaid_package_request',
                    to: toEmail,
                    data: {
                        recipientName: student.payer_name || student.full_name,
                        studentName: student.full_name,
                        tutorName: ownerName,
                        subjectName: subject.name,
                        totalLessons,
                        pricePerLesson: pricePerLesson.toFixed(2),
                        totalPrice: payerChargedTotalEur.toFixed(2),
                        paymentLink: checkoutSession.url,
                    },
                };
                if (invoicePdfBase64 && invoiceNumber) {
                    emailPayload.attachments = [{ filename: `${invoiceNumber}.pdf`, content: invoicePdfBase64 }];
                }
                const emailRes = await postInternalJson(
                    resolveApiUrl(req, '/api/send-email'),
                    emailPayload,
                    20000,
                );
                emailSent = emailRes.ok;
                if (!emailRes.ok) {
                    const body = await emailRes.text().catch(() => '');
                    console.error('[create-package-checkout] send-email HTTP', emailRes.status, body);
                }
            } catch (e) {
                console.error('[create-package-checkout] send-email error:', e);
            }
        }

        return json(res, 200, {
            success: true,
            packageId: lessonPackage.id,
            checkoutUrl: checkoutSession.url,
            emailSent,
        });
    } catch (err: any) {
        console.error('create-package-checkout error:', err);
        return json(res, 500, {
            error: 'Internal Server Error',
            details: err?.message || String(err),
        });
    }
}
