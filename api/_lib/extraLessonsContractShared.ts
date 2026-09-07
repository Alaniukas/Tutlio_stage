import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '../types';
import {
  EXTRA_LESSONS_DEFAULT_BODY,
  EXTRA_LESSONS_CONTRACT_KIND,
  buildExtraLessonsOrderSnapshot,
  canonicalExtraLessonsPayload,
  usesBundledExtraLessonsDocx,
  type ExtraLessonsOrderSnapshot,
} from '../../src/lib/extraLessonsContract.js';
import { fillPlaceholders } from './schoolContractPdf.js';

export function serviceSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function requestHostOrigin(req: VercelRequest): string | null {
  const host = typeof req.headers.host === 'string' ? req.headers.host.trim() : '';
  if (!host) return null;
  const protoHeader = typeof req.headers['x-forwarded-proto'] === 'string'
    ? req.headers['x-forwarded-proto']
    : Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : '';
  const isLocal = /localhost|127\.0\.0\.1/i.test(host);
  const proto = String(protoHeader || (isLocal ? 'http' : 'https')).split(',')[0].trim();
  return `${proto}://${host}`.replace(/\/$/, '');
}

/** Browser-facing origin for accept links. Localhost must ignore a stale APP_URL port. */
export function appOrigin(req: VercelRequest): string {
  const hostOrigin = requestHostOrigin(req);
  if (hostOrigin && /localhost|127\.0\.0\.1/i.test(hostOrigin)) return hostOrigin;
  return (process.env.APP_URL || process.env.VITE_APP_URL || hostOrigin || 'https://tutlio.lt').replace(/\/$/, '');
}

/** Where this process can reach /api/send-email (local API port, not Vite). */
export function internalApiOrigin(req: VercelRequest): string {
  if (process.env.TUTLIO_DEV_API_LOCAL === '1') {
    return `http://127.0.0.1:${process.env.DEV_API_PORT || '3002'}`;
  }
  return appOrigin(req);
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

export function extraLessonsTemplateSource(params: {
  organizationId?: string | null;
  storedBody?: string | null;
}): string {
  const stored = String(params.storedBody || '');
  if (usesBundledExtraLessonsDocx(params.organizationId)) return EXTRA_LESSONS_DEFAULT_BODY;
  if (stored.includes('{{sutarties_nr}}') || stored.includes('{{paslaugos_pavadinimas}}')) return stored;
  if (stored.includes('1 PRIEDAS') && stored.includes('{{')) return stored;
  return EXTRA_LESSONS_DEFAULT_BODY;
}

export function fillExtraLessonsBody(params: {
  templateBody?: string | null;
  organizationId?: string | null;
  payload: Record<string, string>;
  sha256?: string;
  startWithin14Label?: string;
  recordingConsentLabel?: string;
  acceptedAtLabel?: string;
  termsAcceptedLabel?: string;
  confirmationSentLabel?: string;
}): string {
  const body = extraLessonsTemplateSource({
    organizationId: params.organizationId,
    storedBody: params.templateBody,
  });
  const braced: Record<string, string> = {};
  for (const [key, value] of Object.entries(params.payload)) {
    braced[`{{${key}}}`] = value;
  }
  const when = params.acceptedAtLabel || params.payload.data_laikas_Europe_Vilnius || vilniusDateTimeLabel();
  const sha = params.sha256 || params.payload.dokumento_sha256 || '—';
  return fillPlaceholders(body, {
    ...braced,
    '{{data_laikas_Europe_Vilnius}}': when,
    '{{dokumento_sha256}}': sha,
    '{{SHA-256_ar_kitas_integralumo_ID}}': sha,
    '{{start_within_14_label}}': params.startWithin14Label || params.payload.start_within_14_label || 'NETAIKOMA',
    '{{recording_consent_label}}': params.recordingConsentLabel || params.payload.recording_consent_label || 'NETAIKOMA',
    '{{sutikimo_su_salygomis_busena}}': params.termsAcceptedLabel || params.payload.sutikimo_su_salygomis_busena || '—',
    '{{el_pastas_ir_issiuntimo_data_laikas}}': params.confirmationSentLabel || params.payload.el_pastas_ir_issiuntimo_data_laikas || '—',
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
  payload.data = payload.data_laikas_Europe_Vilnius.split(' ')[0] || payload.data_laikas_Europe_Vilnius;
  return payload;
}

export async function endExtraLessonsContract(params: {
  supabase: SupabaseClient;
  contract: any;
  intendedKind?: 'withdrawal' | 'termination' | null;
  origin: string;
}): Promise<{ ok: true; kind: 'withdrawal' | 'termination'; statementPath: string | null } | { ok: false; status: number; error: string }> {
  const { extraLessonsEndKind } = await import('../../src/lib/extraLessonsContract.js');
  const { createSimpleContractPdf } = await import('./schoolContractPdf.js');
  const { schoolContractPdfStoragePath, SCHOOL_CONTRACTS_BUCKET } = await import('./schoolContractPdfPath.js');

  if (!params.contract?.accepted_at) return { ok: false, status: 400, error: 'Not accepted yet' };
  if (params.contract.withdrawal_requested_at) return { ok: false, status: 409, error: 'Already ended' };

  const kind = extraLessonsEndKind(params.contract.accepted_at);
  if (params.intendedKind && params.intendedKind !== kind) {
    return {
      ok: false,
      status: 400,
      error: kind === 'withdrawal'
        ? 'Per 14 dienų naudokite atsisakymą, ne nutraukimą.'
        : '14 dienų atsisakymo terminas pasibaigė — naudokite nutraukimą.',
    };
  }

  const now = new Date();
  const st = params.contract.student || {};
  const org = params.contract.organizations || {};
  const title = kind === 'withdrawal' ? 'Sutarties atsisakymas' : 'Sutarties nutraukimas';
  const body = `${title}

Sutarties Nr. ${params.contract.contract_number || params.contract.id}
Redakcija ${params.contract.revision_label || ''}
Vaikas ${st.full_name || ''}
Mokykla ${org.name || ''}
Data ir laikas (Europe/Vilnius) ${vilniusDateTimeLabel(now)}

Sis pranesimas uzregistruotas Tutlio paskyroje. Mokytojo atskirai informuoti nereikia.
`;

  let statementPath: string | null = null;
  let pdfBase64: string | null = null;
  try {
    const pdfBytes = await createSimpleContractPdf({
      contractNumber: String(params.contract.contract_number || ''),
      studentName: String(st.full_name || ''),
      parentName: String(st.payer_name || ''),
      parentEmail: String(st.payer_email || ''),
      parentPhone: String(st.payer_phone || ''),
      parentPersonalCode: '',
      childBirthDate: '',
      address: '',
      annualFee: 0,
      body,
    });
    statementPath = schoolContractPdfStoragePath({
      organizationId: String(params.contract.organization_id),
      contractId: String(params.contract.id),
      contractNumber: `${params.contract.contract_number || 'extra'}-${kind}`,
    });
    await params.supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).upload(statementPath, Buffer.from(pdfBytes), {
      upsert: true,
      contentType: 'application/pdf',
    });
    pdfBase64 = Buffer.from(pdfBytes).toString('base64');
  } catch (e) {
    console.error('[extra-lessons] statement pdf', (e as Error).message);
  }

  const { error } = await params.supabase.from('school_contracts').update({
    withdrawal_requested_at: now.toISOString(),
    withdrawal_reason: kind === 'withdrawal' ? 'parent_withdrawal' : 'parent_termination',
    extra_end_kind: kind,
    extra_end_statement_path: statementPath,
  }).eq('id', params.contract.id);
  if (error) return { ok: false, status: 500, error: error.message };

  const to = String(st.payer_email || '').trim();
  if (to) {
    await fetch(`${params.origin}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify({
        type: kind === 'withdrawal' ? 'school_contract_extra_withdrawn' : 'school_contract_extra_terminated',
        to,
        data: {
          schoolName: org.name,
          studentName: st.full_name,
          parentName: st.payer_name,
          contractNumber: params.contract.contract_number,
          at: vilniusDateTimeLabel(now),
        },
        attachments: pdfBase64
          ? [{ filename: `${kind}-${params.contract.contract_number || 'sutartis'}.pdf`, content: pdfBase64 }]
          : undefined,
      }),
    }).catch((err) => console.error('[extra-lessons] end email', err));
  }

  return { ok: true, kind, statementPath };
}
