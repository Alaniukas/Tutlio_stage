// ─── Vercel Serverless: Create Manual Lesson Package (Org Tutors) ─────────────
// POST /api/create-manual-package
// Body: { tutorId, studentId, subjectId, totalLessons, pricePerLesson? }
// No Stripe — package starts as pending, org admin confirms payment later.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

function resolveSendEmailUrl(req: VercelRequest): string {
    const vu = process.env.VERCEL_URL;
    if (vu && String(vu).trim()) {
        const host = String(vu).replace(/^https?:\/\//, '').replace(/\/$/, '');
        return `https://${host}/api/send-email`;
    }
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
    if (origin) return `${origin.replace(/\/$/, '')}/api/send-email`;
    const base = (getEnv('APP_URL') || getEnv('VITE_APP_URL') || 'http://127.0.0.1:3002').replace(/\/$/, '');
    return `${base}/api/send-email`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const { tutorId, studentId, subjectId, totalLessons, pricePerLesson: requestedPriceRaw } = req.body as {
        tutorId: string;
        studentId: string;
        subjectId: string;
        totalLessons: number;
        pricePerLesson?: number;
    };

    if (!tutorId || !studentId || !subjectId || !totalLessons) {
        return json(res, 400, { error: 'Missing required fields' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return json(res, 401, { error: 'Unauthorized' });
    }

    if (totalLessons <= 0 || totalLessons > 100) {
        return json(res, 400, { error: 'Lesson count must be between 1 and 100' });
    }

    try {
        const supabaseUrl = getEnv('SUPABASE_URL') || getEnv('VITE_SUPABASE_URL');
        const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

        if (!supabaseUrl) {
            return json(res, 500, { error: 'Server configuration error', details: 'SUPABASE_URL is not set' });
        }
        if (!supabaseServiceRoleKey) {
            return json(res, 500, { error: 'Server configuration error', details: 'SUPABASE_SERVICE_ROLE_KEY is not set' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

        const token = (authHeader as string).replace('Bearer ', '');
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) {
            return json(res, 401, { error: 'Unauthorized' });
        }
        const { data: adminRow } = await supabase.from('organization_admins').select('organization_id').eq('user_id', user.id).maybeSingle();
        if (!adminRow) {
            return json(res, 403, { error: 'Tik organizacijos administratorius gali kurti rankinius paketus' });
        }

        const { data: tutor, error: tutorErr } = await supabase
            .from('profiles')
            .select('id, full_name, organization_id')
            .eq('id', tutorId)
            .single();

        if (tutorErr || !tutor) {
            return json(res, 404, { error: 'Korepetitorius nerastas', details: tutorErr?.message });
        }

        if (!tutor.organization_id) {
            return json(res, 400, { error: 'This tutor does not belong to the organization' });
        }

        if (tutor.organization_id !== adminRow.organization_id) {
            return json(res, 403, { error: 'You do not have permission to manage this tutor' });
        }

        const { data: org } = await supabase
            .from('organizations')
            .select('name, features')
            .eq('id', tutor.organization_id)
            .single();

        if (!(org?.features as Record<string, unknown> | null)?.manual_payments) {
            return json(res, 403, { error: 'Manual payments feature is not enabled for this organization' });
        }

        const orgName = org?.name || tutor.full_name || 'Organizacija';

        const { data: student, error: studentErr } = await supabase
            .from('students')
            .select('id, full_name, email, payer_email, payer_name')
            .eq('id', studentId)
            .single();

        if (studentErr || !student) {
            return json(res, 404, { error: 'Mokinys nerastas', details: studentErr?.message });
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
                // Must be visible immediately so org_admin can confirm payment.
                active: true,
                payment_method: 'manual',
            })
            .select()
            .single();

        if (packageErr || !lessonPackage) {
            console.error('Error creating manual package:', packageErr);
            return json(res, 500, { error: 'Nepavyko sukurti paketo', details: packageErr?.message });
        }

        let emailSent = false;
        const toEmail = (student.payer_email || student.email || '').trim();
        if (toEmail) {
            const features = (org?.features || {}) as Record<string, unknown>;
            const paymentUrl = typeof features.manual_payment_url === 'string' ? features.manual_payment_url.trim() : '';
            try {
                const emailRes = await postJsonWithTimeout(
                    resolveSendEmailUrl(req),
                    {
                        type: 'manual_package_request',
                        to: toEmail,
                        data: {
                            recipientName: student.payer_name || student.full_name,
                            studentName: student.full_name,
                            orgName,
                            subjectName: subject.name,
                            totalLessons,
                            pricePerLesson: pricePerLesson.toFixed(2),
                            totalPrice: totalPrice.toFixed(2),
                            paymentUrl: paymentUrl || undefined,
                        },
                    },
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
        });
    } catch (err: any) {
        console.error('create-manual-package error:', err);
        return json(res, 500, {
            error: 'Internal Server Error',
            details: err?.message || String(err),
        });
    }
}
