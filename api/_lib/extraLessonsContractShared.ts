import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '../types';
import {
  EXTRA_LESSONS_DEFAULT_BODY,
  EXTRA_LESSONS_CONTRACT_KIND,
  buildExtraLessonsOrderSnapshot,
  canonicalExtraLessonsPayload,
  type ExtraLessonsOrderSnapshot,
} from '../../src/lib/extraLessonsContract.js';
import { fillPlaceholders } from './schoolContractPdf.js';

export function serviceSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function appOrigin(req: VercelRequest): string {
  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  const protoHeader = typeof req.headers['x-forwarded-proto'] === 'string'
    ? req.headers['x-forwarded-proto']
    : Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : '';
  const inferred = host ? `${protoHeader || 'https'}://${host}` : '';
  return (process.env.APP_URL || process.env.VITE_APP_URL || inferred || 'https://tutlio.lt').replace(/\/$/, '');
}

export function randomToken(): string {
  return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
}

export function vilniusDateTimeLabel(at = new Date()): string {
  return new Intl.DateTimeFormat('lt-LT', {
    timeZone: 'Europe/Vilnius',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(at);
}

export function fillExtraLessonsBody(params: {
  templateBody?: string | null;
  payload: Record<string, string>;
  sha256?: string;
  startWithin14Label?: string;
  recordingConsentLabel?: string;
  acceptedAtLabel?: string;
}): string {
  const body = String(params.templateBody || EXTRA_LESSONS_DEFAULT_BODY);
  const braced: Record<string, string> = {};
  for (const [key, value] of Object.entries(params.payload)) {
    braced[`{{${key}}}`] = value;
  }
  return fillPlaceholders(body, {
    ...braced,
    '{{data_laikas_Europe_Vilnius}}': params.acceptedAtLabel || params.payload.data_laikas_Europe_Vilnius || vilniusDateTimeLabel(),
    '{{SHA-256_ar_kitas_integralumo_ID}}': params.sha256 || '—',
    '{{start_within_14_label}}': params.startWithin14Label || 'NE',
    '{{recording_consent_label}}': params.recordingConsentLabel || 'NETAIKOMA',
    '{{TAIP}}': 'TAIP',
  });
}

export async function loadExtraLessonsContractByToken(
  supabase: SupabaseClient,
  token: string,
) {
  const { data: tokenRow, error: tokenErr } = await supabase
    .from('school_contract_completion_tokens')
    .select('id, contract_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle();
  if (tokenErr) {
    console.error('[extra-lessons] token lookup', tokenErr.message);
    return { error: 'invalid_token' as const };
  }
  if (!tokenRow?.contract_id) return { error: 'invalid_token' as const };
  if (tokenRow.expires_at && Date.parse(tokenRow.expires_at) < Date.now()) {
    return { error: 'expired' as const };
  }

  // Avoid fragile nested embeds (FK alias failures → empty row → false 404).
  const { data: contract, error: contractErr } = await supabase
    .from('school_contracts')
    .select('*')
    .eq('id', tokenRow.contract_id)
    .maybeSingle();
  if (contractErr) {
    console.error('[extra-lessons] contract lookup', contractErr.message);
    return { error: 'not_found' as const };
  }
  if (!contract || contract.kind !== EXTRA_LESSONS_CONTRACT_KIND) {
    return { error: 'not_found' as const };
  }

  const [{ data: student }, { data: organization }] = await Promise.all([
    contract.student_id
      ? supabase
          .from('students')
          .select('id, full_name, email, grade, payer_name, payer_email, payer_phone, linked_user_id')
          .eq('id', contract.student_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    contract.organization_id
      ? supabase
          .from('organizations')
          .select('id, name, email, phone, features')
          .eq('id', contract.organization_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    tokenRow,
    contract: {
      ...contract,
      student: student || null,
      organizations: organization || null,
    },
  };
}

export function snapshotFromRow(row: { order_snapshot?: unknown }): ExtraLessonsOrderSnapshot | null {
  const raw = row.order_snapshot;
  if (!raw || typeof raw !== 'object') return null;
  try {
    return buildExtraLessonsOrderSnapshot(raw as ExtraLessonsOrderSnapshot);
  } catch {
    return null;
  }
}

export function extraLessonsAcceptUrl(origin: string, token: string): string {
  return `${origin}/school-extra-lessons-accept?token=${encodeURIComponent(token)}`;
}

export function extraLessonsPayloadForContract(params: {
  contractNumber: string;
  order: ExtraLessonsOrderSnapshot;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  studentName: string;
  studentGrade: string;
  userId: string;
  schoolName: string;
}): Record<string, string> {
  const payload = canonicalExtraLessonsPayload({
    contract_number: params.contractNumber,
    order: params.order,
    parent_name: params.parentName,
    parent_email: params.parentEmail,
    parent_phone: params.parentPhone,
    student_name: params.studentName,
    student_grade: params.studentGrade,
    user_id: params.userId,
    school_name: params.schoolName,
  });
  payload.data_laikas_Europe_Vilnius = vilniusDateTimeLabel();
  return payload;
}
