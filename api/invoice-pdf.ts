import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { resolveInvoiceBranding } from './_lib/invoiceBranding.js';
import { generateInvoicePdf, type InvoicePdfData } from './_lib/invoicePdf.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { formatInvoiceSeriesHeading } from './_lib/invoiceNumber.js';
import { parsePvmPdfMeta } from './_lib/pvmEducationInvoice.js';
import {
  CLASSIC_LT_TUTOR_LAYOUT,
  parseClassicLtTutorPdfMeta,
} from './_lib/manoKorepetitoriusInvoice.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import {
  invoicePartyMatches,
  proKlaseVatExemptionNote,
} from './_lib/proKlaseInvoice.js';

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

    if (invoice.issued_by_user_id !== userId) {
      if (invoice.organization_id) {
        const adminRow = await getOrgAdminAccessByUserId(supabase, userId);
        if (
          !adminRow
          || adminRow.organizationId !== invoice.organization_id
          || !hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'finance.view')
        ) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      } else {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    if ((invoice as { origin?: string }).origin === 'external') {
      return res.status(400).json({ error: 'External reserved invoices have no PDF' });
    }

    const brandingPreview = invoice.organization_id
      ? await resolveInvoiceBranding(supabase, invoice.organization_id)
      : null;
    const pvmMetaEarly = parsePvmPdfMeta(invoice.pdf_meta);
    const classicTutorMetaEarly = parseClassicLtTutorPdfMeta(invoice.pdf_meta);

    const isProKlaseInvoice = isProKlaseOrg(invoice.organization_id);
    if (
      !brandingPreview
      && !pvmMetaEarly
      && !classicTutorMetaEarly
      && !isProKlaseInvoice
      && invoice.pdf_storage_path
    ) {
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

    const { data: lineItems } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true });

    const branding = classicTutorMetaEarly ? null : brandingPreview;
    const pvmMeta = pvmMetaEarly;
    const classicTutorMeta = classicTutorMetaEarly;
    const sellerSnapshot = {
      ...(invoice.seller_snapshot as InvoicePdfData['seller']),
    };

    // Older Pro Klasė invoices predate the stored tax note. Reconstruct it when
    // the seller snapshot is the organization, while leaving tutor -> org
    // invoices untouched because the tutor is the seller in that flow.
    if (isProKlaseInvoice && !sellerSnapshot.taxExemptionNote) {
      const [{ data: organization }, { data: organizationInvoiceProfile }] = await Promise.all([
        supabase
          .from('organizations')
          .select('name')
          .eq('id', invoice.organization_id)
          .maybeSingle(),
        supabase
          .from('invoice_profiles')
          .select('business_name, company_code')
          .eq('organization_id', invoice.organization_id)
          .maybeSingle(),
      ]);
      const organizationIdentity = {
        name: organizationInvoiceProfile?.business_name || organization?.name || null,
        companyCode: organizationInvoiceProfile?.company_code || null,
      };
      const hasOrganizationIdentity = Boolean(
        organizationIdentity.name || organizationIdentity.companyCode,
      );
      const buyerIsOrganization = invoicePartyMatches(
        invoice.buyer_snapshot as InvoicePdfData['buyer'],
        organizationIdentity,
      );
      const sellerIsOrganization = invoicePartyMatches(sellerSnapshot, organizationIdentity)
        || (hasOrganizationIdentity && !buyerIsOrganization);
      const taxExemptionNote = proKlaseVatExemptionNote(
        invoice.organization_id,
        sellerIsOrganization,
      );
      if (taxExemptionNote) sellerSnapshot.taxExemptionNote = taxExemptionNote;
    }

    const seller = sellerSnapshot;

    const pdfData: InvoicePdfData = {
      invoiceNumber: invoice.invoice_number,
      issueDate: classicTutorMeta
        ? String(invoice.issue_date).slice(0, 10)
        : new Date(invoice.issue_date).toLocaleDateString('lt-LT'),
      periodStart: invoice.period_start
        ? new Date(invoice.period_start).toLocaleDateString('lt-LT')
        : undefined,
      periodEnd: invoice.period_end
        ? new Date(invoice.period_end).toLocaleDateString('lt-LT')
        : undefined,
      seller: sellerSnapshot,
      buyer: invoice.buyer_snapshot as InvoicePdfData['buyer'],
      lineItems: (lineItems || []).map((li: any) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: Number(li.unit_price),
        totalPrice: Number(li.total_price),
      })),
      totalAmount: Number(invoice.total_amount),
      branding: branding ?? undefined,
      isVatInvoice: !!seller?.vatCode || !!pvmMeta,
      invoiceNumberLabel: pvmMeta || classicTutorMeta
        ? formatInvoiceSeriesHeading(invoice.invoice_number)
        : `Nr. ${invoice.invoice_number}`,
      ...(pvmMeta
        ? {
            layout: 'pvm_education' as const,
            notes: pvmMeta.notes,
            lessonDetails: pvmMeta.lessonDetails,
            hidePlatformFooter: true,
          }
        : {}),
      ...(classicTutorMeta
        ? {
            layout: CLASSIC_LT_TUTOR_LAYOUT,
            lessonDetails: classicTutorMeta.lessonDetails,
            hidePlatformFooter: true,
            issuedByName: classicTutorMeta.issuedByName,
          }
        : {}),
    };

    const pdfBytes = await generateInvoicePdf(pdfData);

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
