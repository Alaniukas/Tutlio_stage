// /api/admin-b2c-invoices — monthly B2C commission invoices (sąskaitos faktūros).
// One invoice per counterparty (agency or individual tutor) for the Tutlio
// intermediation fees of that month; issued as PAID (fees already deducted).
// POST { month: 'YYYY-MM' }            → generate invoices for every client with fees
// GET  ?month=YYYY-MM                  → list generated invoices for the month
// GET  ?invoiceId=<uuid>&download=1    → download one invoice PDF
// Auth: x-admin-secret header (same pattern as admin-b2b-invoices).

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { generateInvoicePdf, type InvoicePdfData } from './_lib/invoicePdf.js';
import { TUTLIO_COMPANY } from './_lib/tutlioCompany.js';
import { monthRangeUtc, monthPeriodDates } from './_lib/b2cReport.js';
import {
  groupB2cFeesByCounterparty,
  buildB2cCommissionLines,
  formatB2cInvoiceNumber,
  B2C_PAID_NOTE,
  type B2cCounterpartyFees,
} from './_lib/b2cCommissionInvoice.js';

function getPlatformAdminSecret(): string {
  const s = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;
  return (s && String(s).trim()) || '';
}

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, supabaseServiceRoleClientOptions() as any) as any;
}

async function nextInvoiceNumber(sb: any): Promise<string> {
  const { data, error } = await sb.rpc('next_b2c_invoice_number');
  if (error || data == null) {
    // Fallback keeps generation working (still unique) if the RPC is missing.
    console.error('[admin-b2c-invoices] invoice number RPC error:', error?.message);
    return `TUT-B2C-${Date.now()}`;
  }
  return formatB2cInvoiceNumber(Number(data));
}

interface BuyerInfo {
  buyer: InvoicePdfData['buyer'];
  displayName: string;
}

/** Buyer requisites: agencies reuse invoice_profiles, tutors use their profile. */
async function resolveBuyers(sb: any, counterparties: B2cCounterpartyFees[]): Promise<Map<string, BuyerInfo>> {
  const orgIds = counterparties.filter((c) => c.counterpartyType === 'org').map((c) => c.counterpartyId);
  const tutorIds = counterparties.filter((c) => c.counterpartyType === 'tutor').map((c) => c.counterpartyId);

  const [orgsRes, invProfilesRes, tutorsRes] = await Promise.all([
    orgIds.length
      ? sb.from('organizations').select('id, name, email').in('id', orgIds)
      : Promise.resolve({ data: [] }),
    orgIds.length
      ? sb.from('invoice_profiles').select('organization_id, business_name, company_code, vat_code, address, contact_email, contact_phone').in('organization_id', orgIds)
      : Promise.resolve({ data: [] }),
    tutorIds.length
      ? sb.from('profiles').select('id, full_name, email').in('id', tutorIds)
      : Promise.resolve({ data: [] }),
  ]);

  const invProfileByOrg = new Map<string, any>();
  for (const p of invProfilesRes.data || []) invProfileByOrg.set(p.organization_id, p);

  const buyers = new Map<string, BuyerInfo>();
  for (const o of orgsRes.data || []) {
    const p = invProfileByOrg.get(o.id);
    const name = p?.business_name || o.name || 'Organizacija';
    buyers.set(`org:${o.id}`, {
      displayName: name,
      buyer: {
        name,
        companyCode: p?.company_code || undefined,
        vatCode: p?.vat_code || undefined,
        address: p?.address || undefined,
        email: p?.contact_email || o.email || undefined,
        phone: p?.contact_phone || undefined,
      },
    });
  }
  for (const t of tutorsRes.data || []) {
    const name = t.full_name || 'Korepetitorius';
    buyers.set(`tutor:${t.id}`, {
      displayName: name,
      buyer: { name, email: t.email || undefined },
    });
  }
  return buyers;
}

async function handleGenerate(sb: any, req: VercelRequest, res: VercelResponse) {
  const month = typeof (req.body as any)?.month === 'string' ? (req.body as any).month : '';
  const period = monthPeriodDates(month);
  const range = monthRangeUtc(month);
  if (!period || !range) return res.status(400).json({ error: 'Invalid month, expected YYYY-MM' });

  const [stripeRes, perlasRes, existingRes] = await Promise.all([
    sb.from('platform_fee_ledger')
      .select('organization_id, tutor_id, platform_fee')
      .gte('paid_at', range.startIso)
      .lt('paid_at', range.endIso),
    sb.from('perlas_ledger')
      .select('entity_type, entity_id, platform_fee, perlas_fee')
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso),
    sb.from('platform_invoices')
      .select('organization_id, tutor_id')
      .eq('invoice_type', 'b2c_commission')
      .eq('period_start', period.periodStart),
  ]);
  if (stripeRes.error) return res.status(500).json({ error: stripeRes.error.message });
  if (perlasRes.error) return res.status(500).json({ error: perlasRes.error.message });

  const { counterparties, unattributedOperations } = groupB2cFeesByCounterparty({
    stripeRows: stripeRes.data || [],
    perlasRows: perlasRes.data || [],
  });

  const alreadyInvoiced = new Set<string>(
    (existingRes.data || []).map((r: any) => (r.organization_id ? `org:${r.organization_id}` : `tutor:${r.tutor_id}`)),
  );

  const buyers = await resolveBuyers(sb, counterparties);
  const issueDate = new Date().toLocaleDateString('lt-LT');
  const generated: { counterparty: string; invoiceNumber: string; totalAmount: number }[] = [];
  const skipped: { counterparty: string; reason: string }[] = [];

  for (const cp of counterparties) {
    const key = `${cp.counterpartyType}:${cp.counterpartyId}`;
    const info = buyers.get(key);
    const displayName = info?.displayName || cp.counterpartyId;

    if (alreadyInvoiced.has(key)) {
      skipped.push({ counterparty: displayName, reason: 'already_invoiced' });
      continue;
    }

    try {
      const lines = buildB2cCommissionLines({ month, fees: cp });
      if (lines.totalAmount <= 0) continue;

      const invoiceNumber = await nextInvoiceNumber(sb);
      const { data: invoice, error: insErr } = await sb
        .from('platform_invoices')
        .insert({
          invoice_number: invoiceNumber,
          invoice_type: 'b2c_commission',
          organization_id: cp.counterpartyType === 'org' ? cp.counterpartyId : null,
          tutor_id: cp.counterpartyType === 'tutor' ? cp.counterpartyId : null,
          period_start: period.periodStart,
          period_end: period.periodEnd,
          line_items: lines.lineItems,
          total_amount: lines.totalAmount,
          deducted_amount: lines.deductedAmount,
          amount_due: lines.amountDue,
        })
        .select('id')
        .single();

      if (insErr || !invoice) {
        const reason = insErr?.code === '23505' ? 'already_invoiced' : insErr?.message || 'insert_failed';
        skipped.push({ counterparty: displayName, reason });
        continue;
      }

      const pdfBytes = await generateInvoicePdf({
        invoiceNumber,
        issueDate,
        periodStart: new Date(period.periodStart).toLocaleDateString('lt-LT'),
        periodEnd: new Date(period.periodEnd).toLocaleDateString('lt-LT'),
        seller: { ...TUTLIO_COMPANY },
        buyer: info?.buyer || { name: displayName },
        lineItems: lines.lineItems,
        totalAmount: lines.totalAmount,
        paidNote: B2C_PAID_NOTE,
      });

      const storagePath = `platform/b2c/${cp.counterpartyId}/${invoice.id}.pdf`;
      const { error: uploadErr } = await sb.storage
        .from('invoices')
        .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
      if (uploadErr) {
        console.error('[admin-b2c-invoices] PDF upload error:', uploadErr.message);
      } else {
        await sb.from('platform_invoices').update({ pdf_storage_path: storagePath }).eq('id', invoice.id);
      }

      generated.push({ counterparty: displayName, invoiceNumber, totalAmount: lines.totalAmount });
    } catch (e: any) {
      console.error('[admin-b2c-invoices] generation error:', e);
      skipped.push({ counterparty: displayName, reason: e?.message || 'unexpected_error' });
    }
  }

  return res.status(200).json({
    generated,
    skipped,
    unattributedOperations,
    message: counterparties.length === 0 ? 'Šio mėnesio mokesčių nėra — sąskaitų generuoti nereikia.' : undefined,
  });
}

async function handleList(sb: any, month: string, res: VercelResponse) {
  const period = monthPeriodDates(month);
  if (!period) return res.status(400).json({ error: 'Invalid month, expected YYYY-MM' });

  const { data, error } = await sb
    .from('platform_invoices')
    .select('id, invoice_number, organization_id, tutor_id, total_amount, pdf_storage_path, created_at, organizations(name), profiles(full_name)')
    .eq('invoice_type', 'b2c_commission')
    .eq('period_start', period.periodStart)
    .order('invoice_number', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const invoices = (data || []).map((r: any) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    counterparty_name: r.organizations?.name || r.profiles?.full_name || r.organization_id || r.tutor_id,
    counterparty_type: r.organization_id ? 'org' : 'tutor',
    total_amount: Number(r.total_amount) || 0,
    has_pdf: Boolean(r.pdf_storage_path),
    created_at: r.created_at,
  }));
  return res.status(200).json({ invoices });
}

async function handleDownload(sb: any, invoiceId: string, res: VercelResponse) {
  const { data: invoice, error } = await sb
    .from('platform_invoices')
    .select('invoice_number, pdf_storage_path')
    .eq('id', invoiceId)
    .eq('invoice_type', 'b2c_commission')
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!invoice?.pdf_storage_path) return res.status(404).json({ error: 'Invoice PDF not found' });

  const { data: blob, error: dlErr } = await sb.storage.from('invoices').download(invoice.pdf_storage_path);
  if (dlErr || !blob) return res.status(404).json({ error: 'Invoice PDF not found in storage' });

  const buf = Buffer.from(await blob.arrayBuffer());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
  return res.status(200).send(buf);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminSecret = getPlatformAdminSecret();
  const secret = typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '';
  if (!adminSecret || !secret || !secretsMatch(secret, adminSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Database not configured' });

  try {
    if (req.method === 'POST') return await handleGenerate(sb, req, res);

    const invoiceId = typeof req.query.invoiceId === 'string' ? req.query.invoiceId : '';
    if (invoiceId && req.query.download) return await handleDownload(sb, invoiceId, res);

    const month = typeof req.query.month === 'string' ? req.query.month : '';
    return await handleList(sb, month, res);
  } catch (err: any) {
    console.error('[admin-b2c-invoices] Error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
