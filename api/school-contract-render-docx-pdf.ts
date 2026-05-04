import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { renderDocxTemplateUrlToPdfBuffer } from './_lib/renderSchoolContractDocxToPdf';
import { schoolContractPdfStoragePath } from './_lib/schoolContractPdfPath';

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

type DocxPayloadValue = string | number | boolean | null;
type DocxPayload = Record<string, DocxPayloadValue>;

function normalizePayload(raw: unknown): DocxPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: DocxPayload = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined) {
      out[k] = '';
      continue;
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
      continue;
    }
    out[k] = String(v);
  }
  return out;
}

/**
 * Org admin only: DOCX šablonas → užpildytas PDF Storage (service role).
 * Vienu skambučiu pakeičia kliento: fetch šablono → base64 į convert-docx → upload (UPSERT fix + mažiau tinklo šlamšto).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Server misconfigured' });

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!authHeader.startsWith('Bearer ')) return json(res, 401, { error: 'Unauthorized' });

  const body = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? (req.body as Record<string, unknown>) : {};
  const organizationId = typeof body.organizationId === 'string' ? body.organizationId.trim() : '';
  const contractId = typeof body.contractId === 'string' ? body.contractId.trim() : '';
  const contractNumberRaw = body.contractNumber;
  const contractNumber =
    typeof contractNumberRaw === 'string' ? contractNumberRaw : contractNumberRaw != null ? String(contractNumberRaw) : '';
  const templateUrl = typeof body.templateUrl === 'string' ? body.templateUrl.trim() : '';
  const templatePayload = normalizePayload(body.templatePayload);

  if (!organizationId || !contractId || !templateUrl) {
    return json(res, 400, { error: 'organizationId, contractId ir templateUrl privalomi' });
  }
  const docxPath = templateUrl.replace(/\?.*$/, '').toLowerCase();
  if (!docxPath.endsWith('.docx')) {
    return json(res, 400, { error: 'Šablono nuoroda turi būti .docx' });
  }

  const userSb = createClient(supabaseUrl, (anonKey || serviceRoleKey).trim());
  const adminSb = createClient(supabaseUrl, serviceRoleKey);
  const jwt = authHeader.slice(7);
  const { data: authData, error: authErr } = await userSb.auth.getUser(jwt);
  if (authErr || !authData.user) return json(res, 401, { error: 'Invalid token' });

  const { data: adminRow } = await adminSb
    .from('organization_admins')
    .select('organization_id')
    .eq('user_id', authData.user.id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!adminRow?.organization_id) return json(res, 403, { error: 'Not authorized for this organization' });

  try {
    const pdfBuffer = await renderDocxTemplateUrlToPdfBuffer({ templateUrl, payload: templatePayload });
    const path = schoolContractPdfStoragePath({
      organizationId,
      contractId,
      contractNumber: contractNumber || null,
    });
    const { error: upErr } = await adminSb.storage.from('school-contracts').upload(path, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
      cacheControl: '3600',
    });
    if (upErr) {
      console.error('[school-contract-render-docx-pdf] upload:', upErr);
      return json(res, 502, { error: upErr.message || 'Nepavyko įkelti PDF' });
    }
    const { data: pub } = adminSb.storage.from('school-contracts').getPublicUrl(path);
    return json(res, 200, { pdfUrl: pub.publicUrl, path });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'PDF generavimas nepavyko';
    console.error('[school-contract-render-docx-pdf]', e);
    return json(res, 500, { error: msg });
  }
}
