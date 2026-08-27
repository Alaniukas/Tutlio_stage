import type { VercelRequest, VercelResponse } from './types';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { isInternalRequest } from './_lib/auth.js';
import {
  EXTRA_LESSONS_CONTRACT_KIND,
  EXTRA_LESSONS_DEFAULT_BODY,
  buildExtraLessonsOrderSnapshot,
  validateExtraLessonsOffer,
} from '../src/lib/extraLessonsContract.js';
import { renderAndStoreExtraLessonsPdf } from './_lib/extraLessonsPdf.js';
import {
  appOrigin,
  extraLessonsAcceptUrl,
  extraLessonsPayloadForContract,
  fillExtraLessonsBody,
  randomToken,
  serviceSupabase,
} from './_lib/extraLessonsContractShared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = serviceSupabase();
  const access = await requireOrgAdminAccess(req, supabase, 'contracts.edit');
  if (!access.ok) return res.status(access.status).json({ error: access.error });

  const body = (req.body || {}) as Record<string, unknown>;
  const studentId = String(body.student_id || '').trim();
  if (!studentId) return res.status(400).json({ error: 'Missing student_id' });

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, email, phone, features, entity_type')
    .eq('id', access.access.organizationId)
    .maybeSingle();
  const features = (org?.features || {}) as Record<string, unknown>;
  if (features.school_extra_lessons_contract !== true) {
    return res.status(403).json({ error: 'Feature not enabled' });
  }

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, email, grade, payer_name, payer_email, payer_phone, organization_id, tutor_id')
    .eq('id', studentId)
    .maybeSingle();
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const order = buildExtraLessonsOrderSnapshot({
    service_name: String(body.service_name || body.group_name || ''),
    service_type: body.service_type === 'individual' ? 'individual' : 'group',
    platform: String(body.platform || 'Google Meet'),
    duration_minutes: Number(body.duration_minutes || 45),
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

  let templateId = body.template_id ? String(body.template_id) : null;
  let templateBody = body.template_body ? String(body.template_body) : '';
  if (!templateBody || !templateId) {
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

  const payerEmail = String(student.payer_email || '').trim();
  if (payerEmail && body.send !== false) {
    const sendUrl = `${origin}/api/send-email`;
    await fetch(sendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      },
      body: JSON.stringify({
        type: 'school_contract_extra_offer',
        to: payerEmail,
        data: {
          schoolName: org?.name,
          studentName: student.full_name,
          parentName: student.payer_name,
          contractNumber,
          acceptUrl,
          serviceName: order.service_name,
          unitPrice: order.unit_price_eur.toFixed(2),
          monthlyPrice: order.indicative_monthly_eur.toFixed(2),
          schedule: order.schedule_label,
        },
      }),
    }).catch((err) => console.error('[extra-lessons-contract-offer] email', err));
  }

  void isInternalRequest;
  return res.status(200).json({
    ok: true,
    contractId: created.id,
    contractNumber: created.contract_number,
    acceptUrl,
    pdfPath,
  });
}
