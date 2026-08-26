import type { VercelRequest, VercelResponse } from './types';
import {
  canClickWrapAccept,
  freezeDocumentSource,
  mergeExtraLessonsOrderPatch,
  recordingConsentLabel,
  sha256Hex,
  startWithin14Label,
  validateExtraLessonsOrder,
  type ExtraLessonsOrderSnapshot,
} from '../src/lib/extraLessonsContract.js';
import { createSimpleContractPdf } from './_lib/schoolContractPdf.js';
import { schoolContractPdfStoragePath, SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';
import {
  appOrigin,
  extraLessonsPayloadForContract,
  fillExtraLessonsBody,
  loadExtraLessonsContractByToken,
  serviceSupabase,
  snapshotFromRow,
  vilniusDateTimeLabel,
} from './_lib/extraLessonsContractShared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = serviceSupabase();
  const token = String(
    req.method === 'GET' ? (req.query?.token || '') : ((req.body as any)?.token || req.query?.token || ''),
  ).trim();
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const loaded = await loadExtraLessonsContractByToken(supabase, token);
  if ('error' in loaded && loaded.error) {
    const status = loaded.error === 'expired' ? 410 : 404;
    return res.status(status).json({ error: loaded.error });
  }
  const { contract, tokenRow } = loaded as any;
  let order = snapshotFromRow(contract);
  if (!order) return res.status(500).json({ error: 'Missing order snapshot' });

  const st = contract.student || {};
  const org = contract.organizations || {};

  if (req.method === 'GET') {
    const payload = extraLessonsPayloadForContract({
      contractNumber: String(contract.contract_number || ''),
      order,
      parentName: String(st.payer_name || ''),
      parentEmail: String(st.payer_email || ''),
      parentPhone: String(st.payer_phone || ''),
      studentName: String(st.full_name || ''),
      studentGrade: String(st.grade || ''),
      userId: String(st.id || contract.student_id || ''),
      schoolName: String(org.name || ''),
    });
    const filled = fillExtraLessonsBody({
      templateBody: contract.filled_body,
      payload,
    });
    const incomplete = validateExtraLessonsOrder(order);
    return res.status(200).json({
      ok: true,
      contractId: contract.id,
      contractNumber: contract.contract_number,
      studentName: st.full_name,
      schoolName: org.name,
      alreadyAccepted: Boolean(contract.accepted_at),
      withdrawn: Boolean(contract.withdrawal_requested_at),
      order,
      parentEditableFields: incomplete,
      summary: payload,
      body: filled,
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (contract.accepted_at) return res.status(409).json({ error: 'Already accepted' });
  if (contract.withdrawal_requested_at) return res.status(409).json({ error: 'Withdrawn' });

  const body = (req.body || {}) as Record<string, unknown>;
  const orderPatch = (body.order_patch || {}) as Partial<ExtraLessonsOrderSnapshot>;
  if (orderPatch && typeof orderPatch === 'object') {
    order = mergeExtraLessonsOrderPatch(order, orderPatch);
  }
  const incomplete = validateExtraLessonsOrder(order);
  if (incomplete.length) {
    return res.status(400).json({ error: 'Incomplete order', fields: incomplete });
  }

  const payload = extraLessonsPayloadForContract({
    contractNumber: String(contract.contract_number || ''),
    order,
    parentName: String(st.payer_name || ''),
    parentEmail: String(st.payer_email || ''),
    parentPhone: String(st.payer_phone || ''),
    studentName: String(st.full_name || ''),
    studentGrade: String(st.grade || ''),
    userId: String(st.id || contract.student_id || ''),
    schoolName: String(org.name || ''),
  });

  const acceptedTerms = body.accepted_terms === true;
  const startWithin14 = body.start_within_14_days === true;
  const recordingRaw = body.recording_consent;
  const recordingConsent = recordingRaw === true ? true : recordingRaw === false ? false : null;
  if (!canClickWrapAccept({ accepted_terms: acceptedTerms, start_within_14_days: startWithin14, recording_consent: recordingConsent })) {
    return res.status(400).json({ error: 'Terms checkbox is required' });
  }

  const acceptedAt = new Date();
  const acceptedAtLabel = vilniusDateTimeLabel(acceptedAt);
  payload.data_laikas_Europe_Vilnius = acceptedAtLabel;
  const filled = fillExtraLessonsBody({
    templateBody: contract.filled_body,
    payload,
    startWithin14Label: startWithin14Label(startWithin14),
    recordingConsentLabel: recordingConsentLabel(recordingConsent),
    acceptedAtLabel,
  });
  const freezeSource = freezeDocumentSource({
    payload,
    filled_body: filled,
    acceptance: {
      accepted_terms: acceptedTerms,
      start_within_14_days: startWithin14,
      recording_consent: recordingConsent,
    },
  });
  const documentSha256 = await sha256Hex(freezeSource);
  const frozenBody = fillExtraLessonsBody({
    templateBody: filled,
    payload: { ...payload, 'SHA-256_ar_kitas_integralumo_ID': documentSha256 },
    sha256: documentSha256,
    startWithin14Label: startWithin14Label(startWithin14),
    recordingConsentLabel: recordingConsentLabel(recordingConsent),
    acceptedAtLabel,
  });

  let pdfPath: string | null = contract.pdf_url || null;
  try {
    const pdfBytes = await createSimpleContractPdf({
      contractNumber: String(contract.contract_number || ''),
      studentName: String(st.full_name || ''),
      parentName: String(st.payer_name || ''),
      parentEmail: String(st.payer_email || ''),
      parentPhone: String(st.payer_phone || ''),
      parentPersonalCode: '',
      childBirthDate: '',
      address: '',
      annualFee: order.indicative_monthly_eur,
      body: frozenBody,
    });
    pdfPath = schoolContractPdfStoragePath({
      organizationId: String(contract.organization_id),
      contractId: String(contract.id),
      contractNumber: contract.contract_number ?? null,
    });
    await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).upload(pdfPath, Buffer.from(pdfBytes), {
      upsert: true,
      contentType: 'application/pdf',
    });
  } catch (e) {
    console.error('[extra-lessons-contract-accept] pdf', (e as Error).message);
  }

  const { error: updErr } = await supabase.from('school_contracts').update({
    accepted_at: acceptedAt.toISOString(),
    accepted_terms: true,
    start_within_14_days: startWithin14,
    recording_consent: recordingConsent,
    document_sha256: documentSha256,
    filled_body: frozenBody,
    order_snapshot: order,
    base_lessons_per_month: order.base_lessons_per_month,
    unit_price_eur: order.unit_price_eur,
    annual_fee: order.indicative_monthly_eur,
    pdf_url: pdfPath,
    signed_contract_url: pdfPath,
    signing_status: 'signed',
    signed_at: acceptedAt.toISOString(),
  }).eq('id', contract.id);
  if (updErr) return res.status(500).json({ error: updErr.message });

  if (tokenRow?.id) {
    await supabase.from('school_contract_completion_tokens')
      .update({ used_at: acceptedAt.toISOString() })
      .eq('id', tokenRow.id);
  }

  const origin = appOrigin(req);
  const to = String(st.payer_email || '').trim();
  if (to) {
    await fetch(`${origin}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify({
        type: 'school_contract_extra_accepted',
        to,
        data: {
          schoolName: org.name,
          studentName: st.full_name,
          parentName: st.payer_name,
          contractNumber: contract.contract_number,
          sha256: documentSha256,
          acceptedAt: acceptedAtLabel,
        },
      }),
    }).catch((err) => console.error('[extra-lessons-contract-accept] email', err));
  }

  return res.status(200).json({
    ok: true,
    contractId: contract.id,
    document_sha256: documentSha256,
    accepted_at: acceptedAt.toISOString(),
  });
}
