import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminSeatByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { releaseBillingBatchForReissue } from './_lib/releaseInvoiceBilling.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth || !auth.userId) return res.status(401).json({ error: 'Unauthorized' });

  const { billingBatchId } = req.body as { billingBatchId?: string };
  if (!billingBatchId) {
    return res.status(400).json({ error: 'Missing billingBatchId' });
  }

  try {
    const { data: batch, error: batchErr } = await supabase
      .from('billing_batches')
      .select('id, tutor_id, paid, payment_status, stripe_checkout_session_id')
      .eq('id', billingBatchId)
      .single();

    if (batchErr || !batch) {
      return res.status(404).json({ error: 'Billing batch not found' });
    }

    const seat = await getOrgAdminSeatByUserId(supabase, auth.userId);
    if (seat) {
      const { data: tutor } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', batch.tutor_id)
        .maybeSingle();
      if (
        seat.status !== 'active'
        || !hasOrgAdminPermission(seat.role, seat.permissions, 'finance.edit')
        || !tutor?.organization_id
        || seat.organizationId !== tutor.organization_id
      ) {
        return res.status(403).json({ error: 'Insufficient organization permission' });
      }
    } else if (batch.tutor_id !== auth.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { sessionIds, wasPaid } = await releaseBillingBatchForReissue(supabase, billingBatchId);

    return res.status(200).json({
      success: true,
      freedSessionIds: sessionIds,
      wasPaid,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[regenerate-monthly-invoice] Error:', err);
    return res.status(500).json({ error: message });
  }
}
