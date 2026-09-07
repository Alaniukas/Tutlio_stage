import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { allocateInvoiceNumber } from './_lib/invoiceNumber.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });

  const adminRow = await getOrgAdminAccessByUserId(supabase, auth.userId);
  if (!adminRow || !hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'finance.edit')) {
    return res.status(403).json({ error: 'Insufficient organization permission' });
  }

  const body = (req.body || {}) as {
    count?: number;
    issueDate?: string;
    buyerName?: string;
    amount?: number;
    note?: string;
  };

  const count = Math.min(50, Math.max(1, Math.floor(Number(body.count) || 1)));
  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.issueDate || ''))
    ? String(body.issueDate)
    : new Date().toISOString().slice(0, 10);
  const buyerName = (body.buyerName || '').trim() || 'Išorinė sąskaita';
  const note = (body.note || '').trim();
  const amount = Number(body.amount);
  const totalAmount = Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : 0;

  const { data: profile, error: profErr } = await supabase
    .from('invoice_profiles')
    .select('*')
    .eq('organization_id', adminRow.organizationId)
    .maybeSingle();

  if (profErr) return res.status(500).json({ error: profErr.message });
  if (!profile?.id) return res.status(400).json({ error: 'Organization invoice profile is missing' });

  const sellerSnapshot = {
    name: profile.business_name || 'Įmonė',
    entityType: profile.entity_type,
    companyCode: profile.company_code || undefined,
    vatCode: profile.vat_code || undefined,
    address: profile.address || undefined,
    contactEmail: profile.contact_email || undefined,
    contactPhone: profile.contact_phone || undefined,
    bankName: profile.bank_name || undefined,
    iban: profile.iban || undefined,
  };

  const created: { id: string; invoice_number: string }[] = [];

  try {
    for (let i = 0; i < count; i++) {
      const invoiceNumber = await allocateInvoiceNumber(supabase, profile.id as string);
      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          issued_by_user_id: auth.userId,
          organization_id: adminRow.organizationId,
          seller_snapshot: sellerSnapshot,
          buyer_snapshot: { name: buyerName, note: note || undefined },
          issue_date: issueDate,
          period_start: issueDate,
          period_end: issueDate,
          grouping_type: 'single',
          subtotal: totalAmount,
          total_amount: totalAmount,
          status: 'issued',
          origin: 'external',
          pdf_meta: { layout: 'external_reservation', note: note || null },
        })
        .select('id, invoice_number')
        .single();

      if (invErr || !invoice) {
        throw new Error(invErr?.message || 'Failed to reserve invoice number');
      }
      created.push({ id: invoice.id, invoice_number: invoice.invoice_number });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to reserve invoice numbers', created });
  }

  return res.status(201).json({ ok: true, invoices: created });
}
