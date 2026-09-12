import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchOrgStudentDynamicPrice } from '../../src/lib/orgStudentPricing.js';
import { parseStudentGrade } from '../../src/lib/organizationDynamicPricing.js';
import { endOfMonthYmd, nextMonthFirstYmd } from '../../src/lib/monthlyPackagePlan.js';
import { previewMonthlyStudentPackage } from './monthlyStudentPackage.js';
import {
  pooledPackageEmailIdempotencyKey,
  sendPendingPackagePaymentEmail,
} from './sendPendingPackageEmail.js';
import { isProKlaseOrg } from './marketMoney.js';

type RenewalArgs = { organizationId: string; studentIds: string[]; periodStart: string; createdBy: string };

/** Reuse the existing cron and collapse old per-tutor plans into one renewal. */
export async function ensurePooledMonthlyRenewal(db: SupabaseClient, args: RenewalArgs) {
  if (!isProKlaseOrg(args.organizationId) || !args.studentIds.length) throw new Error('Invalid pooled renewal identity');
  const students = await db.from('students').select('id,tutor_id,grade').eq('organization_id', args.organizationId)
    .in('id', args.studentIds).is('detached_at', null).order('id');
  if (students.error) throw new Error(students.error.message);
  const anchor = students.data?.find(row => row.tutor_id);
  if (!anchor) throw new Error('No active tutor pairing for renewal');
  const pricing = await fetchOrgStudentDynamicPrice(db, anchor.id);
  const grade = parseStudentGrade(anchor.grade);
  if (!grade || !pricing.lessonsPerWeek) throw new Error('Missing renewal grade or frequency');
  const plans = await db.from('recurring_monthly_package_plans').select('id,next_generation_date,auto_from_schedule')
    .eq('organization_id', args.organizationId).in('student_id', args.studentIds).eq('active', true).order('id');
  if (plans.error) throw new Error(plans.error.message);
  const primary = plans.data?.[0];
  const next = nextMonthFirstYmd(args.periodStart);
  const patch = { subject_id: null, auto_from_schedule: true, active: true,
    grade, lessons_per_week: Math.min(7, pricing.lessonsPerWeek), payment_method: 'stripe', attach_sales_invoice: true,
    next_generation_date: primary?.next_generation_date && primary.next_generation_date > next ? primary.next_generation_date : next,
    last_generated_period_start: args.periodStart, last_generated_period_end: endOfMonthYmd(args.periodStart), updated_at: new Date().toISOString() };
  if (primary) {
    const updated = await db.from('recurring_monthly_package_plans').update(patch).eq('id', primary.id);
    if (updated.error) throw new Error(updated.error.message);
  } else {
    const inserted = await db.from('recurring_monthly_package_plans').insert({ ...patch,
      organization_id: args.organizationId, created_by: args.createdBy, tutor_id: anchor.tutor_id, student_id: anchor.id });
    // The existing unique active-auto-plan index arbitrates simultaneous creates.
    if (inserted.error && inserted.error.code !== '23505') throw new Error(inserted.error.message);
  }
  // Disable duplicates only after the surviving plan is safely updated. If this
  // cleanup fails, idempotent package creation is safer than losing all renewal state.
  const extraIds = (plans.data || []).slice(1).map(row => row.id);
  if (extraIds.length) {
    const removed = await db.from('recurring_monthly_package_plans').update({ active: false })
      .in('id', extraIds).eq('organization_id', args.organizationId);
    if (removed.error) throw new Error(removed.error.message);
  }
}

type GenerationArgs = { organizationId: string; studentId: string; periodStart: string; createdBy: string; appOrigin: string; serviceRoleKey: string };
type DeliveryArgs = Pick<GenerationArgs, 'organizationId' | 'appOrigin' | 'serviceRoleKey'> & {
  packageId: string;
  sendEmailOrigin?: string;
};

export type PooledPackageEmailDelivery = {
  status: 'sent' | 'already_sent' | 'pending' | 'failed';
  error?: string;
};

const EMAIL_CLAIM_LEASE_MS = 10 * 60 * 1000;

/**
 * Claim and deliver one pooled-package offer. The database claim prevents
 * concurrent sends; the provider idempotency key makes a stale-claim retry safe
 * if the process exits after Resend accepted the message but before DB commit.
 */
export async function deliverPooledPackageOffer(
  db: SupabaseClient,
  args: DeliveryArgs,
): Promise<PooledPackageEmailDelivery> {
  const state = await db.from('lesson_packages')
    .select('id,pool_email_claimed_at,pool_email_sent_at')
    .eq('id', args.packageId)
    .eq('pool_organization_id', args.organizationId)
    .maybeSingle();
  if (state.error || !state.data) throw new Error(state.error?.message || 'Pooled package not found');
  if (state.data.pool_email_sent_at) return { status: 'already_sent' };

  const previousClaim = state.data.pool_email_claimed_at as string | null;
  const previousClaimMs = previousClaim ? Date.parse(previousClaim) : Number.NaN;
  if (previousClaim && Number.isFinite(previousClaimMs)
    && previousClaimMs > Date.now() - EMAIL_CLAIM_LEASE_MS) {
    return { status: 'pending' };
  }

  const claimedAt = new Date().toISOString();
  let claim = db.from('lesson_packages')
    .update({ pool_email_claimed_at: claimedAt })
    .eq('id', args.packageId)
    .eq('pool_organization_id', args.organizationId)
    .is('pool_email_sent_at', null);
  claim = previousClaim
    ? claim.eq('pool_email_claimed_at', previousClaim)
    : claim.is('pool_email_claimed_at', null);
  const claimed = await claim.select('id');
  if (claimed.error) throw new Error(claimed.error.message);
  if (!claimed.data?.length) return { status: 'pending' };

  const email = await sendPendingPackagePaymentEmail({
    supabase: db,
    packageId: args.packageId,
    organizationId: args.organizationId,
    appOrigin: args.appOrigin,
    sendEmailUrl: `${(args.sendEmailOrigin || args.appOrigin).replace(/\/$/, '')}/api/send-email`,
    serviceRoleKey: args.serviceRoleKey,
    idempotencyKey: pooledPackageEmailIdempotencyKey(args.packageId),
  });
  if (email.ok === false) {
    const released = await db.from('lesson_packages').update({ pool_email_claimed_at: null })
      .eq('id', args.packageId).eq('pool_email_claimed_at', claimedAt);
    if (released.error) throw new Error(released.error.message);
    return { status: 'failed', error: email.error };
  }

  const sentAt = new Date().toISOString();
  const completed = await db.from('lesson_packages')
    .update({ pool_email_sent_at: sentAt, pool_email_claimed_at: null })
    .eq('id', args.packageId)
    .eq('pool_email_claimed_at', claimedAt)
    .is('pool_email_sent_at', null)
    .select('id');
  if (completed.error || !completed.data?.length) {
    throw new Error(completed.error?.message || 'Unable to record pooled package email delivery');
  }
  return { status: 'sent' };
}

/** Trusted cron service: no HTTP hop through a user-authenticated create endpoint. */
export async function generatePooledMonthlyPackage(db: SupabaseClient, args: GenerationArgs) {
  if (!isProKlaseOrg(args.organizationId)) throw new Error('Pooled generation is only enabled for Pro Klase');
  const org = await db.from('organizations').select('features,stripe_account_id,stripe_onboarding_complete').eq('id', args.organizationId).single();
  if (org.error) throw new Error(org.error.message);
  if (org.data?.features?.monthly_packages !== true) throw new Error('Monthly packages are disabled');
  if (org.data.features.manual_payments === true) throw new Error('Consolidated monthly packages require the configured Stripe payment flow');
  if (!org.data.stripe_account_id || !org.data.stripe_onboarding_complete) throw new Error('Organization payment account is not connected');
  const pricing = await fetchOrgStudentDynamicPrice(db, args.studentId);
  const existing = await db.from('lesson_packages').select('id').eq('pool_organization_id', args.organizationId)
    .in('student_id', pricing.studentIds).eq('billing_period_end', endOfMonthYmd(args.periodStart))
    .neq('payment_status', 'cancelled').maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  let packageId: string | undefined = existing.data?.id;
  if (!packageId) {
    const preview = await previewMonthlyStudentPackage(db, args.studentId, args.organizationId, args.periodStart);
    const created = await db.rpc('create_org_student_package', {
      p_student_id: args.studentId, p_org_id: args.organizationId, p_student_ids: preview.studentIds,
      p_items: preview.items, p_unit_price: preview.pricePerLesson, p_period_start: preview.periodStart,
      p_period_end: preview.periodEnd, p_preview_token: preview.previewToken, p_session_ids: preview.sessionIds,
    });
    if (created.error) throw new Error(created.error.message);
    packageId = created.data as string;
  }
  if (!packageId) throw new Error('Package creation returned no id');
  const delivery = await deliverPooledPackageOffer(db, { ...args, packageId });
  if (delivery.status === 'failed') throw new Error(delivery.error || 'Email delivery failed');
  if (delivery.status === 'pending') {
    return { packageId, emailSent: false, deliveryPending: true, existing: !!existing.data };
  }
  await ensurePooledMonthlyRenewal(db, { ...args, studentIds: pricing.studentIds });
  return { packageId, emailSent: delivery.status === 'sent', existing: !!existing.data };
}
