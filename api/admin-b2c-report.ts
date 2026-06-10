// GET /api/admin-b2c-report?month=YYYY-MM&format=pdf|csv
// Monthly B2C summary for accounting: platform fees collected from physical
// persons (Stripe: platform_fee_ledger, Perlas: perlas_ledger).
// Requires x-admin-secret header (same pattern as admin-statistics).
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { asciify } from './_lib/invoicePdf.js';
import {
  monthRangeUtc,
  summarizeB2cMonth,
  b2cSummaryCsv,
  type B2cMonthlySummary,
} from './_lib/b2cReport.js';

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
  return createClient(url, key, supabaseServiceRoleClientOptions() as any);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const adminSecret = getPlatformAdminSecret();
  const secret = typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '';
  if (!adminSecret || !secret || !secretsMatch(secret, adminSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Database not configured' });

  const month = typeof req.query.month === 'string' ? req.query.month : '';
  const range = monthRangeUtc(month);
  if (!range) return res.status(400).json({ error: 'Invalid month, expected YYYY-MM' });

  const format = req.query.format === 'csv' ? 'csv' : 'pdf';

  try {
    const [stripeRes, perlasRes] = await Promise.all([
      sb
        .from('platform_fee_ledger')
        .select('platform_fee, gross_amount')
        .gte('paid_at', range.startIso)
        .lt('paid_at', range.endIso),
      sb
        .from('perlas_ledger')
        .select('platform_fee, perlas_fee, volume')
        .gte('created_at', range.startIso)
        .lt('created_at', range.endIso),
    ]);

    if (stripeRes.error) throw stripeRes.error;
    if (perlasRes.error) throw perlasRes.error;

    const summary = summarizeB2cMonth({
      month,
      stripeRows: stripeRes.data || [],
      perlasRows: perlasRes.data || [],
    });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="tutlio-b2c-suvestine-${month}.csv"`);
      return res.status(200).send(b2cSummaryCsv(summary));
    }

    const pdfBytes = await buildB2cReportPdf(summary);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tutlio-b2c-suvestine-${month}.pdf"`);
    return res.status(200).send(Buffer.from(pdfBytes));
  } catch (err: any) {
    console.error('[admin-b2c-report] Error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}

async function buildB2cReportPdf(s: B2cMonthlySummary): Promise<Uint8Array> {
  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const MARGIN = 50;

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const gray = rgb(0.3, 0.3, 0.3);
  const black = rgb(0, 0, 0);
  const lightGray = rgb(0.85, 0.85, 0.85);
  const headerBlue = rgb(0.24, 0.35, 0.59);

  let y = PAGE_HEIGHT - MARGIN;
  const drawText = (text: string, x: number, yPos: number, opts?: { size?: number; bold?: boolean; color?: typeof black }) => {
    page.drawText(asciify(text), {
      x,
      y: yPos,
      size: opts?.size || 10,
      font: opts?.bold ? fontBold : font,
      color: opts?.color || black,
    });
  };
  const drawLine = (yPos: number) => {
    page.drawLine({ start: { x: MARGIN, y: yPos }, end: { x: PAGE_WIDTH - MARGIN, y: yPos }, thickness: 0.5, color: lightGray });
  };

  drawText('MENESINE B2C SUVESTINE', MARGIN, y, { size: 16, bold: true, color: headerBlue });
  y -= 18;
  drawText('Tutlio platformos mokesciai, surinkti is fiziniu asmenu', MARGIN, y, { size: 9, color: gray });
  y -= 24;

  drawText(`Laikotarpis: ${s.periodLabel}`, MARGIN, y, { size: 11, bold: true });
  drawText(`Suformuota: ${new Date().toISOString().slice(0, 10)}`, MARGIN + 300, y, { size: 9, color: gray });
  y -= 16;
  drawLine(y);
  y -= 24;

  // Table: provider / operations / collected fees / gross volume
  const colProvider = MARGIN;
  const colOps = MARGIN + 200;
  const colFees = MARGIN + 290;
  const colGross = MARGIN + 410;

  drawText('Mokejimo teikejas', colProvider, y, { size: 8, bold: true, color: gray });
  drawText('Operaciju sk.', colOps, y, { size: 8, bold: true, color: gray });
  drawText('Surinkta, EUR', colFees, y, { size: 8, bold: true, color: gray });
  drawText('Apyvarta, EUR', colGross, y, { size: 8, bold: true, color: gray });
  y -= 6;
  drawLine(y);
  y -= 16;

  const rows: Array<{ label: string; ops: number; fees: number; gross: number }> = [
    { label: 'Stripe (korteles)', ops: s.stripe.operations, fees: s.stripe.feesEur, gross: s.stripe.grossEur },
    { label: 'Perlas Finance (bankas)', ops: s.perlas.operations, fees: s.perlas.feesEur, gross: s.perlas.grossEur },
  ];
  for (const r of rows) {
    drawText(r.label, colProvider, y, { size: 10 });
    drawText(String(r.ops), colOps + 20, y, { size: 10 });
    drawText(r.fees.toFixed(2), colFees + 20, y, { size: 10 });
    drawText(r.gross.toFixed(2), colGross + 20, y, { size: 10 });
    y -= 16;
  }

  y -= 4;
  drawLine(y);
  y -= 18;

  drawText('IS VISO:', colProvider, y, { size: 11, bold: true });
  drawText(String(s.totalOperations), colOps + 20, y, { size: 11, bold: true });
  drawText(s.totalFeesEur.toFixed(2), colFees + 20, y, { size: 11, bold: true, color: headerBlue });
  drawText((Math.round((s.stripe.grossEur + s.perlas.grossEur) * 100) / 100).toFixed(2), colGross + 20, y, { size: 11, bold: true });
  y -= 28;

  drawText('Pagrindas: Tutlio platformos administravimo mokestis (B2C pajamos is fiziniu asmenu).', MARGIN, y, { size: 8, color: gray });
  y -= 12;
  drawText('Stripe: mokestis fiksuojamas platform_fee_ledger; Perlas Finance: perlas_ledger.', MARGIN, y, { size: 8, color: gray });

  y = MARGIN + 14;
  drawLine(y);
  y -= 12;
  drawText('Ataskaita suformuota Tutlio platformoje | www.tutlio.lt', MARGIN, y, { size: 7, color: gray });

  return doc.save();
}
