// /api/admin-b2b-invoices — monthly B2B platform invoices for agencies.
// POST { month: 'YYYY-MM' }            → generate + email invoices for all eligible orgs
// GET  ?month=YYYY-MM                  → list generated invoices for the month
// GET  ?invoiceId=<uuid>&download=1    → download one invoice PDF
// Auth: x-admin-secret header (same pattern as admin-organizations).

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { generateInvoicePdf, type InvoicePdfData } from './_lib/invoicePdf.js';
import { buildB2bInvoiceLines, lithuanianMonthLabel } from './_lib/b2bInvoice.js';
import { TUTLIO_COMPANY } from './_lib/tutlioCompany.js';
import { monthRangeUtc } from './_lib/b2cReport.js';

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

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v && String(v).trim().length > 0 ? String(v) : null;
}

function resolveApiUrl(req: VercelRequest, path: string): string {
  const vu = process.env.VERCEL_URL;
  if (vu && String(vu).trim()) {
    const host = String(vu).replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${host}${path}`;
  }
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  if (origin) return `${origin.replace(/\/$/, '')}${path}`;
  const base = (getEnv('APP_URL') || getEnv('VITE_APP_URL') || 'http://127.0.0.1:3002').replace(/\/$/, '');
  return `${base}${path}`;
}

async function postInternalJson(url: string, payload: unknown, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** "YYYY-MM" -> { periodStart: 'YYYY-MM-01', periodEnd: last day of the month }. */
function monthPeriodDates(month: string): { periodStart: string; periodEnd: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const mon = Number(m[2]);
  if (mon < 1 || mon > 12) return null;
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const mm = String(mon).padStart(2, '0');
  return { periodStart: `${year}-${mm}-01`, periodEnd: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

async function nextInvoiceNumber(sb: any): Promise<string> {
  const { data, error } = await sb.rpc('next_platform_invoice_number');
  if (error || data == null) {
    // Fallback keeps generation working (still unique) if the RPC is missing.
    console.error('[admin-b2b-invoices] invoice number RPC error:', error?.message);
    return `TUT-${Date.now()}`;
  }
  return `TUT-${String(Number(data)).padStart(5, '0')}`;
}

async function handleGenerate(sb: any, req: VercelRequest, res: VercelResponse) {
  const month = typeof (req.body as any)?.month === 'string' ? (req.body as any).month : '';
  const period = monthPeriodDates(month);
  const range = monthRangeUtc(month);
  if (!period || !range) return res.status(400).json({ error: 'Invalid month, expected YYYY-MM' });

  const { data: orgs, error: orgErr } = await sb
    .from('organizations')
    .select('id, name, email, entity_type, status, platform_monthly_fee_eur')
    .eq('entity_type', 'company')
    .not('platform_monthly_fee_eur', 'is', null);
  if (orgErr) return res.status(500).json({ error: orgErr.message });

  const eligible = (orgs || []).filter(
    (o: any) => o.status !== 'suspended' && Number(o.platform_monthly_fee_eur) > 0,
  );
  if (eligible.length === 0) {
    return res.status(200).json({ generated: [], skipped: [], message: 'No eligible agencies (entity_type=company with platform_monthly_fee_eur set)' });
  }

  const orgIds = eligible.map((o: any) => o.id);

  const [{ data: existingRows }, { data: feeRows, error: feeErr }, { data: invProfiles }] = await Promise.all([
    sb.from('platform_invoices').select('organization_id').eq('period_start', period.periodStart).in('organization_id', orgIds),
    sb.from('payout_fee_records')
      .select('entity_id, fee_amount')
      .eq('entity_type', 'org')
      .in('entity_id', orgIds)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso),
    sb.from('invoice_profiles').select('organization_id, business_name, company_code, vat_code, address, contact_email, contact_phone').in('organization_id', orgIds),
  ]);
  if (feeErr) return res.status(500).json({ error: feeErr.message });

  const alreadyInvoiced = new Set<string>((existingRows || []).map((r: any) => r.organization_id));
  const feesByOrg = new Map<string, number[]>();
  for (const row of feeRows || []) {
    const list = feesByOrg.get(row.entity_id) || [];
    list.push(Number(row.fee_amount) || 0);
    feesByOrg.set(row.entity_id, list);
  }
  const invProfileByOrg = new Map<string, any>();
  for (const p of invProfiles || []) invProfileByOrg.set(p.organization_id, p);

  const periodLabel = lithuanianMonthLabel(month);
  const issueDate = new Date().toLocaleDateString('lt-LT');
  const generated: { organizationId: string; organizationName: string; invoiceNumber: string; amountDue: number; emailed: boolean }[] = [];
  const skipped: { organizationId: string; organizationName: string; reason: string }[] = [];

  for (const org of eligible) {
    if (alreadyInvoiced.has(org.id)) {
      skipped.push({ organizationId: org.id, organizationName: org.name, reason: 'already_invoiced' });
      continue;
    }

    try {
      const lines = buildB2bInvoiceLines({
        month,
        subscriptionEur: Number(org.platform_monthly_fee_eur),
        payoutFees: feesByOrg.get(org.id) || [],
      });

      const invoiceNumber = await nextInvoiceNumber(sb);
      const invProfile = invProfileByOrg.get(org.id);
      const buyer: InvoicePdfData['buyer'] = {
        name: invProfile?.business_name || org.name || 'Organizacija',
        companyCode: invProfile?.company_code || undefined,
        vatCode: invProfile?.vat_code || undefined,
        address: invProfile?.address || undefined,
        email: invProfile?.contact_email || org.email || undefined,
        phone: invProfile?.contact_phone || undefined,
      };

      const { data: invoice, error: insErr } = await sb
        .from('platform_invoices')
        .insert({
          invoice_number: invoiceNumber,
          organization_id: org.id,
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
        // Unique violation = another run won the race; anything else is reported.
        const reason = insErr?.code === '23505' ? 'already_invoiced' : insErr?.message || 'insert_failed';
        skipped.push({ organizationId: org.id, organizationName: org.name, reason });
        continue;
      }

      const pdfBytes = await generateInvoicePdf({
        invoiceNumber,
        issueDate,
        periodStart: new Date(period.periodStart).toLocaleDateString('lt-LT'),
        periodEnd: new Date(period.periodEnd).toLocaleDateString('lt-LT'),
        seller: { ...TUTLIO_COMPANY },
        buyer,
        lineItems: lines.lineItems,
        totalAmount: lines.totalAmount,
        deductedAmount: lines.deductedAmount,
        amountDue: lines.amountDue,
      });

      const storagePath = `platform/${org.id}/${invoice.id}.pdf`;
      const { error: uploadErr } = await sb.storage
        .from('invoices')
        .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
      if (uploadErr) {
        console.error('[admin-b2b-invoices] PDF upload error:', uploadErr.message);
      } else {
        await sb.from('platform_invoices').update({ pdf_storage_path: storagePath }).eq('id', invoice.id);
      }

      let emailed = false;
      const recipient = String(org.email || invProfile?.contact_email || '').trim();
      if (recipient) {
        try {
          const emailRes = await postInternalJson(resolveApiUrl(req, '/api/send-email'), {
            type: 'platform_invoice',
            to: recipient,
            data: {
              organizationName: org.name,
              invoiceNumber,
              periodLabel,
              totalAmount: lines.totalAmount.toFixed(2),
              deductedAmount: lines.deductedAmount > 0 ? lines.deductedAmount.toFixed(2) : undefined,
              amountDue: lines.amountDue.toFixed(2),
            },
            attachments: [{ filename: `${invoiceNumber}.pdf`, content: Buffer.from(pdfBytes).toString('base64') }],
          });
          emailed = emailRes.ok;
          if (emailRes.ok) {
            await sb.from('platform_invoices').update({ sent_at: new Date().toISOString() }).eq('id', invoice.id);
          } else {
            console.error('[admin-b2b-invoices] send-email HTTP', emailRes.status, await emailRes.text().catch(() => ''));
          }
        } catch (e: any) {
          console.error('[admin-b2b-invoices] email error:', e?.message || e);
        }
      } else {
        console.warn(`[admin-b2b-invoices] org ${org.id} has no email — invoice created without sending`);
      }

      generated.push({
        organizationId: org.id,
        organizationName: org.name,
        invoiceNumber,
        amountDue: lines.amountDue,
        emailed,
      });
    } catch (e: any) {
      console.error(`[admin-b2b-invoices] org ${org.id} failed:`, e?.message || e);
      skipped.push({ organizationId: org.id, organizationName: org.name, reason: e?.message || 'error' });
    }
  }

  return res.status(200).json({ generated, skipped });
}

async function handleList(sb: any, req: VercelRequest, res: VercelResponse) {
  const month = typeof req.query.month === 'string' ? req.query.month : '';
  const period = monthPeriodDates(month);
  if (!period) return res.status(400).json({ error: 'Invalid month, expected YYYY-MM' });

  const { data, error } = await sb
    .from('platform_invoices')
    .select('id, invoice_number, organization_id, period_start, period_end, total_amount, deducted_amount, amount_due, pdf_storage_path, sent_at, created_at, organizations(name)')
    .eq('period_start', period.periodStart)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const invoices = (data || []).map((r: any) => ({
    id: r.id,
    invoice_number: r.invoice_number,
    organization_id: r.organization_id,
    organization_name: r.organizations?.name || null,
    period_start: r.period_start,
    period_end: r.period_end,
    total_amount: Number(r.total_amount),
    deducted_amount: Number(r.deducted_amount),
    amount_due: Number(r.amount_due),
    has_pdf: !!r.pdf_storage_path,
    sent_at: r.sent_at,
    created_at: r.created_at,
  }));

  return res.status(200).json({ invoices });
}

async function handleDownload(sb: any, req: VercelRequest, res: VercelResponse) {
  const invoiceId = typeof req.query.invoiceId === 'string' ? req.query.invoiceId : '';
  if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });

  const { data: invoice, error } = await sb
    .from('platform_invoices')
    .select('invoice_number, pdf_storage_path')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!invoice?.pdf_storage_path) return res.status(404).json({ error: 'Invoice PDF not found' });

  const { data: blob, error: dlErr } = await sb.storage.from('invoices').download(invoice.pdf_storage_path);
  if (dlErr || !blob) return res.status(404).json({ error: 'PDF file not found in storage' });

  const buf = Buffer.from(await blob.arrayBuffer());
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
  return res.status(200).send(buf);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const adminSecret = getPlatformAdminSecret();
  const secret = typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '';
  if (!adminSecret || !secret || !secretsMatch(secret, adminSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Database not configured' });

  try {
    if (req.method === 'POST') return await handleGenerate(sb, req, res);
    if (req.method === 'GET') {
      if (req.query.invoiceId) return await handleDownload(sb, req, res);
      return await handleList(sb, req, res);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    console.error('[admin-b2b-invoices]', e);
    return res.status(500).json({ error: e?.message || 'Internal error' });
  }
}
