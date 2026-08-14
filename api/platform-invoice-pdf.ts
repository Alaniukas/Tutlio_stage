// GET /api/platform-invoice-pdf?id=<uuid> — agency downloads its Tutlio B2B invoice.
// Auth: user JWT; must be an org admin of the invoice's organization.
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { generateInvoicePdf, type InvoicePdfData } from './_lib/invoicePdf.js';
import { TUTLIO_COMPANY } from './_lib/tutlioCompany.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });

  const invoiceId = typeof req.query.id === 'string' ? req.query.id : '';
  if (!invoiceId) return res.status(400).json({ error: 'Missing invoice id' });

  try {
    const { data: invoice, error: invErr } = await supabase
      .from('platform_invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle();
    if (invErr || !invoice) return res.status(404).json({ error: 'Invoice not found' });

    const adminRow = await getOrgAdminAccessByUserId(supabase, auth.userId);
    if (
      !adminRow
      || adminRow.organizationId !== invoice.organization_id
      || !hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'finance.view')
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (invoice.pdf_storage_path) {
      const { data: fileData, error: dlErr } = await supabase.storage
        .from('invoices')
        .download(invoice.pdf_storage_path);
      if (!dlErr && fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer());
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${invoice.invoice_number}.pdf"`);
        return res.status(200).send(buffer);
      }
    }

    // Storage miss — regenerate from the stored invoice row.
    const [{ data: org }, { data: invProfile }] = await Promise.all([
      supabase.from('organizations').select('name, email').eq('id', invoice.organization_id).maybeSingle(),
      supabase
        .from('invoice_profiles')
        .select('business_name, company_code, vat_code, address, contact_email, contact_phone')
        .eq('organization_id', invoice.organization_id)
        .maybeSingle(),
    ]);

    const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
    const pdfData: InvoicePdfData = {
      invoiceNumber: invoice.invoice_number,
      issueDate: new Date(invoice.created_at).toLocaleDateString('lt-LT'),
      periodStart: new Date(invoice.period_start).toLocaleDateString('lt-LT'),
      periodEnd: new Date(invoice.period_end).toLocaleDateString('lt-LT'),
      seller: { ...TUTLIO_COMPANY },
      buyer: {
        name: invProfile?.business_name || org?.name || 'Organizacija',
        companyCode: invProfile?.company_code || undefined,
        vatCode: invProfile?.vat_code || undefined,
        address: invProfile?.address || undefined,
        email: invProfile?.contact_email || org?.email || undefined,
        phone: invProfile?.contact_phone || undefined,
      },
      lineItems: lineItems.map((li: any) => ({
        description: String(li.description || ''),
        quantity: Number(li.quantity) || 0,
        unitPrice: Number(li.unitPrice) || 0,
        totalPrice: Number(li.totalPrice) || 0,
      })),
      totalAmount: Number(invoice.total_amount),
      deductedAmount: Number(invoice.deducted_amount) > 0 ? Number(invoice.deducted_amount) : undefined,
      amountDue: Number(invoice.amount_due),
    };

    const pdfBytes = await generateInvoicePdf(pdfData);

    // Cache for future requests
    const storagePath = `platform/${invoice.organization_id}/${invoiceId}.pdf`;
    try {
      await supabase.storage
        .from('invoices')
        .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
      await supabase.from('platform_invoices').update({ pdf_storage_path: storagePath }).eq('id', invoiceId);
    } catch {
      // ignore cache failures
    }

    const buffer = Buffer.from(pdfBytes);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoice_number}.pdf"`);
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error('[platform-invoice-pdf] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
