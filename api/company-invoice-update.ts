import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types.js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import { isOwnOrgTutorInvoice } from '../src/lib/orgTutorInvoiceAccess.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, supabaseServiceRoleClientOptions());
    const access = await requireOrgAdminAccess(req, supabase, 'finance.edit');
    if (access.ok === false) return res.status(access.status).json({ error: access.error });
    const { invoiceId, action, expectedNumber } = req.body || {};
    const number = typeof req.body?.invoiceNumber === 'string' ? req.body.invoiceNumber.trim().toUpperCase() : '';
    if (!UUID.test(String(invoiceId || '')) || !['mark_paid', 'change_number'].includes(action)
      || (action === 'change_number' && (!/^[\p{L}\p{N}][\p{L}\p{N}._/-]{0,59}$/u.test(number)
        || typeof expectedNumber !== 'string'))) {
      return res.status(400).json({ error: 'Invalid invoice change' });
    }
    const orgId = access.access.organizationId;
    const { data: invoice, error: loadError } = await supabase.from('invoices')
      .select('id, invoice_number, status, origin, billing_batch_id, pdf_meta')
      .eq('id', invoiceId).eq('organization_id', orgId).maybeSingle();
    if (loadError) throw loadError;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.origin === 'external' || invoice.billing_batch_id || !['issued', 'paid'].includes(invoice.status)) {
      return res.status(409).json({ error: 'Invoice cannot be changed' });
    }
    if (action === 'change_number' && (!isProKlaseOrg(orgId)
      || !isOwnOrgTutorInvoice(invoice, invoice.pdf_meta?.tutorId || ''))) {
      return res.status(403).json({ error: 'Only tutor remuneration numbers can be corrected here' });
    }
    if (action === 'mark_paid') {
      if (invoice.status === 'paid') return res.status(200).json({ invoice });
      const { data: saved, error } = await supabase.from('invoices')
        .update({ status: 'paid', pdf_meta: { ...invoice.pdf_meta,
          manualPayment: { confirmedAt: new Date().toISOString(), confirmedBy: access.access.userId } } })
        .eq('id', invoiceId).eq('organization_id', orgId).eq('status', 'issued')
        .eq('invoice_number', invoice.invoice_number)
        .select('id, invoice_number, status').maybeSingle();
      if (error) throw error;
      if (!saved || saved.status !== 'paid') return res.status(409).json({ error: 'Invoice changed; refresh and retry' });
      return res.status(200).json({ invoice: saved });
    }
    const { data: saved, error } = await supabase.rpc('correct_org_tutor_invoice_number', {
      p_organization_id: orgId, p_invoice_id: invoiceId, p_expected_number: expectedNumber,
      p_new_number: number, p_changed_by: access.access.userId,
    });
    if (error) return res.status(['23505', '40001'].includes(error.code) ? 409 : 503)
      .json({ error: error.code === '23505' ? 'Invoice number already used in organization' : 'Invoice number could not be saved' });
    if (!saved || saved.id !== invoiceId || saved.invoice_number !== number) {
      return res.status(503).json({ error: 'Invoice number could not be saved' });
    }
    return res.status(200).json({ invoice: saved });
  } catch (error) {
    console.error('[company-invoice-update]', error instanceof Error ? error.message : 'Invoice update failed');
    return res.status(503).json({ error: 'Invoice update unavailable' });
  }
}
