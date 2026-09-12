import type Stripe from 'stripe';

type SupabaseLike = {
  from: (table: string) => any;
};

export function directChargeOptions(
  stripeAccount: string,
  idempotencyKey?: string,
): Stripe.RequestOptions {
  return {
    stripeAccount,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };
}

export type ConnectCheckoutSessionLookup = {
  session: Stripe.Checkout.Session;
  /** null means the Checkout Session belongs to the platform (legacy destination charge). */
  stripeAccount: string | null;
};

/**
 * New Checkout Sessions live on the connected account. The platform fallback
 * keeps payment-success pages and stale-link handling compatible with Checkout
 * Sessions created before the direct-charge migration.
 */
export async function retrieveConnectCheckoutSessionWithScope(
  stripe: Stripe,
  checkoutSessionId: string,
  stripeAccount?: string | null,
): Promise<ConnectCheckoutSessionLookup> {
  let connectedError: unknown = null;
  if (stripeAccount) {
    try {
      return {
        session: await stripe.checkout.sessions.retrieve(
          checkoutSessionId,
          directChargeOptions(stripeAccount),
        ),
        stripeAccount,
      };
    } catch (error) {
      connectedError = error;
    }
  }

  try {
    return {
      session: await stripe.checkout.sessions.retrieve(checkoutSessionId),
      stripeAccount: null,
    };
  } catch (platformError) {
    throw connectedError || platformError;
  }
}

export async function retrieveConnectCheckoutSession(
  stripe: Stripe,
  checkoutSessionId: string,
  stripeAccount?: string | null,
): Promise<Stripe.Checkout.Session> {
  return (await retrieveConnectCheckoutSessionWithScope(
    stripe,
    checkoutSessionId,
    stripeAccount,
  )).session;
}

export async function expireConnectCheckoutSession(
  stripe: Stripe,
  checkoutSessionId: string,
  stripeAccount?: string | null,
): Promise<Stripe.Checkout.Session> {
  let connectedError: unknown = null;
  if (stripeAccount) {
    try {
      return await stripe.checkout.sessions.expire(
        checkoutSessionId,
        directChargeOptions(stripeAccount),
      );
    } catch (error) {
      connectedError = error;
    }
  }

  try {
    return await stripe.checkout.sessions.expire(checkoutSessionId);
  } catch (platformError) {
    throw connectedError || platformError;
  }
}

/** Resolve the payment account for a tutor-owned or organization-owned sale. */
export async function resolveTutorStripeAccount(
  supabase: SupabaseLike,
  tutorId: string | null | undefined,
  organizationId?: string | null,
): Promise<string | null> {
  let resolvedOrganizationId = organizationId || null;

  if (!resolvedOrganizationId && tutorId) {
    const { data: tutor } = await supabase
      .from('profiles')
      .select('stripe_account_id, organization_id')
      .eq('id', tutorId)
      .maybeSingle();
    resolvedOrganizationId = tutor?.organization_id || null;
    if (!resolvedOrganizationId) {
      const accountId = String(tutor?.stripe_account_id || '').trim();
      return accountId || null;
    }
  }

  if (resolvedOrganizationId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('stripe_account_id')
      .eq('id', resolvedOrganizationId)
      .maybeSingle();
    const accountId = String(org?.stripe_account_id || '').trim();
    return accountId || null;
  }

  return null;
}
