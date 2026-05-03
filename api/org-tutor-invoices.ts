import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function collectSessionIdsFromLineItems(
  lineItems: { invoice_id?: string; session_ids?: unknown }[] | null,
): Map<string, string[]> {
  const lineItemsByInvoice = new Map<string, string[]>();
  for (const li of lineItems || []) {
    const invId = (li as any).invoice_id as string | undefined;
    if (!invId) continue;
    const raw = (li as any).session_ids;
    const arr = Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
    const prev = lineItemsByInvoice.get(invId) || [];
    lineItemsByInvoice.set(invId, [...prev, ...arr]);
  }
  return lineItemsByInvoice;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const tutorId = auth.userId;
  const periodStart = asString(req.query.periodStart);
  const periodEnd = asString(req.query.periodEnd);
  const hasPeriod = !!(periodStart && periodEnd);

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

    let orgInvoicesQuery = supabase
      .from('invoices')
      .select(
        'id, invoice_number, issue_date, period_start, period_end, buyer_snapshot, total_amount, status, grouping_type, pdf_storage_path, issued_by_user_id, created_at, organization_id',
      )
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(300);

    if (periodStart) orgInvoicesQuery = orgInvoicesQuery.eq('period_start', periodStart);
    if (periodEnd) orgInvoicesQuery = orgInvoicesQuery.eq('period_end', periodEnd);

    const { data: orgInvoices } = await orgInvoicesQuery;
    const invoiceIds = (orgInvoices || []).map((i: any) => i.id);

    let lineItemsByInvoice = new Map<string, string[]>();
    let tutorOwnedSessionIds = new Set<string>();

    if (invoiceIds.length > 0) {
      const { data: lineItems } = await supabase
        .from('invoice_line_items')
        .select('invoice_id, session_ids')
        .in('invoice_id', invoiceIds);

      lineItemsByInvoice = collectSessionIdsFromLineItems(lineItems || []);

      if (hasPeriod) {
        const { data: tutorSessions } = await supabase
          .from('sessions')
          .select('id')
          .eq('tutor_id', tutorId)
          .neq('status', 'cancelled')
          .neq('status', 'no_show')
          .gte('start_time', `${periodStart}T00:00:00`)
          .lte('start_time', `${periodEnd}T23:59:59`)
          .limit(5000);
        tutorOwnedSessionIds = new Set((tutorSessions || []).map((s: any) => s.id));
      } else {
        const referenced = new Set<string>();
        for (const ids of lineItemsByInvoice.values()) ids.forEach((id) => referenced.add(id));

        const unique = [...referenced];
        const chunkSize = 500;
        for (let i = 0; i < unique.length; i += chunkSize) {
          const chunk = unique.slice(i, i + chunkSize);
          const { data: owned } = await supabase.from('sessions').select('id').eq('tutor_id', tutorId).in('id', chunk);
          for (const row of owned || []) tutorOwnedSessionIds.add((row as any).id);
        }
      }
    }

    const relevantOrgInvoices = (orgInvoices || []).filter((inv: any) => {
      if (inv.issued_by_user_id === tutorId) return true;
      const ids = lineItemsByInvoice.get(inv.id) || [];
      return ids.some((sid) => tutorOwnedSessionIds.has(sid));
    });

    const issuerIds = Array.from(new Set(relevantOrgInvoices.map((i: any) => i.issued_by_user_id).filter(Boolean)));
    let issuerNameMap: Record<string, string> = {};
    if (issuerIds.length > 0) {
      const { data: issuers } = await supabase.from('profiles').select('id, full_name').in('id', issuerIds);
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
