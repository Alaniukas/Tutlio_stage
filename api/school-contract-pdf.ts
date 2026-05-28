import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { loadSchoolContractPdfBuffer } from './_lib/schoolContractPdfView.js';

/**
 * GET /api/school-contract-pdf?token=...
 * Streams contract PDF for parents who received the email link (no account required).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const token = typeof req.query?.token === 'string' ? req.query.token.trim() : '';
  if (!token) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Trūksta nuorodos parametro.');
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Serveris nesukonfigūruotas.');
  }

  const adminSb = createClient(supabaseUrl, serviceRoleKey);

  const { data: tokenRow, error: tokenErr } = await adminSb
    .from('school_contract_completion_tokens')
    .select('contract_id, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (tokenErr || !tokenRow?.contract_id) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Nuoroda nebegalioja arba neteisinga.');
  }

  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    res.statusCode = 410;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Nuorodos galiojimas pasibaigė. Prašome susisiekti su mokykla.');
  }

  const { data: contract, error: contractErr } = await adminSb
    .from('school_contracts')
    .select('pdf_url, contract_number')
    .eq('id', tokenRow.contract_id)
    .maybeSingle();

  if (contractErr || !contract?.pdf_url) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Sutarties PDF nerastas.');
  }

  const pdfBuffer = await loadSchoolContractPdfBuffer(adminSb, String(contract.pdf_url));
  if (!pdfBuffer || pdfBuffer.length === 0) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('Nepavyko atidaryti sutarties PDF.');
  }

  const num = String((contract as { contract_number?: string | null }).contract_number || '').trim();
  const filename = num ? `Sutartis-${num}.pdf` : 'Sutartis.pdf';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.end(pdfBuffer);
}
