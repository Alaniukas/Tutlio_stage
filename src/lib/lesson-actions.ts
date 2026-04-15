import { supabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import { format } from 'date-fns';
import { t, detectLocaleFromHost } from '@/lib/i18n/core';

export async function cancelSessionAndFillWaitlist({
    sessionId,
    tutorId,
    reason,
    cancelledBy,
    studentName,
    tutorName,
    studentEmail,
    tutorEmail,
    cancellationHours,
    cancellationFeePercent,
}: {
    sessionId: string;
    tutorId: string;
    reason: string;
    cancelledBy: 'tutor' | 'student';
    studentName: string;
    tutorName: string;
    studentEmail: string | null;
    tutorEmail: string | null;
    cancellationHours?: number;
    cancellationFeePercent?: number;
}) {
    // 1. Mark session as cancelled
    const { data: session, error: cancelError } = await supabase
        .from('sessions')
        .update({
            status: 'cancelled',
            cancellation_reason: reason,
            cancelled_by: cancelledBy,
            cancelled_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .select('*')
        .single();

    if (cancelError || !session) return { success: false, error: cancelError };

    // 1b. Package credit handling with penalty support
    if (session.lesson_package_id) {
        const { data: pkg } = await supabase
            .from('lesson_packages')
            .select('available_lessons, reserved_lessons')
            .eq('id', session.lesson_package_id)
            .single();

        if (pkg) {
            // Tutor-initiated cancels: always return full credit (no penalty)
            // Student-initiated with penalty: fractional credit deduction
            const hoursValue = Number(cancellationHours ?? 24);
            const feePercent = Number(cancellationFeePercent ?? 0);
            const hoursLeft = (new Date(session.start_time).getTime() - Date.now()) / 3600000;
            const isLate = cancelledBy === 'student' && hoursLeft < hoursValue;
            const hasPenalty = isLate && feePercent > 0;
            const penaltyCredits = hasPenalty ? feePercent / 100 : 0;
            const creditsToReturn = 1 - penaltyCredits;

            await supabase
                .from('lesson_packages')
                .update({
                    available_lessons: Number(pkg.available_lessons || 0) + creditsToReturn,
                    reserved_lessons: Math.max(0, Number(pkg.reserved_lessons || 0) - 1),
                })
                .eq('id', session.lesson_package_id);

            if (hasPenalty) {
                const penaltyAmount = ((session.price ?? 0) * feePercent) / 100;
                await supabase.from('sessions').update({
                    is_late_cancelled: true,
                    cancellation_fee_percent_applied: feePercent,
                    cancellation_penalty_amount: penaltyAmount,
                    penalty_resolution: 'paid',
                }).eq('id', sessionId);
            }

            console.log(`[Cancel] Returned ${creditsToReturn} lesson credit(s) to package ${session.lesson_package_id}`);
        }
    }

    // 2. Send cancellation emails for original session
    const emailDate = format(new Date(session.start_time), 'yyyy-MM-dd');
    const emailTime = format(new Date(session.start_time), 'HH:mm');

    const isPaid = session.paid;
    const sessionPrice = session.price;
    const locale = typeof window !== 'undefined' ? detectLocaleFromHost(window.location.hostname) : 'lt';

    if (tutorEmail && cancelledBy === 'student') {
        sendEmail({
            type: 'session_cancelled',
            to: tutorEmail,
            data: {
                studentName, tutorName, date: emailDate, time: emailTime, cancelledBy, reason,
                hideRefund: true,
                locale,
            },
        });
    }
    if (studentEmail) {
        sendEmail({
            type: 'session_cancelled',
            to: studentEmail,
            data: {
                studentName, tutorName, date: emailDate, time: emailTime, cancelledBy, reason,
                isPaid, sessionPrice,
                locale,
            },
        });
    }

    // 3. Fetch tutor settings (min_booking_hours) and bank details
    const { data: tutorProfile } = await supabase
        .from('profiles')
        .select('min_booking_hours')
        .eq('id', tutorId)
        .single();

    // Only skip auto-fill if session is starting in less than 1 hour (relaxed from min_booking_hours)
    const oneHourBeforeSession = new Date(new Date(session.start_time).getTime() - 1 * 3600000);
    if (oneHourBeforeSession < new Date()) {
        console.log('[Waitlist] Session starts in less than 1 hour - skipping auto-fill');
        return { success: true };
    }

    console.log('[Waitlist] Looking for waitlist entries for session:', sessionId, 'tutor:', tutorId);

    // 4. Find waitlist entries - try specific session first, then generic queue
    // First try: exact session match
    let { data: waitlist } = await supabase
        .from('waitlists')
        .select(`
            id,
            student_id,
            session_id,
            preferred_day,
            preferred_time,
            student:students(full_name, email)
        `)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(1);

    console.log('[Waitlist] Specific session query result:', waitlist);

    // If no exact match, try generic queue for this tutor
    if (!waitlist || waitlist.length === 0) {
        console.log('[Waitlist] No specific match, checking generic queue for tutor:', tutorId);

        const { data: genericQueue } = await supabase
            .from('waitlists')
            .select(`
                id,
                student_id,
                session_id,
                preferred_day,
                preferred_time,
                student:students(full_name, email)
            `)
            .eq('tutor_id', tutorId)
            .is('session_id', null)
            .order('created_at', { ascending: true });

        console.log('[Waitlist] Generic queue result:', genericQueue);

        // Take first in generic queue (prefer matching preferences, but not critical for now)
        if (genericQueue && genericQueue.length > 0) {
            waitlist = [genericQueue[0]];
            console.log('[Waitlist] Using generic queue entry:', waitlist[0]);
        }
    }

    if (waitlist && waitlist.length > 0) {
        const nextInLine = waitlist[0];
        console.log('[Waitlist] Found student in line:', nextInLine);

        // 5. Create new active session for the waitlisted student
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
                paid: false
            }])
            .select()
            .single();

        if (createError) {
            console.error('[Waitlist] Error creating new session:', createError);
        }

        if (!createError && newSession) {
            console.log('[Waitlist] Successfully created new session:', newSession.id);
            // 6. Remove from waitlist
            await supabase.from('waitlists').delete().eq('id', nextInLine.id);

            const sData = Array.isArray(nextInLine.student) ? nextInLine.student[0] : nextInLine.student;

            // 7. Send waitlist matched emails
            if (sData?.email) {
                sendEmail({
                    type: 'waitlist_matched_student',
                    to: sData.email as string,
                    data: {
                        studentName: (sData as any).full_name || t(locale, 'misc.studentFallback'),
                        tutorName,
                        date: emailDate,
                        time: emailTime,
                        price: session.price?.toString() || '0',
                        sessionId: newSession.id,
                        bankAccountName: null,
                        bankAccountNumber: null,
                        paymentPurpose: null,
                        locale,
                    }
                });
            }

            if (tutorEmail) {
                sendEmail({
                    type: 'waitlist_matched_tutor',
                    to: tutorEmail,
                    data: {
                        studentName: (sData as any).full_name || t(locale, 'misc.studentFallback'),
                        tutorName,
                        date: emailDate,
                        time: emailTime,
                        locale,
                    }
                });
            }
        }
    } else {
        console.log('[Waitlist] No waitlist entries found - session cancelled without auto-fill');
    }

    return { success: true };
}
