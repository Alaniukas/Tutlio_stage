import type { VercelRequest, VercelResponse } from './types';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import {
  normalizePackageItemsInput,
  resolvePackageItems,
  aggregatePackageTotals,
} from './_lib/packageItems.js';
import { endOfMonthIso } from './_lib/packageMonth.js';
import { pendingPackageEditDenial, expireOpenCheckoutSession } from '../src/lib/pendingPackageEdit.js';
import { sendPendingPackagePaymentEmail } from './_lib/sendPendingPackageEmail.js';
import { waitUntil } from '@vercel/functions';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

function validYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function packageExpiryIso(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
  return new Date(normalized).toISOString();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return json(res, 401, { error: 'Unauthorized' });

  const body = (req.body || {}) as {
    packageId?: string;
    items?: unknown;
    subjectId?: string;
    totalLessons?: number;
    pricePerLesson?: number;
    billingPeriodStart?: string;
    billingPeriodEnd?: string;
    expiresAt?: string;
  };
  if (!body.packageId) return json(res, 400, { error: 'Missing packageId' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, { error: 'Server configuration error' });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) return json(res, 401, { error: 'Unauthorized' });

    const adminAccess = await getOrgAdminAccessByUserId(supabase, authData.user.id);
    if (!adminAccess || !hasOrgAdminPermission(adminAccess.role, adminAccess.permissions, 'finance.edit')) {
      return json(res, 403, { error: 'Only an administrator with finance edit access can edit packages' });
    }
    const organizationId = adminAccess.organizationId;

    const { data: pkg, error: pkgErr } = await supabase
      .from('lesson_packages')
      .select(`
        id, tutor_id, student_id, subject_id, paid, payment_status, created_at,
        stripe_checkout_session_id, payment_method, total_lessons
      `)
      .eq('id', body.packageId)
      .single();
    if (pkgErr || !pkg) return json(res, 404, { error: 'Paketas nerastas' });

    const { data: tutor } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', pkg.tutor_id)
      .maybeSingle();
    if (tutor?.organization_id !== organizationId) {
      return json(res, 403, { error: 'Package belongs to another organization' });
    }

    const denial = pendingPackageEditDenial(pkg);
    if (denial === 'paid') return json(res, 409, { error: 'Paketas jau apmokėtas', code: denial });
    if (denial === 'too_old') {
      return json(res, 409, { error: 'Paketą galima koreguoti tik 7 dienas nuo išsiuntimo', code: denial });
    }
    if (denial) return json(res, 409, { error: 'Šio paketo koreguoti negalima', code: denial });

    const normalized = normalizePackageItemsInput(body);
    if (normalized.error) return json(res, 400, { error: normalized.error });

    const resolved = await resolvePackageItems(supabase, {
      tutorId: pkg.tutor_id,
      studentId: pkg.student_id,
      items: normalized.items,
    });
    if (resolved.error) return json(res, 400, { error: resolved.error });
    const totals = aggregatePackageTotals(resolved.items);

    const { count: reservedCount, error: reservedErr } = await supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('lesson_package_id', pkg.id)
      .eq('payment_status', 'reserved');
    if (reservedErr) return json(res, 500, { error: reservedErr.message });
    if ((reservedCount || 0) > totals.totalLessons) {
      return json(res, 409, {
        error: 'Negalima sumažinti kiekio žemiau rezervuotų pamokų skaičiaus',
        code: 'reserved_exceeds_qty',
        reserved: reservedCount,
      });
    }

    let billingPeriodStart = validYmd(body.billingPeriodStart) ? body.billingPeriodStart : null;
    let billingPeriodEnd = validYmd(body.billingPeriodEnd) ? body.billingPeriodEnd : null;
    if ((billingPeriodStart && !billingPeriodEnd) || (!billingPeriodStart && billingPeriodEnd)) {
      return json(res, 400, { error: 'Nurodykite ir periodo pradžią, ir pabaigą' });
    }

    let expiresAt: string | null = null;
    if (billingPeriodEnd) {
      expiresAt = endOfMonthIso(new Date(`${billingPeriodEnd}T12:00:00.000Z`));
    } else if (typeof body.expiresAt === 'string' && body.expiresAt.trim()) {
      expiresAt = packageExpiryIso(body.expiresAt.trim());
    }

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    const checkoutSessionId = pkg.stripe_checkout_session_id;

    const primary = resolved.items[0];
    const { error: updErr } = await supabase
      .from('lesson_packages')
      .update({
        subject_id: primary.subjectId,
        total_lessons: totals.totalLessons,
        available_lessons: totals.totalLessons,
        price_per_lesson: primary.pricePerLesson,
        total_price: totals.totalPriceEur,
        stripe_checkout_session_id: null,
        ...(billingPeriodStart ? { billing_period_start: billingPeriodStart } : {}),
        ...(billingPeriodEnd ? { billing_period_end: billingPeriodEnd } : {}),
        ...(expiresAt ? { expires_at: expiresAt } : {}),
      })
      .eq('id', pkg.id);
    if (updErr) return json(res, 500, { error: updErr.message });

    await supabase.from('lesson_package_items').delete().eq('package_id', pkg.id);
    const { error: itemsErr } = await supabase.from('lesson_package_items').insert(
      resolved.items.map((it, position) => ({
        package_id: pkg.id,
        subject_id: it.subjectId,
        total_lessons: it.totalLessons,
        available_lessons: it.totalLessons,
        reserved_lessons: 0,
        completed_lessons: 0,
        price_per_lesson: it.pricePerLesson,
        total_price: it.itemTotalPrice,
        position,
      })),
    );
    if (itemsErr) return json(res, 500, { error: itemsErr.message });

    const appOrigin = publicOriginFromRequest(req);
    const requestOrigin = req.headers.origin ? String(req.headers.origin) : null;
    const sendEmailUrl = `${(requestOrigin || appOrigin).replace(/\/$/, '')}/api/send-email`;
    const background = (async () => {
      try {
        if (pkg.payment_method !== 'manual' && checkoutSessionId && stripeSecret) {
          const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' as any });
          await expireOpenCheckoutSession(
            (id) => stripe.checkout.sessions.expire(id),
            checkoutSessionId,
          );
        }
        const emailed = await sendPendingPackagePaymentEmail({
          supabase,
          packageId: pkg.id,
          organizationId,
          appOrigin,
          sendEmailUrl,
          serviceRoleKey,
        });
        if (!emailed.ok) {
          console.error('[update-pending-package] email after save failed:', emailed.error, emailed.details);
        }
      } catch (bgErr) {
        console.error('[update-pending-package] background expire/email failed:', bgErr);
      }
    })();
    try {
      waitUntil(background);
    } catch {
      /* local API has no Vercel context; the promise still runs on the event loop */
    }

    return json(res, 200, {
      success: true,
      totalLessons: totals.totalLessons,
      totalPrice: totals.totalPriceEur,
      emailQueued: true,
    });
  } catch (err: any) {
    console.error('[update-pending-package] error:', err);
    return json(res, 500, { error: 'Internal Server Error', details: err?.message || String(err) });
  }
}
