import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '../types';
import { extractSchoolContractStoragePath, SCHOOL_CONTRACTS_BUCKET } from './schoolContractStorage.js';

function randomToken(): string {
  return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
}

export function publicAppOriginFromRequest(req: VercelRequest): string {
  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  const protoHeader = typeof req.headers['x-forwarded-proto'] === 'string'
    ? req.headers['x-forwarded-proto']
    : Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : '';
  const inferred = host ? `${protoHeader || 'https'}://${host}` : '';
  return (process.env.APP_URL || process.env.VITE_APP_URL || inferred || 'https://tutlio.lt').replace(/\/$/, '');
}

export function extractTokenFromSchoolContractUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = trimmed.startsWith('http') ? new URL(trimmed) : new URL(trimmed, 'https://tutlio.lt');
    const t = parsed.searchParams.get('token');
    return t?.trim() || null;
  } catch {
    const m = trimmed.match(/[?&]token=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

export function schoolContractCompletionPageUrl(appBase: string, token: string): string {
  return `${appBase}/school-contract-complete?token=${encodeURIComponent(token)}`;
}

export function schoolContractPdfApiUrl(appBase: string, token: string): string {
  return `${appBase}/api/school-contract-pdf?token=${encodeURIComponent(token)}`;
}

/**
 * One access token per email: works for both PDF stream and parent completion form.
 * Reuses token already embedded in completionUrl when the client created the link first.
 */
export async function ensureSchoolContractAccessToken(
  adminSb: SupabaseClient,
  contractId: string,
  opts?: { existingToken?: string | null },
): Promise<string | null> {
  const cid = contractId.trim();
  if (!cid) return null;

  const reuse = opts?.existingToken?.trim();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString();

  if (reuse) {
    const { data: row, error: lookupErr } = await adminSb
      .from('school_contract_completion_tokens')
      .select('token, contract_id')
      .eq('token', reuse)
      .maybeSingle();
    if (lookupErr) {
      console.error('[schoolContractPdfView] token lookup:', lookupErr);
    }
    if (row?.token) {
      if (String(row.contract_id) !== cid) {
        console.error('[schoolContractPdfView] token contract mismatch', {
          token: reuse.slice(0, 8),
          expected: cid,
          actual: row.contract_id,
        });
        return null;
      }
      return row.token;
    }

    // Email / completion link already contains this token — persist it instead of minting a new one.
    const { error: insertReuseErr } = await adminSb.from('school_contract_completion_tokens').insert({
      contract_id: cid,
      token: reuse,
      expires_at: expiresAt,
    });
    if (!insertReuseErr) return reuse;
    if (insertReuseErr.code === '23505') {
      const { data: again } = await adminSb
        .from('school_contract_completion_tokens')
        .select('token, contract_id')
        .eq('token', reuse)
        .maybeSingle();
      if (again?.token && String(again.contract_id) === cid) return again.token;
    }
    console.error('[schoolContractPdfView] token insert (reuse):', insertReuseErr);
    return null;
  }

  const token = randomToken();
  const { error } = await adminSb.from('school_contract_completion_tokens').insert({
    contract_id: cid,
    token,
    expires_at: expiresAt,
  });
  if (error) {
    console.error('[schoolContractPdfView] token insert:', error);
    return null;
  }
  return token;
}

/** Parent-safe PDF link (same token as completion form). */
export async function createSchoolContractPdfViewUrl(
  adminSb: SupabaseClient,
  contractId: string,
  req: VercelRequest,
  opts?: { existingToken?: string | null },
): Promise<string | null> {
  const { data: contract } = await adminSb
    .from('school_contracts')
    .select('pdf_url')
    .eq('id', contractId)
    .maybeSingle();
  if (!contract?.pdf_url || !String(contract.pdf_url).trim()) return null;

  const token = await ensureSchoolContractAccessToken(adminSb, contractId, opts);
  if (!token) return null;

  return schoolContractPdfApiUrl(publicAppOriginFromRequest(req), token);
}

export async function loadSchoolContractPdfBuffer(
  adminSb: SupabaseClient,
  pdfUrlOrPath: string,
): Promise<Buffer | null> {
  const path = extractSchoolContractStoragePath(pdfUrlOrPath);
  const { data, error } = await adminSb.storage.from(SCHOOL_CONTRACTS_BUCKET).download(path);
  if (error || !data) {
    console.error('[schoolContractPdfView] download:', error);
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}
