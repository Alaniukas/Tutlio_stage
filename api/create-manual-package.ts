// ─── Vercel Serverless: Create Manual Lesson Package (Individual Tutors) ──────
// POST /api/create-manual-package
// Body: { tutorId, studentId, subjectId, totalLessons, pricePerLesson? }
// No Stripe — package starts as pending, tutor confirms payment later.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { tutorUsesManualStudentPayments } from './_lib/soloManualStudentPayments.js';
import { verifyRequestAuth } from './_lib/auth.js';

function isSafeHttpUrl(raw: string): boolean {
    try {
        const u = new URL(raw);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function json(res: VercelResponse, status: number, body: unknown) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(status).send(JSON.stringify(body));
}

function getEnv(name: string): string | null {
    const v = process.env[name];
    return v && String(v).trim().length > 0 ? String(v) : null;
}

async function postJsonWithTimeout(url: string, payload: unknown, timeoutMs = 7000) {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const { tutorId, studentId, subjectId, totalLessons, pricePerLesson: requestedPriceRaw, expiresAt, attachSalesInvoice } = req.body as {
        tutorId: string;
        studentId: string;
        subjectId: string;
        totalLessons: number;
        pricePerLesson?: number;
        expiresAt?: string;
        /** Generate S.F. and attach PDF to email */
        attachSalesInvoice?: boolean;
    };
    const shouldAttachSf = attachSalesInvoice === true;

    if (!tutorId || !studentId || !subjectId || !totalLessons) {
        return json(res, 400, { error: 'Missing required fields' });
    }

    if (totalLessons <= 0 || totalLessons > 100) {
        return json(res, 400, { error: 'Lesson count must be between 1 and 100' });
    }

    try {
        const auth = await verifyRequestAuth(req);
        if (!auth?.userId || auth.isInternal) {
            return json(res, 401, { error: 'Unauthorized' });
        }
        const callerId = auth.userId;

        const supabaseUrl = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
        const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl) {
            return json(res, 500, { error: 'Server configuration error', details: 'SUPABASE_URL is not set' });
        }
        if (!supabaseServiceRoleKey) {
            return json(res, 500, { error: 'Server configuration error', details: 'SUPABASE_SERVICE_ROLE_KEY is not set' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

        const { data: tutor, error: tutorErr } = await supabase
            .from('profiles')
            .select(
                'id, full_name, organization_id, subscription_plan, manual_subscription_exempt, enable_manual_student_payments, manual_payment_bank_details',
            )
            .eq('id', tutorId)
            .single();

        if (tutorErr || !tutor) {
            return json(res, 404, { error: 'Korepetitorius nerastas', details: tutorErr?.message });
        }

        const { data: adminRow } = await supabase
            .from('organization_admins')
            .select('organization_id')
            .eq('user_id', callerId)
            .maybeSingle();

        let callerAuthorized = callerId === tutorId;
        if (!callerAuthorized && adminRow?.organization_id && tutor.organization_id === adminRow.organization_id) {
            callerAuthorized = true;
        }
        if (!callerAuthorized) {
            return json(res, 403, { error: 'Forbidden' });
        }

        if (!tutorUsesManualStudentPayments(tutor)) {
            return json(res, 403, {
                error: 'Manual student payments are not enabled for this tutor.',
                details: 'Enable subscription_only, manual exemption, or platform admin manual-student flag.',
            });
        }

        const tutorName = tutor.full_name || 'Korepetitorius';

        const { data: student, error: studentErr } = await supabase
            .from('students')
            .select('id, full_name, email, payer_email, payer_name, organization_id')
            .eq('id', studentId)
            .single();

        if (studentErr || !student) {
            return json(res, 404, { error: 'Mokinys nerastas', details: studentErr?.message });
        }

        if (adminRow && callerId !== tutorId) {
            if (!tutor.organization_id || (student as { organization_id?: string | null }).organization_id !== adminRow.organization_id) {
                return json(res, 403, { error: 'Forbidden' });
            }
        }

        let manualPaymentUrl = '';
        let orgDisplayName: string | null = null;
        if (tutor.organization_id) {
            const { data: orgRow } = await supabase
                .from('organizations')
                .select('name, features')
                .eq('id', tutor.organization_id)
                .single();
            const features = (orgRow?.features || {}) as Record<string, unknown>;
            const rawUrl = features.manual_payment_url;
            if (typeof rawUrl === 'string' && rawUrl.trim()) {
                const tUrl = rawUrl.trim();
                manualPaymentUrl = isSafeHttpUrl(tUrl) ? tUrl : '';
            }
            orgDisplayName = orgRow?.name || null;
        }

        const { data: subject, error: subjectErr } = await supabase
            .from('subjects')
            .select('id, name, price')
            .eq('id', subjectId)
            .single();

        if (subjectErr || !subject) {
            return json(res, 404, { error: 'Dalykas nerastas', details: subjectErr?.message });
        }

        const { data: individualPricing } = await supabase
            .from('student_individual_pricing')
            .select('price')
            .eq('student_id', studentId)
            .eq('subject_id', subjectId)
            .single();

        const requestedPrice =
            typeof requestedPriceRaw === 'number' && Number.isFinite(requestedPriceRaw) && requestedPriceRaw >= 0
                ? requestedPriceRaw
                : null;

        const pricePerLesson = requestedPrice ?? individualPricing?.price ?? subject.price ?? 25;
        const totalPrice = pricePerLesson * totalLessons;

        const { data: lessonPackage, error: packageErr } = await supabase
            .from('lesson_packages')
            .insert({
                tutor_id: tutorId,
                student_id: studentId,
                subject_id: subjectId,
                total_lessons: totalLessons,
                available_lessons: totalLessons,
                reserved_lessons: 0,
                completed_lessons: 0,
                price_per_lesson: pricePerLesson,
                total_price: totalPrice,
                paid: false,
                payment_status: 'pending',
                active: true,
                payment_method: 'manual',
                ...(expiresAt ? { expires_at: new Date(expiresAt).toISOString() } : {}),
            })
            .select()
            .single();

        if (packageErr || !lessonPackage) {
            console.error('Error creating manual package:', packageErr);
            return json(res, 500, { error: 'Nepavyko sukurti paketo', details: packageErr?.message });
        }

        // Generate S.F. and get PDF for email attachment
        let invoicePdfBase64: string | null = null;
        let invoiceNumber: string | null = null;
        if (shouldAttachSf) {
            try {
                console.log(`[create-manual-package] Generating S.F. for package ${lessonPackage.id}`);
                const invRes = await postJsonWithTimeout(
                    resolveApiUrl(req, '/api/generate-invoice'),
                    {
                        periodStart: new Date().toISOString().slice(0, 10),
                        periodEnd: new Date().toISOString().slice(0, 10),
                        groupingType: 'single',
                        tutorId,
                        studentId,
                        packageIds: [lessonPackage.id],
                        allowPendingStripePackages: true,
                        issuedByUserId: callerId,
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
                                console.log(`[create-manual-package] S.F. ${invoiceNumber} PDF ready (${invoicePdfBase64.length} chars)`);
                            }
                        }
                    }
                } else {
                    const errText = await invRes.text().catch(() => '');
                    console.error('[create-manual-package] generate-invoice HTTP', invRes.status, errText);
                }
            } catch (e) {
                console.error('[create-manual-package] S.F. generation error:', e);
            }
        }

        let emailSent = false;
        const toEmail = (student.payer_email || student.email || '').trim();
        if (toEmail) {
            try {
                const emailPayload: Record<string, unknown> = {
                    type: 'manual_package_request',
                    to: toEmail,
                    data: {
                        recipientName: student.payer_name || student.full_name,
                        studentName: student.full_name,
                        orgName: orgDisplayName || tutorName,
                        subjectName: subject.name,
                        totalLessons,
                        pricePerLesson: pricePerLesson.toFixed(2),
                        totalPrice: totalPrice.toFixed(2),
                        bankDetails: (tutor as { manual_payment_bank_details?: string | null }).manual_payment_bank_details || '',
                        ...(manualPaymentUrl ? { paymentUrl: manualPaymentUrl } : {}),
                        ...((tutor as any).organization_id ? { organizationId: (tutor as any).organization_id } : {}),
                    },
                };
                if (invoicePdfBase64 && invoiceNumber) {
                    emailPayload.attachments = [{ filename: `${invoiceNumber}.pdf`, content: invoicePdfBase64 }];
                    console.log(`[create-manual-package] Attaching S.F. PDF ${invoiceNumber} to email for ${toEmail}`);
                }
                const emailRes = await postJsonWithTimeout(
                    resolveApiUrl(req, '/api/send-email'),
                    emailPayload,
                    20000,
                );
                emailSent = emailRes.ok;
                if (!emailRes.ok) {
                    const body = await emailRes.text().catch(() => '');
                    console.error('[create-manual-package] send-email HTTP', emailRes.status, body);
                }
            } catch (e) {
                console.error('[create-manual-package] send-email error:', e);
            }
        }

        return json(res, 200, {
            success: true,
            packageId: lessonPackage.id,
            emailSent,
            ...(manualPaymentUrl ? { paymentUrl: manualPaymentUrl } : {}),
        });
    } catch (err: any) {
        console.error('create-manual-package error:', err);
        return json(res, 500, {
            error: 'Internal Server Error',
            details: err?.message || String(err),
        });
    }
}
