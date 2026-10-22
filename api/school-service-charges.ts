import type { VercelRequest, VercelResponse } from './types.js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { serviceSupabase } from './_lib/schoolConsultationsAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { sameOrgStudentIdentity } from '../src/lib/orgStudentIdentity.js';
import { fetchAllRows } from '../src/lib/fetchAllRows.js';
import { parseServiceChargeInput, schoolServiceChargesEnabled, validServicePrice } from '../src/lib/schoolServiceCharges.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHARGE_SELECT = 'id, student_id, template_id, description, unit_price_eur, quantity, service_date, invoice_month, internal_note, cancelled_at, invoice_id, version, invoice:school_monthly_invoices!school_student_service_charges_invoice_id_fkey(invoice_number,payment_status)';
const fail = (res: VercelResponse, status: number, errorKey: string) => res.status(status).json({ errorKey });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const db = serviceSupabase();
  const accessResult = await requireOrgAdminAccess(req, db, 'finance.view');
  if (accessResult.ok === false) return res.status(accessResult.status).json({ error: accessResult.error });
  const { access } = accessResult;
  const organizationId = access.organizationId;
  const canEdit = hasOrgAdminPermission(access.role, access.permissions, 'finance.edit');
  const body = (req.body || {}) as Record<string, unknown>;
  if (req.method === 'POST' && !canEdit) return fail(res, 403, 'school.services.forbidden');

  try {
    const org = await db.from('organizations').select('id, entity_type, features').eq('id', organizationId).maybeSingle();
    if (org.error) throw org.error;
    if (org.data?.entity_type !== 'school' || !schoolServiceChargesEnabled(org.data.features, org.data.entity_type)) {
      return fail(res, 404, 'school.services.unavailable');
    }

    const studentId = String(req.method === 'GET' ? req.query.studentId || '' : body.studentId || '');
    const isTemplate = req.method === 'POST' && ['save-template', 'archive-template'].includes(String(body.action));
    let studentIds: string[] = [];
    if (studentId && !isTemplate) {
      if (!UUID.test(studentId)) return fail(res, 400, 'school.services.invalid');
      const student = await db.from('students').select('id, organization_id, full_name, payer_email, email, linked_user_id')
        .eq('id', studentId).eq('organization_id', organizationId).maybeSingle();
      if (student.error) throw student.error;
      if (!student.data) return fail(res, 404, 'school.services.notFound');
      const anchor = student.data;
      const field = anchor.payer_email ? 'payer_email' : anchor.linked_user_id ? 'linked_user_id' : anchor.email ? 'email' : null;
      const candidates = field ? await fetchAllRows<any>((from, to) => {
        let query = db.from('students').select('id, organization_id, full_name, payer_email, email, linked_user_id')
          .eq('organization_id', organizationId);
        query = field === 'linked_user_id' ? query.eq(field, anchor[field])
          : query.ilike(field, String(anchor[field]).trim().replace(/[\\%_]/g, '\\$&'));
        return query.order('id').range(from, to);
      }) : [anchor];
      // A shared payer never merges different children into the same card.
      studentIds = [...new Set([anchor.id, ...candidates.filter(row => sameOrgStudentIdentity(row, anchor)).map(row => row.id)])].sort();
    }

    if (req.method === 'GET') {
      const [templates, charges] = await Promise.all([
        fetchAllRows<any>((from, to) => db.from('school_service_templates')
          .select('id, name, unit_price_eur, is_active, version').eq('organization_id', organizationId).order('name').order('id').range(from, to)),
        studentIds.length ? fetchAllRows<any>((from, to) => db.from('school_student_service_charges')
          .select(CHARGE_SELECT).eq('organization_id', organizationId).in('student_id', studentIds)
          .order('invoice_month', { ascending: false }).order('id').range(from, to)) : [],
      ]);
      return res.status(200).json({ templates, charges, canEdit });
    }
    const id = String(body.id || '');
    if (!UUID.test(id)) return fail(res, 400, 'school.services.invalid');
    const editing = body.version !== undefined;
    if (editing && (!Number.isInteger(body.version) || Number(body.version) < 1)) return fail(res, 400, 'school.services.invalid');

    if (isTemplate) {
      if (body.action === 'archive-template' && !editing) return fail(res, 400, 'school.services.invalid');
      const name = String(body.name || '').trim();
      if (body.action === 'save-template' && (!name || name.length > 160 || !validServicePrice(body.unitPriceEur))) {
        return fail(res, 400, 'school.services.invalid');
      }
      const patch = body.action === 'archive-template' ? { is_active: false, updated_by: access.userId }
        : { name, unit_price_eur: Number(body.unitPriceEur), updated_by: access.userId };
      const result = editing
        ? await db.from('school_service_templates').update(patch).eq('organization_id', organizationId).eq('id', id).eq('version', Number(body.version)).select('id').maybeSingle()
        : await db.from('school_service_templates').insert({ ...patch, id, organization_id: organizationId, created_by: access.userId }).select('id').single();
      if (result.error?.code === '23505') return fail(res, 409, 'school.services.duplicateTemplate');
      if (result.error) throw result.error;
      if (!result.data) return fail(res, 409, 'school.services.changed');
      return res.status(200).json({ ok: true });
    }
    if (!studentIds.length || !['save-charge', 'cancel-charge', 'restore-charge'].includes(String(body.action))) {
      return fail(res, 400, 'school.services.invalid');
    }
    const existing = editing ? await db.from('school_student_service_charges').select(CHARGE_SELECT)
      .eq('organization_id', organizationId).in('student_id', studentIds).eq('id', id).maybeSingle() : null;
    if (existing?.error) throw existing.error;
    if (editing && !existing?.data) return fail(res, 404, 'school.services.notFound');
    if (existing?.data.invoice_id) return fail(res, 409, 'school.services.locked');

    let patch: Record<string, unknown>;
    if (body.action === 'save-charge') {
      if (existing?.data.cancelled_at) return fail(res, 409, 'school.services.changed');
      patch = parseServiceChargeInput(body);
      const templateId = body.templateId ? String(body.templateId) : null;
      if (templateId) {
        if (!UUID.test(templateId)) return fail(res, 400, 'school.services.invalid');
        const template = await db.from('school_service_templates').select('id, is_active')
          .eq('organization_id', organizationId).eq('id', templateId).maybeSingle();
        if (template.error) throw template.error;
        if (!template.data || (!template.data.is_active && existing?.data.template_id !== templateId)) return fail(res, 400, 'school.services.notFound');
      }
      patch.template_id = templateId;
    } else {
      if (!editing) return fail(res, 400, 'school.services.invalid');
      patch = { cancelled_at: body.action === 'cancel-charge' ? new Date().toISOString() : null,
        cancelled_by: body.action === 'cancel-charge' ? access.userId : null };
    }
    patch.updated_by = access.userId;
    const result = editing
      ? await db.from('school_student_service_charges').update(patch).eq('organization_id', organizationId)
        .in('student_id', studentIds).eq('id', id).eq('version', Number(body.version)).is('invoice_id', null).select('id').maybeSingle()
      : await db.from('school_student_service_charges').insert({ ...patch, id, organization_id: organizationId,
        student_id: studentIds[0], created_by: access.userId }).select('id').single();
    if (result.error?.code === '23505' && !editing) {
      // A retry with the same client-generated id must not add a second charge.
      const retry = await db.from('school_student_service_charges').select('*').eq('id', id)
        .eq('organization_id', organizationId).in('student_id', studentIds).maybeSingle();
      if (retry.error) throw retry.error;
      if (retry.data && Object.entries(patch).every(([key, value]) => key === 'updated_by' || String(retry.data[key] ?? '') === String(value ?? ''))) {
        return res.status(200).json({ ok: true });
      }
      return fail(res, 409, 'school.services.changed');
    }
    if (result.error) throw result.error;
    if (!result.data) return fail(res, 409, 'school.services.changed');
    return res.status(200).json({ ok: true });
  } catch (error) {
    const value = error as { code?: string; message?: string };
    if (value.message === 'school.services.invalid') return fail(res, 400, value.message);
    if (/already invoiced|history cannot|identity cannot/i.test(value.message || '')) return fail(res, 409, 'school.services.locked');
    if (['42P01', '42703', 'PGRST200', 'PGRST205'].includes(value.code || '')) return fail(res, 503, 'school.services.migrationRequired');
    console.error('[school-service-charges]', value.code || value.message);
    return fail(res, 500, 'school.services.error');
  }
}
