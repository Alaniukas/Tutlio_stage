// ─── Vercel Cron Function: Payment Deadline Warnings ─────────────────────────
// Runs every 5 minutes via vercel.json cron schedule.
// Finds active, unpaid sessions whose payment deadline is between now and 30 minutes
// from now, and sends a warning to the solo tutor, or to organization admins for org tutors (tutor never gets payment details).
//
// A session's payment deadline = session.start_time - tutor.cancellation_hours hours.
// We send the warning when: 0 ≤ (deadline - now) ≤ 30 minutes.
//
// To avoid duplicate emails, we store `payment_deadline_warning_sent` flag on the
// session. If the column doesn't exist yet, we add it via ALTER TABLE.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { resolvePerLessonPaymentRules } from './_lib/perLessonPaymentRules.js';
import { isOrgTutor } from './_lib/isOrgTutor.js';
import {
    soloTutorUsesManualStudentPayments,
    trimManualPaymentBankDetails,
} from './_lib/soloManualStudentPayments.js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BASE_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

async function sendWarningEmail(payload: any) {
    const url = `${BASE_URL}/api/send-email`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
        body: JSON.stringify(payload),
    });
    return resp.ok;
}

async function getOrgAdminProfiles(
    organizationId: string,
): Promise<Array<{ email: string; full_name: string | null }>> {
    const { data: orgAdmins } = await supabase
        .from('organization_admins')
        .select('user_id')
        .eq('organization_id', organizationId);
    const adminIds = (orgAdmins || []).map((a: { user_id: string }) => a.user_id).filter(Boolean);
    if (adminIds.length === 0) return [];
    const { data: adminProfiles } = await supabase
        .from('profiles')
        .select('email, full_name')
        .in('id', adminIds);
    return (adminProfiles || [])
        .map((p: { email?: string; full_name?: string | null }) => ({
            email: String(p.email || '').trim(),
            full_name: p.full_name ?? null,
        }))
        .filter((p) => p.email.length > 0);
}

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
        const now = new Date();
        const in30min = new Date(now.getTime() + 30 * 60000);

        // Fetch active, unpaid sessions with tutor and student info.
        // Deadline depends on tutor's payment_timing:
        // - before_lesson: deadline = start_time - payment_deadline_hours
        // - after_lesson: deadline = end_time + payment_deadline_hours
        // We send the warning when 0 ≤ (deadline - now) ≤ 30 minutes.
        const { data: sessions, error } = await supabase
            .from('sessions')
            .select(`
        id,
        start_time,
        end_time,
        price,
        paid,
        payment_deadline_warning_sent,
        student:students!inner(
          id,
          full_name,
          email,
          phone,
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
          email,
          organization_id,
          cancellation_hours,
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
            .is('payment_deadline_warning_sent', null);

        if (error) {
            console.error('Error fetching sessions:', error);
            return res.status(500).json({ error: 'Database error', details: error });
        }

        const warned: string[] = [];
        const skipped: string[] = [];

        for (const session of sessions || []) {
            const tutor = session.tutor as any;
            const student = session.student as any;

            const baseHours = tutor?.payment_deadline_hours ?? (tutor?.cancellation_hours ?? 24);
            const resolved = resolvePerLessonPaymentRules(
                {
                    payment_model: student?.payment_model,
                    per_lesson_payment_timing: student?.per_lesson_payment_timing,
                    per_lesson_payment_deadline_hours: student?.per_lesson_payment_deadline_hours,
                },
                {
                    payment_timing: tutor?.payment_timing ?? 'before_lesson',
                    payment_deadline_hours: baseHours,
                },
            );
            const paymentTiming = resolved.payment_timing;
            const deadlineHours = resolved.payment_deadline_hours;
            const sessionStart = new Date(session.start_time);
            const sessionEnd = new Date(session.end_time);

            let deadline: Date;
            if (paymentTiming === 'after_lesson') {
                deadline = new Date(sessionEnd.getTime() + deadlineHours * 3600000);
            } else {
                deadline = new Date(sessionStart.getTime() - deadlineHours * 3600000);
            }

            // For before_lesson: do not warn if the lesson has already started (illogical to "pay before" a past lesson)
            if (paymentTiming === 'before_lesson' && sessionStart <= now) {
                skipped.push(session.id);
                continue;
            }
            // Only warn if the deadline falls within the next 30 minutes (and hasn't passed yet)
            if (deadline > now && deadline <= in30min) {
                const sessionDate = sessionStart.toLocaleDateString('lt-LT', {
                    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Vilnius'
                });
                const sessionTime = sessionStart.toLocaleTimeString('lt-LT', {
                    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius'
                });
                const deadlineTime = deadline.toLocaleTimeString('lt-LT', {
                    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius'
                });
                const paymentContext =
                    paymentTiming === 'after_lesson'
                        ? `Po pamokos mokėjimas turėjo būti atliktas iki ${deadlineTime}.`
                        : `Mokėjimo terminas – iki ${deadlineTime}.`;

                // 1) Solo tutor gets warning email; org tutors never — same info goes to org admins instead
                let tutorStepOk = false;
                if (isOrgTutor(tutor.organization_id)) {
                    const admins = await getOrgAdminProfiles(tutor.organization_id);
                    if (admins.length === 0) {
                        console.warn(
                            '[payment-deadline-warnings] No org admin emails for organization_id',
                            tutor.organization_id,
                            'session',
                            session.id,
                        );
                        tutorStepOk = true;
                    } else {
                        let allSent = true;
                        for (const admin of admins) {
                            const ok = await sendWarningEmail({
                                type: 'payment_deadline_warning_org_admin',
                                to: admin.email,
                                data: {
                                    recipientName: admin.full_name || 'Administratoriau',
                                    studentName: student.full_name,
                                    studentEmail: student.email,
                                    studentPhone: student.phone,
                                    sessionDate,
                                    sessionTime,
                                    deadlineTime,
                                    paymentContext,
                                    price: session.price ?? '–',
                                    assignedTutorName: tutor.full_name || 'Korepetitorius',
                                },
                            });
                            if (!ok) allSent = false;
                        }
                        tutorStepOk = allSent;
                    }
                } else {
                    tutorStepOk = await sendWarningEmail({
                        type: 'payment_deadline_warning_tutor',
                        to: tutor.email,
                        data: {
                            tutorName: tutor.full_name,
                            studentName: student.full_name,
                            studentEmail: student.email,
                            studentPhone: student.phone,
                            sessionDate,
                            sessionTime,
                            deadlineTime,
                            paymentContext,
                            price: session.price ?? '–',
                        },
                    });
                }

                if (tutorStepOk) {
                    await supabase
                        .from('sessions')
                        .update({ payment_deadline_warning_sent: true })
                        .eq('id', session.id);
                    warned.push(session.id);
                }

                // 2) Reminder to payer (parent or student) – only when payment_timing = before_lesson
                if (paymentTiming === 'before_lesson') {
                    const studentObj = student as any;
                    const rawPayerEmail = (studentObj?.payment_payer === 'parent'
                        ? (studentObj?.payer_email || '')
                        : (studentObj?.email || '')
                    ).trim();

                    if (rawPayerEmail) {
                        const minutesToDeadline = Math.round((deadline.getTime() - now.getTime()) / 60000);
                        const deadlineHoursForEmail = Math.max(1, Math.round(minutesToDeadline / 60)) || 1;
                        const bankDetails = trimManualPaymentBankDetails(tutor.manual_payment_bank_details);

                        if (!isOrgTutor(tutor.organization_id) && soloTutorUsesManualStudentPayments(tutor)) {
                            await sendWarningEmail({
                                type: 'payment_reminder',
                                to: rawPayerEmail,
                                data: {
                                    studentName: student.full_name,
                                    tutorName: tutor.full_name,
                                    recipientName: studentObj?.payer_name || undefined,
                                    date: sessionDate,
                                    time: sessionTime,
                                    price: session.price ?? 0,
                                    deadlineHours: deadlineHoursForEmail,
                                    paymentTiming,
                                    manualPaymentInstructions: true,
                                    bankDetails: bankDetails || undefined,
                                    paymentUrl: `${BASE_URL}/student/sessions`,
                                    payerIsParent: studentObj?.payment_payer === 'parent',
                                },
                            });
                        } else {
                            const paymentUrl = await getPaymentUrl(session.id, rawPayerEmail);
                            if (paymentUrl) {
                                await sendWarningEmail({
                                    type: 'payment_reminder',
                                    to: rawPayerEmail,
                                    data: {
                                        studentName: student.full_name,
                                        tutorName: tutor.full_name,
                                        recipientName: studentObj?.payer_name || undefined,
                                        date: sessionDate,
                                        time: sessionTime,
                                        price: session.price ?? 0,
                                        deadlineHours: deadlineHoursForEmail,
                                        paymentTiming,
                                        paymentUrl,
                                    },
                                });
                            }
                        }
                    }
                }
            } else {
                skipped.push(session.id);
            }
        }

        return res.status(200).json({
            success: true,
            checkedAt: now.toISOString(),
            warned: warned.length,
            skipped: skipped.length,
            warnedIds: warned,
        });
    } catch (err: any) {
        console.error('payment-deadline-warnings error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
}
