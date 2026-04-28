import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const tutorId = auth.userId;
  const periodStart = asString(req.query.periodStart);
  const periodEnd = asString(req.query.periodEnd);

  try {
    const { data: tutorProfile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', tutorId)
      .maybeSingle();

    const orgId = (tutorProfile as any)?.organization_id as string | null;
    if (!orgId) return res.status(200).json({ invoices: [], periodInvoices: [] });

    const { data: adminRows } = await supabase
      .from('organization_admins')
      .select('user_id')
      .eq('organization_id', orgId);
    const adminIds = new Set((adminRows || []).map((r: any) => r.user_id));

    // Tutor session ids for matching invoices (all-time for list, period-filtered for duplicates).
    let sessionIdsQuery = supabase
      .from('sessions')
      .select('id')
      .eq('tutor_id', tutorId)
      .neq('status', 'cancelled')
      .neq('status', 'no_show');

    if (periodStart) sessionIdsQuery = sessionIdsQuery.gte('start_time', `${periodStart}T00:00:00`);
    if (periodEnd) sessionIdsQuery = sessionIdsQuery.lte('start_time', `${periodEnd}T23:59:59`);

    const { data: tutorSessions } = await sessionIdsQuery.limit(10000);
    const tutorSessionIds = new Set((tutorSessions || []).map((s: any) => s.id));

    // Org invoices include admin-issued org_tutor invoices and own invoices.
    let orgInvoicesQuery = supabase
      .from('invoices')
      .select('id, invoice_number, issue_date, period_start, period_end, buyer_snapshot, total_amount, status, grouping_type, pdf_storage_path, issued_by_user_id, created_at, organization_id')
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(300);

    if (periodStart) orgInvoicesQuery = orgInvoicesQuery.eq('period_start', periodStart);
    if (periodEnd) orgInvoicesQuery = orgInvoicesQuery.eq('period_end', periodEnd);

    const { data: orgInvoices } = await orgInvoicesQuery;
    const invoiceIds = (orgInvoices || []).map((i: any) => i.id);

    let lineItemsByInvoice = new Map<string, string[]>();
    if (invoiceIds.length > 0) {
      const { data: lineItems } = await supabase
        .from('invoice_line_items')
        .select('invoice_id, session_ids')
        .in('invoice_id', invoiceIds);
      for (const li of lineItems || []) {
        const arr = Array.isArray((li as any).session_ids) ? ((li as any).session_ids as string[]) : [];
        const prev = lineItemsByInvoice.get((li as any).invoice_id) || [];
        lineItemsByInvoice.set((li as any).invoice_id, [...prev, ...arr]);
      }
    }

    const relevantOrgInvoices = (orgInvoices || []).filter((inv: any) => {
      if (inv.issued_by_user_id === tutorId) return true;
      const ids = lineItemsByInvoice.get(inv.id) || [];
      return ids.some((sid) => tutorSessionIds.has(sid));
    });

    const issuerIds = Array.from(new Set(relevantOrgInvoices.map((i: any) => i.issued_by_user_id).filter(Boolean)));
    let issuerNameMap: Record<string, string> = {};
    if (issuerIds.length > 0) {
      const { data: issuers } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', issuerIds);
      for (const i of issuers || []) issuerNameMap[(i as any).id] = (i as any).full_name || '—';
    }

    const invoices = relevantOrgInvoices.map((inv: any) => ({
      ...inv,
      issued_by_name: issuerNameMap[inv.issued_by_user_id] || '—',
      issued_by_is_admin: adminIds.has(inv.issued_by_user_id),
    }));

    return res.status(200).json({
      invoices,
      periodInvoices: invoices,
    });
  } catch (err: any) {
    console.error('[org-tutor-invoices] error:', err);
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}

