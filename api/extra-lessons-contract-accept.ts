import type { VercelRequest, VercelResponse } from './types';
import {
  EXTRA_LESSONS_TERMS_CHECKBOX_TEXT,
  START_WITHIN_14_CHECKBOX_TEXT,
  canClickWrapAccept,
  freezeDocumentSource,
  mergeExtraLessonsOrderPatch,
  recordingConsentLabel,
  resolveStartWithin14Status,
  sha256Hex,
  startWithin14Label,
  validateExtraLessonsOrder,
  type ExtraLessonsOrderSnapshot,
} from '../src/lib/extraLessonsContract.js';
import { createSimpleContractPdf } from './_lib/schoolContractPdf.js';
import { schoolContractPdfStoragePath, SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';
import { verifyRequestAuth } from './_lib/auth.js';
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
    const start14 = resolveStartWithin14Status({ order, acceptedAt: new Date(), parentChecked: false });
    const orgFeatures = (org.features || {}) as Record<string, unknown>;
    const recordingsEnabled = orgFeatures.school_lesson_recordings === true;
    return res.status(200).json({
      ok: true,
      contractId: contract.id,
      contractNumber: contract.contract_number,
      revisionLabel: order.revision_label,
      studentName: st.full_name,
      schoolName: org.name,
      schoolEmail: org.email,
      schoolPhone: org.phone,
      alreadyAccepted: Boolean(contract.accepted_at),
      acceptedAt: contract.accepted_at || null,
      withdrawn: Boolean(contract.withdrawal_requested_at),
      extraEndKind: contract.extra_end_kind || null,
      pdfUrl: contract.signed_contract_url || contract.pdf_url || null,
      order,
      parentEditableFields: incomplete,
      summary: payload,
      body: filled,
      startWithin14Applies: start14.applies,
      firstLessonDate: start14.firstLessonYmd,
      termsCheckboxText: EXTRA_LESSONS_TERMS_CHECKBOX_TEXT,
      startWithin14CheckboxText: START_WITHIN_14_CHECKBOX_TEXT,
      recordingsEnabled,
      legalLinks: {
        withdrawalForm: '/legal/extra-lessons-withdrawal-form.html',
        privacyMailto: org.email ? `mailto:${org.email}` : null,
      },
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
    userId: '',
    schoolName: String(org.name || ''),
  });

  const acceptedTerms = body.accepted_terms === true;
  const recordingsEnabled = ((org.features || {}) as Record<string, unknown>).school_lesson_recordings === true;
  const recordingRaw = body.recording_consent;
  const recordingConsent = !recordingsEnabled
    ? null
    : recordingRaw === true ? true : recordingRaw === false ? false : null;
  const acceptedAt = new Date();
  const resolved14 = resolveStartWithin14Status({
    order,
    acceptedAt,
    parentChecked: body.start_within_14_days === true,
  });
  const startWithin14 = resolved14.status === 'yes';
  if (!canClickWrapAccept({ accepted_terms: acceptedTerms, start_within_14_days: startWithin14, recording_consent: recordingConsent })) {
    return res.status(400).json({ error: 'Terms checkbox is required' });
  }

  const auth = await verifyRequestAuth(req);
  const acceptedByUserId = auth?.userId || st.linked_user_id || null;
  payload.naudotojo_ID = String(acceptedByUserId || st.payer_email || '');

  const acceptedAtLabel = vilniusDateTimeLabel(acceptedAt);
  payload.data_laikas_Europe_Vilnius = acceptedAtLabel;
  const start14Label = startWithin14Label(resolved14.status);
  const filled = fillExtraLessonsBody({
    templateBody: contract.filled_body,
    payload,
    startWithin14Label: start14Label,
    recordingConsentLabel: recordingConsentLabel(recordingConsent),
    acceptedAtLabel,
  });
  const freezeSource = freezeDocumentSource({
    payload,
    filled_body: filled,
    acceptance: {
      accepted_terms: acceptedTerms,
      start_within_14_days: startWithin14,
      start_within_14_status: resolved14.status,
      start_within_14_shown_text: resolved14.shownText,
      recording_consent: recordingConsent,
    },
  });
  const documentSha256 = await sha256Hex(freezeSource);
  const frozenBody = fillExtraLessonsBody({
    templateBody: filled,
    payload: { ...payload, 'SHA-256_ar_kitas_integralumo_ID': documentSha256 },
    sha256: documentSha256,
    startWithin14Label: start14Label,
    recordingConsentLabel: recordingConsentLabel(recordingConsent),
    acceptedAtLabel,
  });

  let pdfPath: string | null = contract.pdf_url || null;
  let pdfBase64: string | null = null;
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
    pdfBase64 = Buffer.from(pdfBytes).toString('base64');
  } catch (e) {
    console.error('[extra-lessons-contract-accept] pdf', (e as Error).message);
  }

  const { error: updErr } = await supabase.from('school_contracts').update({
    accepted_at: acceptedAt.toISOString(),
    accepted_terms: true,
    start_within_14_days: startWithin14,
    start_within_14_status: resolved14.status,
    start_within_14_shown_text: resolved14.shownText,
    start_within_14_chosen_at: acceptedAt.toISOString(),
    accepted_by_user_id: acceptedByUserId,
    recording_consent: recordingConsent,
    document_sha256: documentSha256,
    filled_body: frozenBody,
    order_snapshot: order,
    revision_label: order.revision_label,
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
        attachments: pdfBase64
          ? [{ filename: `sutartis-${contract.contract_number || contract.id}.pdf`, content: pdfBase64 }]
          : undefined,
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
