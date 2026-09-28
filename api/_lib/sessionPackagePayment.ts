import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

/**
 * Session checkouts can settle a linked trial package without package metadata.
 * Receipts and fee recording stay with the session payment. Larger packages
 * still require package checkout; paying one lesson cannot settle their balance.
 */
export async function markLinkedPackagePaidForSession(
    supabase: SupabaseClient,
    sessionId: string,
    checkout: Stripe.Checkout.Session,
): Promise<boolean> {
    if (checkout.payment_status !== 'paid'
        || checkout.metadata?.tutlio_session_id !== sessionId
        || checkout.metadata?.is_penalty_payment === 'true') {
        return false;
    }

    const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('student_id, lesson_package_id, paid')
        .eq('id', sessionId)
        .maybeSingle();

    if (sessionError) {
        throw new Error(`Could not load session for package payment sync: ${sessionError.message}`);
    }
    if (!session?.paid || !session.lesson_package_id) return false;

    // Run even when the session was already paid, so a retry repairs an earlier
    // package-write failure. Only the first caller can transition the package.
    const { data: updatedPackage, error: packageError } = await supabase
        .from('lesson_packages')
        .update({
            paid: true,
            payment_status: 'paid',
            paid_at: new Date().toISOString(),
            active: true,
            stripe_checkout_session_id: checkout.id,
        })
        .eq('id', session.lesson_package_id)
        .eq('student_id', session.student_id)
        .eq('total_lessons', 1)
        .eq('paid', false)
        .neq('payment_status', 'cancelled')
        .select('id')
        .maybeSingle();

    if (packageError) {
        throw new Error(`Could not sync linked package payment: ${packageError.message}`);
    }
    return Boolean(updatedPackage);
}
