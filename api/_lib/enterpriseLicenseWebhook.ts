/**
 * Enterprise license webhook handlers.
 * Checkouts/subscriptions from /api/create-enterprise-checkout carry
 * metadata.tutlio_enterprise = '1' and quantity = purchased tutor licenses.
 * The Stripe quantity is synced into organizations.tutor_license_count (the
 * value all existing UI reads), so manual licensing for sales-led orgs keeps
 * working unchanged for orgs without a license subscription.
 */
import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { Resend } from 'resend';
import { getFromEmail, getResendApiKey, INTERNAL_NOTIFY_EMAILS } from './resendConfig.js';
import { sendEnterpriseWelcomeEmail } from './sendEnterpriseWelcomeEmail.js';
import { insertInitialOrgOwner } from './orgAdminAccess.js';

type Supabase = SupabaseClient;

function subscriptionPeriodEndIso(subscription: Stripe.Subscription): string {
  const end = (subscription as Stripe.Subscription & { current_period_end: number }).current_period_end;
  return new Date(end * 1000).toISOString();
}

function subscriptionQuantity(subscription: Stripe.Subscription): number {
  return subscription.items.data[0]?.quantity ?? 0;
}

function isEnterpriseLicenseSubscription(subscription: Stripe.Subscription): boolean {
  return subscription.metadata?.tutlio_enterprise === '1';
}

async function sendInternalAlert(subject: string, html: string): Promise<void> {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    console.warn('[enterprise-license] Resend not configured — internal alert skipped:', subject);
    return;
  }
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from: getFromEmail(), to: INTERNAL_NOTIFY_EMAILS, subject, html });
  } catch (err: any) {
    console.error('[enterprise-license] Failed to send internal alert:', err?.message || err);
  }
}

function alertRow(label: string, value: string): string {
  return `<tr><td style="padding:6px 10px;font-weight:600;color:#6b7280;width:160px;">${label}</td><td style="padding:6px 10px;color:#1f2937;">${value}</td></tr>`;
}

interface FallbackParams {
  supabase: Supabase;
  reason: string;
  companyName: string;
  email: string;
  customerName: string | null;
  licenseCount: number;
  sessionId: string;
  subscriptionId: string;
  customerId: string;
}

/**
 * Payment is captured but auto-provisioning is not safe (e.g. email already has
 * an account). Record it for manual setup and alert the team.
 */
async function fallbackToManualProvisioning(params: FallbackParams): Promise<void> {
  const { supabase, reason, companyName, email, customerName, licenseCount, sessionId, subscriptionId, customerId } = params;

  const nameParts = (customerName || '').trim().split(/\s+/).filter(Boolean);
  const message =
    `PAID enterprise checkout needs manual provisioning (${reason}). ` +
    `Stripe session ${sessionId}, subscription ${subscriptionId}, customer ${customerId}.`;

  const { error } = await supabase.from('enterprise_contacts').insert({
    company_name: companyName || '—',
    license_count: licenseCount || 1,
    contact_name: nameParts[0] || '—',
    contact_surname: nameParts.slice(1).join(' ') || '—',
    email: email || '—',
    phone: null,
    message,
  });
  if (error) console.error('[enterprise-license] Failed to record manual provisioning fallback:', error.message);

  await sendInternalAlert(
    `[Tutlio] PAID enterprise checkout needs manual setup — ${companyName || email}`,
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#b91c1c;">Paid enterprise checkout requires manual provisioning</h2>
      <p style="color:#1f2937;">Reason: <strong>${reason}</strong></p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${alertRow('Company', companyName || '—')}
        ${alertRow('Email', email || '—')}
        ${alertRow('Licenses paid', String(licenseCount))}
        ${alertRow('Checkout session', sessionId)}
        ${alertRow('Subscription', subscriptionId)}
        ${alertRow('Customer', customerId)}
      </table>
    </div>`,
  );
}

export interface EnterpriseCheckoutParams {
  stripe: Stripe;
  supabase: Supabase;
  session: Stripe.Checkout.Session;
  customerId: string;
  subscriptionId: string;
  /** Fallback app origin when checkout metadata lacks one. */
  appUrl: string;
}

/** checkout.session.completed with metadata.tutlio_enterprise === '1'. */
export async function handleEnterpriseCheckoutCompleted(params: EnterpriseCheckoutParams): Promise<void> {
  const { stripe, supabase, session, customerId, subscriptionId, appUrl } = params;
  const metadata = session.metadata || {};

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const licenseCount = subscriptionQuantity(subscription) || Math.max(1, Number(metadata.license_count) || 0);
  const orgBillingFields = {
    stripe_customer_id: customerId,
    license_subscription_id: subscriptionId,
    license_subscription_status: subscription.status,
    license_subscription_period_end: subscriptionPeriodEndIso(subscription),
    tutor_license_count: licenseCount,
  };

  // ── Existing organization: apply purchased licenses ──
  if (metadata.organization_id) {
    const { error } = await supabase
      .from('organizations')
      .update(orgBillingFields)
      .eq('id', metadata.organization_id);
    if (error) {
      console.error(`[enterprise-license] Failed to update org ${metadata.organization_id}:`, error.message);
      throw new Error(`Enterprise org update failed: ${error.message}`);
    }
    console.log(`[enterprise-license] Org ${metadata.organization_id} licensed: ${licenseCount} licenses (sub ${subscriptionId})`);
    return;
  }

  // ── New company: auto-provision org + admin account ──
  // Idempotency across Stripe retries.
  const { data: existingOrg } = await supabase
    .from('organizations')
    .select('id')
    .eq('license_subscription_id', subscriptionId)
    .maybeSingle();
  if (existingOrg) {
    console.log(`[enterprise-license] Subscription ${subscriptionId} already provisioned (org ${existingOrg.id})`);
    return;
  }

  const email = String(session.customer_details?.email || session.customer_email || '').trim().toLowerCase();
  const customerName = session.customer_details?.name || null;
  const companyName = String(metadata.company_name || '').trim() || customerName || 'New organization';
  const appOrigin = String(metadata.app_origin || '').trim() || appUrl;
  const uiLocale = String(metadata.ui_locale || '').trim() || undefined;

  const fallbackBase = {
    supabase,
    companyName,
    email,
    customerName,
    licenseCount,
    sessionId: session.id,
    subscriptionId,
    customerId,
  };

  if (!email) {
    await fallbackToManualProvisioning({ ...fallbackBase, reason: 'missing customer email' });
    return;
  }

  // Existing account with this email (tutor / other org admin) — do not auto-provision.
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existingProfile) {
    await fallbackToManualProvisioning({ ...fallbackBase, reason: 'email already has a Tutlio account' });
    return;
  }

  // 1. Auth user (random password; admin sets their own via the emailed recovery link)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: `${randomUUID()}${randomUUID()}`,
    email_confirm: true,
  });
  if (authError || !authData?.user) {
    await fallbackToManualProvisioning({ ...fallbackBase, reason: `auth user creation failed: ${authError?.message || 'unknown'}` });
    return;
  }
  const userId = authData.user.id;

  // 2. Organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name: companyName,
      email,
      // Legacy column kept for backwards-compat; do not enforce tutor count limits.
      tutor_limit: 9999,
      ...orgBillingFields,
    })
    .select('id')
    .single();
  if (orgError || !org) {
    await supabase.auth.admin.deleteUser(userId);
    await fallbackToManualProvisioning({ ...fallbackBase, reason: `organization creation failed: ${orgError?.message || 'unknown'}` });
    return;
  }

  // 3. Profile linked to the org
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: userId, email, full_name: `${companyName} Admin`, organization_id: org.id }, { onConflict: 'id' });
  if (profileError) {
    await supabase.auth.admin.deleteUser(userId);
    await supabase.from('organizations').delete().eq('id', org.id);
    await fallbackToManualProvisioning({ ...fallbackBase, reason: `profile creation failed: ${profileError.message}` });
    return;
  }

  // 4. Org admin link
  const { error: adminError } = await insertInitialOrgOwner(supabase, userId, org.id);
  if (adminError) {
    await supabase.auth.admin.deleteUser(userId);
    await supabase.from('organizations').delete().eq('id', org.id);
    await fallbackToManualProvisioning({ ...fallbackBase, reason: `org admin link failed: ${adminError.message}` });
    return;
  }

  // 5. Password setup link + welcome email (org is live even if this fails —
  //    the admin can use "forgot password"; team is alerted below either way)
  let welcomeError: string | null = null;
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appOrigin}/auth/callback?next=/reset-password` },
  });
  const setupLink = linkData?.properties?.action_link;
  if (!setupLink) {
    welcomeError = `recovery link generation failed: ${linkError?.message || 'no action link'}`;
  } else {
    const sent = await sendEnterpriseWelcomeEmail(email, { companyName, licenseCount, setupLink, locale: uiLocale });
    if (!sent.ok) welcomeError = `welcome email failed: ${'error' in sent ? sent.error : 'unknown error'}`;
  }
  if (welcomeError) console.error(`[enterprise-license] ${welcomeError} (org ${org.id})`);

  // 6. Internal notification
  await sendInternalAlert(
    `[Tutlio] New enterprise purchase — ${companyName} (${licenseCount} licenses)`,
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="color:#1f2937;">New self-serve enterprise organization</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${alertRow('Company', companyName)}
        ${alertRow('Admin email', email)}
        ${alertRow('Licenses', String(licenseCount))}
        ${alertRow('Organization ID', org.id)}
        ${alertRow('Subscription', subscriptionId)}
        ${alertRow('Welcome email', welcomeError ? `FAILED — ${welcomeError}` : 'sent')}
      </table>
    </div>`,
  );

  console.log(`[enterprise-license] Provisioned org ${org.id} (“${companyName}”) with ${licenseCount} licenses for ${email}`);
}

/**
 * customer.subscription.created/updated for an enterprise license subscription.
 * Returns true when handled (caller should skip tutor-profile logic).
 */
export async function syncEnterpriseLicenseSubscription(
  supabase: Supabase,
  subscription: Stripe.Subscription,
): Promise<boolean> {
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('license_subscription_id', subscription.id)
    .maybeSingle();
  if (!org) {
    // Subscription not linked yet (checkout.session.completed provisions it) —
    // still claim enterprise-metadata events so tutor-profile logic never sees them.
    return isEnterpriseLicenseSubscription(subscription);
  }

  const fullyCanceled = subscription.status === 'canceled';
  const scheduledCancel = (subscription as any).cancel_at_period_end === true;
  const statusToSave = fullyCanceled || scheduledCancel ? 'canceled' : subscription.status;
  const quantity = subscriptionQuantity(subscription);

  const { error } = await supabase
    .from('organizations')
    .update({
      license_subscription_status: statusToSave,
      license_subscription_period_end: subscriptionPeriodEndIso(subscription),
      // Scheduled cancellations keep licenses until the period actually ends.
      ...(fullyCanceled ? { tutor_license_count: 0 } : quantity > 0 ? { tutor_license_count: quantity } : {}),
    })
    .eq('id', org.id);
  if (error) {
    console.error(`[enterprise-license] Failed to sync subscription ${subscription.id} to org ${org.id}:`, error.message);
    throw new Error(`Enterprise subscription sync failed: ${error.message}`);
  }

  console.log(`[enterprise-license] Org ${org.id} subscription ${subscription.id}: status=${statusToSave}, licenses=${fullyCanceled ? 0 : quantity}`);
  return true;
}

/**
 * customer.subscription.deleted for an enterprise license subscription.
 * Returns true when handled.
 */
export async function handleEnterpriseLicenseSubscriptionDeleted(
  supabase: Supabase,
  subscription: Stripe.Subscription,
): Promise<boolean> {
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('license_subscription_id', subscription.id)
    .maybeSingle();
  if (!org) return isEnterpriseLicenseSubscription(subscription);

  const { error } = await supabase
    .from('organizations')
    .update({
      license_subscription_status: 'canceled',
      license_subscription_period_end: subscriptionPeriodEndIso(subscription),
      tutor_license_count: 0,
    })
    .eq('id', org.id);
  if (error) {
    console.error(`[enterprise-license] Failed to mark subscription ${subscription.id} deleted for org ${org.id}:`, error.message);
    throw new Error(`Enterprise subscription delete sync failed: ${error.message}`);
  }

  console.log(`[enterprise-license] Org ${org.id} license subscription deleted — licenses set to 0`);
  return true;
}
