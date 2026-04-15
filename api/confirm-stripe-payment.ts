import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { syncSessionToGoogle } from './_lib/google-calendar.js';
import { verifyRequestAuth } from './_lib/auth.js';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

function getStripe() {
    return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
}

function getSupabase() {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await verifyRequestAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const { sessionId, checkoutSessionId } = req.body as { sessionId?: string; checkoutSessionId?: string };
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    if (!checkoutSessionId || typeof checkoutSessionId !== 'string') {
        return res.status(400).json({ error: 'checkoutSessionId is required' });
    }

    try {
        const supabase = getSupabase();
        const stripe = getStripe();

        // Retrieve the DB session (include tutor/organization Stripe account for Connect)
        const { data: sessionData, error: sessionErr } = await supabase
            .from('sessions')
            .select(`
                id, price, topic, student_id, tutor_id, start_time, end_time, paid, payment_status,
                stripe_checkout_session_id, meeting_link, credit_applied_amount,
                students!inner(full_name, email, payment_payer, payer_email, credit_balance),
                profiles!sessions_tutor_id_fkey(
                    full_name, email, cancellation_hours, cancellation_fee_percent,
                    organization_id, stripe_account_id
                )
            `)
            .eq('id', sessionId)
            .single();

        if (sessionErr || !sessionData) {
            return res.status(404).json({ error: 'Session not found', details: sessionErr?.message });
        }

        // Resolve Stripe Connect account (lesson payments go to tutor or org connected account)
        const tutorProfile = sessionData.profiles as any;
        let stripeAccountId: string | null = tutorProfile?.stripe_account_id || null;
        if (tutorProfile?.organization_id) {
            const { data: org } = await supabase
                .from('organizations')
                .select('stripe_account_id')
                .eq('id', tutorProfile.organization_id)
                .single();
            if (org?.stripe_account_id) stripeAccountId = org.stripe_account_id;
        }

        // Checkout kuriamas platformoje (destination charge); senesni UI – ant Connect paskyros.
        let isPaid = false;
        let checkoutSession: Stripe.Checkout.Session | null = null;
        try {
            checkoutSession = await stripe.checkout.sessions.retrieve(checkoutSessionId).catch(() => null);
            if (!checkoutSession && stripeAccountId) {
                checkoutSession = await stripe
                    .checkout.sessions.retrieve(checkoutSessionId, { stripeAccount: stripeAccountId } as any)
                    .catch(() => null);
            }
            if (!checkoutSession) {
                return res.status(400).json({
                    error: 'Could not find Stripe payment session. If payment was made – contact info@tutlio.lt.',
                });
            }
            const metaSid = checkoutSession.metadata?.tutlio_session_id;
            if (metaSid && metaSid !== sessionId) {
                return res.status(400).json({ error: 'This Stripe payment does not belong to this session' });
            }
            const dbCheckoutId = (sessionData as { stripe_checkout_session_id?: string | null }).stripe_checkout_session_id;
            if (!metaSid && dbCheckoutId && dbCheckoutId !== checkoutSessionId) {
                return res.status(400).json({ error: 'Invalid payment session' });
            }
            if (checkoutSession.payment_status === 'paid') {
                isPaid = true;
            }
        } catch (stripeErr: any) {
            console.error('[confirm-stripe-payment] Stripe retrieve error', stripeErr?.message || stripeErr);
            return res.status(400).json({
                error: 'Could not confirm payment with Stripe. If funds were charged – contact info@tutlio.lt.',
                details: stripeErr?.message
            });
        }

        if (isPaid) {
            // Update DB: paid + payment_status (required). stripe_checkout_session_id optional (column may not exist in all envs)
            const updatePayload: Record<string, unknown> = { paid: true, payment_status: 'paid' };
            if (checkoutSessionId) updatePayload.stripe_checkout_session_id = checkoutSessionId;

            let updatedSession: { tutor_id?: string } | null = null;
            const { data: updateData, error: updateErr } = await supabase
                .from('sessions')
                .update(updatePayload)
                .eq('id', sessionId)
                .eq('paid', false)
                .select('tutor_id')
                .maybeSingle();

            if (updateErr) {
                console.error('[confirm-stripe-payment] DB update error', updateErr);
                // Turi sutapti su updatePayload — kitaip lieka paid=true be stripe_checkout_session_id
                // ir vėlesnis refund per /api/cancel-penalty-resolution nebeveikia.
                const { data: retryData, error: retryErr } = await supabase
                    .from('sessions')
                    .update(updatePayload)
                    .eq('id', sessionId)
                    .eq('paid', false)
                    .select('tutor_id')
                    .maybeSingle();
                if (retryErr) {
                    return res.status(500).json({
                        error: 'Could not update session. If payment was made – contact info@tutlio.lt.',
                        details: updateErr.message
                    });
                }
                updatedSession = retryData;
            } else {
                updatedSession = updateData;
            }

            // Idempotency: concurrent webhook + StripeSuccess — only first update wins; skip duplicate emails
            if (!updatedSession) {
                return res.status(200).json({ success: true, already_paid: true });
            }

            // Deduct pending credit from student balance (set at checkout time)
            const creditApplied = Number((sessionData as any).credit_applied_amount || 0);
            if (creditApplied > 0) {
                const studentRecord = sessionData.students as any;
                const currentBalance = Number(studentRecord?.credit_balance || 0);
                await supabase
                    .from('students')
                    .update({ credit_balance: Math.max(0, currentBalance - creditApplied) })
                    .eq('id', sessionData.student_id);
            }

            // Sync this session to tutor's Google Calendar (reflect "paid" status in title/description)
            try {
                const tutorId = (updatedSession as any)?.tutor_id || sessionData.tutor_id;
                if (tutorId) {
                    await syncSessionToGoogle(sessionId, tutorId);
                }
            } catch (e) {
                console.error('[confirm-stripe-payment] Failed to sync Google Calendar:', e);
            }

            // Send notification emails
            const student = sessionData.students as any;
            const tutor = sessionData.profiles as any;

            // Optional pricing details (we might not have subject cancellation info exactly without join, but we have tutor defaults)
            const durationMs = new Date(sessionData.end_time).getTime() - new Date(sessionData.start_time).getTime();
            const durationMinutes = Math.round(durationMs / 60000);

            const sessionStart = new Date(sessionData.start_time);
            const dateStr = sessionStart.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' });
            const timeStr = sessionStart.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });

            const totalChargedEur =
                checkoutSession?.amount_total != null ? checkoutSession.amount_total / 100 : undefined;

            const emailData = {
                studentName: student.full_name,
                tutorName: tutor.full_name || 'Korepetitorius',
                date: dateStr,
                time: timeStr,
                subject: sessionData.topic,
                price: sessionData.price,
                lessonPriceEur: sessionData.price,
                totalChargedEur,
                duration: durationMinutes,
                cancellationHours: tutor.cancellation_hours ?? 24,
                cancellationFeePercent: tutor.cancellation_fee_percent ?? 0,
            };

            const sendEmailUrl = `${APP_URL}/api/send-email`;

            // Payer gets payment_success; if payer is parent, student also gets one (so they know the lesson is paid)
            const recipients = new Set<string>();
            if (student.email) {
                recipients.add(student.email);
            }
            if (student.payment_payer === 'parent' && student.payer_email) {
                recipients.add(student.payer_email);
            }

// Send confirmation to payer (parent or student) and optionally to student when parent paid
            for (const email of Array.from(recipients)) {
                try {
                    await fetch(sendEmailUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
                        body: JSON.stringify({
                            type: 'payment_success',
                            to: email,
                            data: emailData
                        })
                    });
                } catch (e) {
                    console.error('[confirm-stripe-payment] Failed to send email to', email, e);
                }
            }

            // Org tutor: lesson confirmed + join link (not "payment received"); solo tutor: unchanged
            if (tutor?.email) {
                try {
                    const isOrgTutor = Boolean(tutorProfile?.organization_id);
                    const tutorPayload = isOrgTutor
                        ? {
                            type: 'lesson_confirmed_tutor',
                            to: tutor.email,
                            data: {
                                studentName: student.full_name,
                                tutorName: tutor.full_name || 'Korepetitorius',
                                date: dateStr,
                                time: timeStr,
                                subject: sessionData.topic,
                                meetingLink: (sessionData as { meeting_link?: string | null }).meeting_link || ''
                            }
                        }
                        : {
                            type: 'payment_received_tutor',
                            to: tutor.email,
                            data: {
                                studentName: student.full_name,
                                tutorName: tutor.full_name || 'Korepetitorius',
                                date: dateStr,
                                time: timeStr,
                                subject: sessionData.topic,
                                price: sessionData.price
                            }
                        };
                    await fetch(sendEmailUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
                        body: JSON.stringify(tutorPayload)
                    });
                } catch (e) {
                    console.error('[confirm-stripe-payment] Failed to send tutor email', e);
                }
            }

            return res.status(200).json({ success: true });
        } else {
            return res.status(400).json({ error: 'Payment not successful yet' });
        }
    } catch (err: any) {
        console.error('[confirm-stripe-payment] Error:', err);
        return res.status(500).json({ error: err.message });
    }
}
