import { createHash, randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './types';
import { serviceSupabase } from './_lib/schoolConsultationsAccess.js';
import { generateSchoolDiscountAgreementPdf } from './_lib/schoolDiscountAgreementPdf.js';
import {
  SCHOOL_DISCOUNT_ACCEPTANCE_VERSION,
  loadSchoolDiscountAgreementByToken,
  ensureSchoolDiscountProposalPdf,
  isSchoolDiscountContractEligible,
  schoolDiscountContractLinks,
  schoolDiscountPdfPath,
  signSchoolDiscountPdf,
} from './_lib/schoolDiscountAgreementShared.js';
import { SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';
import { resolveInvoiceBranding } from './_lib/invoiceBranding.js';
import { schoolDiscountAcceptanceStatement } from '../src/lib/schoolDiscountAgreement.js';
import { appOrigin, loadExtraLessonsContractByToken } from './_lib/extraLessonsContractShared.js';

function vilniusDateTime(value: Date | string): string {
  return new Intl.DateTimeFormat('lt-LT', {
    timeZone: 'Europe/Vilnius',
    dateStyle: 'long',
    timeStyle: 'medium',
  }).format(new Date(value));
}

async function loadAgreementContext(params: { token?: string; contractToken?: string; agreementId?: string }) {
  const supabase = serviceSupabase();
  let agreement;
  if (params.token) {
    agreement = await loadSchoolDiscountAgreementByToken(supabase, params.token);
  } else {
    const loaded = await loadExtraLessonsContractByToken(supabase, params.contractToken || '');
    if ('error' in loaded) return null;
    const parentContract = loaded.contract;
    const { data } = await supabase.from('school_discount_agreements')
      .select('*').eq('id', params.agreementId || '')
      .eq('contract_id', parentContract.id)
      .eq('organization_id', parentContract.organization_id)
      .eq('student_id', parentContract.student_id).maybeSingle();
    agreement = data;
  }
  if (!agreement) return null;
  const [{ data: student }, { data: contract }, { data: org }, { data: profile }] = await Promise.all([
    supabase.from('students')
      .select('id, full_name, payer_name, payer_email, email')
      .eq('id', agreement.student_id)
      .eq('organization_id', agreement.organization_id).maybeSingle(),
    supabase.from('school_contracts')
      .select('id, contract_number, signing_status, kind, accepted_at, archived_at, terminated_at, withdrawal_requested_at, pdf_url, signed_contract_url')
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

function publicPayload(context: any, links: Awaited<ReturnType<typeof schoolDiscountContractLinks>>, pdfUrl: string | null = null) {
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
    ...links,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'POST'].includes(String(req.method))) return res.status(405).json({ error: 'Method not allowed' });
  const source = (req.method === 'GET' ? req.query : req.body) as Record<string, unknown> | undefined;
  const token = String(source?.token || '').trim();
  const contractToken = String(source?.contractToken || '').trim();
  const agreementId = String(source?.agreementId || '').trim();
  if (!token && !(contractToken && agreementId)) return res.status(400).json({ error: 'Trūksta patvirtinimo nuorodos.' });
  const context = await loadAgreementContext({ token, contractToken, agreementId });
  if (!context) return res.status(404).json({ error: 'Nuolaidos pasiūlymas nerastas.' });
  const { supabase, agreement, student, contract, org, profile } = context;

  if (!isSchoolDiscountContractEligible(contract)) {
    return res.status(409).json({ error: 'Užsiėmimų sutartis nebėra aktyvi.' });
  }
  if (!['pending', 'accepted'].includes(agreement.status)) {
    return res.status(410).json({ error: 'Šis nuolaidos pasiūlymas nebegalioja.' });
  }
  const tokenExpiry = Date.parse(agreement.token_expires_at);
  if (agreement.status === 'pending' && (!Number.isFinite(tokenExpiry) || tokenExpiry < Date.now())) {
    await supabase.from('school_discount_agreements').update({
      status: 'expired',
      updated_at: new Date().toISOString(),
    }).eq('id', agreement.id).eq('status', 'pending');
    return res.status(410).json({ error: 'Nuolaidos patvirtinimo nuoroda nebegalioja.' });
  }

  let contractLinks;
  try {
    contractLinks = await schoolDiscountContractLinks(supabase, contract, appOrigin(req),
      !token && contractToken ? contractToken : undefined);
  } catch {
    return res.status(503).json({ error: 'Nepavyko atidaryti užsiėmimų sutarties PDF. Bandykite dar kartą.' });
  }

  if (agreement.status === 'accepted') {
    const pdfUrl = await signSchoolDiscountPdf(supabase, agreement.pdf_path);
    return res.status(200).json(publicPayload(context, contractLinks, pdfUrl));
  }
  if (req.method === 'GET') {
    try {
      const proposal = await ensureSchoolDiscountProposalPdf(supabase, agreement, contract, student, org);
      return res.status(200).json(publicPayload(context, contractLinks, proposal.pdfUrl));
    } catch {
      return res.status(503).json({ error: 'Nepavyko paruošti nuolaidos priedo PDF. Bandykite dar kartą.' });
    }
  }

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
      contractAccepted: contractLinks.contractAccepted,
      branding,
    });
    const pdfPath = schoolDiscountPdfPath({
      organizationId: agreement.organization_id,
      contractId: agreement.contract_id,
      agreementNumber: agreement.agreement_number,
      acceptanceId: randomUUID(),
    });
    const sha256 = createHash('sha256').update(pdf).digest('hex');
    const { error: uploadError } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET)
      .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: false });
    if (uploadError) throw uploadError;

    const evidence = {
      version: SCHOOL_DISCOUNT_ACCEPTANCE_VERSION,
      method: 'click-wrap',
      action: 'Sutinku',
      recipient_email: parentEmail,
      accepted_at: acceptedAt.toISOString(),
      contract_accepted: contractLinks.contractAccepted,
      ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
    };
    const { data: acceptedAgreement, error: updateError } = await supabase.from('school_discount_agreements').update({
      status: 'accepted',
      accepted_at: acceptedAt.toISOString(),
      acceptance_statement: acceptanceStatement,
      acceptance_evidence: evidence,
      pdf_path: pdfPath,
      document_sha256: sha256,
      updated_at: acceptedAt.toISOString(),
    }).eq('id', agreement.id).eq('organization_id', agreement.organization_id)
      .eq('status', 'pending').select('*').maybeSingle();
    if (updateError) throw updateError;
    if (!acceptedAgreement) {
      const { data: current } = await supabase.from('school_discount_agreements').select('*')
        .eq('id', agreement.id).eq('organization_id', agreement.organization_id)
        .eq('contract_id', contract.id).eq('student_id', student.id).maybeSingle();
      if (current?.status !== 'accepted') {
        return res.status(409).json({ error: 'Nuolaidos pasiūlymo būsena pasikeitė. Atidarykite nuorodą iš naujo.' });
      }
      context.agreement = current;
    } else context.agreement = acceptedAgreement;
    const pdfUrl = await signSchoolDiscountPdf(supabase, context.agreement.pdf_path);
    return res.status(200).json(publicPayload(context, contractLinks, pdfUrl));
  } catch (error) {
    console.error('[school-discount-accept]', error);
    return res.status(500).json({ error: 'Nepavyko patvirtinti nuolaidos. Bandykite dar kartą.' });
  }
}
