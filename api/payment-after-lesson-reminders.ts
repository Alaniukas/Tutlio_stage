// ─── Vercel Cron: Payment-after-lesson reminders ───────────────────────────
// Runs every 5 minutes. Finds sessions that have ended, are unpaid, tutor uses
// payment_timing = after_lesson, and we haven't sent the reminder yet.
// Sends the payer (parent or student) an email with payment link and pay-by time.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { resolvePerLessonPaymentRules } from './_lib/perLessonPaymentRules.js';
import {
    tutorUsesManualStudentPayments,
    trimManualPaymentBankDetails,
} from './_lib/soloManualStudentPayments.js';
import { isOrgTutor } from './_lib/isOrgTutor.js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BASE_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

async function getPaymentUrl(sessionId: string, payerEmail: string | null): Promise<string | null> {
    const url = `${BASE_URL}/api/stripe-checkout`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
        body: JSON.stringify({ sessionId, payerEmail: payerEmail || undefined }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.url || null;
}

async function sendEmail(payload: any): Promise<boolean> {
    const res = await fetch(`${BASE_URL}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
        body: JSON.stringify(payload),
    });
    return res.ok;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
        const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
        if (auth !== `Bearer ${cronSecret}`) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    try {
        const now = new Date().toISOString();

        const { data: sessions, error } = await supabase
            .from('sessions')
            .select(`
                id,
                start_time,
                end_time,
                price,
                topic,
                payment_after_lesson_reminder_sent,
                student:students!inner(
                    full_name,
                    email,
                    payment_payer,
                    payer_email,
                    payer_name,
                    payment_model,
                    per_lesson_payment_timing,
                    per_lesson_payment_deadline_hours
                ),
                tutor:profiles!inner(
                    id,
                    full_name,
                    organization_id,
                    payment_timing,
                    payment_deadline_hours,
                    subscription_plan,
                    manual_subscription_exempt,
                    enable_manual_student_payments,
                    manual_payment_bank_details
                )
            `)
            .eq('status', 'active')
            .eq('paid', false)
            .lt('end_time', now)
            .or('payment_after_lesson_reminder_sent.is.null,payment_after_lesson_reminder_sent.eq.false');

        if (error) {
            console.error('payment-after-lesson-reminders fetch error:', error);
            return res.status(500).json({ error: 'Database error', details: error });
        }

        const sent: string[] = [];
        const skipped: string[] = [];

        for (const session of sessions || []) {
            const tutor = session.tutor as any;
            const student = session.student as any;
            const resolved = resolvePerLessonPaymentRules(
                {
                    payment_model: student?.payment_model,
                    per_lesson_payment_timing: student?.per_lesson_payment_timing,
                    per_lesson_payment_deadline_hours: student?.per_lesson_payment_deadline_hours,
                },
                {
                    payment_timing: tutor?.payment_timing ?? 'before_lesson',
                    payment_deadline_hours: tutor?.payment_deadline_hours ?? 24,
                },
            );
            if (resolved.payment_timing !== 'after_lesson') {
                skipped.push(session.id);
                continue;
            }

            const toEmail = (student?.payer_email || student?.email || '').trim();
            if (!toEmail) {
                skipped.push(session.id);
                continue;
            }

            const tutorManual = tutorUsesManualStudentPayments(tutor);
            let paymentLink: string | null = null;
            if (tutorManual) {
                paymentLink =
                    student?.payment_payer === 'parent'
                        ? `${BASE_URL}/parent/lessons`
                        : `${BASE_URL}/student/sessions`;
            } else {
                paymentLink = await getPaymentUrl(session.id, toEmail);
            }
            if (!paymentLink) {
                skipped.push(session.id);
                continue;
            }

            const deadlineHours = resolved.payment_deadline_hours;
            const endTime = new Date(session.end_time);
            const payBy = new Date(endTime.getTime() + deadlineHours * 3600000);

            const sessionStart = new Date(session.start_time);
            const dateStr = sessionStart.toLocaleDateString('lt-LT', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Vilnius' });
            const timeStr = sessionStart.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius' });
            const payByStr = payBy.toLocaleString('lt-LT', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: 'Europe/Vilnius',
            });

            const recipientName = student?.payer_name || (student?.payment_payer === 'parent' ? student?.payer_name : null) || undefined;

            // Mark as sent first to prevent duplicate if two cron runs overlap
            const { error: updateErr } = await supabase
                .from('sessions')
                .update({ payment_after_lesson_reminder_sent: true })
                .eq('id', session.id);
            if (updateErr) {
                console.error('payment-after-lesson-reminders update flag error:', updateErr);
                skipped.push(session.id);
                continue;
            }

            const bankDetails = trimManualPaymentBankDetails(tutor.manual_payment_bank_details);
            const ok = await sendEmail({
                type: 'payment_after_lesson_reminder',
                to: toEmail,
                data: {
                    studentName: student?.full_name || 'Mokinys',
                    tutorName: tutor?.full_name || 'Korepetitorius',
                    recipientName: recipientName || undefined,
                    date: dateStr,
                    time: timeStr,
                    amount: session.price ?? 0,
                    paymentLink,
                    payByTime: payByStr,
                    ...(tutorManual
                        ? {
                              manualPaymentInstructions: true,
                              bankDetails: bankDetails || undefined,
                              payerIsParent: student?.payment_payer === 'parent',
                          }
                        : {}),
                },
            });

            if (ok) {
                sent.push(session.id);
            } else {
                // Send failed: revert flag so next cron can retry
                await supabase
                    .from('sessions')
                    .update({ payment_after_lesson_reminder_sent: false })
                    .eq('id', session.id);
                skipped.push(session.id);
            }
        }

        return res.status(200).json({
            success: true,
            checkedAt: new Date().toISOString(),
            sent: sent.length,
            skipped: skipped.length,
            sentIds: sent,
        });
    } catch (err: any) {
        console.error('payment-after-lesson-reminders error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
}
