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

/** Parent-safe link: tokenized app URL that streams PDF from private bucket (no login). */
export async function createSchoolContractPdfViewUrl(
  adminSb: SupabaseClient,
  contractId: string,
  req: VercelRequest,
): Promise<string | null> {
  const { data: contract } = await adminSb
    .from('school_contracts')
    .select('pdf_url')
    .eq('id', contractId)
    .maybeSingle();
  if (!contract?.pdf_url || !String(contract.pdf_url).trim()) return null;

  const token = randomToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString();
  const { error } = await adminSb.from('school_contract_completion_tokens').insert({
    contract_id: contractId,
    token,
    expires_at: expiresAt,
  });
  if (error) {
    console.error('[schoolContractPdfView] token insert:', error);
    return null;
  }

  const appBase = publicAppOriginFromRequest(req);
  return `${appBase}/api/school-contract-pdf?token=${encodeURIComponent(token)}`;
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
