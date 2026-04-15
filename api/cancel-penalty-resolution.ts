// ─── Vercel Serverless Function: Resolve Late Cancellation Penalty ────────────
// POST /api/cancel-penalty-resolution
// For per-lesson paid sessions: student chooses credit toward next lesson or refund.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';

function paymentIntentIdFromCheckout(cs: { payment_intent?: unknown }): string | null {
    const pi = cs.payment_intent;
    if (typeof pi === 'string') return pi;
    if (pi && typeof pi === 'object' && pi !== null && 'id' in pi) {
        const id = (pi as { id?: unknown }).id;
        if (typeof id === 'string') return id;
    }
    return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const auth = await verifyRequestAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const { sessionId, choice } = req.body as {
        sessionId: string;
        choice: 'credit' | 'refund';
    };

    if (!sessionId || !choice || !['credit', 'refund'].includes(choice)) {
        return res.status(400).json({ error: 'Missing or invalid sessionId / choice' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Missing Supabase env vars' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: session, error: sessErr } = await supabase
        .from('sessions')
        .select('id, student_id, price, paid, penalty_resolution, cancellation_penalty_amount, stripe_checkout_session_id, tutor_id')
        .eq('id', sessionId)
        .single();

    if (sessErr || !session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const { data: tutorProfile } = await supabase
        .from('profiles')
        .select('organization_id, stripe_account_id')
        .eq('id', session.tutor_id)
        .maybeSingle();
    const manualRefundContact: 'tutor' | 'org_admin' = tutorProfile?.organization_id ? 'org_admin' : 'tutor';

    let connectStripeAccountId: string | null = tutorProfile?.stripe_account_id || null;
    if (tutorProfile?.organization_id) {
        const { data: orgRow } = await supabase
            .from('organizations')
            .select('stripe_account_id')
            .eq('id', tutorProfile.organization_id)
            .maybeSingle();
        if (orgRow?.stripe_account_id) connectStripeAccountId = orgRow.stripe_account_id;
    }

    if (session.penalty_resolution !== 'pending') {
        return res.status(400).json({ error: 'Penalty already resolved', current: session.penalty_resolution });
    }

    const penaltyAmount = Number(session.cancellation_penalty_amount || 0);
    const sessionPrice = Number(session.price || 0);
    const refundableAmount = sessionPrice - penaltyAmount;

    if (choice === 'credit') {
        if (refundableAmount > 0) {
            const { data: student } = await supabase
                .from('students')
                .select('credit_balance')
                .eq('id', session.student_id)
                .single();

            const currentBalance = Number(student?.credit_balance || 0);
            await supabase
                .from('students')
                .update({ credit_balance: currentBalance + refundableAmount })
                .eq('id', session.student_id);
        }

        await supabase
            .from('sessions')
            .update({ penalty_resolution: 'credit_applied' })
            .eq('id', sessionId);

        return res.status(200).json({ success: true, creditAdded: refundableAmount });
    }

    // choice === 'refund'
    if (refundableAmount <= 0) {
        await supabase
            .from('sessions')
            .update({ penalty_resolution: 'refunded' })
            .eq('id', sessionId);
        return res.status(200).json({ success: true, refundedAmount: 0 });
    }

    // Stripe refund: platform Checkout + PaymentIntent su metadata tutlio_session_id
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
        await supabase.from('sessions').update({ penalty_resolution: 'refunded' }).eq('id', sessionId);
        return res.status(200).json({
            success: true,
            refundedAmount: refundableAmount,
            refundFollowUp: { kind: 'manual', contact: manualRefundContact },
            note: 'Stripe not configured.',
        });
    }

    const refundInfo: {
        dbHadCheckoutId: boolean;
        checkoutRetrieved: boolean;
        checkoutPaymentStatus: string | null;
        paymentIntentFromCheckout: boolean;
        searchAttempted: boolean;
        searchResultCount: number;
        searchError: string | null;
        resolvedPaymentIntentId: string | null;
        refundCents: number | null;
        stripeRefundCreated: boolean;
    } = {
        dbHadCheckoutId: Boolean(session.stripe_checkout_session_id),
        checkoutRetrieved: false,
        checkoutPaymentStatus: null,
        paymentIntentFromCheckout: false,
        searchAttempted: false,
        searchResultCount: 0,
        searchError: null,
        resolvedPaymentIntentId: null,
        refundCents: null,
        stripeRefundCreated: false,
    };

    try {
        const { default: Stripe } = await import('stripe');
        const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' as any });

        let paymentIntentId: string | null = null;

        const retrieveOpts = { expand: ['payment_intent'] as string[] };

        const retrieveCheckout = async (checkoutId: string) => {
            try {
                return await stripe.checkout.sessions.retrieve(checkoutId, retrieveOpts);
            } catch {
                if (!connectStripeAccountId) return null;
                try {
                    return await stripe.checkout.sessions.retrieve(checkoutId, {
                        ...retrieveOpts,
                        stripeAccount: connectStripeAccountId,
                    } as any);
                } catch {
                    return null;
                }
            }
        };

        if (session.stripe_checkout_session_id) {
            const cs = await retrieveCheckout(session.stripe_checkout_session_id);
            if (cs) {
                refundInfo.checkoutRetrieved = true;
                refundInfo.checkoutPaymentStatus = cs.payment_status || null;
            }
            if (cs && cs.payment_status === 'paid') {
                paymentIntentId = paymentIntentIdFromCheckout(cs);
                if (paymentIntentId) refundInfo.paymentIntentFromCheckout = true;
            }
        }

        if (!paymentIntentId) {
            refundInfo.searchAttempted = true;
            try {
                const searchRes = await stripe.paymentIntents.search({
                    query: `metadata['tutlio_session_id']:'${sessionId}' AND status:'succeeded'`,
                    limit: 10,
                });
                const succeeded = (searchRes.data || []).filter((p) => p.status === 'succeeded');
                refundInfo.searchResultCount = succeeded.length;
                succeeded.sort((a, b) => (b.created || 0) - (a.created || 0));
                const lessonPi = succeeded.find((p) => p.metadata?.is_penalty_payment !== 'true');
                paymentIntentId = (lessonPi || succeeded[0])?.id || null;
            } catch (searchErr: any) {
                refundInfo.searchError = searchErr?.message || String(searchErr);
                console.error('[cancel-penalty-resolution] PaymentIntent search failed:', searchErr);
            }
        }

        refundInfo.resolvedPaymentIntentId = paymentIntentId;

        if (!paymentIntentId) {
            await supabase.from('sessions').update({ penalty_resolution: 'refunded' }).eq('id', sessionId);
            return res.status(200).json({
                success: true,
                refundedAmount: refundableAmount,
                refundFollowUp: { kind: 'manual', contact: manualRefundContact },
                note: 'No Stripe PaymentIntent found for this lesson (missing checkout id or search empty).',
                refundInfo,
            });
        }

        const refundCents = Math.round(refundableAmount * 100);
        refundInfo.refundCents = refundCents;

        await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: refundCents,
            metadata: { tutlio_session_id: sessionId, reason: 'late_cancel_partial_refund' },
        });
        refundInfo.stripeRefundCreated = true;

        await supabase.from('sessions').update({ penalty_resolution: 'refunded' }).eq('id', sessionId);

        return res.status(200).json({
            success: true,
            refundedAmount: refundableAmount,
            refundFollowUp: { kind: 'stripe' },
            refundInfo,
        });
    } catch (err: any) {
        console.error('Stripe refund error:', err);
        return res.status(500).json({
            error: 'Stripe refund failed',
            details: err.message,
            refundInfo: { ...refundInfo, stripeRefundCreated: false },
        });
    }
}
