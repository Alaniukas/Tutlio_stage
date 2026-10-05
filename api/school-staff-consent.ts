import type { VercelRequest, VercelResponse } from './types';
import { waitUntil } from '@vercel/functions';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  validateConsentAnswers,
  validateStaffPersonalDetails,
  isStaffDocumentsOrg,
  staffPersonalDetailsStoragePath,
  parseStoredStaffPersonalDetails,
  encodeStaffPersonalDetails,
} from './_lib/schoolStaffDocuments.js';
import { completeStaffConsentPdfGeneration } from './_lib/schoolStaffConsentPdf.js';
import { SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function loadStashedStaffDetails(
  supabase: SupabaseClient,
  organizationId: string,
  confidentialityId: string,
): Promise<{ address: string; personalCode: string } | null> {
  const { data, error } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET)
    .download(staffPersonalDetailsStoragePath(organizationId, confidentialityId));
  if (error || !data) return null;
  try {
    const blob = data as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
    const raw = typeof blob.arrayBuffer === 'function'
      ? Buffer.from(await blob.arrayBuffer())
      : Buffer.from(String(data));
    const parsed = JSON.parse(raw.toString('utf8'));
    return parseStoredStaffPersonalDetails(parsed);
  } catch {
    return null;
  }
}

async function previewExists(supabase: SupabaseClient, folder: string): Promise<boolean> {
  const { data: listed } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET)
    .list(folder, { search: 'consent-preview.pdf', limit: 5 });
  return (listed || []).some((file) => file.name === 'consent-preview.pdf');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json(res, 500, { error: 'Server misconfigured' });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = req.method === 'GET'
    ? String(req.query?.token || '').trim()
    : String(req.body?.token || '').trim();
  if (!token) return json(res, 400, { error: 'Trūksta nuorodos.' });
  const { data: signature } = await supabase.from('school_contract_signatures')
    .select('id, contract_id, role, status, token, token_expires_at').eq('token', token).maybeSingle();
  if (!signature || signature.role !== 'teacher') return json(res, 404, { error: 'Nuoroda negalioja.' });
  if (signature.token_expires_at && new Date(signature.token_expires_at).getTime() < Date.now()) {
    return json(res, 410, { error: 'Nuoroda nebegalioja. Paprašykite mokyklos naujo pakvietimo.' });
  }
  const { data: contract } = await supabase.from('school_contracts')
    .select('id, organization_id, contract_number, counterparty_name, counterparty_email, signing_status, staff_document_type, staff_document_group_id, staff_consent_answers, staff_revoked_at, staff_employment_contract_number, staff_employment_contract_date, pdf_url, organizations(name, entity_type, features)')
    .eq('id', signature.contract_id).maybeSingle();
  const org = (contract as any)?.organizations;
  if (!contract || !isStaffDocumentsOrg(contract.organization_id) || contract.staff_document_type !== 'consent' || org?.entity_type !== 'school'
    || org?.features?.school_staff_documents !== true || org?.features?.school_contract_esign !== true) {
    return json(res, 404, { error: 'Dokumentas nerastas.' });
  }
  if (contract.staff_revoked_at || signature.status === 'canceled') {
    return json(res, 410, { error: 'Šis dokumentas atšauktas.' });
  }
  const { data: agreement, error: agreementError } = await supabase.from('school_contracts')
    .select('id, organization_id, contract_number, counterparty_name, signing_status, staff_document_type, staff_document_group_id, staff_revoked_at, pdf_url')
    .eq('organization_id', contract.organization_id)
    .eq('staff_document_group_id', contract.staff_document_group_id)
    .eq('staff_document_type', 'confidentiality').maybeSingle();
  if (agreementError || !agreement || agreement.staff_revoked_at) {
    return json(res, 409, { error: 'Susitarimas nerastas arba atšauktas. Kreipkitės į mokyklą.' });
  }
  const stashedDetails = agreement.pdf_url
    ? null
    : await loadStashedStaffDetails(supabase, agreement.organization_id, agreement.id);
  const needsPersonalDetails = !agreement.pdf_url && !stashedDetails;
  if (req.method === 'GET') {
    await supabase.from('school_contracts').update({ staff_viewed_at: new Date().toISOString() })
      .eq('id', contract.id).is('staff_viewed_at', null);
    let previewUrl: string | null = null;
    if (!contract.staff_consent_answers) {
      const folder = `${contract.organization_id}/contracts/${contract.id}`;
      if (await previewExists(supabase, folder)) {
        const { data: signed } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET)
          .createSignedUrl(`${folder}/consent-preview.pdf`, 3600);
        previewUrl = signed?.signedUrl || null;
      }
    }
    return json(res, 200, {
      employeeName: contract.counterparty_name,
      schoolName: org.name,
      answersSubmitted: Boolean(contract.staff_consent_answers),
      signed: contract.signing_status === 'signed',
      previewUrl,
      needsPersonalDetails,
      detailsHeldBySchool: Boolean(agreement.pdf_url || stashedDetails),
    });
  }
  if (contract.staff_consent_answers) {
    return json(res, 200, { ok: true });
  }
  if (contract.signing_status !== 'draft') {
    return json(res, 409, { error: 'Atsakymai jau pateikti. Dėl pakeitimų kreipkitės į mokyklą.' });
  }
  const answers = validateConsentAnswers(req.body?.answers);
  if (!answers) return json(res, 400, { error: 'Pažymėkite kiekvieną iš 10 punktų.' });
  if (needsPersonalDetails && agreement.signing_status !== 'draft') {
    return json(res, 409, { error: 'Susitarimo būsena pasikeitė. Atnaujinkite puslapį.' });
  }
  const details = needsPersonalDetails
    ? validateStaffPersonalDetails({
      address: req.body?.address,
      personalCode: req.body?.personalCode,
    })
    : stashedDetails;
  if (!agreement.pdf_url && !details) {
    return json(res, 400, { error: 'Įveskite gyvenamosios vietos adresą ir 11 skaitmenų asmens kodą.' });
  }

  const { data: saved, error: saveError } = await supabase.from('school_contracts').update({
    staff_consent_answers: answers,
  }).eq('id', contract.id).is('staff_consent_answers', null).is('staff_revoked_at', null).select('id').maybeSingle();
  if (saveError) {
    console.error('[school-staff-consent] answers save failed', saveError.message || 'unknown');
    return json(res, 502, { error: 'Nepavyko išsaugoti atsakymų. Bandykite dar kartą.' });
  }
  if (!saved) return json(res, 200, { ok: true });

  if (!agreement.pdf_url && details) {
    const { error: stashError } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).upload(
      staffPersonalDetailsStoragePath(agreement.organization_id, agreement.id),
      encodeStaffPersonalDetails(details),
      { contentType: 'application/json', upsert: true },
    );
    if (stashError) {
      console.error('[school-staff-consent] details stash failed', stashError.message || 'unknown');
    }
  }

  json(res, 200, { ok: true });
  const backgroundDetails = details || await loadStashedStaffDetails(supabase, agreement.organization_id, agreement.id);
  const background = completeStaffConsentPdfGeneration({
    supabase,
    contract,
    agreement,
    answers,
    details: backgroundDetails,
    schoolName: String(org?.name || 'Mokykla'),
    source: 'employee_submit',
  });
  try {
    waitUntil(background);
  } catch {
    await background;
  }
}
