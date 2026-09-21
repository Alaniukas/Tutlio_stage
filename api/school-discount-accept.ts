import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './types';
import { serviceSupabase } from './_lib/schoolConsultationsAccess.js';
import { generateSchoolDiscountAgreementPdf } from './_lib/schoolDiscountAgreementPdf.js';
import {
  SCHOOL_DISCOUNT_ACCEPTANCE_VERSION,
  loadSchoolDiscountAgreementByToken,
  schoolDiscountPdfPath,
  signSchoolDiscountPdf,
} from './_lib/schoolDiscountAgreementShared.js';
import { SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';
import { resolveInvoiceBranding } from './_lib/invoiceBranding.js';
import { schoolDiscountAcceptanceStatement } from '../src/lib/schoolDiscountAgreement.js';

function vilniusDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat('lt-LT', {
    timeZone: 'Europe/Vilnius',
    dateStyle: 'long',
    timeStyle: 'medium',
  }).format(new Date(value));
}

async function loadAgreementContext(token: string) {
  const supabase = serviceSupabase();
  const agreement = await loadSchoolDiscountAgreementByToken(supabase, token);
  if (!agreement) return null;
  const [{ data: student }, { data: contract }, { data: org }, { data: profile }] = await Promise.all([
    supabase.from('students')
      .select('id, full_name, payer_name, payer_email, email')
      .eq('id', agreement.student_id)
      .eq('organization_id', agreement.organization_id).maybeSingle(),
    supabase.from('school_contracts')
      .select('id, contract_number, signing_status, kind, accepted_at, archived_at, terminated_at, withdrawal_requested_at')
      .eq('id', agreement.contract_id)
      .eq('organization_id', agreement.organization_id)
      .eq('student_id', agreement.student_id).maybeSingle(),
    supabase.from('organizations')
      .select('id, name, email')
      .eq('id', agreement.organization_id).maybeSingle(),
    supabase.from('invoice_profiles')
      .select('business_name, company_code, address, contact_email')
      .eq('organization_id', agreement.organization_id).maybeSingle(),
  ]);
  if (!student || !contract || !org) return null;
  return { supabase, agreement, student, contract, org, profile };
}

function publicPayload(context: any, pdfUrl: string | null = null) {
  const { agreement, student, contract, org } = context;
  return {
    ok: true,
    status: agreement.status,
    alreadyAccepted: agreement.status === 'accepted',
    acceptedAt: agreement.accepted_at,
    agreementNumber: agreement.agreement_number,
    contractNumber: contract.contract_number || contract.id,
    schoolName: org.name,
    studentName: student.full_name,
    parentName: agreement.recipient_name || student.payer_name || student.full_name,
    activityLabel: agreement.activity_label,
    discountType: agreement.discount_type,
    discountValue: Number(agreement.discount_value),
    validFrom: agreement.valid_from,
    validUntil: agreement.valid_until,
    note: agreement.note,
    pdfUrl,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'POST'].includes(String(req.method))) return res.status(405).json({ error: 'Method not allowed' });
  const token = String(req.method === 'GET' ? req.query?.token || '' : (req.body as any)?.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Trūksta patvirtinimo nuorodos.' });
  const context = await loadAgreementContext(token);
  if (!context) return res.status(404).json({ error: 'Nuolaidos pasiūlymas nerastas.' });
  const { supabase, agreement, student, contract, org, profile } = context;

  if (agreement.status === 'accepted') {
    const pdfUrl = await signSchoolDiscountPdf(supabase, agreement.pdf_path);
    return res.status(200).json(publicPayload(context, pdfUrl));
  }
  if (agreement.status !== 'pending') {
    return res.status(410).json({ error: 'Šis nuolaidos pasiūlymas nebegalioja.' });
  }
  if (Date.parse(agreement.token_expires_at) < Date.now()) {
    await supabase.from('school_discount_agreements').update({
      status: 'expired',
      updated_at: new Date().toISOString(),
    }).eq('id', agreement.id).eq('status', 'pending');
    return res.status(410).json({ error: 'Nuolaidos patvirtinimo nuoroda nebegalioja.' });
  }
  if (contract.kind !== 'extra_lessons' || contract.signing_status !== 'signed' || !contract.accepted_at
    || contract.archived_at || contract.terminated_at || contract.withdrawal_requested_at) {
    return res.status(409).json({ error: 'Užsiėmimų sutartis nebėra aktyvi.' });
  }
  if (req.method === 'GET') return res.status(200).json(publicPayload(context));

  const acceptedAt = new Date();
  const parentName = agreement.recipient_name || student.payer_name || student.full_name;
  const parentEmail = agreement.recipient_email || student.payer_email || student.email;
  const acceptanceStatement = schoolDiscountAcceptanceStatement({
    agreementNumber: agreement.agreement_number,
    studentName: student.full_name,
    activityLabel: agreement.activity_label,
    discountType: agreement.discount_type,
    discountValue: Number(agreement.discount_value),
    validFrom: agreement.valid_from,
    validUntil: agreement.valid_until,
  });

  try {
    const branding = await resolveInvoiceBranding(supabase, agreement.organization_id);
    const pdf = await generateSchoolDiscountAgreementPdf({
      agreementNumber: agreement.agreement_number,
      contractNumber: contract.contract_number || contract.id,
      issueDate: acceptedAt.toLocaleDateString('lt-LT', { timeZone: 'Europe/Vilnius' }),
      acceptedAt: vilniusDateTime(acceptedAt),
      schoolName: profile?.business_name || org.name,
      schoolCompanyCode: profile?.company_code,
      schoolAddress: profile?.address,
      schoolEmail: profile?.contact_email || org.email,
      parentName,
      parentEmail,
      studentName: student.full_name,
      activityLabel: agreement.activity_label,
      discountType: agreement.discount_type,
      discountValue: Number(agreement.discount_value),
      validFrom: agreement.valid_from,
      validUntil: agreement.valid_until,
      note: agreement.note,
      acceptanceStatement,
      branding,
    });
    const pdfPath = schoolDiscountPdfPath({
      organizationId: agreement.organization_id,
      contractId: agreement.contract_id,
      agreementNumber: agreement.agreement_number,
    });
    const sha256 = createHash('sha256').update(pdf).digest('hex');
    const { error: uploadError } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET)
      .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw uploadError;

    const evidence = {
      version: SCHOOL_DISCOUNT_ACCEPTANCE_VERSION,
      method: 'click-wrap',
      action: 'Sutinku',
      recipient_email: parentEmail,
      accepted_at: acceptedAt.toISOString(),
      ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
    };
    const { error: updateError } = await supabase.from('school_discount_agreements').update({
      status: 'accepted',
      accepted_at: acceptedAt.toISOString(),
      acceptance_statement: acceptanceStatement,
      acceptance_evidence: evidence,
      pdf_path: pdfPath,
      document_sha256: sha256,
      updated_at: acceptedAt.toISOString(),
    }).eq('id', agreement.id).eq('status', 'pending');
    if (updateError) throw updateError;
    agreement.status = 'accepted';
    agreement.accepted_at = acceptedAt.toISOString();
    agreement.pdf_path = pdfPath;
    const pdfUrl = await signSchoolDiscountPdf(supabase, pdfPath);
    return res.status(200).json(publicPayload(context, pdfUrl));
  } catch (error) {
    console.error('[school-discount-accept]', error);
    return res.status(500).json({ error: 'Nepavyko patvirtinti nuolaidos. Bandykite dar kartą.' });
  }
}
