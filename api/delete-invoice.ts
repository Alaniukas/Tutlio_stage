import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });

  const { invoiceId } = req.body as { invoiceId?: string };
  if (!invoiceId) return res.status(400).json({ error: 'Missing invoiceId' });

  try {
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id, status, issued_by_user_id, organization_id, billing_batch_id, pdf_storage_path, origin')
      .eq('id', invoiceId)
      .maybeSingle();

    if (invErr || !invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Cannot delete a paid invoice' });
    }

    const access = await getOrgAdminAccessByUserId(supabase, auth.userId);
    if (access) {
      if (
        !hasOrgAdminPermission(access.role, access.permissions, 'finance.edit')
        || !invoice.organization_id
        || access.organizationId !== invoice.organization_id
      ) {
        return res.status(403).json({ error: 'Insufficient organization permission' });
      }
    } else if (invoice.issued_by_user_id !== auth.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (invoice.billing_batch_id) {
      const { data: batch } = await supabase
        .from('billing_batches')
        .select('id, paid, payment_status')
        .eq('id', invoice.billing_batch_id)
        .maybeSingle();
      if (batch?.paid === true || batch?.payment_status === 'paid') {
        return res.status(400).json({ error: 'Cannot delete a paid invoice' });
      }

      const { data: batchSessions } = await supabase
        .from('billing_batch_sessions')
        .select('session_id')
        .eq('billing_batch_id', invoice.billing_batch_id);
      const sessionIds = (batchSessions || []).map((bs) => bs.session_id).filter(Boolean);
      if (sessionIds.length > 0) {
        await supabase.from('sessions').update({ payment_batch_id: null }).in('id', sessionIds);
      }
      await supabase.from('billing_batch_sessions').delete().eq('billing_batch_id', invoice.billing_batch_id);
      await supabase.from('billing_batches').delete().eq('id', invoice.billing_batch_id);
    }

    const { data: lineItems } = await supabase
      .from('invoice_line_items')
      .select('session_ids')
      .eq('invoice_id', invoiceId);
    const sessionIdsFromLines = new Set<string>();
    for (const li of lineItems || []) {
      const ids = Array.isArray((li as { session_ids?: string[] }).session_ids)
        ? (li as { session_ids: string[] }).session_ids
        : [];
      for (const sid of ids) sessionIdsFromLines.add(sid);
    }
    if (sessionIdsFromLines.size > 0) {
      await supabase
        .from('sessions')
        .update({ payment_batch_id: null })
        .in('id', Array.from(sessionIdsFromLines));
    }

    await supabase
      .from('lesson_packages')
      .update({ manual_sales_invoice_id: null })
      .eq('manual_sales_invoice_id', invoiceId);

    if (invoice.pdf_storage_path) {
      await supabase.storage.from('invoices').remove([invoice.pdf_storage_path]);
    }

    const { error: deleteErr } = await supabase.from('invoices').delete().eq('id', invoiceId);
    if (deleteErr) throw deleteErr;

    return res.status(200).json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[delete-invoice] Error:', err);
    return res.status(500).json({ error: message });
  }
}
