import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { isOwnOrgTutorInvoice } from '../src/lib/orgTutorInvoiceAccess.js';

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
  res.setHeader('Cache-Control', 'private, no-store');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  try {
    const { data: tutorProfile, error: profileError } = await supabase
      .from('profiles').select('organization_id').eq('id', auth.userId).maybeSingle();
    if (profileError) throw profileError;
    const orgId = tutorProfile?.organization_id;
    if (!orgId) return res.status(200).json({ invoices: [], periodInvoices: [] });

    // Filter before loading customer identities, amounts, or payment states.
    // Neither lesson membership nor issued_by_user_id authorizes client finances.
    let query = supabase.from('invoices')
      .select('id, invoice_number, issue_date, period_start, period_end, buyer_snapshot, total_amount, status, grouping_type, pdf_storage_path, issued_by_user_id, created_at, organization_id, pdf_meta')
      .eq('organization_id', orgId)
      .eq('pdf_meta->>invoiceKind', 'tutor_pay')
      .eq('pdf_meta->>tutorId', auth.userId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false }).limit(300);
    const periodStart = asString(req.query.periodStart);
    const periodEnd = asString(req.query.periodEnd);
    if (periodStart) query = query.eq('period_start', periodStart);
    if (periodEnd) query = query.eq('period_end', periodEnd);
    const { data, error } = await query;
    if (error) throw error;
    const invoices = (data || []).filter(invoice => isOwnOrgTutorInvoice(invoice, auth.userId!));
    return res.status(200).json({ invoices, periodInvoices: invoices });
  } catch (err) {
    console.error('[org-tutor-invoices] error:', err);
    return res.status(503).json({ error: 'Invoice access unavailable' });
  }
}
