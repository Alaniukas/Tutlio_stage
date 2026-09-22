import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { renderStaffDocumentPdf, validateConsentAnswers, STAFF_TEMPLATE_ORG_ID } from './_lib/schoolStaffDocuments.js';
import { schoolContractPdfStoragePath, SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    .select('id, organization_id, contract_number, counterparty_name, counterparty_email, signing_status, staff_document_type, staff_consent_answers, staff_revoked_at, staff_employment_contract_number, staff_employment_contract_date, organizations(name, entity_type, features)')
    .eq('id', signature.contract_id).maybeSingle();
  const org = (contract as any)?.organizations;
  if (!contract || contract.organization_id !== STAFF_TEMPLATE_ORG_ID || contract.staff_document_type !== 'consent' || org?.entity_type !== 'school'
    || org?.features?.school_staff_documents !== true || org?.features?.school_contract_esign !== true) {
    return json(res, 404, { error: 'Dokumentas nerastas.' });
  }
  if (contract.staff_revoked_at || signature.status === 'canceled') {
    return json(res, 410, { error: 'Šis dokumentas atšauktas.' });
  }
  if (req.method === 'GET') {
    await supabase.from('school_contracts').update({ staff_viewed_at: new Date().toISOString() })
      .eq('id', contract.id).is('staff_viewed_at', null);
    let previewUrl: string | null = null;
    if (!contract.staff_consent_answers) {
      const folder = `${contract.organization_id}/contracts/${contract.id}`;
      const previewPath = `${folder}/consent-preview.pdf`;
      const { data: listed } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET)
        .list(folder, { search: 'consent-preview.pdf', limit: 5 });
      if (!(listed || []).some((file) => file.name === 'consent-preview.pdf')) {
        try {
          const preview = await renderStaffDocumentPdf('consent', {
            name: String(contract.counterparty_name || ''),
            employmentContractNumber: String(contract.staff_employment_contract_number || ''),
            employmentContractDate: String(contract.staff_employment_contract_date || ''),
            date: new Date(),
          }, null, true);
          await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).upload(previewPath, preview, {
            contentType: 'application/pdf', upsert: true,
          });
        } catch (error) {
          console.error('[school-staff-consent] preview', error);
        }
      }
      const { data: signed } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).createSignedUrl(previewPath, 3600);
      previewUrl = signed?.signedUrl || null;
      if (!previewUrl) return json(res, 503, { error: 'Sutikimo dokumento dabar parodyti nepavyko. Bandykite vėliau.' });
    }
    return json(res, 200, {
      employeeName: contract.counterparty_name,
      schoolName: org.name,
      answersSubmitted: Boolean(contract.staff_consent_answers),
      signed: contract.signing_status === 'signed',
      previewUrl,
    });
  }
  if (contract.staff_consent_answers || contract.signing_status !== 'draft') {
    return json(res, 409, { error: 'Atsakymai jau pateikti. Dėl pakeitimų kreipkitės į mokyklą.' });
  }
  const answers = validateConsentAnswers(req.body?.answers);
  if (!answers) return json(res, 400, { error: 'Pažymėkite kiekvieną iš 10 punktų.' });
  const path = schoolContractPdfStoragePath({
    organizationId: contract.organization_id,
    contractId: contract.id,
    contractNumber: contract.contract_number,
  }).replace(/\.pdf$/i, `-${randomUUID()}.pdf`);
  try {
    const pdf = await renderStaffDocumentPdf('consent', {
      name: String(contract.counterparty_name || ''),
      employmentContractNumber: String(contract.staff_employment_contract_number || ''),
      employmentContractDate: String(contract.staff_employment_contract_date || ''),
      date: new Date(),
    }, answers);
    const { error: uploadError } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).upload(path, pdf, {
      contentType: 'application/pdf', upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data: updated, error: updateError } = await supabase.from('school_contracts').update({
      staff_consent_answers: answers,
      pdf_url: path,
      signing_status: 'awaiting_school_signature',
    }).eq('id', contract.id).eq('signing_status', 'draft').is('staff_revoked_at', null).select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return json(res, 409, { error: 'Dokumentas jau pakeistas.' });
    return json(res, 200, { ok: true });
  } catch (error: any) {
    console.error('[school-staff-consent]', error);
    return json(res, 502, { error: error?.message || 'Nepavyko paruošti sutikimo PDF.' });
  }
}
