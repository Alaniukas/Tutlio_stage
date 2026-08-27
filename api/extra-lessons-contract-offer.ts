import type { VercelRequest, VercelResponse } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { isInternalRequest } from './_lib/auth.js';
import {
  EXTRA_LESSONS_CONTRACT_KIND,
  EXTRA_LESSONS_DEFAULT_BODY,
  buildExtraLessonsOrderSnapshot,
  parseExtraLessonsServiceType,
  usesBundledExtraLessonsDocx,
  validateExtraLessonsOffer,
  type ExtraLessonsOrderSnapshot,
} from '../src/lib/extraLessonsContract.js';
import { renderAndStoreExtraLessonsPdf } from './_lib/extraLessonsPdf.js';
import {
  appOrigin,
  extraLessonsAcceptUrl,
  extraLessonsPayloadForContract,
  fillExtraLessonsBody,
  internalApiOrigin,
  randomToken,
  serviceSupabase,
  snapshotFromRow,
} from './_lib/extraLessonsContractShared.js';

async function ensureExtraLessonsCompletionToken(
  supabase: SupabaseClient,
  contractId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from('school_contract_completion_tokens')
    .select('token, expires_at')
    .eq('contract_id', contractId)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.token && (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now())) {
    return String(existing.token);
  }
  const token = randomToken();
  const { error } = await supabase.from('school_contract_completion_tokens').insert({
    contract_id: contractId,
    token,
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  });
  if (error) throw new Error(error.message);
  return token;
}

async function sendExtraLessonsOfferEmail(
  req: VercelRequest,
  params: {
    to: string;
    organizationId: string;
    schoolName?: string | null;
    schoolEmail?: string | null;
    studentName?: string | null;
    parentName?: string | null;
    contractNumber?: string | null;
    acceptUrl: string;
    order: ExtraLessonsOrderSnapshot;
  },
): Promise<{ ok: boolean; error: string | null }> {
  const sendUrl = `${internalApiOrigin(req)}/api/send-email`;
  try {
    const mailRes = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify({
        type: 'school_contract_extra_offer',
        to: params.to,
        data: {
          organizationId: params.organizationId,
          schoolName: params.schoolName,
          schoolEmail: params.schoolEmail,
          studentName: params.studentName,
          parentName: params.parentName,
          contractNumber: params.contractNumber,
          acceptUrl: params.acceptUrl,
          serviceName: params.order.service_name,
          unitPrice: Number(params.order.unit_price_eur || 0).toFixed(2),
          monthlyPrice: params.order.indicative_monthly_eur > 0
            ? params.order.indicative_monthly_eur.toFixed(2)
            : '',
          schedule: params.order.schedule_label,
          startDate: params.order.start_date,
          endDate: params.order.end_date,
        },
      }),
    });
    const mailBody = await mailRes.text();
    if (!mailRes.ok) {
      console.error('[extra-lessons-offer] email', mailRes.status, mailBody.slice(0, 240));
      return { ok: false, error: mailBody.slice(0, 240) };
    }
    return { ok: true, error: null };
  } catch (err) {
    const message = (err as Error).message;
    console.error('[extra-lessons-offer] email', message);
    return { ok: false, error: message };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = serviceSupabase();
  const access = await requireOrgAdminAccess(req, supabase, 'contracts.edit');
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, email, phone, features, entity_type')
    .eq('id', access.access.organizationId)
    .maybeSingle();
  const features = (org?.features || {}) as Record<string, unknown>;
  if (features.school_extra_lessons_contract !== true) {
    return res.status(403).json({ error: 'Feature not enabled' });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const existingContractId = String(body.contract_id || '').trim();
  if (existingContractId) {
    const { data: contract } = await supabase
      .from('school_contracts')
      .select('id, organization_id, student_id, contract_number, kind, pdf_url, filled_body, template_id, order_snapshot, unit_price_eur, annual_fee')
      .eq('id', existingContractId)
      .eq('organization_id', access.access.organizationId)
      .maybeSingle();
    if (!contract || contract.kind !== EXTRA_LESSONS_CONTRACT_KIND) {
      return res.status(404).json({ error: 'Extra-lessons contract not found' });
    }
    const { data: student } = await supabase
      .from('students')
      .select('id, full_name, email, grade, payer_name, payer_email, payer_phone, organization_id')
      .eq('id', contract.student_id)
      .maybeSingle();
    const payerEmail = String(student?.payer_email || '').trim();
    if (!payerEmail) {
      return res.status(400).json({
        error: 'Mokiniui nėra mokėtojo el. pašto. Įrašykite jį mokinio kortelėje ir bandykite dar kartą.',
        code: 'missing_payer_email',
      });
    }
    const order = snapshotFromRow(contract) || buildExtraLessonsOrderSnapshot({
      unit_price_eur: Number(contract.unit_price_eur || 0),
      service_name: String(contract.contract_number || ''),
    });
    const token = await ensureExtraLessonsCompletionToken(supabase, contract.id);
    const origin = appOrigin(req);
    const acceptUrl = extraLessonsAcceptUrl(origin, token);
    if (!contract.pdf_url) {
      try {
        const rendered = await renderAndStoreExtraLessonsPdf(supabase, {
          contract: {
            id: contract.id,
            organization_id: access.access.organizationId,
            contract_number: contract.contract_number,
            template_id: contract.template_id,
          },
          student: student || {},
          filledBody: String(contract.filled_body || EXTRA_LESSONS_DEFAULT_BODY),
          indicativeMonthlyEur: order.indicative_monthly_eur || Number(contract.annual_fee || 0),
          extraLessonsPayload: extraLessonsPayloadForContract({
            contractNumber: String(contract.contract_number || ''),
            order,
            parentName: String(student?.payer_name || ''),
            parentEmail: payerEmail,
            parentPhone: String(student?.payer_phone || ''),
            studentName: String(student?.full_name || ''),
            studentGrade: String(student?.grade || ''),
            userId: String(student?.id || contract.student_id),
            schoolName: String(org?.name || ''),
          }),
        });
        if (rendered.uploadedPath) {
          await supabase.from('school_contracts').update({ pdf_url: rendered.uploadedPath }).eq('id', contract.id);
        }
      } catch (e) {
        console.error('[extra-lessons-contract-offer] resend pdf', (e as Error).message);
      }
    }
    const mail = await sendExtraLessonsOfferEmail(req, {
      to: payerEmail,
      organizationId: access.access.organizationId,
      schoolName: org?.name,
      schoolEmail: org?.email,
      studentName: student?.full_name,
      parentName: student?.payer_name,
      contractNumber: contract.contract_number,
      acceptUrl,
      order,
    });
    await supabase
      .from('school_contracts')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', contract.id);
    return res.status(200).json({
      ok: true,
      resent: true,
      contractId: contract.id,
      contractNumber: contract.contract_number,
      acceptUrl,
      emailSent: mail.ok,
      emailTo: payerEmail,
      emailError: mail.error,
    });
  }

  const studentId = String(body.student_id || '').trim();
  if (!studentId) return res.status(400).json({ error: 'Missing student_id' });

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, email, grade, payer_name, payer_email, payer_phone, organization_id, tutor_id')
    .eq('id', studentId)
    .maybeSingle();
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const order = buildExtraLessonsOrderSnapshot({
    service_name: String(body.service_name || body.group_name || ''),
    service_type: parseExtraLessonsServiceType(body.service_type),
    platform: String(body.platform || ''),
    duration_minutes: Number(body.duration_minutes || 0),
    schedule_slots: Array.isArray(body.schedule_slots) ? body.schedule_slots as any : [],
    schedule_label: String(body.schedule_label || ''),
    start_date: String(body.start_date || ''),
    end_date: String(body.end_date || ''),
    unit_price_eur: Number(body.unit_price_eur || 0),
    vat_status: String(body.vat_status || ''),
    base_lessons_per_month: Number(body.base_lessons_per_month || 0),
    school_email: String(org?.email || ''),
    school_phone: String(org?.phone || ''),
    data_protection_contact: String(body.data_protection_contact || org?.email || ''),
    group_id: body.group_id ? String(body.group_id) : null,
    group_name: body.group_name ? String(body.group_name) : null,
    individual_cancel_terms: String(body.individual_cancel_terms || ''),
  });
  const missing = validateExtraLessonsOffer(order);
  if (missing.length) return res.status(400).json({ error: 'Invalid order', fields: missing });
  const payerEmail = String(student.payer_email || '').trim();
  if (body.send !== false && !payerEmail) {
    return res.status(400).json({
      error: 'Mokiniui nėra mokėtojo el. pašto. Įrašykite jį mokinio kortelėje ir bandykite dar kartą.',
      code: 'missing_payer_email',
    });
  }

  let templateId = body.template_id ? String(body.template_id) : null;
  let templateBody = body.template_body ? String(body.template_body) : '';
  if (usesBundledExtraLessonsDocx(access.access.organizationId)) {
    templateBody = EXTRA_LESSONS_DEFAULT_BODY;
    if (!templateId) {
      const { data: tpl } = await supabase
        .from('school_contract_templates')
        .select('id')
        .eq('organization_id', access.access.organizationId)
        .ilike('name', '%papildom%')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (tpl?.id) templateId = String(tpl.id);
    }
  } else if (!templateBody || !templateId) {
    let tplQuery = supabase
      .from('school_contract_templates')
      .select('id, body, name')
      .eq('organization_id', access.access.organizationId)
      .order('created_at', { ascending: false });
    if (templateId) tplQuery = tplQuery.eq('id', templateId);
    else tplQuery = tplQuery.ilike('name', '%papildom%');
    const { data: tpl } = await tplQuery.limit(1).maybeSingle();
    if (tpl?.body) {
      templateBody = String(tpl.body);
      templateId = templateId || String(tpl.id);
    }
  }
  if (!templateBody) templateBody = EXTRA_LESSONS_DEFAULT_BODY;

  const contractNumber = String(body.contract_number || `PP-${Date.now().toString().slice(-8)}`);
  const payload = extraLessonsPayloadForContract({
    contractNumber,
    order,
    parentName: String(student.payer_name || ''),
    parentEmail: String(student.payer_email || ''),
    parentPhone: String(student.payer_phone || ''),
    studentName: String(student.full_name || ''),
    studentGrade: String(student.grade || ''),
    userId: studentId,
    schoolName: String(org?.name || ''),
  });
  const filledBody = fillExtraLessonsBody({
    templateBody,
    organizationId: access.access.organizationId,
    payload,
  });

  const insertRow: Record<string, unknown> = {
    organization_id: access.access.organizationId,
    student_id: studentId,
    template_id: templateId,
    contract_number: contractNumber,
    filled_body: filledBody,
    annual_fee: order.indicative_monthly_eur,
    signing_status: 'sent',
    sent_at: new Date().toISOString(),
    kind: EXTRA_LESSONS_CONTRACT_KIND,
    order_snapshot: order,
    revision_label: order.revision_label,
    base_lessons_per_month: order.base_lessons_per_month,
    unit_price_eur: order.unit_price_eur,
    class_group_id: order.group_id || null,
  };

  const { data: created, error } = await supabase
    .from('school_contracts')
    .insert(insertRow)
    .select('id, contract_number')
    .single();
  if (error || !created) return res.status(500).json({ error: error?.message || 'Insert failed' });

  if (order.group_id) {
    await supabase.from('school_class_group_members').upsert({
      group_id: order.group_id,
      student_id: studentId,
    }, { onConflict: 'group_id,student_id' });
  }

  const token = randomToken();
  await supabase.from('school_contract_completion_tokens').insert({
    contract_id: created.id,
    token,
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
  });
  const origin = appOrigin(req);
  const acceptUrl = extraLessonsAcceptUrl(origin, token);

  let pdfPath: string | null = null;
  try {
    const rendered = await renderAndStoreExtraLessonsPdf(supabase, {
      contract: { id: created.id, organization_id: access.access.organizationId, contract_number: contractNumber, template_id: templateId },
      student,
      filledBody,
      indicativeMonthlyEur: order.indicative_monthly_eur,
      extraLessonsPayload: payload,
    });
    pdfPath = rendered.uploadedPath;
    if (pdfPath) {
      await supabase.from('school_contracts').update({ pdf_url: pdfPath }).eq('id', created.id);
    }
  } catch (e) {
    console.error('[extra-lessons-contract-offer] pdf', (e as Error).message);
  }

  let emailSent = false;
  let emailError: string | null = null;
  if (payerEmail && body.send !== false) {
    const mail = await sendExtraLessonsOfferEmail(req, {
      to: payerEmail,
      organizationId: access.access.organizationId,
      schoolName: org?.name,
      schoolEmail: org?.email,
      studentName: student.full_name,
      parentName: student.payer_name,
      contractNumber,
      acceptUrl,
      order,
    });
    emailSent = mail.ok;
    emailError = mail.error;
  }

  void isInternalRequest;
  return res.status(200).json({
    ok: true,
    contractId: created.id,
    contractNumber: created.contract_number,
    acceptUrl,
    pdfPath,
    emailSent,
    emailTo: payerEmail || null,
    emailError,
  });
}
