import type { VercelRequest, VercelResponse } from './types';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { AttendanceRequestError, attendanceResponse, loadAttendanceOccurrence, loadAttendanceParticipants } from './_lib/schoolGroupAttendance.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ error: 'Method not allowed' });
  try {
    const auth = await verifyRequestAuth(req);
    if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
    const db = serviceSupabase();
    const admin = await getOrgAdminAccessByUserId(db, auth.userId);
    if (req.method === 'GET' && req.query?.action === 'alerts') {
      if (!admin || !hasOrgAdminPermission(admin.role, admin.permissions, 'sessions.view')) return res.status(403).json({ error: 'Forbidden' });
      const org = await db.from('organizations').select('entity_type').eq('id', admin.organizationId).maybeSingle();
      if (org.error) throw org.error;
      if (org.data?.entity_type !== 'school') return res.status(403).json({ error: 'School required' });
      const result = await db.from('school_group_attendance_attestations')
        .select('id,student_id,student_name,tutor_name,group_id,group_name,start_time,end_time,confirmed_at', { count: 'exact' })
        .eq('organization_id', admin.organizationId).eq('status', 'completed').eq('contract_confirmed', false)
        .is('reviewed_at', null).order('start_time', { ascending: false }).limit(100);
      if (result.error) throw result.error;
      return res.status(200).json({ ok: true, total: result.count ?? result.data?.length ?? 0,
        alerts: (result.data || []).map(a => ({ id: a.id, studentId: a.student_id, studentName: a.student_name,
          tutorName: a.tutor_name, groupId: a.group_id, groupName: a.group_name, startTime: a.start_time, endTime: a.end_time, statusConfirmedAt: a.confirmed_at })) });
    }
    const input = req.method === 'GET' ? req.query : req.body;
    const occurrence = await loadAttendanceOccurrence(db, {
      anchorSessionId: String(input?.anchorSessionId || '').trim(), groupId: String(input?.groupId || '').trim(), startTime: String(input?.startTime || '').trim(),
    });
    const { group } = occurrence;
    const isAdmin = Boolean(admin && admin.organizationId === group.organization_id
      && hasOrgAdminPermission(admin.role, admin.permissions, req.method === 'POST' ? 'sessions.edit' : 'sessions.view'));
    if (auth.userId !== group.tutor_id && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
    const [organization, teacher] = await Promise.all([
      db.from('organizations').select('entity_type,features').eq('id', group.organization_id).maybeSingle(),
      db.from('profiles').select('organization_id').eq('id', group.tutor_id).maybeSingle(),
    ]);
    if (organization.error) throw organization.error;
    if (teacher.error) throw teacher.error;
    if (organization.data?.entity_type !== 'school' || teacher.data?.organization_id !== group.organization_id) {
      return res.status(403).json({ error: 'School required' });
    }
    const participants = await loadAttendanceParticipants(db, occurrence, new Date(), organization.data.features?.school_extra_lessons_contract === true);
    if (req.method === 'GET') return res.status(200).json({ ok: true, groupId: group.id, startTime: occurrence.startTime,
      endTime: occurrence.endTime, participants: participants.map(({ studentName, tutorName, groupName, ...p }) => p) });
    const studentId = String(req.body?.studentId || '').trim();
    const status = String(req.body?.status || '').trim();
    if (!['completed', 'no_show'].includes(status)) return res.status(400).json({ error: 'invalid_status' });
    const participant = participants.find(p => p.studentId === studentId);
    if (!participant) return res.status(403).json({ error: 'not_in_group' });
    if (!participant.canConfirmAttendance) return res.status(409).json({ error: participant.unavailableReason });
    const result = await db.rpc('save_school_group_attendance', { p_record: {
      organization_id: group.organization_id, group_id: group.id, student_id: studentId, tutor_id: group.tutor_id,
      anchor_session_id: occurrence.anchorSessionId, start_time: occurrence.startTime, end_time: occurrence.endTime,
      status, contract_confirmed: participant.contractConfirmed, confirmed_by: auth.userId, confirmed_at: new Date().toISOString(),
      student_name: participant.studentName, tutor_name: participant.tutorName, group_name: participant.groupName,
    } });
    if (result.error || !result.data) throw result.error || new Error('Attendance write failed');
    return res.status(200).json({ ok: true, studentId, attendance: attendanceResponse(result.data) });
  } catch (error: any) {
    if (error instanceof AttendanceRequestError) return res.status(error.status).json({ error: error.message });
    console.error('[school-group-attendance]', error?.message || error);
    return res.status(503).json({ error: 'attendance_unavailable' });
  }
}
