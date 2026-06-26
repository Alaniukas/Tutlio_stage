// Shared Stripe Connect onboarding status logic.
// Used by api/stripe-connect.ts (verify) and api/stripe-webhook.ts (account.updated)
// so both decide "is this account ready to take payments?" the exact same way.

/** Minimal shape of a Stripe Account we need — Stripe.Account satisfies this structurally. */
export interface StripeAccountLike {
    details_submitted?: boolean | null;
    charges_enabled?: boolean | null;
    payouts_enabled?: boolean | null;
    capabilities?: { transfers?: string | null } | null;
    requirements?: {
        currently_due?: string[] | null;
        past_due?: string[] | null;
        pending_verification?: string[] | null;
        disabled_reason?: string | null;
    } | null;
}

export interface StripeOnboardingSummary {
    /** Account is fully ready to accept payments and pay out. */
    complete: boolean;
    /** Nothing is required from the user — Stripe is still reviewing submitted details/documents. */
    pendingVerification: boolean;
    detailsSubmitted: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    currentlyDue: string[];
    pastDue: string[];
    transfers: string | null;
}

export function summarizeStripeOnboarding(account: StripeAccountLike): StripeOnboardingSummary {
    const currentlyDue = account.requirements?.currently_due ?? [];
    const pastDue = account.requirements?.past_due ?? [];
    const requirementsClear = currentlyDue.length === 0 && pastDue.length === 0;
    const transfers = account.capabilities?.transfers ?? null;
    const detailsSubmitted = account.details_submitted === true;
    const chargesEnabled = account.charges_enabled === true;
    const payoutsEnabled = account.payouts_enabled === true;

    // Express: details_submitted alone is not enough — need charges/payouts or active transfers (destination charge).
    let complete = detailsSubmitted && requirementsClear && chargesEnabled && payoutsEnabled;

    // Sometimes payouts_enabled is still false while Stripe finishes review; if transfers are active and nothing is due — consider ready.
    if (!complete && detailsSubmitted && requirementsClear && chargesEnabled && transfers === 'active') {
        complete = true;
    }

    // Pending verification: user submitted everything (nothing currently/past due) but Stripe is still reviewing.
    const pendingArr = account.requirements?.pending_verification ?? [];
    const disabledReason = account.requirements?.disabled_reason ?? null;
    const pendingVerification =
        !complete &&
        requirementsClear &&
        (pendingArr.length > 0 || disabledReason === 'requirements.pending_verification');

    return {
        complete,
        pendingVerification,
        detailsSubmitted,
        chargesEnabled,
        payoutsEnabled,
        currentlyDue,
        pastDue,
        transfers,
    };
}
