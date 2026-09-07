import type { VercelRequest, VercelResponse } from './types';
import {
  EXTRA_LESSONS_FULL_TERMS_CHECKBOX_TEXT,
  START_WITHIN_14_CHECKBOX_TEXT,
  canClickWrapAccept,
  extraLessonsWithdrawalFormHref,
  freezeDocumentSource,
  mergeExtraLessonsOrderPatch,
  recordingConsentLabel,
  resolveStartWithin14Status,
  sha256Hex,
  startWithin14Label,
  validateExtraLessonsOrder,
  type ExtraLessonsOrderSnapshot,
} from '../src/lib/extraLessonsContract.js';
import { renderAndStoreExtraLessonsPdf, renderExtraLessonsAnnexPdf, signSchoolContractPdf } from './_lib/extraLessonsPdf.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { sendFirstLessonInvite } from './_lib/extraLessonsFirstLessonInvite.js';
import {
  extraLessonsPayloadForContract,
  extraLessonsTemplateSource,
  fillExtraLessonsBody,
  internalApiOrigin,
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
  const templateBody = extraLessonsTemplateSource({
    organizationId: contract.organization_id,
    storedBody: contract.filled_body,
  });
  const defaultStartWithin14 = contract.accepted_at
    ? contract.start_within_14_status === 'yes'
      || (!contract.start_within_14_status && contract.start_within_14_days === true)
    : true;

  async function renderPreviewPdf(payload: Record<string, string>, filled: string): Promise<string | null> {
    try {
      const rendered = await renderAndStoreExtraLessonsPdf(supabase, {
        contract,
        student: st,
        filledBody: filled,
        indicativeMonthlyEur: order.indicative_monthly_eur,
        extraLessonsPayload: payload,
      });
      if (rendered.uploadedPath) {
        await supabase.from('school_contracts').update({ pdf_url: rendered.uploadedPath }).eq('id', contract.id);
        contract.pdf_url = rendered.uploadedPath;
        return signSchoolContractPdf(supabase, rendered.uploadedPath);
      }
    } catch (e) {
      console.error('[extra-lessons-contract-accept] preview pdf', (e as Error).message);
    }
    return null;
  }

  async function jsonPreview(opts: { alreadyAccepted?: boolean; forceRender?: boolean } = {}) {
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
    const incomplete = validateExtraLessonsOrder(order);
    const start14 = resolveStartWithin14Status({
      order,
      acceptedAt: contract.accepted_at ? new Date(contract.accepted_at) : new Date(),
      parentChecked: defaultStartWithin14,
    });
    const orgFeatures = (org.features || {}) as Record<string, unknown>;
    const recordingsEnabled = orgFeatures.school_lesson_recordings === true;
    payload.start_within_14_label = startWithin14Label(start14.status);
    payload.recording_consent_label = recordingsEnabled ? '—' : 'NETAIKOMA';
    payload.sutikimo_su_salygomis_busena = contract.accepted_at ? 'TAIP' : '—';
    const filled = fillExtraLessonsBody({
      templateBody,
      organizationId: contract.organization_id,
      payload,
      startWithin14Label: payload.start_within_14_label,
      recordingConsentLabel: payload.recording_consent_label,
      termsAcceptedLabel: payload.sutikimo_su_salygomis_busena,
    });

    let pdfUrl: string | null = null;
    if (contract.accepted_at || opts.alreadyAccepted) {
      pdfUrl = await signSchoolContractPdf(supabase, contract.signed_contract_url || contract.pdf_url);
    } else {
      pdfUrl = await renderPreviewPdf(payload, filled);
      if (!pdfUrl) {
        pdfUrl = await signSchoolContractPdf(supabase, contract.pdf_url);
      }
    }

    return {
      ok: true,
      contractId: contract.id,
      contractNumber: contract.contract_number,
      revisionLabel: order.revision_label,
      studentName: st.full_name,
      schoolName: org.name,
      schoolEmail: org.email,
      schoolPhone: org.phone,
      alreadyAccepted: Boolean(contract.accepted_at) || Boolean(opts.alreadyAccepted),
      acceptedAt: contract.accepted_at || null,
      withdrawn: Boolean(contract.withdrawal_requested_at),
      extraEndKind: contract.extra_end_kind || null,
      pdfUrl,
      order,
      parentEditableFields: incomplete,
      summary: payload,
      body: filled,
      startWithin14Applies: start14.applies,
      startWithin14Default: defaultStartWithin14,
      firstLessonDate: start14.firstLessonYmd,
      termsCheckboxText: EXTRA_LESSONS_FULL_TERMS_CHECKBOX_TEXT,
      startWithin14CheckboxText: START_WITHIN_14_CHECKBOX_TEXT,
      recordingsEnabled,
      legalLinks: {
        withdrawalForm: extraLessonsWithdrawalFormHref(token),
        privacyMailto: org.email ? `mailto:${org.email}` : null,
      },
    };
  }

  if (req.method === 'GET') {
    const format = String(Array.isArray(req.query?.format) ? req.query.format[0] : (req.query?.format || '')).trim();
    if (format === 'annex-pdf') {
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
      const start14 = resolveStartWithin14Status({
        order,
        acceptedAt: contract.accepted_at ? new Date(contract.accepted_at) : new Date(),
        parentChecked: defaultStartWithin14,
      });
      const orgFeatures = (org.features || {}) as Record<string, unknown>;
      const recordingsEnabled = orgFeatures.school_lesson_recordings === true;
      payload.start_within_14_label = startWithin14Label(start14.status);
      payload.recording_consent_label = recordingsEnabled ? '—' : 'NETAIKOMA';
      payload.sutikimo_su_salygomis_busena = contract.accepted_at ? 'TAIP' : '—';
      const filled = fillExtraLessonsBody({
        templateBody,
        organizationId: contract.organization_id,
        payload,
        startWithin14Label: payload.start_within_14_label,
        recordingConsentLabel: payload.recording_consent_label,
        termsAcceptedLabel: payload.sutikimo_su_salygomis_busena,
      });
      try {
        const pdf = await renderExtraLessonsAnnexPdf(supabase, {
          contract,
          student: st,
          filledBody: filled,
          indicativeMonthlyEur: order.indicative_monthly_eur,
          extraLessonsPayload: payload,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="Sutarties-atsisakymo-forma.pdf"');
        res.setHeader('Cache-Control', 'private, max-age=60');
        return res.status(200).send(Buffer.from(pdf));
      } catch (e) {
        console.error('[extra-lessons-contract-accept] annex pdf', (e as Error).message);
        return res.status(500).json({ error: 'Nepavyko paruošti priedo PDF' });
      }
    }
    return res.status(200).json(await jsonPreview());
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = (req.body || {}) as Record<string, unknown>;
  const orderPatch = (body.order_patch || {}) as Partial<ExtraLessonsOrderSnapshot>;
  if (orderPatch && typeof orderPatch === 'object') {
    order = mergeExtraLessonsOrderPatch(order, orderPatch);
  }

  if (body.preview === true) {
    return res.status(200).json(await jsonPreview({ forceRender: true }));
  }

  if (contract.accepted_at) return res.status(409).json({ error: 'Already accepted' });
  if (contract.withdrawal_requested_at) return res.status(409).json({ error: 'Withdrawn' });
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
  const recordingsEnabled = ((org.features || {}) as Record<string, unknown>).school_lesson_recordings === true;
  const recordingRaw = body.recording_consent;
  const recordingConsent = !recordingsEnabled
    ? null
    : recordingRaw === true ? true : recordingRaw === false ? false : null;
  if (recordingsEnabled && recordingConsent === null) {
    return res.status(400).json({ error: 'Pasirinkite, ar sutinkate su užsiėmimų įrašymu.' });
  }
  const acceptedAt = new Date();
  const resolved14 = resolveStartWithin14Status({
    order,
    acceptedAt,
    parentChecked: body.start_within_14_days !== false,
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
  const recLabel = recordingConsentLabel(recordingConsent);
  payload.sutikimo_su_salygomis_busena = 'TAIP';
  payload.start_within_14_label = start14Label;
  payload.recording_consent_label = recLabel;
  const filled = fillExtraLessonsBody({
    templateBody,
    organizationId: contract.organization_id,
    payload,
    startWithin14Label: start14Label,
    recordingConsentLabel: recLabel,
    acceptedAtLabel,
    termsAcceptedLabel: 'TAIP',
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
  payload.dokumento_sha256 = documentSha256;
  payload['SHA-256_ar_kitas_integralumo_ID'] = documentSha256;
  payload.el_pastas_ir_issiuntimo_data_laikas = [String(st.payer_email || '').trim(), acceptedAtLabel]
    .filter(Boolean)
    .join(' · ');
  const frozenBody = fillExtraLessonsBody({
    templateBody,
    organizationId: contract.organization_id,
    payload,
    sha256: documentSha256,
    startWithin14Label: start14Label,
    recordingConsentLabel: recLabel,
    acceptedAtLabel,
    termsAcceptedLabel: 'TAIP',
    confirmationSentLabel: payload.el_pastas_ir_issiuntimo_data_laikas,
  });

  let rendered: Awaited<ReturnType<typeof renderAndStoreExtraLessonsPdf>>;
  try {
    rendered = await renderAndStoreExtraLessonsPdf(supabase, {
      contract,
      student: st,
      filledBody: frozenBody,
      indicativeMonthlyEur: order.indicative_monthly_eur,
      extraLessonsPayload: payload,
    });
  } catch (e) {
    console.error('[extra-lessons-contract-accept] pdf', (e as Error).message);
    return res.status(503).json({
      error: 'Nepavyko suformuoti sutarties pagal įkeltą DOCX šabloną. Sutartis dar nepatvirtinta - bandykite dar kartą.',
      code: 'contract_pdf_generation_failed',
    });
  }
  if (!rendered.uploadedPath || !rendered.pdfBase64) {
    return res.status(503).json({
      error: 'Nepavyko išsaugoti galutinio sutarties PDF. Sutartis dar nepatvirtinta - bandykite dar kartą.',
      code: 'contract_pdf_generation_failed',
    });
  }
  const pdfPath = rendered.uploadedPath;
  const pdfBase64 = rendered.pdfBase64;

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

  const origin = internalApiOrigin(req);
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
          organizationId: contract.organization_id,
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

  // Schema step 2: the confirmed contract comes back → invite to the nearest
  // lesson (join link + homework page), still without any account.
  let firstLessonInvite: Awaited<ReturnType<typeof sendFirstLessonInvite>> | null = null;
  try {
    firstLessonInvite = await sendFirstLessonInvite(supabase, req, {
      contractId: contract.id,
      contractNumber: contract.contract_number || null,
      organizationId: contract.organization_id,
      schoolName: org.name || null,
      studentId: String(st.id || contract.student_id),
      studentName: st.full_name || null,
      parentName: st.payer_name || null,
      payerEmail: st.payer_email || null,
      order,
      acceptedAtIso: acceptedAt.toISOString(),
      startWithin14Status: resolved14.status,
      classGroupId: contract.class_group_id || null,
    });
  } catch (err) {
    console.error('[extra-lessons-contract-accept] first lesson invite', err);
  }

  const signedPdfUrl = pdfPath ? await signSchoolContractPdf(supabase, pdfPath) : null;

  return res.status(200).json({
    ok: true,
    contractId: contract.id,
    document_sha256: documentSha256,
    accepted_at: acceptedAt.toISOString(),
    pdfUrl: signedPdfUrl,
    firstLessonInvite,
  });
}
