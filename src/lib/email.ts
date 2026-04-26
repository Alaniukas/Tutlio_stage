// ─── Email Helper ────────────────────────────────────────────────────────────
// Fire-and-forget email sender. Calls the /api/send-email Vercel serverless fn.
// Never throws – logs errors to console so it doesn't block UI.

import { supabase } from '@/lib/supabase';

type EmailType =
    | 'booking_confirmation'
    | 'booking_notification'
    | 'org_tutor_availability_notice'
    | 'session_cancelled'
    | 'session_reminder'
    | 'package_depleted_notification'
    | 'payment_rejection_reminder'
    | 'invite_email'
    | 'recurring_booking_confirmation'
    | 'lesson_rescheduled'
    | 'waitlist_matched_student'
    | 'waitlist_matched_tutor'
    | 'payment_review_needed'
    | 'stripe_payment_forwarding'
    | 'payment_success'
    | 'lesson_confirmed_tutor'
    | 'payment_received_tutor'
    | 'payment_failed'
    | 'session_comment_added'
    | 'tutor_student_assigned'
    | 'school_contract'
    | 'school_installment_request';

interface SendEmailParams {
    type: EmailType;
    to: string | string[];
    data: Record<string, any>;
}

export async function sendEmail({ type, to, data }: SendEmailParams): Promise<boolean> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers,
            body: JSON.stringify({ type, to, data }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const msg = (err && typeof err === 'object' && 'error' in err) ? String(err.error) : 'Request failed';
            console.error('[Email] Failed to send:', msg, response.status);
            return false;
        }

        if (import.meta.env?.DEV) {
            console.log(`[Email] ✅ ${type} sent to ${Array.isArray(to) ? to.join(', ') : to}`);
        }
        return true;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[Email] Error:', message);
        return false;
    }
}
