// ─── Vercel Serverless: Stripe Connect Onboarding ─────────────────────────────
// POST /api/stripe-connect
// Body: { action: 'onboard' | 'verify', entity: 'tutor' | 'org', entityId: string, returnUrl: string }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';

function getStripe() {
    return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' as any });
}

function getSupabase() {
    return createClient(
        process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await verifyRequestAuth(req);
    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const { action, entity, entityId, returnUrl } = req.body as {
        action: 'onboard' | 'verify';
        entity: 'tutor' | 'org';
        entityId: string;
        returnUrl?: string;
    };

    if (!entity || !entityId) return res.status(400).json({ error: 'entity and entityId are required' });

    const table = entity === 'tutor' ? 'profiles' : 'organizations';
    const stripe = getStripe();
    const supabase = getSupabase();

    try {
        if (action === 'onboard') {
            const { data: row } = await supabase.from(table).select('stripe_account_id').eq('id', entityId).single();

            let accountId: string = row?.stripe_account_id;

            if (!accountId) {
                // Create new Express account
                const account = await stripe.accounts.create({
                    type: 'express',
                    capabilities: {
                        card_payments: { requested: true },
                        transfers: { requested: true },
                    },
                    settings: {
                        payouts: { schedule: { interval: 'manual' } },
                    },
                });
                accountId = account.id;

                // Save account ID
                const { error: saveAcctErr } = await supabase
                    .from(table)
                    .update({ stripe_account_id: accountId })
                    .eq('id', entityId);
                if (saveAcctErr) {
                    console.error('[stripe-connect] Failed to save stripe_account_id:', saveAcctErr);
                    return res.status(500).json({ error: saveAcctErr.message || 'Could not save Stripe account' });
                }
            }

            // Create account onboarding link
            const origin = returnUrl || 'https://tutlio.lt';
            const successUrl = `${origin}?stripe=success`;
            const refreshUrl = `${origin}?stripe=refresh`;

            const accountLink = await stripe.accountLinks.create({
                account: accountId,
                refresh_url: refreshUrl,
                return_url: successUrl,
                type: 'account_onboarding',
            });

            return res.status(200).json({ url: accountLink.url });
        }

        // ─── VERIFY: Check if Stripe account is fully onboarded ─────────────────────
        if (action === 'verify') {
            const { data: row } = await supabase.from(table).select('stripe_account_id').eq('id', entityId).single();
            if (!row?.stripe_account_id) {
                return res.status(200).json({ complete: false, reason: 'No stripe account ID found' });
            }

            const account = await stripe.accounts.retrieve(row.stripe_account_id);
            const currentlyDue = account.requirements?.currently_due ?? [];
            const pastDue = account.requirements?.past_due ?? [];
            const requirementsClear = currentlyDue.length === 0 && pastDue.length === 0;
            const transfersCap = account.capabilities?.transfers;

            // Express: details_submitted alone is not enough — need charges/payouts or active transfers (destination charge).
            let complete =
                account.details_submitted === true &&
                requirementsClear &&
                account.charges_enabled === true &&
                account.payouts_enabled === true;

            // Sometimes payouts_enabled is still false while Stripe finishes review; if transfers are active and nothing is due — consider ready.
            if (
                !complete &&
                account.details_submitted === true &&
                requirementsClear &&
                account.charges_enabled === true &&
                transfersCap === 'active'
            ) {
                complete = true;
            }

            if (complete) {
                const { error: flagErr } = await supabase
                    .from(table)
                    .update({ stripe_onboarding_complete: true })
                    .eq('id', entityId);
                if (flagErr) console.error('[stripe-connect] onboarding flag:', flagErr);
            }

            return res.status(200).json({
                complete,
                accountId: row.stripe_account_id,
                stripe: {
                    details_submitted: account.details_submitted,
                    charges_enabled: account.charges_enabled,
                    payouts_enabled: account.payouts_enabled,
                    currently_due: currentlyDue,
                    past_due: pastDue,
                    transfers: transfersCap ?? null,
                },
            });
        }

        // ─── MANAGE: Return management link for already-onboarded account ───────────
        if (action === 'manage') {
            const { data: row } = await supabase.from(table).select('stripe_account_id').eq('id', entityId).single();
            if (!row?.stripe_account_id) return res.status(404).json({ error: 'No Stripe account' });

            const loginLink = await stripe.accounts.createLoginLink(row.stripe_account_id);
            return res.status(200).json({ url: loginLink.url });
        }

        return res.status(400).json({ error: 'Unknown action' });
    } catch (err: any) {
        console.error('stripe-connect error:', err);
        return res.status(500).json({ error: err.message });
    }
}
