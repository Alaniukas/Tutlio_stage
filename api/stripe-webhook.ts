import { Buffer } from 'buffer';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { tryIssueSalesInvoiceForStripePackage } from './_lib/issuePackageSalesInvoice.js';
import { syncSessionToGoogle } from './_lib/google-calendar.js';

const getStripe = () => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return null;
    return new Stripe(key, { apiVersion: '2023-10-16' as any });
};

const getSupabase = () => {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
};

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

export const config = {
    api: {
        bodyParser: false,
    },
};

async function buffer(readable: NodeJS.ReadableStream) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of readable) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks);
}

function getStripeId(value: unknown): string | null {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null && 'id' in (value as any)) {
        const id = (value as any).id;
        return typeof id === 'string' ? id : null;
    }
    return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).send('Method not allowed');

    const stripe = getStripe();
    const supabase = getSupabase();
    if (!stripe) {
        console.error('[stripe-webhook] Missing STRIPE_SECRET_KEY');
        return res.status(500).send('Server misconfigured: STRIPE_SECRET_KEY missing');
    }
    if (!supabase) {
        console.error('[stripe-webhook] Missing Supabase env vars (SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
        return res.status(500).send('Server misconfigured: Supabase env missing');
    }

    let buf: Buffer;
    try {
        buf = await buffer(req);
    } catch (e) {
        return res.status(400).send(`Error reading body: ${e}`);
    }

    // Some local dev servers/runtime layers may already consume the stream and populate req.body as an object.
    // In that case we can re-stringify to recover a stable payload for signature verification.
    if ((!buf || buf.length === 0) && (req as any).body && typeof (req as any).body === 'object') {
        try {
            buf = Buffer.from(JSON.stringify((req as any).body), 'utf8');
        } catch {
            // keep buf as-is
        }
    }
    
    const sigHeader = req.headers['stripe-signature'];
    const sig = Array.isArray(sigHeader) ? sigHeader[0] : (sigHeader as string | undefined);
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    try {
        if (!webhookSecret) {
            console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set — refusing to process unverified event');
            return res.status(500).send('Server misconfigured: STRIPE_WEBHOOK_SECRET missing');
        }
        event = stripe.webhooks.constructEvent(buf, sig ?? '', webhookSecret);
    } catch (err: any) {
        console.error(`[stripe-webhook] Webhook signature verification failed: ${err.message}`);
        console.error('[stripe-webhook] Raw body diagnostics:', {
            bufLen: buf?.length ?? null,
            bodyType: typeof (req as any).body,
            hasSig: Boolean(sig && String(sig).length > 0),
            contentType: req.headers['content-type'],
        });
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
        // ─── Subscription Events ─────────────────────────────────────────────────────
        if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = getStripeId(subscription.customer);
            if (!customerId) {
                console.warn('[stripe-webhook] Missing customer id in subscription event');
                return res.json({ received: true });
            }
            const isCanceledOrScheduled = subscription.status === 'canceled' || (subscription as any).cancel_at_period_end === true;

            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('stripe_customer_id', customerId)
                .maybeSingle();

            if (profile) {
                let subToUse: Stripe.Subscription = subscription;
                if (isCanceledOrScheduled) {
                    const all = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
                    const otherActive = all.data.find(s => s.id !== subscription.id && (s.status === 'active' || s.status === 'trialing'));
                    if (otherActive) {
                        subToUse = otherActive;
                        console.log(`[stripe-webhook] Ignoring canceled sub ${subscription.id}, using active sub ${otherActive.id} for profile ${profile.id}`);
                    }
                }
                const subOnlyPriceId = process.env.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID;
                const priceItem = subToUse.items.data[0];
                const plan = priceItem?.price.id === subOnlyPriceId
                    ? 'subscription_only'
                    : priceItem?.price.recurring?.interval === 'year' ? 'yearly' : 'monthly';
                const periodEnd = new Date((subToUse as Stripe.Subscription & { current_period_end: number }).current_period_end * 1000).toISOString();
                const statusToSave = subToUse.status === 'canceled' || (subToUse as any).cancel_at_period_end ? 'canceled' : subToUse.status;
                const isTrialing = statusToSave === 'trialing';

                await supabase
                    .from('profiles')
                    .update({
                        stripe_subscription_id: subToUse.id,
                        subscription_status: statusToSave,
                        subscription_plan: plan,
                        subscription_current_period_end: periodEnd,
                        ...(isTrialing && { trial_used: true }),
                    })
                    .eq('id', profile.id);

                console.log(`[stripe-webhook] Subscription ${statusToSave} for profile ${profile.id}`);
            }
        } else if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = getStripeId(subscription.customer);
            if (!customerId) {
                console.warn('[stripe-webhook] Missing customer id in subscription.deleted event');
                return res.json({ received: true });
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('stripe_customer_id', customerId)
                .maybeSingle();

            if (profile) {
                const all = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
                const otherActive = all.data.find(s => s.id !== subscription.id && (s.status === 'active' || s.status === 'trialing'));
                if (otherActive) {
                    const subOnlyPriceId = process.env.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID;
                    const otherPriceId = otherActive.items.data[0]?.price?.id;
                    const plan = otherPriceId === subOnlyPriceId
                        ? 'subscription_only'
                        : otherActive.items.data[0]?.price.recurring?.interval === 'year'
                            ? 'yearly'
                            : 'monthly';
                    const periodEnd = new Date((otherActive as Stripe.Subscription & { current_period_end: number }).current_period_end * 1000).toISOString();
                    const statusToSave = (otherActive as any).cancel_at_period_end ? 'canceled' : otherActive.status;
                    await supabase
                        .from('profiles')
                        .update({
                            stripe_subscription_id: otherActive.id,
                            subscription_status: statusToSave,
                            subscription_plan: plan,
                            subscription_current_period_end: periodEnd,
                        })
                        .eq('id', profile.id);
                    console.log(`[stripe-webhook] Subscription deleted but found active sub ${otherActive.id}, updated profile ${profile.id}`);
                } else {
                    await supabase
                        .from('profiles')
                        .update({
                            subscription_status: 'canceled',
                            subscription_current_period_end: new Date((subscription as Stripe.Subscription & { current_period_end: number }).current_period_end * 1000).toISOString(),
                        })
                        .eq('id', profile.id);
                    console.log(`[stripe-webhook] Subscription canceled for profile ${profile.id}`);
                }
            }
        } else if (event.type === 'invoice.payment_succeeded') {
            const invoice = event.data.object as Stripe.Invoice;

            // Only handle subscription invoices
            if ((invoice as Stripe.Invoice & { subscription?: string | null }).subscription) {
                const customerId = getStripeId(invoice.customer);
                if (!customerId) {
                    console.warn('[stripe-webhook] Missing customer id in invoice.payment_succeeded');
                    return res.json({ received: true });
                }

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('stripe_customer_id', customerId)
                    .maybeSingle();

                if (profile) {
                    await supabase
                        .from('profiles')
                        .update({ subscription_status: 'active' })
                        .eq('id', profile.id);

                    console.log(`[stripe-webhook] Invoice paid for profile ${profile.id}`);
                }
            }
        } else if (event.type === 'invoice.payment_failed') {
            const invoice = event.data.object as Stripe.Invoice;

            // Only handle subscription invoices
            if ((invoice as Stripe.Invoice & { subscription?: string | null }).subscription) {
                const customerId = getStripeId(invoice.customer);
                if (!customerId) {
                    console.warn('[stripe-webhook] Missing customer id in invoice.payment_failed');
                    return res.json({ received: true });
                }

                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id, email, full_name')
                    .eq('stripe_customer_id', customerId)
                    .maybeSingle();

                if (profile) {
                    await supabase
                        .from('profiles')
                        .update({ subscription_status: 'past_due' })
                        .eq('id', profile.id);

                    console.log(`[stripe-webhook] Payment failed for profile ${profile.id}`);

                    // TODO: Send email notification about failed payment
                }
            }
        }

        // ─── Lesson Payment Events ───────────────────────────────────────────────────
        else if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
            const session = event.data.object as Stripe.Checkout.Session;

            // Handle subscription checkout completion
            if (session.mode === 'subscription') {
                const customerId = getStripeId(session.customer);
                const subscriptionId = getStripeId(session.subscription);
                if (!customerId || !subscriptionId) {
                    console.warn('[stripe-webhook] Missing customer/subscription id in checkout.session.completed subscription mode');
                    return res.json({ received: true });
                }

                // Create or update profile with customer ID
                // Note: At this point, user might not be registered yet
                // We'll store this in a temporary way or handle it during registration
                console.log(`[stripe-webhook] Subscription checkout completed for customer ${customerId}`);

                // Get subscription details to update profile
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);

                // Try to find profile by email (in case user already exists)
                if (session.customer_email) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('email', session.customer_email)
                        .maybeSingle();

                    if (profile) {
                        const subOnlyPriceId = process.env.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID;
                        const currentPriceId = subscription.items.data[0]?.price?.id;
                        const plan = currentPriceId === subOnlyPriceId
                            ? 'subscription_only'
                            : subscription.items.data[0]?.price.recurring?.interval === 'year'
                                ? 'yearly'
                                : 'monthly';
                        const isTrialing = subscription.status === 'trialing';

                        await supabase
                            .from('profiles')
                            .update({
                                stripe_customer_id: customerId,
                                stripe_subscription_id: subscriptionId,
                                subscription_status: subscription.status,
                                subscription_plan: plan,
                                subscription_current_period_end: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
                                ...(isTrialing && { trial_used: true }),
                            })
                            .eq('id', profile.id);

                        console.log(`[stripe-webhook] Profile ${profile.id} updated with subscription`);
                    }
                }
            }
            // Yearly plan: one-time payment – grant 12 months access
            else if (session.mode === 'payment' && session.metadata?.plan === 'yearly' && session.customer_email) {
                const periodEnd = new Date();
                periodEnd.setMonth(periodEnd.getMonth() + 12);
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('email', session.customer_email)
                    .maybeSingle();
                if (profile) {
                    await supabase
                        .from('profiles')
                        .update({
                            stripe_customer_id: session.customer,
                            stripe_subscription_id: `yearly_${session.id}`,
                            subscription_status: 'active',
                            subscription_plan: 'yearly',
                            subscription_current_period_end: periodEnd.toISOString(),
                        })
                        .eq('id', profile.id);
                    console.log(`[stripe-webhook] Profile ${profile.id} updated with yearly one-time access`);
                }
            }
            // Handle prepaid package payment
            else if (session.payment_status === 'paid' && session.metadata?.tutlio_package_id) {
                const packageId = session.metadata.tutlio_package_id;

                console.log(`[stripe-webhook] Prepaid package payment completed: ${packageId}`);

                // Update package: mark as paid and active
                // Update only when transitioning from unpaid -> paid to avoid duplicate emails
                const { data: updatedPackage, error: updateErr } = await supabase
                    .from('lesson_packages')
                    .update({
                        paid: true,
                        payment_status: 'paid',
                        paid_at: new Date().toISOString(),
                        active: true,
                    })
                    .eq('id', packageId)
                    .eq('paid', false)
                    .select(
                        'id, tutor_id, total_lessons, available_lessons, total_price, payment_method, manual_sales_invoice_id, paid_at, students(full_name, email, payer_email, payer_name), subject:subjects(name)'
                    )
                    .maybeSingle();

                if (updateErr && updateErr.code !== 'PGRST116') {
                    console.error('[stripe-webhook] Error updating package:', updateErr);
                } else if (updatedPackage) {
                    const student = updatedPackage.students as any;
                    const subject = (updatedPackage as any).subject || (updatedPackage as any).subjects;
                    // Resolve tutor separately to avoid brittle relationship-name dependency in lesson_packages select.
                    const { data: tutor } = await supabase
                        .from('profiles')
                        .select('full_name, email')
                        .eq('id', (updatedPackage as any).tutor_id)
                        .maybeSingle();

                    // Send success email to both payer and student (if different)
                    const recipientPairs: Array<{ email: string; recipientName: string }> = [];
                    if (student.payer_email) {
                        recipientPairs.push({
                            email: student.payer_email,
                            recipientName: student.payer_name || student.full_name,
                        });
                    }
                    if (student.email && student.email !== student.payer_email) {
                        recipientPairs.push({
                            email: student.email,
                            recipientName: student.full_name,
                        });
                    }
                    if (tutor?.email) {
                        recipientPairs.push({
                            email: tutor.email,
                            recipientName: tutor.full_name || 'Korepetitoriau',
                        });
                    }

                    for (const r of recipientPairs) {
                        await fetch(`${APP_URL}/api/send-email`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
                            body: JSON.stringify({
                                type: 'prepaid_package_success',
                                to: r.email,
                                data: {
                                    recipientName: r.recipientName,
                                    studentName: student.full_name,
                                    tutorName: tutor?.full_name || 'Korepetitorius',
                                    subjectName: subject?.name || '–',
                                    totalLessons: updatedPackage.total_lessons,
                                    availableLessons: updatedPackage.available_lessons,
                                    totalPrice: updatedPackage.total_price.toFixed(2),
                                },
                            }),
                        }).catch(e => console.error('[stripe-webhook] Error sending package success email:', e));
                    }

                    console.log(`[stripe-webhook] Package ${packageId} activated successfully`);

                    // Mark any pre-payment invoices for this package as 'paid'
                    try {
                        const { data: invLineItems } = await supabase
                            .from('invoice_line_items')
                            .select('invoice_id, session_ids')
                            .contains('session_ids', [packageId]);
                        if (invLineItems?.length) {
                            const invoiceIds = [...new Set(invLineItems.map(li => li.invoice_id))];
                            await supabase.from('invoices').update({ status: 'paid' }).in('id', invoiceIds).eq('status', 'issued');
                        }
                    } catch (invErr) {
                        console.error('[stripe-webhook] Error updating invoice status:', invErr);
                    }

                    try {
                        await tryIssueSalesInvoiceForStripePackage(supabase, updatedPackage as any);
                    } catch (sfErr) {
                        console.error('[stripe-webhook] Auto S.F. for package failed (non-blocking):', sfErr);
                    }
                } else {
                    console.log(`[stripe-webhook] Package ${packageId} was already paid, skipping duplicate email`);
                }

                // If there are pre-created sessions tied to this package (e.g. trial lessons),
                // mark them as paid now so the UI doesn't show "awaiting payment".
                try {
                    const { data: paidSessions } = await supabase
                        .from('sessions')
                        .update({ paid: true, payment_status: 'paid' })
                        .eq('lesson_package_id', packageId)
                        .eq('paid', false)
                        .select('id, tutor_id');
                    for (const ps of paidSessions || []) {
                        syncSessionToGoogle(ps.id, ps.tutor_id).catch(() => {});
                    }
                } catch (e) {
                    console.error('[stripe-webhook] Error updating sessions for prepaid package:', e);
                }
            }
            // Handle monthly invoice payment
            else if (session.payment_status === 'paid' && session.metadata?.tutlio_billing_batch_id) {
                const batchId = session.metadata.tutlio_billing_batch_id;

                console.log(`[stripe-webhook] Monthly invoice payment completed: ${batchId}`);

                // Update billing batch: mark as paid
                const { data: updatedBatch, error: updateErr } = await supabase
                    .from('billing_batches')
                    .update({
                        paid: true,
                        payment_status: 'paid',
                        paid_at: new Date().toISOString(),
                    })
                    .eq('id', batchId)
                    .eq('paid', false) // idempotency: send emails only once
                    .select('*, profiles!billing_batches_tutor_id_fkey(full_name, email)')
                    .single();

                if (updateErr) {
                    console.error('[stripe-webhook] Error updating billing batch:', updateErr);
                } else if (updatedBatch) {
                    // Mark all sessions in batch as paid
                    const { data: batchSessions } = await supabase
                        .from('billing_batch_sessions')
                        .select('session_id')
                        .eq('billing_batch_id', batchId);

                    if (batchSessions && batchSessions.length > 0) {
                        const sessionIds = batchSessions.map(bs => bs.session_id);
                        const { data: paidBatchSessions } = await supabase
                            .from('sessions')
                            .update({ paid: true, payment_status: 'paid' })
                            .in('id', sessionIds)
                            .eq('paid', false)
                            .select('id, tutor_id');

                        for (const ps of paidBatchSessions || []) {
                            syncSessionToGoogle(ps.id, ps.tutor_id).catch(() => {});
                        }

                        console.log(`[stripe-webhook] Marked ${sessionIds.length} sessions as paid in batch ${batchId}`);
                    }

                    // Send confirmation email
                    const tutor = updatedBatch.profiles as any;
                    const periodStart = new Date(updatedBatch.period_start_date);
                    const periodEnd = new Date(updatedBatch.period_end_date);
                    const periodText = `${periodStart.toLocaleDateString('lt-LT')} - ${periodEnd.toLocaleDateString('lt-LT')}`;

                    const sessionsCount = batchSessions?.length || 0;
                    const tutorName = tutor?.full_name || 'Korepetitorius';
                    const tutorEmail = tutor?.email || null;
                    const payerEmail = updatedBatch.payer_email || null;
                    const payerName = updatedBatch.payer_name || 'Gerbiamasis kliente';

                    // Also include student(s) emails (they can differ from payer for "parent pays").
                    const { data: sessionsForStudents } = await supabase
                        .from('sessions')
                        .select('id, student_id, students!sessions_student_id_fkey(email, full_name)')
                        .in('id', (batchSessions || []).map(bs => bs.session_id));

                    const recipientPairs: Array<{ email: string; recipientName: string }> = [];
                    if (payerEmail) {
                        recipientPairs.push({ email: payerEmail, recipientName: payerName });
                    }
                    if (sessionsForStudents && sessionsForStudents.length > 0) {
                        for (const ss of sessionsForStudents as any[]) {
                            const se = ss?.students?.email;
                            const sn = ss?.students?.full_name;
                            if (se && se !== payerEmail) {
                                recipientPairs.push({ email: se, recipientName: sn || 'Mokinys' });
                            }
                        }
                    }
                    if (tutorEmail) {
                        // Ensure tutor gets the same paid info.
                        recipientPairs.push({ email: tutorEmail, recipientName: tutorName });
                    }

                    // De-duplicate recipients by email.
                    const uniqueByEmail = new Map<string, { email: string; recipientName: string }>();
                    recipientPairs.forEach(r => uniqueByEmail.set(r.email, r));

                    const emailPromises: Promise<any>[] = [];

                    for (const r of Array.from(uniqueByEmail.values())) {
                        emailPromises.push(
                            fetch(`${APP_URL}/api/send-email`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
                                body: JSON.stringify({
                                    type: 'monthly_invoice_paid',
                                    to: r.email,
                                    data: {
                                        recipientName: r.recipientName,
                                        tutorName,
                                        periodText,
                                        totalAmount: Number(updatedBatch.total_amount || 0).toFixed(2),
                                        sessionsCount,
                                    },
                                }),
                            }).catch(e => console.error('[stripe-webhook] Error sending invoice paid email:', e))
                        );
                    }

                    await Promise.all(emailPromises);

                    console.log(`[stripe-webhook] Billing batch ${batchId} marked as paid successfully`);
                }
            }
            // Handle school installment payment
            else if (session.payment_status === 'paid' && session.metadata?.tutlio_school_installment_id) {
                const installmentId = session.metadata.tutlio_school_installment_id;
                const contractId = session.metadata.tutlio_school_contract_id;
                const studentId = session.metadata.tutlio_student_id;

                console.log(`[stripe-webhook] School installment payment completed: ${installmentId}`);

                const { data: updatedInstallment, error: updateErr } = await supabase
                    .from('school_payment_installments')
                    .update({
                        payment_status: 'paid',
                        paid_at: new Date().toISOString(),
                        stripe_payment_intent_id: (session as any).payment_intent || null,
                    })
                    .eq('id', installmentId)
                    .eq('payment_status', 'pending')
                    .select('id, installment_number, amount, contract_id')
                    .maybeSingle();

                if (updateErr) {
                    console.error('[stripe-webhook] Error updating school installment:', updateErr);
                } else if (updatedInstallment) {
                    // School invite email is sent by confirm-school-installment-payment endpoint
                    // to avoid duplicate emails when both webhook and success-page confirmation run.
                    console.log(`[stripe-webhook] School installment ${installmentId} marked as paid`);
                } else {
                    console.log(`[stripe-webhook] School installment ${installmentId} was already paid, skipping`);
                }
            }
            // Handle lesson payment — update DB and send emails directly (same pattern as packages)
            // Do NOT call /api/confirm-stripe-payment here: StripeSuccess page also calls that endpoint,
            // and two concurrent callers would race and sometimes both send emails.
            else if (session.payment_status === 'paid') {
                const sessionId = session.metadata?.tutlio_session_id;

                if (sessionId) {
                    // Fetch session data needed for emails
                    const { data: dbSession } = await supabase
                        .from('sessions')
                        .select(`
                            id, price, topic, start_time, end_time, meeting_link, tutor_id,
                            students!inner(full_name, email, payment_payer, payer_email),
                            profiles!sessions_tutor_id_fkey(full_name, email, cancellation_hours, cancellation_fee_percent, organization_id)
                        `)
                        .eq('id', sessionId)
                        .single();

                    if (!dbSession) {
                        console.error('[stripe-webhook] Lesson session not found:', sessionId);
                    } else {
                        // Idempotent update: only succeeds (returns data) on the first call
                        const { data: updated, error: updateErr } = await supabase
                            .from('sessions')
                            .update({ paid: true, payment_status: 'paid', stripe_checkout_session_id: session.id })
                            .eq('id', sessionId)
                            .eq('paid', false)
                            .select('tutor_id')
                            .maybeSingle();

                        if (updateErr) {
                            console.error('[stripe-webhook] Error updating lesson session:', updateErr);
                        } else if (updated) {
                            syncSessionToGoogle(sessionId, (updated as any).tutor_id || (dbSession as any).tutor_id).catch(() => {});
                            const student = (dbSession as any).students;
                            const tutor = (dbSession as any).profiles;

                            const sessionStart = new Date((dbSession as any).start_time);
                            const dateStr = sessionStart.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' });
                            const timeStr = sessionStart.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
                            const durationMinutes = Math.round(
                                (new Date((dbSession as any).end_time).getTime() - sessionStart.getTime()) / 60000
                            );

                            const amountTotal = (session as Stripe.Checkout.Session).amount_total;
                            const emailData = {
                                studentName: student.full_name,
                                tutorName: tutor.full_name || 'Korepetitorius',
                                date: dateStr,
                                time: timeStr,
                                subject: (dbSession as any).topic,
                                price: (dbSession as any).price,
                                lessonPriceEur: (dbSession as any).price,
                                totalChargedEur: amountTotal != null ? amountTotal / 100 : undefined,
                                duration: durationMinutes,
                                cancellationHours: tutor.cancellation_hours ?? 24,
                                cancellationFeePercent: tutor.cancellation_fee_percent ?? 0,
                            };

                            const sendEmailUrl = `${APP_URL}/api/send-email`;

                            const recipients = new Set<string>();
                            if (student.email) recipients.add(student.email);
                            if (student.payment_payer === 'parent' && student.payer_email) {
                                recipients.add(student.payer_email);
                            }

                            for (const email of Array.from(recipients)) {
                                await fetch(sendEmailUrl, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
                                    body: JSON.stringify({ type: 'payment_success', to: email, data: emailData }),
                                }).catch(e => console.error('[stripe-webhook] Error sending lesson payment email:', e));
                            }

                            if (tutor?.email) {
                                const isOrgTutor = Boolean(tutor.organization_id);
                                const tutorPayload = isOrgTutor
                                    ? {
                                        type: 'lesson_confirmed_tutor',
                                        to: tutor.email,
                                        data: {
                                            studentName: student.full_name,
                                            tutorName: tutor.full_name || 'Korepetitorius',
                                            date: dateStr,
                                            time: timeStr,
                                            subject: (dbSession as any).topic,
                                            meetingLink: (dbSession as any).meeting_link || '',
                                        },
                                    }
                                    : {
                                        type: 'payment_received_tutor',
                                        to: tutor.email,
                                        data: {
                                            studentName: student.full_name,
                                            tutorName: tutor.full_name || 'Korepetitorius',
                                            date: dateStr,
                                            time: timeStr,
                                            subject: (dbSession as any).topic,
                                            price: (dbSession as any).price,
                                        },
                                    };
                                await fetch(sendEmailUrl, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
                                    body: JSON.stringify(tutorPayload),
                                }).catch(e => console.error('[stripe-webhook] Error sending tutor email:', e));
                            }

                            console.log(`[stripe-webhook] Lesson session ${sessionId} confirmed and emails sent`);
                        } else {
                            console.log(`[stripe-webhook] Lesson session ${sessionId} was already paid, skipping duplicate emails`);
                        }
                    }
                }
            }
        } else if (event.type === 'checkout.session.async_payment_failed') {
            const session = event.data.object as Stripe.Checkout.Session;
            const sessionId = session.metadata?.tutlio_session_id;

            if (sessionId) {
                await supabase
                    .from('sessions')
                    .update({ payment_status: 'failed' })
                    .eq('id', sessionId);

                const { data: dbSession } = await supabase
                    .from('sessions')
                    .select('*, students(full_name, email, payment_payer, payer_email), profiles!sessions_tutor_id_fkey(full_name)')
                    .eq('id', sessionId)
                    .single();

                if (dbSession) {
                    const student = dbSession.students as any;
                    const tutor = dbSession.profiles as any;

                    const sessionStart = new Date(dbSession.start_time);
                    const dateStr = sessionStart.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' });
                    const timeStr = sessionStart.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });

                    const recipients = new Set<string>();
                    if (student.email) recipients.add(student.email);
                    if (student.payment_payer === 'parent' && student.payer_email) {
                        recipients.add(student.payer_email);
                    }

                    for (const email of Array.from(recipients)) {
                        await fetch(`${APP_URL}/api/send-email`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
                            body: JSON.stringify({
                                type: 'payment_failed',
                                to: email,
                                data: {
                                    studentName: student.full_name,
                                    tutorName: tutor.full_name,
                                    date: dateStr,
                                    time: timeStr
                                }
                            })
                        }).catch(() => {});
                    }
                }
            }
        }
        res.json({ received: true });
    } catch (err: any) {
        console.error('[stripe-webhook] Handler error:', err);
        return res.status(200).json({ received: true, warning: 'processing_error' });
    }
}
