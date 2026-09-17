import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SCHOOL_CONTRACTS_BUCKET } from './schoolContractPdfPath.js';

export const SCHOOL_DISCOUNT_ACCEPTANCE_VERSION = '2026-09-17-v1';

export function newSchoolDiscountToken(): string {
  return randomBytes(32).toString('hex');
}

export function schoolDiscountTokenHash(token: string): string {
  return createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

export function newSchoolDiscountAgreementNumber(at = new Date()): string {
  const date = at.toISOString().slice(0, 10).replace(/-/g, '');
  return `NPR-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function schoolDiscountAcceptUrl(origin: string, token: string): string {
  const base = String(origin || '').replace(/\/$/, '');
  return `${base}/school-discount-accept?token=${encodeURIComponent(token)}`;
}

export function schoolDiscountPdfPath(params: {
  organizationId: string;
  contractId: string;
  agreementNumber: string;
}): string {
  const safeNumber = params.agreementNumber.replace(/[^A-Za-z0-9_-]+/g, '-');
  return `${params.organizationId}/contracts/${params.contractId}/priedai/Nuolaidos-priedas-${safeNumber}.pdf`;
}

export async function loadSchoolDiscountAgreementByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<any | null> {
  const hash = schoolDiscountTokenHash(token);
  const { data, error } = await supabase
    .from('school_discount_agreements')
    .select('*')
    .eq('acceptance_token_hash', hash)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function signSchoolDiscountPdf(
  supabase: SupabaseClient,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(SCHOOL_CONTRACTS_BUCKET)
    .createSignedUrl(path, 60 * 30);
  return error ? null : data?.signedUrl || null;
}
