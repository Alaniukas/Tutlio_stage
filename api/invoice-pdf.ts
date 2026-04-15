import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { generateInvoicePdf, type InvoicePdfData } from './_lib/invoicePdf.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const userId = auth.userId;
  const invoiceId = req.query.id as string;

  if (!invoiceId) return res.status(400).json({ error: 'Missing invoice id' });

  try {
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (invErr || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Authorization: must be the issuer or an org admin for the invoice's org
    if (invoice.issued_by_user_id !== userId) {
      if (invoice.organization_id) {
        const { data: adminRow } = await supabase
          .from('organization_admins')
          .select('id')
          .eq('user_id', userId)
          .eq('organization_id', invoice.organization_id)
          .maybeSingle();
        if (!adminRow) return res.status(403).json({ error: 'Forbidden' });
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // Try serving from storage first
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

    // Regenerate on the fly
    const { data: lineItems } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true });

    const pdfData: InvoicePdfData = {
      invoiceNumber: invoice.invoice_number,
      issueDate: new Date(invoice.issue_date).toLocaleDateString('lt-LT'),
      periodStart: invoice.period_start
        ? new Date(invoice.period_start).toLocaleDateString('lt-LT')
        : undefined,
      periodEnd: invoice.period_end
        ? new Date(invoice.period_end).toLocaleDateString('lt-LT')
        : undefined,
      seller: invoice.seller_snapshot as InvoicePdfData['seller'],
      buyer: invoice.buyer_snapshot as InvoicePdfData['buyer'],
      lineItems: (lineItems || []).map((li: any) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: Number(li.unit_price),
        totalPrice: Number(li.total_price),
      })),
      totalAmount: Number(invoice.total_amount),
    };

    const pdfBytes = await generateInvoicePdf(pdfData);

    // Cache for future requests
    const storagePath = `${invoice.issued_by_user_id}/${invoiceId}.pdf`;
    try {
      await supabase.storage
        .from('invoices')
        .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
    } catch {
      // ignore cache upload failures
    }

    try {
      await supabase
        .from('invoices')
        .update({ pdf_storage_path: storagePath })
        .eq('id', invoiceId);
    } catch {
      // ignore cache update failures
    }

    const buffer = Buffer.from(pdfBytes);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoice.invoice_number}.pdf"`);
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error('[invoice-pdf] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
