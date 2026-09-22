import type { VercelRequest, VercelResponse } from './types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { ensureSignatureRow, fetchSignatureRows, inviteTeacherToSign, renewParentSignatureAccess, sendInternalEmail } from './_lib/schoolContractSigning.js';
import { renderStaffDocumentPdf, staffDocumentStatus, STAFF_TEMPLATE_ORG_ID } from './_lib/schoolStaffDocuments.js';
import { schoolContractPdfStoragePath, SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';
import { cancelSigning } from './_lib/gosignClient.js';
import { PDFDocument } from 'pdf-lib';

const SELECT = 'id, organization_id, contract_number, counterparty_name, counterparty_email, signing_status, created_at, sent_at, signed_at, pdf_url, signed_contract_url, staff_document_type, staff_document_group_id, staff_employment_contract_number, staff_employment_contract_date, staff_consent_answers, staff_viewed_at, staff_revoked_at, staff_last_reminder_at, staff_files_deleted_at';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function isEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value) && value.length <= 254;
}

async function sendConsentChoicesInvite(
  supabase: SupabaseClient,
  contract: any,
  origin: string,
  schoolName: string,
): Promise<boolean> {
  let row = await ensureSignatureRow(supabase, {
    contractId: contract.id,
    role: 'teacher',
    signerName: contract.counterparty_name,
    signerEmail: contract.counterparty_email,
  });
  row = await renewParentSignatureAccess(supabase, row);
  const emailed = await sendInternalEmail(origin, 'school_staff_consent_choices_request', contract.counterparty_email, {
    employeeName: contract.counterparty_name,
    schoolName,
    choicesUrl: `${origin.replace(/\/$/, '')}/school-staff-consent?token=${encodeURIComponent(row.token)}`,
    organizationId: contract.organization_id,
  });
  if (emailed) {
    await supabase.from('school_contracts').update({
      sent_at: new Date().toISOString(),
      staff_last_reminder_at: new Date().toISOString(),
    }).eq('id', contract.id);
  }
  return emailed;
}

async function remindOne(supabase: SupabaseClient, contract: any, origin: string, schoolName: string): Promise<boolean> {
  if (contract.staff_revoked_at || contract.signing_status === 'signed') return false;
  if (contract.staff_document_type === 'consent' && !contract.staff_consent_answers) {
    return sendConsentChoicesInvite(supabase, contract, origin, schoolName);
  }
  if (contract.signing_status !== 'signed_by_school') return false;
  const signatures = await fetchSignatureRows(supabase, contract.id);
  const schoolPath = String(signatures.find((row: any) => row.role === 'school')?.signed_pdf_path || '');
  if (!schoolPath) return false;
  const result = await inviteTeacherToSign(supabase, {
    ...contract,
    organizations: { name: schoolName },
  }, schoolPath, origin, {
    name: contract.counterparty_name,
    email: contract.counterparty_email,
  });
  if (result.emailed) {
    await supabase.from('school_contracts').update({ staff_last_reminder_at: new Date().toISOString() }).eq('id', contract.id);
  }
  return result.emailed;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId || auth.isInternal) return json(res, 401, { error: 'Unauthorized' });
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) return json(res, 500, { error: 'Server misconfigured' });
  const supabase = createClient(supabaseUrl, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const access = await getOrgAdminAccessByUserId(supabase, auth.userId);
  const permission = req.method === 'GET' ? 'contracts.view' : 'contracts.edit';
  if (!access?.organizationId || !hasOrgAdminPermission(access.role, access.permissions, permission)) {
    return json(res, 403, { error: 'Forbidden' });
  }
  const orgId = access.organizationId;
  const { data: org } = await supabase.from('organizations').select('name, entity_type, features').eq('id', orgId).maybeSingle();
  if (orgId !== STAFF_TEMPLATE_ORG_ID || org?.entity_type !== 'school' || org?.features?.school_staff_documents !== true || org?.features?.school_contract_esign !== true) {
    return json(res, 403, { error: 'Darbuotojų dokumentų funkcija šiai mokyklai neįjungta.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('school_contracts').select(SELECT)
      .eq('organization_id', orgId).not('staff_document_type', 'is', null)
      .order('created_at', { ascending: false }).limit(1000);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { organizationId: orgId, documents: (data || []).map((row: any) => ({ ...row, status: staffDocumentStatus(row) })) });
  }

  const action = String(req.body?.action || '');
  const origin = publicOriginFromRequest(req);
  if (action === 'create-bundle') {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const employmentNumber = String(req.body?.employmentContractNumber || '').trim();
    const employmentDate = String(req.body?.employmentContractDate || '').trim();
    const groupId = String(req.body?.groupId || '').trim();
    const confidentialityId = String(req.body?.confidentialityId || '').trim();
    const consentId = String(req.body?.consentId || '').trim();
    if (!name || name.length > 200 || !isEmail(email)) {
      return json(res, 400, { error: 'Neteisingi darbuotojo arba dokumento duomenys.' });
    }
    const preparedPath = String(req.body?.preparedPdfPath || '').trim();
    if (employmentNumber.length > 100 || (employmentDate && !/^\d{4}-\d{2}-\d{2}$/.test(employmentDate))) {
      return json(res, 400, { error: 'Neteisingas darbo sutarties numeris arba data.' });
    }
    if (!preparedPath && (!employmentNumber || !employmentDate)) {
      return json(res, 400, { error: 'Generuojant dokumentą reikia darbo sutarties numerio ir datos.' });
    }
    if (![groupId, confidentialityId, consentId].every((id) => /^[0-9a-f-]{36}$/i.test(id)) || confidentialityId === consentId) {
      return json(res, 400, { error: 'Neteisingas dokumento identifikatorius.' });
    }
    const { data: existing, error: existingError } = await supabase.from('school_contracts').select(SELECT)
      .eq('organization_id', orgId).eq('staff_document_group_id', groupId).limit(3);
    if (existingError) return json(res, 500, { error: existingError.message });
    if (existing?.length) {
      const confidentiality = existing.find((item: any) => item.staff_document_type === 'confidentiality');
      const consent = existing.find((item: any) => item.staff_document_type === 'consent');
      if (existing.length === 2 && confidentiality?.id === confidentialityId && consent?.id === consentId
        && confidentiality.counterparty_name === name && confidentiality.counterparty_email === email) {
        return json(res, 200, { documents: existing, emailed: Boolean(consent.sent_at) });
      }
      return json(res, 409, { error: 'Šios grupės dokumentai jau sukurti. Atnaujinkite sąrašą.' });
    }
    const number = `DAR-${new Date().getFullYear()}-${confidentialityId.slice(0, 8).toUpperCase()}`;
    const consentNumber = `DAR-${new Date().getFullYear()}-${consentId.slice(0, 8).toUpperCase()}`;
    const path = schoolContractPdfStoragePath({ organizationId: orgId, contractId: confidentialityId, contractNumber: number });
    if (preparedPath && preparedPath !== path) return json(res, 400, { error: 'Neteisinga PDF failo vieta.' });
    const removeUnclaimedPdf = async () => {
      const { data: claimed, error: lookupError } = await supabase.from('school_contracts').select('id').eq('id', confidentialityId).maybeSingle();
      if (lookupError || claimed) return;
      const { error: removeError } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).remove([path]);
      if (removeError) console.error('[school-staff-documents] orphan PDF cleanup:', removeError);
    };
    try {
      if (preparedPath) {
        const { data: file, error: downloadError } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).download(path);
        if (downloadError || !file) return json(res, 400, { error: 'PDF failas nerastas.' });
        if (file.size > 25 * 1024 * 1024) {
          await removeUnclaimedPdf();
          return json(res, 413, { error: 'PDF failas per didelis. Daugiausia 25 MB.' });
        }
        const bytes = Buffer.from(await file.arrayBuffer());
        if (bytes.subarray(0, 5).toString() !== '%PDF-') {
          await removeUnclaimedPdf();
          return json(res, 400, { error: 'Įkeltas failas nėra PDF.' });
        }
        try {
          const pdf = await PDFDocument.load(bytes);
          if (!pdf.getPageCount()) {
            await removeUnclaimedPdf();
            return json(res, 400, { error: 'PDF neturi puslapių.' });
          }
        } catch {
          await removeUnclaimedPdf();
          return json(res, 400, { error: 'PDF failo nepavyko perskaityti.' });
        }
      } else {
        const bytes = await renderStaffDocumentPdf('confidentiality', {
          name, employmentContractNumber: employmentNumber, employmentContractDate: employmentDate, date: new Date(),
        });
        const { error: uploadError } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).upload(path, bytes, {
          contentType: 'application/pdf', upsert: false,
        });
        if (uploadError) throw uploadError;
      }
      const base = {
        organization_id: orgId,
        template_id: null,
        student_id: null,
        party_kind: 'teacher',
        counterparty_name: name,
        counterparty_email: email,
        filled_body: name,
        annual_fee: 0,
        staff_document_group_id: groupId,
        staff_employment_contract_number: employmentNumber || null,
        staff_employment_contract_date: employmentDate || null,
      };
      // One PostgREST insert is one SQL statement: either both documents exist or neither does.
      const { data: contracts, error: insertError } = await supabase.from('school_contracts').insert([
        { ...base, id: confidentialityId, contract_number: number, pdf_url: path,
          signing_status: 'awaiting_school_signature', staff_document_type: 'confidentiality' },
        { ...base, id: consentId, contract_number: consentNumber, pdf_url: null,
          signing_status: 'draft', staff_document_type: 'consent' },
      ]).select(SELECT);
      if (insertError || !contracts || contracts.length !== 2) throw insertError || new Error('Nepavyko sukurti abiejų dokumentų.');
      const consent = contracts.find((item: any) => item.staff_document_type === 'consent');
      let emailed = false;
      if (consent) {
        try { emailed = await sendConsentChoicesInvite(supabase, consent, origin, org.name || 'Mokykla'); }
        catch (emailError) { console.error('[school-staff-documents] consent invite:', emailError); }
      }
      return json(res, 201, { documents: contracts, emailed });
    } catch (error: any) {
      await removeUnclaimedPdf().catch((cleanupError) => console.error('[school-staff-documents] cleanup:', cleanupError));
      return json(res, 500, { error: error?.message || 'Nepavyko sukurti abiejų dokumentų.' });
    }
  }

  if (action === 'remind' || action === 'revoke') {
    const id = String(req.body?.id || '').trim();
    const { data: contract } = await supabase.from('school_contracts').select(SELECT)
      .eq('id', id).eq('organization_id', orgId).not('staff_document_type', 'is', null).maybeSingle();
    if (!contract) return json(res, 404, { error: 'Dokumentas nerastas.' });
    if (action === 'revoke') {
      if (contract.signing_status === 'signed') return json(res, 409, { error: 'Pasirašyto dokumento atšaukti negalima.' });
      if (contract.staff_revoked_at) return json(res, 200, { ok: true });
      const at = new Date().toISOString();
      const { error } = await supabase.from('school_contracts').update({ staff_revoked_at: at }).eq('id', id).is('staff_revoked_at', null);
      if (error) return json(res, 500, { error: error.message });
      const rows = await fetchSignatureRows(supabase, id);
      for (const row of rows) {
        if (row.gosign_transaction_id && row.status === 'in_progress') {
          try { await cancelSigning(row.gosign_transaction_id); } catch { /* local revocation still blocks access */ }
        }
      }
      await supabase.from('school_contract_signatures').update({ status: 'canceled' })
        .eq('contract_id', id).in('status', ['pending', 'in_progress']);
      return json(res, 200, { ok: true });
    }
    try {
      const emailed = await remindOne(supabase, contract, origin, org.name || 'Mokykla');
      return json(res, 200, { ok: true, emailed });
    } catch (error: any) {
      return json(res, 502, { error: error?.message || 'Nepavyko išsiųsti priminimo.' });
    }
  }

  if (action === 'remind-unsigned') {
    const { data, error } = await supabase.from('school_contracts').select(SELECT)
      .eq('organization_id', orgId).not('staff_document_type', 'is', null)
      .is('staff_revoked_at', null).neq('signing_status', 'signed').limit(250);
    if (error) return json(res, 500, { error: error.message });
    const now = Date.now();
    let sent = 0;
    let skipped = 0;
    for (const contract of data || []) {
      if (contract.staff_last_reminder_at && now - new Date(contract.staff_last_reminder_at).getTime() < 24 * 60 * 60 * 1000) {
        skipped += 1;
        continue;
      }
      try {
        if (await remindOne(supabase, contract, origin, org.name || 'Mokykla')) sent += 1;
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
    return json(res, 200, { ok: true, sent, skipped });
  }
  return json(res, 400, { error: 'Unknown action' });
}
