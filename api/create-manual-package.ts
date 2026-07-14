// ─── Vercel Serverless: Create Manual Lesson Package (Individual Tutors) ──────
// POST /api/create-manual-package
// Body (multi-subject):
//   { tutorId, studentId, items: [{ subjectId, totalLessons, pricePerLesson? }], expiresAt?, attachSalesInvoice? }
// Body (legacy single-subject, still accepted):
//   { tutorId, studentId, subjectId, totalLessons, pricePerLesson?, expiresAt?, attachSalesInvoice? }
// No Stripe — package starts as pending, tutor confirms payment later.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { tutorUsesManualStudentPayments } from './_lib/soloManualStudentPayments.js';
import { verifyRequestAuth } from './_lib/auth.js';
import {
  normalizePackageItemsInput,
  resolvePackageItems,
  aggregatePackageTotals,
  itemsForEmailPayload,
} from './_lib/packageItems.js';
import {
  isPackageReservationFlowEnabled,
  getPackagePaymentDeadlineHours,
} from './_lib/trialReservation.js';
import { reservePackageSlots, type PackageSlotInput } from './_lib/packageSlots.js';
import {
    resolveRecurringPackagePlan,
    recurringPlanPackageFields,
    type MonthlyPlanInput,
} from './_lib/recurringPackagePlan.js';

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

function packageExpiryIso(value: string): string {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
    return new Date(normalized).toISOString();
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

    const body = req.body as {
        tutorId?: string;
        studentId?: string;
        // Legacy single-subject fields:
        subjectId?: string;
        totalLessons?: number;
        pricePerLesson?: number;
        // New multi-subject payload:
        items?: Array<{ subjectId: string; totalLessons: number; pricePerLesson?: number }>;
        expiresAt?: string;
        /** Generate S.F. and attach PDF to email */
        attachSalesInvoice?: boolean;
        /** Reservation flow (req 3): pre-book lesson times held until paid by the deadline. */
        slots?: PackageSlotInput[];
        monthlyPlan?: MonthlyPlanInput;
        recurringPlanId?: string;
        billingPeriodStart?: string;
        billingPeriodEnd?: string;
    };
    const tutorId = body.tutorId;
    const studentId = body.studentId;
    const expiresAt = body.expiresAt;
    const shouldAttachSf = body.attachSalesInvoice === true;

    if (!tutorId || !studentId) {
        return json(res, 400, { error: 'Missing required fields' });
    }

    const { items: normalizedItems, error: normalizeErr } = normalizePackageItemsInput(body);
    if (normalizeErr) {
        return json(res, 400, { error: normalizeErr });
    }

    try {
        const auth = await verifyRequestAuth(req);
        if (!auth || (!auth.userId && !(auth.isInternal && body.recurringPlanId))) {
            return json(res, 401, { error: 'Unauthorized' });
        }

        const supabaseUrl = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
        const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl) {
            return json(res, 500, { error: 'Server configuration error', details: 'SUPABASE_URL is not set' });
        }
        if (!supabaseServiceRoleKey) {
            return json(res, 500, { error: 'Server configuration error', details: 'SUPABASE_SERVICE_ROLE_KEY is not set' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

        let callerId = auth.userId;
        if (auth.isInternal && body.recurringPlanId) {
            const { data: planCreator } = await supabase
                .from('recurring_monthly_package_plans')
                .select('created_by')
                .eq('id', body.recurringPlanId)
                .eq('active', true)
                .maybeSingle();
            callerId = planCreator?.created_by || null;
        }
        if (!callerId) return json(res, 401, { error: 'Unauthorized recurring package plan.' });

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
        let orgFeatures: Record<string, unknown> | null = null;
        if (tutor.organization_id) {
            const { data: orgRow } = await supabase
                .from('organizations')
                .select('name, features')
                .eq('id', tutor.organization_id)
                .single();
            const features = (orgRow?.features || {}) as Record<string, unknown>;
            orgFeatures = features;
            const rawUrl = features.manual_payment_url;
            if (typeof rawUrl === 'string' && rawUrl.trim()) {
                const tUrl = rawUrl.trim();
                manualPaymentUrl = isSafeHttpUrl(tUrl) ? tUrl : '';
            }
            orgDisplayName = orgRow?.name || null;
        }

        // Resolve every item: subject ownership + per-student pricing + price fallback
        const { items: resolvedItems, error: itemsErr } = await resolvePackageItems(supabase, {
            tutorId,
            studentId,
            items: normalizedItems,
        });
        if (itemsErr) {
            return json(res, 400, { error: itemsErr });
        }
        const { totalLessons, totalPriceEur: totalPrice } = aggregatePackageTotals(resolvedItems);
        if ((body.monthlyPlan || body.recurringPlanId) && resolvedItems.length !== 1) {
            return json(res, 400, { error: 'A recurring monthly package must contain exactly one subject.' });
        }
        const primarySubjectId = resolvedItems.length === 1 ? resolvedItems[0]!.subjectId : null;
        const primaryPricePerLesson = resolvedItems.length === 1 ? resolvedItems[0]!.pricePerLesson : null;
        const { data: recurringPlan, error: recurringPlanError } = await resolveRecurringPackagePlan({
            supabase,
            organizationId: tutor.organization_id || null,
            createdBy: callerId,
            tutorId,
            studentId,
            subjectId: primarySubjectId,
            paymentMethod: 'manual',
            attachSalesInvoice: shouldAttachSf,
            monthlyPlan: body.monthlyPlan,
            recurringPlanId: body.recurringPlanId,
            billingPeriodStart: body.billingPeriodStart,
            billingPeriodEnd: body.billingPeriodEnd,
        });
        if (recurringPlanError || !recurringPlan) {
            return json(res, 400, { error: recurringPlanError || 'Failed to resolve monthly package plan.' });
        }
        const effectiveExpiresAt = expiresAt || recurringPlan.billingPeriodEnd;

        const { data: lessonPackage, error: packageErr } = await supabase
            .from('lesson_packages')
            .insert({
                tutor_id: tutorId,
                student_id: studentId,
                subject_id: primarySubjectId,
                total_lessons: totalLessons,
                available_lessons: totalLessons,
                reserved_lessons: 0,
                completed_lessons: 0,
                price_per_lesson: primaryPricePerLesson,
                total_price: totalPrice,
                paid: false,
                payment_status: 'pending',
                active: true,
                payment_method: 'manual',
                ...recurringPlanPackageFields(recurringPlan),
                ...(effectiveExpiresAt ? { expires_at: packageExpiryIso(effectiveExpiresAt) } : {}),
            })
            .select()
            .single();

        if (packageErr || !lessonPackage) {
            console.error('Error creating manual package:', packageErr);
            return json(res, 500, { error: 'Nepavyko sukurti paketo', details: packageErr?.message });
        }

        const itemRows = resolvedItems.map((it, idx) => ({
            package_id: lessonPackage.id,
            subject_id: it.subjectId,
            total_lessons: it.totalLessons,
            available_lessons: it.totalLessons,
            reserved_lessons: 0,
            completed_lessons: 0,
            price_per_lesson: it.pricePerLesson,
            total_price: it.itemTotalPrice,
            position: idx,
        }));
        const { error: itemsInsertErr } = await supabase
            .from('lesson_package_items')
            .insert(itemRows);
        if (itemsInsertErr) {
            console.error('Error creating manual package items:', itemsInsertErr);
            await supabase.from('lesson_packages').delete().eq('id', lessonPackage.id);
            return json(res, 500, { error: 'Nepavyko sukurti paketo punktų', details: itemsInsertErr.message });
        }

        // Reservation flow (req 3+5): pre-book times held until the manual payment
        // is confirmed; unpaid holds auto-release via the cron at the deadline.
        if (isPackageReservationFlowEnabled(orgFeatures) && Array.isArray(body.slots) && body.slots.length > 0) {
            const reserveResult = await reservePackageSlots(supabase, {
                tutorId,
                studentId,
                packageId: lessonPackage.id,
                slots: body.slots,
                items: resolvedItems.map((it) => ({
                    subjectId: it.subjectId,
                    subjectName: it.subjectName,
                    pricePerLesson: it.pricePerLesson,
                    totalLessons: it.totalLessons,
                })),
                deadlineHours: getPackagePaymentDeadlineHours(orgFeatures),
            });
            if (reserveResult.error) {
                await supabase.from('lesson_packages').delete().eq('id', lessonPackage.id);
                return json(res, reserveResult.status || 500, { error: reserveResult.error });
            }
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
                const firstItem = resolvedItems[0]!;
                const emailPayload: Record<string, unknown> = {
                    type: 'manual_package_request',
                    to: toEmail,
                    data: {
                        recipientName: student.payer_name || student.full_name,
                        studentName: student.full_name,
                        orgName: orgDisplayName || tutorName,
                        // Multi-subject payload:
                        items: itemsForEmailPayload(resolvedItems),
                        // Back-compat keys (first item):
                        subjectName: firstItem.subjectName,
                        pricePerLesson: firstItem.pricePerLesson.toFixed(2),
                        totalLessons,
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
            recurringPlanId: recurringPlan.planId,
        });
    } catch (err: any) {
        console.error('create-manual-package error:', err);
        return json(res, 500, {
            error: 'Internal Server Error',
            details: err?.message || String(err),
        });
    }
}
