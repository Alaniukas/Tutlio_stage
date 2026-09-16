import type { VercelRequest, VercelResponse } from './types';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import {
  expireConnectCheckoutSession,
  resolveTutorStripeAccount,
  retrieveConnectCheckoutSessionWithScope,
} from './_lib/stripeDirectCharge.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const packageId = typeof req.body?.packageId === 'string' ? req.body.packageId.trim() : '';
  if (!packageId) return json(res, 400, { error: 'Missing packageId' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) return json(res, 500, { error: 'Server configuration error' });
  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const auth = await requireOrgAdminAccess(req, db, 'finance.edit');
    if (auth.ok === false) return json(res, auth.status, { error: auth.error });
    const { data: pkg, error: packageError } = await db.from('lesson_packages')
      .select('id, tutor_id, paid, payment_status, stripe_checkout_session_id, pool_organization_id')
      .eq('id', packageId).maybeSingle();
    if (packageError || !pkg) return json(res, 404, { error: 'Paketas nerastas' });
    if (pkg.paid || pkg.payment_status === 'paid') {
      return json(res, 409, { error: 'Paketas jau apmokėtas', code: 'paid' });
    }
    if (pkg.payment_status === 'cancelled') return json(res, 200, { success: true, alreadyCancelled: true });

    const { data: tutor } = await db.from('profiles')
      .select('organization_id').eq('id', pkg.tutor_id).maybeSingle();
    const ownerOrganizationId = pkg.pool_organization_id || tutor?.organization_id || null;
    if (ownerOrganizationId !== auth.access.organizationId) {
      return json(res, 403, { error: 'Package belongs to another organization' });
    }

    const accountId = await resolveTutorStripeAccount(
      db,
      pkg.tutor_id,
      ownerOrganizationId,
    );
    if (pkg.stripe_checkout_session_id) {
      const secret = process.env.STRIPE_SECRET_KEY || '';
      if (!secret) return json(res, 500, { error: 'Stripe configuration error' });
      const stripe = new Stripe(secret, { apiVersion: '2023-10-16' as any });
      const checkout = await retrieveConnectCheckoutSessionWithScope(
        stripe,
        pkg.stripe_checkout_session_id,
        accountId,
      );
      if (checkout.session.payment_status === 'paid' || checkout.session.status === 'complete') {
        return json(res, 409, { error: 'Paketas jau apmokėtas', code: 'paid' });
      }
      if (checkout.session.status === 'open') {
        await expireConnectCheckoutSession(
          stripe,
          pkg.stripe_checkout_session_id,
          checkout.stripeAccount,
        );
      }
    }

    const { data, error } = await db.rpc('cancel_pending_lesson_package', {
      p_package_id: packageId,
      p_org_id: auth.access.organizationId,
      p_cancelled_by: auth.access.userId,
    });
    if (error) {
      const paidConflict = /already paid|has paid lessons/i.test(error.message || '');
      const conflict = paidConflict || /not pending/i.test(error.message || '');
      return json(res, conflict ? 409 : 500, {
        error: error.message,
        ...(paidConflict ? { code: 'paid' } : {}),
      });
    }
    return json(res, 200, { success: true, packageId: data || packageId });
  } catch (error: any) {
    console.error('[cancel-pending-package] error:', error);
    return json(res, 500, { error: 'Internal Server Error', details: error?.message || String(error) });
  }
}
