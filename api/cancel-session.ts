// ─── Vercel Serverless Function: Cancel Session + Fill Waitlist ───────────────
// POST /api/cancel-session
// Uses service role key to bypass RLS so waitlist can be read regardless of who cancels.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { lt } from 'date-fns/locale';
import { deleteSessionFromGoogle, syncSessionToGoogle } from './_lib/google-calendar.js';
import { verifyRequestAuth } from './_lib/auth.js';

async function sendEmail(body: object) {
    const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000';
    try {
        await fetch(`${baseUrl}/api/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
            body: JSON.stringify(body),
        });
    } catch (e) {
        console.error('sendEmail error:', e);
    }
}

async function sendEmailWithTimeout(body: object, timeoutMs = 2500) {
    return await Promise.race([
        sendEmail(body),
        new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await verifyRequestAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const {
        sessionId,
        tutorId,
        reason,
        cancelledBy,
        studentName,
        tutorName,
        studentEmail,
        tutorEmail,
        payerEmail,
        cancellationHours,
        cancellationFeePercent,
        penaltyPaidViaStripe,
    } = req.body as {
        sessionId: string;
        tutorId: string;
        reason: string;
        cancelledBy: 'tutor' | 'student';
        studentName: string;
        tutorName: string;
        studentEmail: string | null;
        tutorEmail: string | null;
        payerEmail?: string | null;
        cancellationHours?: number;
        cancellationFeePercent?: number;
        penaltyPaidViaStripe?: boolean;
    };

    const normEmail = (e: string | null | undefined) =>
        (e || '').trim().toLowerCase();

    if (!sessionId || !tutorId) {
        return res.status(400).json({ error: 'Missing sessionId or tutorId' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Missing Supabase env vars' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Mark session as cancelled
    const { data: session, error: cancelError } = await supabase
        .from('sessions')
        .update({
            status: 'cancelled',
            cancellation_reason: reason,
            cancelled_by: cancelledBy,  // Track who cancelled (tutor or student)
            cancelled_at: new Date().toISOString()  // Track when cancelled for auto-hide
        })
        .eq('id', sessionId)
        .select('*')
        .single();

    if (cancelError || !session) {
        console.error('Cancel error:', cancelError);
        return res.status(500).json({ error: 'Failed to cancel session', details: cancelError });
    }

    // If this is a group lesson, increment available_spots on all other sessions at this time
    if (session.subject_id) {
        const { data: subject } = await supabase
            .from('subjects')
            .select('is_group')
            .eq('id', session.subject_id)
            .maybeSingle();

        if (subject?.is_group) {
            // Fetch all other group sessions at this time
            const { data: otherSessions } = await supabase
                .from('sessions')
                .select('id, available_spots')
                .eq('tutor_id', tutorId)
                .eq('start_time', session.start_time)
                .eq('subject_id', session.subject_id)
                .neq('id', sessionId)
                .neq('status', 'cancelled');

            // Increment available_spots on each
            if (otherSessions && otherSessions.length > 0) {
                for (const otherSession of otherSessions) {
                    const newSpots = (otherSession.available_spots ?? 0) + 1;
                    await supabase
                        .from('sessions')
                        .update({ available_spots: newSpots })
                        .eq('id', otherSession.id);
                }
            }
        }
    }

    // Delete from Google Calendar (if synced) in background to keep cancellation fast
    deleteSessionFromGoogle(sessionId, tutorId).catch((err) => {
        console.error('Failed to delete from Google Calendar:', err);
    });

    // OPTIMIZED: Send emails in parallel fire-and-forget (don't await at all)
    const emailDate = format(new Date(session.start_time), 'yyyy-MM-dd');
    const emailTime = format(new Date(session.start_time), 'HH:mm');
    const isPaid = session.paid;
    const sessionPrice = session.price;

    const packageId = (session as any).lesson_package_id as string | null | undefined;

    const { data: studentModelRow } = await supabase
        .from('students')
        .select('payment_model')
        .eq('id', session.student_id)
        .maybeSingle();
    const paymentModelEarly = studentModelRow?.payment_model || 'per_lesson';

    // If there's a pending credit/refund choice (per_lesson, paid, student cancel),
    // hide automatic refund wording from student email — the UI handles selection
    const sessionStart = new Date(session.start_time).getTime();
    const nowMs = Date.now();
    const cancellationHoursValue = Number(cancellationHours ?? 24);
    const cancellationFeePercentValue = Number(cancellationFeePercent ?? 0);
    const hoursLeft = (sessionStart - nowMs) / 3600000;
    const isLateCancel = hoursLeft < cancellationHoursValue && cancelledBy === 'student';
    const hasPenaltyFee = isLateCancel && cancellationFeePercentValue > 0;
    const willHavePendingPenalty =
        hasPenaltyFee &&
        isPaid &&
        !packageId &&
        !penaltyPaidViaStripe &&
        paymentModelEarly === 'per_lesson';
    const willHaveEarlyRefundChoice =
        cancelledBy === 'student' &&
        !hasPenaltyFee &&
        isPaid &&
        !packageId &&
        paymentModelEarly === 'per_lesson';
    const hideStudentRefund = willHavePendingPenalty || willHaveEarlyRefundChoice;

    if (tutorEmail && cancelledBy === 'student') {
        void sendEmailWithTimeout({
            type: 'session_cancelled',
            to: tutorEmail,
            data: {
                studentName, tutorName, date: emailDate, time: emailTime, cancelledBy, reason,
                hideRefund: true,
                locale: 'lt',
            },
        }, 1500);
    }
    if (studentEmail) {
        void sendEmailWithTimeout({
            type: 'session_cancelled',
            to: studentEmail,
            data: {
                studentName, tutorName, date: emailDate, time: emailTime, cancelledBy, reason,
                isPaid: hideStudentRefund ? false : isPaid,
                sessionPrice: hideStudentRefund ? null : sessionPrice,
                locale: 'lt',
            },
        }, 1500);
    }

    const payerTrim = (payerEmail || '').trim();
    if (
        cancelledBy === 'student' &&
        payerTrim &&
        normEmail(payerTrim) !== normEmail(studentEmail)
    ) {
        void sendEmailWithTimeout({
            type: 'session_cancelled_parent',
            to: payerTrim,
            data: {
                studentName,
                tutorName,
                date: emailDate,
                time: emailTime,
                cancelledBy,
                reason,
                locale: 'lt',
            },
        }, 1500);
    }

    // ── Penalty + Package credit handling ──────────────────────────────────────
    const basePriceForPenalty = session.price ?? 0;
    const penaltyAmount = hasPenaltyFee ? (basePriceForPenalty * cancellationFeePercentValue) / 100 : 0;

    if (packageId) {
        // ── PACKAGE payment model ──
        const { data: pkg } = await supabase
            .from('lesson_packages')
            .select('available_lessons, reserved_lessons')
            .eq('id', packageId)
            .maybeSingle();

        if (pkg) {
            const penaltyCredits = hasPenaltyFee ? cancellationFeePercentValue / 100 : 0;
            const creditsToReturn = 1 - penaltyCredits;

            await supabase
                .from('lesson_packages')
                .update({
                    available_lessons: Number(pkg.available_lessons || 0) + creditsToReturn,
                    reserved_lessons: Math.max(0, Number(pkg.reserved_lessons || 0) - 1),
                })
                .eq('id', packageId);
        }

        if (hasPenaltyFee) {
            await supabase.from('sessions').update({
                is_late_cancelled: true,
                cancellation_fee_percent_applied: cancellationFeePercentValue,
                cancellation_penalty_amount: penaltyAmount,
                penalty_resolution: 'paid',
            }).eq('id', sessionId);
        }
    } else if (hasPenaltyFee) {
        // ── NON-PACKAGE late cancellation ──
        const paymentModel = paymentModelEarly;

        if (paymentModel === 'monthly_billing') {
            // Monthly billing: mark for inclusion in next invoice
            await supabase.from('sessions').update({
                is_late_cancelled: true,
                cancellation_fee_percent_applied: cancellationFeePercentValue,
                cancellation_penalty_amount: penaltyAmount,
                penalty_resolution: 'invoiced',
            }).eq('id', sessionId);
        } else {
            // Per-lesson: if penalty was just paid via Stripe or session wasn't paid, it's resolved.
            // Only show credit/refund choice if session was paid in full before cancel.
            const resolution = (penaltyPaidViaStripe || !isPaid) ? 'paid' : 'pending';
            await supabase.from('sessions').update({
                is_late_cancelled: true,
                cancellation_fee_percent_applied: cancellationFeePercentValue,
                cancellation_penalty_amount: penaltyAmount,
                penalty_resolution: resolution,
            }).eq('id', sessionId);
        }
    }

    let needsPenaltyChoice = false;
    if (
        cancelledBy === 'student' &&
        !packageId &&
        paymentModelEarly === 'per_lesson' &&
        isPaid &&
        !penaltyPaidViaStripe
    ) {
        if (!hasPenaltyFee) {
            await supabase
                .from('sessions')
                .update({
                    cancellation_penalty_amount: 0,
                    penalty_resolution: 'pending',
                    is_late_cancelled: false,
                })
                .eq('id', sessionId);
        }
        needsPenaltyChoice = true;
    }

    res.status(200).json({ success: true, penaltyAmount, isLate: hasPenaltyFee, needsPenaltyChoice });

    // ── Background: waitlist auto-fill ────────────────────────────────────────
    void (async () => {
        try {
            // Only skip auto-fill if session is starting in less than 1 hour.
            const oneHourBeforeSession = new Date(new Date(session.start_time).getTime() - 1 * 3600000);
            if (oneHourBeforeSession < new Date()) {
                console.log('[Waitlist API] Session starts in less than 1 hour - skipping auto-fill');
                return;
            }

            console.log('[Waitlist API] Looking for waitlist entries for session:', sessionId, 'tutor:', tutorId);

            // First try: exact session match
            let { data: waitlist } = await supabase
                .from('waitlists')
                .select(`id, student_id, session_id, preferred_day, preferred_time, student:students(full_name, email)`)
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true })
                .limit(1);

            // If no exact match, try generic queue for this tutor
            if (!waitlist || waitlist.length === 0) {
                const sessionDay = format(new Date(session.start_time), 'EEEE', { locale: lt }).toLowerCase();
                const sessionTime = format(new Date(session.start_time), 'HH:mm');

                const { data: genericQueue } = await supabase
                    .from('waitlists')
                    .select(`id, student_id, session_id, preferred_day, preferred_time, student:students(full_name, email)`)
                    .eq('tutor_id', tutorId)
                    .is('session_id', null)
                    .order('created_at', { ascending: true });

                if (genericQueue && genericQueue.length > 0) {
                    const matched = genericQueue.find(w => {
                        if (!w.preferred_day && !w.preferred_time) return true;
                        const dayMatch = !w.preferred_day || w.preferred_day.toLowerCase() === sessionDay;
                        const timeMatch = !w.preferred_time || w.preferred_time === sessionTime;
                        return dayMatch && timeMatch;
                    });

                    waitlist = matched ? [matched] : [genericQueue[0]];
                }
            }

            if (!waitlist || waitlist.length === 0) {
                console.log('[Waitlist API] No waitlist entries found - session cancelled without auto-fill');
                return;
            }

            const nextInLine = waitlist[0];

            const { data: newSession, error: createError } = await supabase
                .from('sessions')
                .insert([{
                    tutor_id: tutorId,
                    student_id: nextInLine.student_id,
                    start_time: session.start_time,
                    end_time: session.end_time,
                    topic: session.topic,
                    status: 'active',
                    price: session.price,
                    payment_status: 'pending',
                    paid: false,
                }])
                .select()
                .single();

            if (createError || !newSession) {
                console.error('[Waitlist API] Error creating new session:', createError);
                return;
            }

            // Sync new session to Google Calendar
            syncSessionToGoogle(newSession.id, tutorId).catch((err) => {
                console.error('Failed to sync new session to Google Calendar:', err);
            });

            // Remove from waitlist
            await supabase.from('waitlists').delete().eq('id', nextInLine.id);

            const sData = Array.isArray(nextInLine.student) ? nextInLine.student[0] : nextInLine.student;

            // OPTIMIZED: Send waitlist matched emails in parallel fire-and-forget
            if (sData?.email) {
                void sendEmailWithTimeout({
                    type: 'waitlist_matched_student',
                    to: sData.email as string,
                    data: {
                        studentName: (sData as any).full_name || 'Mokinys',
                        tutorName,
                        date: emailDate,
                        time: emailTime,
                        price: session.price?.toString() || '0',
                        sessionId: newSession.id,
                        bankAccountName: null,
                        bankAccountNumber: null,
                        paymentPurpose: null,
                        locale: 'lt',
                    },
                }, 2000);
            }

            if (tutorEmail) {
                void sendEmailWithTimeout({
                    type: 'waitlist_matched_tutor',
                    to: tutorEmail,
                    data: {
                        studentName: (sData as any).full_name || 'Mokinys',
                        tutorName,
                        date: emailDate,
                        time: emailTime,
                        locale: 'lt',
                    },
                }, 2000);
            }
        } catch (e) {
            console.error('[Waitlist API] Background fill failed:', e);
        }
    })();
}
