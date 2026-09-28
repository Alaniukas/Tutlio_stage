import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '../types.js';
import { loadSchoolFamilyGuardianAccess } from './schoolFamilyGuardianAccess.js';
import { isOrgAdminForOrg, linkedStudentIdsForUser } from './schoolConsultationsAccess.js';
import { schoolFamilyConsultationVisibleToParent, schoolFamilyConsultationsForView, type SchoolFamilyConsultationBooking } from '../../src/lib/schoolFamilyConsultations.js';
import { consultationSchoolYear, isConsultationSeason } from '../../src/lib/schoolConsultationYear.js';
import { annualUsLimitMinutes } from '../../src/lib/schoolConsultationLimits.js';
import { computeUsBalance } from '../../src/lib/schoolConsultationBalance.js';
import { HELP_TEAM_CATEGORIES, computeHelpTeamQuota, familyHelpTeamQuota, helpTeamPriceEur, type HelpTeamCategory } from '../../src/lib/schoolHelpTeamQuota.js';
import { cancelEffect, isLateCancellation } from '../../src/lib/schoolConsultationCancel.js';

export const FAMILY_CONSULTATION_FIELDS = 'id, organization_id, student_id, tutor_id, kind, target_kind, family_student_ids, help_team_category, request_id, status, start_time, end_time, planned_minutes, actual_minutes, reserved_minutes, charged_minutes, school_year, outcome, mode, is_paid, price_eur, late_cancel, family_key, created_at';
export const FAMILY_CONSULTATION_NOTE_FIELDS = 'id, consultation_id, author_user_id, body, created_at, updated_at';

async function familyBookingRows(db: SupabaseClient, organizationId: string, studentIds: string[], schoolYear: string | null) {
  if (!studentIds.length) return [];
  const ids = studentIds.filter(id => consultationUuid(id)).join(',');
  if (!ids) return [];
  const rows: SchoolFamilyConsultationBooking[] = [];
  for (let offset = 0; ; offset += 200) {
    let query = db.from('school_consultations')
      .select(`${FAMILY_CONSULTATION_FIELDS}, tutor:profiles!school_consultations_tutor_id_fkey(full_name)`)
      .eq('organization_id', organizationId)
      .or(`student_id.in.(${ids}),family_student_ids.ov.{${ids}}`)
      .order('start_time', { ascending: false }).order('id').range(offset, offset + 199);
    if (schoolYear) query = query.eq('school_year', schoolYear);
    const result = await query;
    if (result.error) throw new Error('Unable to load consultations');
    rows.push(...(result.data || []) as SchoolFamilyConsultationBooking[]);
    if ((result.data || []).length < 200) break;
  }
  return rows;
}

export function consultationUuid(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
    ? value.trim().toLowerCase() : null;
}

export async function schoolFamilyConsultationsEnabled(db: SupabaseClient, organizationId: string) {
  const { data, error } = await db.from('organizations').select('id, entity_type, features').eq('id', organizationId).maybeSingle();
  if (error) throw new Error('Unable to check consultation access');
  return data?.entity_type === 'school' && data.features?.school_family_portal === true;
}

export async function loadFamilyConsultation(db: SupabaseClient, id: string) {
  const { data, error } = await db.from('school_consultations').select(FAMILY_CONSULTATION_FIELDS).eq('id', id).maybeSingle();
  if (error) throw new Error('Unable to load consultation');
  return data as SchoolFamilyConsultationBooking | null;
}

export async function familyConsultationAccess(db: SupabaseClient, userId: string, row: SchoolFamilyConsultationBooking) {
  if (!(await schoolFamilyConsultationsEnabled(db, row.organization_id))) {
    return { canReadBooking: false, canReadNotes: false, canWriteNotes: false, parent: false, assigned: false, admin: false };
  }
  const [guardian, admin, profileResult, childResult] = await Promise.all([
    loadSchoolFamilyGuardianAccess(db, userId, row.organization_id),
    isOrgAdminForOrg(db, userId, row.organization_id),
    db.from('profiles').select('id, organization_id, help_team_category').eq('id', userId).maybeSingle(),
    db.from('students').select('id').eq('organization_id', row.organization_id).eq('linked_user_id', userId).limit(1).maybeSingle(),
  ]);
  if (profileResult.error || childResult.error) throw new Error('Unable to check consultation role');
  const parent = guardian.distinctParent && schoolFamilyConsultationVisibleToParent(row, guardian.studentIds);
  const assigned = row.tutor_id === userId && profileResult.data?.organization_id === row.organization_id;
  const specialist = assigned && row.kind === 'help_team' && Boolean(row.help_team_category)
    && profileResult.data?.help_team_category === row.help_team_category;
  const privateRole = !childResult.data && (parent || specialist);
  return {
    parent, assigned, admin,
    canReadBooking: parent || admin || assigned,
    canReadNotes: privateRole && row.kind === 'help_team',
    canWriteNotes: privateRole && specialist,
  };
}

type FamilyResponse = { status: number; data: Record<string, unknown> };
const denied = (): FamilyResponse => ({ status: 403, data: { error: 'Forbidden' } });
const invalid = (): FamilyResponse => ({ status: 400, data: { error: 'Invalid consultation request' } });

async function familyPortal(db: SupabaseClient, userId: string, organizationId: string, selectedId: string | null) {
  const guardian = await loadSchoolFamilyGuardianAccess(db, userId, organizationId);
  if (selectedId && !guardian.studentIds.includes(selectedId)) return denied();
  const schoolYear = consultationSchoolYear() || '';
  const base = { ok: true, familyPortal: true, organizationId, schoolYear, inSeason: isConsultationSeason() };
  if (!guardian.distinctParent || !guardian.studentIds.length) {
    return { status: 200, data: { ...base, students: [], eligibleStudentIds: [], requests: [], consultations: [], balances: {}, helpQuotas: {}, specialists: [], familyQuota: 0 } };
  }
  const [studentsResult, requestsResult, consultationsResult, specialistsResult] = await Promise.all([
    db.from('students').select('id, full_name, grade, organization_id, ppt_adapted, ppt_individualized').eq('organization_id', organizationId).in('id', guardian.studentIds),
    db.from('school_consultation_requests').select('id, student_id, topic, status, created_at, subject_id').eq('organization_id', organizationId).in('student_id', guardian.studentIds).order('created_at', { ascending: false }),
    familyBookingRows(db, organizationId, guardian.studentIds, null),
    db.from('profiles').select('id, full_name, help_team_category').eq('organization_id', organizationId).not('help_team_category', 'is', null),
  ]);
  if ([studentsResult, requestsResult, specialistsResult].some(result => result.error)) throw new Error('Unable to load family consultations');
  const students = studentsResult.data || [];
  const visible = consultationsResult.filter(row => schoolFamilyConsultationVisibleToParent(row, guardian.studentIds));
  const consultations = schoolFamilyConsultationsForView(visible as SchoolFamilyConsultationBooking[], selectedId)
    .map(row => ({ ...row, canReadNotes: row.kind === 'help_team', canWriteNotes: false }));
  const balances: Record<string, unknown> = {};
  for (const student of students) {
    balances[student.id] = computeUsBalance({ annualLimit: annualUsLimitMinutes(student.grade), consultations: visible.filter(row => row.school_year === schoolYear && row.student_id === student.id && row.kind === 'teacher_subject') as any[] });
  }
  const familyQuota = familyHelpTeamQuota(students);
  const helpQuotas = Object.fromEntries(HELP_TEAM_CATEGORIES.map(category => [category, computeHelpTeamQuota({ quota: familyQuota, category, consultations: visible.filter(row => row.school_year === schoolYear && row.kind === 'help_team') as any[] })]));
  return { status: 200, data: { ...base, students, eligibleStudentIds: guardian.studentIds, requests: (requestsResult.data || []).filter(row => !selectedId || row.student_id === selectedId), consultations, balances, familyQuota, helpQuotas, specialists: specialistsResult.data || [] } };
}

async function familyStaff(db: SupabaseClient, userId: string, organizationId: string) {
  const admin = await isOrgAdminForOrg(db, userId, organizationId);
  const { data: profile, error } = await db.from('profiles').select('id, organization_id').eq('id', userId).maybeSingle();
  if (error) throw new Error('Unable to check consultation role');
  if (!admin && profile?.organization_id !== organizationId) return denied();
  let query = db.from('school_consultations').select(`${FAMILY_CONSULTATION_FIELDS}, student:students(id, full_name, grade), tutor:profiles!school_consultations_tutor_id_fkey(full_name)`).eq('organization_id', organizationId).order('start_time', { ascending: false });
  if (!admin) query = query.eq('tutor_id', userId);
  const { data: rows, error: rowsError } = await query;
  if (rowsError) throw new Error('Unable to load consultations');
  const consultations = [];
  for (const row of rows || []) {
    const access = await familyConsultationAccess(db, userId, row as SchoolFamilyConsultationBooking);
    consultations.push({ ...row, canReadNotes: access.canReadNotes, canWriteNotes: access.canWriteNotes });
  }
  let requests: unknown[] = [];
  if (admin) {
    const result = await db.from('school_consultation_requests').select('id, student_id, topic, status, created_at, school_year, student:students(id, full_name, grade)').eq('organization_id', organizationId).order('created_at', { ascending: false });
    if (result.error) throw new Error('Unable to load consultation requests');
    requests = result.data || [];
  }
  return { status: 200, data: { ok: true, familyPortal: true, requests, consultations } };
}

async function bookFamilyHelp(db: SupabaseClient, userId: string, organizationId: string, input: Record<string, unknown>): Promise<FamilyResponse> {
  const studentId = consultationUuid(input.student_id);
  const specialistId = consultationUuid(input.tutor_id);
  const category = input.help_team_category as HelpTeamCategory;
  const target = input.target_kind ?? 'child';
  const start = typeof input.start_time === 'string' ? new Date(input.start_time) : null;
  const end = typeof input.end_time === 'string' ? new Date(input.end_time) : null;
  const minutes = start && end ? Math.round((end.getTime() - start.getTime()) / 60_000) : 0;
  if (!studentId || !specialistId || !HELP_TEAM_CATEGORIES.includes(category) || !['child', 'family'].includes(String(target))
    || !start || !end || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.getTime() <= Date.now() || minutes < 1 || minutes > 240) return invalid();
  if (!isConsultationSeason()) return { status: 400, data: { error: 'Consultations are outside the school season' } };
  const guardian = await loadSchoolFamilyGuardianAccess(db, userId, organizationId);
  if (!guardian.distinctParent || !guardian.studentIds.includes(studentId)) return denied();
  const [specialistResult, studentsResult, bookingsResult, organizationResult] = await Promise.all([
    db.from('profiles').select('id, organization_id, help_team_category').eq('id', specialistId).eq('organization_id', organizationId).maybeSingle(),
    db.from('students').select('id, ppt_adapted, ppt_individualized').eq('organization_id', organizationId).in('id', guardian.studentIds),
    familyBookingRows(db, organizationId, guardian.studentIds, consultationSchoolYear() || ''),
    db.from('organizations').select('features').eq('id', organizationId).maybeSingle(),
  ]);
  if ([specialistResult, studentsResult, organizationResult].some(result => result.error)) throw new Error('Unable to check consultation reservation');
  if (specialistResult.data?.help_team_category !== category) return denied();
  const existing = bookingsResult.filter(row => row.kind === 'help_team' && schoolFamilyConsultationVisibleToParent(row, guardian.studentIds));
  const quota = computeHelpTeamQuota({ quota: familyHelpTeamQuota(studentsResult.data || []), category, consultations: existing as any[] });
  if (quota.nextIsPaid && input.pay_ack !== true) return { status: 400, data: { error: 'Payment acknowledgement required' } };
  const price = quota.nextIsPaid ? helpTeamPriceEur(minutes, Number(organizationResult.data?.features?.specialist_hourly_rate_eur) || 0) : 0;
  const familyIds = [...guardian.studentIds].sort();
  const familyKey = `family:${createHash('sha256').update(`${organizationId}:${familyIds.join(',')}`).digest('hex')}`;
  const now = new Date().toISOString();
  const { data, error } = await db.from('school_consultations').insert({
    organization_id: organizationId, student_id: studentId, target_kind: target,
    family_student_ids: target === 'family' ? familyIds : [], family_key: familyKey,
    kind: 'help_team', status: 'confirmed', tutor_id: specialistId, help_team_category: category,
    mode: 'individual', start_time: start.toISOString(), end_time: end.toISOString(), planned_minutes: minutes,
    is_paid: quota.nextIsPaid, price_eur: price,
    paid_ack_at: quota.nextIsPaid ? now : null, paid_ack_by: quota.nextIsPaid ? userId : null,
    confirmed_at: now, confirmed_by: userId, school_year: consultationSchoolYear(),
  }).select('id').single();
  if (error) throw new Error('Unable to create consultation');
  return { status: 200, data: { ok: true, consultationId: data.id, isPaid: quota.nextIsPaid, priceEur: price } };
}

async function mutateFamilyBooking(db: SupabaseClient, userId: string, row: SchoolFamilyConsultationBooking, input: Record<string, unknown>): Promise<FamilyResponse> {
  const access = await familyConsultationAccess(db, userId, row);
  const action = input.action;
  if (!access.canReadBooking) return denied();
  if (['confirm', 'reject'].includes(String(action)) && (!access.parent || row.status !== 'awaiting_parent_confirm')) return denied();
  if (action === 'cancel' && (!['confirmed', 'awaiting_parent_confirm', 'awaiting_payment'].includes(row.status) || !row.start_time)) return invalid();
  if (action === 'outcome' && (!access.assigned && !access.admin)) return denied();
  let updates: Record<string, unknown>;
  if (action === 'confirm') updates = { status: 'confirmed', confirmed_by: userId, confirmed_at: new Date().toISOString() };
  else if (action === 'reject' || action === 'cancel') {
    const late = action === 'cancel' && isLateCancellation(String(row.start_time));
    const effect = action === 'cancel' ? cancelEffect({ kind: row.kind, mode: row.mode as any, isPaid: row.is_paid === true, startTimeIso: String(row.start_time) }) : null;
    updates = { status: access.parent ? 'cancelled_parent' : 'cancelled_staff', cancelled_at: new Date().toISOString(), cancelled_by: userId, late_cancel: late, outcome: 'cancelled' };
    if (effect === 'charge_individual_us' && row.kind === 'teacher_subject') Object.assign(updates, { charged_minutes: row.planned_minutes, outcome: 'no_show' });
  } else if (action === 'outcome') {
    if (!['occurred', 'no_show', 'cancelled'].includes(String(input.outcome))) return invalid();
    const actual = input.actual_minutes === undefined ? Number(row.planned_minutes || 0) : Number(input.actual_minutes);
    if (!Number.isFinite(actual) || actual < 0 || actual > 240) return invalid();
    updates = { status: input.outcome === 'occurred' ? 'occurred' : input.outcome === 'no_show' ? 'no_show' : 'cancelled_staff', outcome: input.outcome, actual_minutes: actual };
    // Subject consultations keep their existing balance calculation in the legacy handler.
    if (row.kind === 'teacher_subject') return { status: 0, data: {} };
  } else return invalid();
  const { error } = await db.from('school_consultations').update(updates).eq('id', row.id).eq('organization_id', row.organization_id).eq('status', row.status);
  if (error) throw new Error('Unable to update consultation');
  return { status: 200, data: { ok: true } };
}

/** Only opted-in schools enter this branch; legacy organizations retain their existing handler. */
export async function maybeHandleFamilyConsultations(db: SupabaseClient, userId: string, req: VercelRequest): Promise<FamilyResponse | null> {
  const input = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const action = input.action;
  let organizationId = consultationUuid(req.method === 'GET' ? req.query?.organization_id : input.organization_id);
  let row: SchoolFamilyConsultationBooking | null = null;
  if (req.method === 'POST' && ['confirm', 'reject', 'cancel', 'outcome'].includes(String(action))) {
    const id = consultationUuid(input.consultation_id);
    if (!id) return invalid();
    const result = await db.from('school_consultations').select('organization_id').eq('id', id).maybeSingle();
    if (result.error) throw new Error('Unable to resolve consultation school');
    organizationId = result.data?.organization_id || null;
    if (organizationId && await schoolFamilyConsultationsEnabled(db, organizationId)) row = await loadFamilyConsultation(db, id);
  }
  if (!organizationId && req.method === 'GET' && (!req.query?.scope || req.query.scope === 'portal')) {
    const [ids, bindings] = await Promise.all([
      linkedStudentIdsForUser(db, userId),
      db.from('school_family_guardians').select('organization_id').eq('guardian_user_id', userId),
    ]);
    const orgIds = new Set<string>((bindings.data || []).map(binding => binding.organization_id));
    if (ids.length) {
      const { data: students, error } = await db.from('students').select('organization_id').in('id', ids);
      if (error) throw new Error('Unable to resolve family school');
      for (const student of students || []) if (student.organization_id) orgIds.add(student.organization_id);
    }
    for (const id of [...orgIds].sort()) if (await schoolFamilyConsultationsEnabled(db, id)) { organizationId = id; break; }
  }
  if (!organizationId || !(await schoolFamilyConsultationsEnabled(db, organizationId))) return null;
  if (req.method === 'GET') {
    const scope = req.query?.scope || 'portal';
    if (scope === 'portal') {
      const selected = req.query?.student_id ? consultationUuid(req.query.student_id) : null;
      if (req.query?.student_id && !selected) return invalid();
      return familyPortal(db, userId, organizationId, selected);
    }
    if (scope === 'admin' || scope === 'specialist') return familyStaff(db, userId, organizationId);
    return invalid();
  }
  if (req.method === 'POST' && action === 'book_help') return bookFamilyHelp(db, userId, organizationId, input);
  if (row) {
    const response = await mutateFamilyBooking(db, userId, row, input);
    return response.status === 0 ? null : response;
  }
  return null;
}
