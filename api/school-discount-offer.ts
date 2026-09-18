import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { assertOrgConsultationsEnabled, serviceSupabase } from './_lib/schoolConsultationsAccess.js';
import { appOrigin, internalApiOrigin } from './_lib/extraLessonsContractShared.js';
import {
  newSchoolDiscountAgreementNumber,
  newSchoolDiscountToken,
  schoolDiscountAcceptUrl,
  signSchoolDiscountPdf,
  schoolDiscountTokenHash,
} from './_lib/schoolDiscountAgreementShared.js';
import {
  normalizeSchoolDiscountAgreementInput,
  schoolDiscountTermsLabel,
} from '../src/lib/schoolDiscountAgreement.js';

type ActivityOption = {
  subjectId: string;
  tutorId: string | null;
  label: string;
};

async function loadAgreementHistory(
  supabase: SupabaseClient,
  organizationId: string,
  studentId: string,
) {
  const { data } = await supabase.from('school_discount_agreements')
    .select('id, agreement_number, activity_label, discount_type, discount_value, valid_from, valid_until, status, accepted_at, pdf_path')
    .eq('organization_id', organizationId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(20);
  return Promise.all((data || []).map(async (row: any) => ({
    id: row.id,
    agreementNumber: row.agreement_number,
    activityLabel: row.activity_label,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    status: row.status,
    acceptedAt: row.accepted_at,
    pdfUrl: row.status === 'accepted' ? await signSchoolDiscountPdf(supabase, row.pdf_path) : null,
  })));
}

function activityKey(subjectId: string, tutorId: string | null): string {
  return `${subjectId}:${tutorId || ''}`;
}

async function loadStudentActivities(
  supabase: SupabaseClient,
  organizationId: string,
  studentId: string,
): Promise<ActivityOption[]> {
  const [{ data: sessions }, { data: recurring }] = await Promise.all([
    supabase.from('sessions')
      .select('subject_id, tutor_id, subject:subjects(name), tutor:profiles!sessions_tutor_id_fkey(full_name, organization_id)')
      .eq('student_id', studentId)
      .order('start_time', { ascending: false })
      .limit(500),
    supabase.from('recurring_individual_sessions')
      .select('subject_id, tutor_id, subject:subjects(name), tutor:profiles!recurring_individual_sessions_tutor_id_fkey(full_name, organization_id)')
      .eq('student_id', studentId)
      .eq('active', true)
      .limit(100),
  ]);
  const activities = new Map<string, ActivityOption>();
  for (const row of [...(recurring || []), ...(sessions || [])] as any[]) {
    const subject = Array.isArray(row.subject) ? row.subject[0] : row.subject;
    const tutor = Array.isArray(row.tutor) ? row.tutor[0] : row.tutor;
    if (!row.subject_id || !row.tutor_id || tutor?.organization_id !== organizationId) continue;
    const option: ActivityOption = {
      subjectId: String(row.subject_id),
      tutorId: String(row.tutor_id),
      label: `${String(subject?.name || 'Užsiėmimas')} - ${String(tutor?.full_name || 'mokytojas')}`,
    };
    activities.set(activityKey(option.subjectId, option.tutorId), option);
  }
  return [...activities.values()].sort((a, b) => a.label.localeCompare(b.label, 'lt'));
}

async function sendOfferEmail(req: VercelRequest, params: {
  to: string;
  organizationId: string;
  schoolName: string;
  schoolEmail?: string | null;
  parentName: string;
  studentName: string;
  contractNumber: string;
  agreementNumber: string;
  activityLabel: string;
  discountDescription: string;
  validFrom: string;
  validUntil: string;
  note?: string | null;
  acceptUrl: string;
}): Promise<{ ok: boolean; error: string | null }> {
  try {
    const response = await fetch(`${internalApiOrigin(req)}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify({
        type: 'school_discount_offer',
        to: params.to,
        data: params,
      }),
    });
    const body = await response.text();
    return response.ok ? { ok: true, error: null } : { ok: false, error: body.slice(0, 400) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Email delivery failed' };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceSupabase();
  const access = await requireOrgAdminAccess(req, supabase, 'finance.edit');
  if (access.ok === false) return res.status(access.status).json({ error: access.error });

  const body = (req.body || {}) as Record<string, any>;
  const organizationId = String(body.organizationId || access.access.organizationId);
  if (organizationId !== access.access.organizationId) return res.status(403).json({ error: 'Forbidden' });
  const gate = await assertOrgConsultationsEnabled(supabase, organizationId);
  if (gate.ok === false) return res.status(gate.status).json({ error: gate.error });

  const studentId = String(body.studentId || '').trim();
  const requestedContractId = String(body.contractId || '').trim();
  if (!studentId) return res.status(400).json({ error: 'Pasirinkite mokinį.' });
  const [{ data: student }, { data: org }] = await Promise.all([
    supabase.from('students')
      .select('id, organization_id, full_name, payer_name, payer_email, email')
      .eq('id', studentId)
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase.from('organizations').select('id, name, email').eq('id', organizationId).maybeSingle(),
  ]);
  if (!student || !org) return res.status(404).json({ error: 'Mokinys arba mokykla nerasta.' });

  if (body.action === 'options') {
    const [activities, agreements] = await Promise.all([
      loadStudentActivities(supabase, organizationId, studentId),
      loadAgreementHistory(supabase, organizationId, studentId),
    ]);
    return res.status(200).json({ ok: true, activities, agreements });
  }
  if (body.action !== 'create') return res.status(400).json({ error: 'Nežinomas veiksmas.' });

  try {
    const activities = await loadStudentActivities(supabase, organizationId, studentId);
    const input = normalizeSchoolDiscountAgreementInput({
      subjectId: body.subjectId,
      tutorId: body.tutorId,
      discountType: body.discountType,
      discountValue: body.discountValue,
      validFrom: body.validFrom,
      validUntil: body.validUntil,
      note: body.note,
    });
    const activity = activities.find((item) => activityKey(item.subjectId, item.tutorId) === activityKey(input.subjectId, input.tutorId));
    if (!activity) throw new Error('Pasirinktas užsiėmimas nepriskirtas šiam mokiniui.');
    const recipientEmail = String(student.payer_email || student.email || '').trim();
    if (!recipientEmail) throw new Error('Mokiniui nėra nurodytas mokėtojo el. paštas.');

    let contractQuery = supabase.from('school_contracts')
      .select('id, contract_number')
      .eq('organization_id', organizationId)
      .eq('student_id', studentId)
      .eq('kind', 'annual')
      .eq('signing_status', 'signed')
      .is('archived_at', null);
    contractQuery = requestedContractId
      ? contractQuery.eq('id', requestedContractId)
      : contractQuery.order('created_at', { ascending: false }).limit(1);
    const { data: contract } = await contractQuery.maybeSingle();
    if (!contract) throw new Error('Mokinys neturi pasirašytos metinės sutarties.');

    let pending = supabase.from('school_discount_agreements')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('student_id', studentId)
      .eq('subject_id', input.subjectId)
      .eq('status', 'pending');
    pending = input.tutorId ? pending.eq('tutor_id', input.tutorId) : pending.is('tutor_id', null);
    await pending;

    const token = newSchoolDiscountToken();
    const agreementNumber = newSchoolDiscountAgreementNumber();
    const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: agreement, error: insertError } = await supabase.from('school_discount_agreements').insert({
      organization_id: organizationId,
      student_id: studentId,
      contract_id: contract.id,
      subject_id: input.subjectId,
      tutor_id: input.tutorId,
      agreement_number: agreementNumber,
      activity_label: activity.label,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      valid_from: input.validFrom,
      valid_until: input.validUntil,
      note: input.note,
      recipient_name: student.payer_name || student.full_name,
      recipient_email: recipientEmail,
      acceptance_token_hash: schoolDiscountTokenHash(token),
      token_expires_at: tokenExpiresAt,
      created_by: access.access.userId,
    }).select('id, agreement_number').single();
    if (insertError || !agreement) throw new Error(insertError?.message || 'Nepavyko išsaugoti nuolaidos pasiūlymo.');

    const acceptUrl = schoolDiscountAcceptUrl(appOrigin(req), token);
    const delivery = await sendOfferEmail(req, {
      to: recipientEmail,
      organizationId,
      schoolName: org.name,
      schoolEmail: org.email,
      parentName: student.payer_name || student.full_name,
      studentName: student.full_name,
      contractNumber: contract.contract_number || contract.id,
      agreementNumber,
      activityLabel: activity.label,
      discountDescription: schoolDiscountTermsLabel(input.discountType, input.discountValue),
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      note: input.note,
      acceptUrl,
    });
    await supabase.from('school_discount_agreements').update({
      sent_at: delivery.ok ? new Date().toISOString() : null,
      email_error: delivery.error,
      updated_at: new Date().toISOString(),
    }).eq('id', agreement.id);

    return res.status(delivery.ok ? 200 : 202).json({
      ok: true,
      agreementId: agreement.id,
      agreementNumber,
      emailSent: delivery.ok,
      emailTo: recipientEmail,
      emailError: delivery.error,
    });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Nepavyko suteikti nuolaidos.' });
  }
}
