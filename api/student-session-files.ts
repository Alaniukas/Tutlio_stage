// Authenticated student / parent access to lesson files (list, homework upload, delete).
// POST { action: 'list' | 'upload-url' | 'delete', sessionId, fileName?, size? }
import type { VercelRequest, VercelResponse } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { loadSchoolFamilyGuardianAccess, schoolFamilyPortalEnabled } from './_lib/schoolFamilyGuardianAccess.js';
import {
  HOMEWORK_ALLOWED_EXT,
  HOMEWORK_MAX_BYTES,
  homeworkObjectName,
  isAllowedHomeworkFile,
  siblingFolders,
  studentSlug,
} from './school-homework.js';
import {
  HOMEWORK_FILE_PREFIX,
  isHomeworkSubmissionFile,
  studentMaySeeGroupFile,
} from '../src/lib/sessionFileVisibility.js';

const BUCKET = 'session-files';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type SessionRow = {
  id: string;
  student_id: string;
  tutor_id: string;
  subject_id: string | null;
  start_time: string;
  end_time: string | null;
  class_group_id: string | null;
  subjects?: { is_group?: boolean | null } | { is_group?: boolean | null }[] | null;
};

function isGroupSubjectSession(session: SessionRow): boolean {
  const relation = Array.isArray(session.subjects) ? session.subjects[0] : session.subjects;
  return !session.class_group_id && relation?.is_group === true && Boolean(session.subject_id);
}

async function loadMemberGroupIds(supabase: SupabaseClient, studentId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('school_class_group_members')
    .select('group_id')
    .eq('student_id', studentId);
  return new Set((data || []).map((row: { group_id: string }) => row.group_id).filter(Boolean));
}

function sessionAllowedForStudent(session: SessionRow, memberGroupIds: Set<string>): boolean {
  if (!session.class_group_id) return true;
  return memberGroupIds.has(session.class_group_id);
}

async function resolveSessionAccess(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<
  | { ok: true; student: { id: string; full_name: string; organization_id: string | null }; privatePortal: boolean }
  | { ok: false; status: number; error: string }
> {
  const { data: session } = await supabase
    .from('sessions')
    .select('id, student_id, tutor_id, subject_id, start_time, end_time, class_group_id, subjects(is_group)')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return { ok: false, status: 404, error: 'Pamoka nerasta' };

  const studentId = String((session as SessionRow).student_id || '');
  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, linked_user_id, organization_id')
    .eq('id', studentId)
    .maybeSingle();
  if (!student) return { ok: false, status: 404, error: 'Mokinys nerastas' };

  const org = student.organization_id ? await supabase.from('organizations').select('entity_type,features')
    .eq('id', student.organization_id).maybeSingle() : { data: null, error: null };
  if (org.error) return { ok: false, status: 503, error: 'school_family_access_unavailable' };
  const privatePortal = org.data?.entity_type === 'school' && schoolFamilyPortalEnabled(org.data?.features);
  let allowed = student.linked_user_id === userId;
  if (!allowed) {
    if (privatePortal) {
      const guardian = await loadSchoolFamilyGuardianAccess(supabase, userId, student.organization_id);
      allowed = guardian.distinctParent && guardian.studentIds.includes(studentId);
    } else {
      const { data: parentProfile } = await supabase
        .from('parent_profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (parentProfile?.id) {
        const { data: link } = await supabase
          .from('parent_students')
          .select('id')
          .eq('parent_id', parentProfile.id)
          .eq('student_id', studentId)
          .maybeSingle();
        allowed = !!link;
      }
    }
  }
  if (!allowed) return { ok: false, status: 403, error: 'Forbidden' };

  const memberGroupIds = await loadMemberGroupIds(supabase, studentId);
  if (!sessionAllowedForStudent(session as SessionRow, memberGroupIds)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  if (privatePortal && (session as SessionRow).class_group_id) {
    const group = await supabase.from('school_class_groups').select('id')
      .eq('id', (session as SessionRow).class_group_id).eq('organization_id', student.organization_id).maybeSingle();
    if (group.error) return { ok: false, status: 503, error: 'school_family_access_unavailable' };
    if (!group.data) return { ok: false, status: 403, error: 'Forbidden' };
  }

  return {
    ok: true,
    student: { id: studentId, full_name: String(student.full_name || ''), organization_id: student.organization_id || null },
    privatePortal,
  };
}

function readBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
  }
  return raw as Record<string, unknown>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = serviceSupabase();
  const body = readBody(req);
  const action = String(body.action || '').trim();
  const sessionId = String(body.sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

  let access: Awaited<ReturnType<typeof resolveSessionAccess>>;
  try { access = await resolveSessionAccess(supabase, auth.userId, sessionId); }
  catch { return res.status(503).json({ error: 'school_family_access_unavailable' }); }
  if (access.ok === false) return res.status(access.status).json({ error: access.error });

  const { student, privatePortal } = access;
  const mySlug = studentSlug(student.full_name);

  if (action === 'list') {
    const { data: session } = await supabase
      .from('sessions')
      .select('id, student_id, tutor_id, subject_id, start_time, end_time, class_group_id, subjects(is_group)')
      .eq('id', sessionId)
      .maybeSingle();
    if (!session) return res.status(404).json({ error: 'Pamoka nerasta' });

    let siblings: SessionRow[] = [session as SessionRow];
    const classGroupId = (session as SessionRow).class_group_id;
    if (classGroupId) {
      const { data } = await supabase
        .from('sessions')
        .select('id, student_id, tutor_id, subject_id, start_time, end_time, class_group_id')
        .eq('class_group_id', classGroupId)
        .eq('start_time', (session as SessionRow).start_time)
        .eq('end_time', (session as SessionRow).end_time);
      siblings = (data || []) as SessionRow[];
    } else if (isGroupSubjectSession(session as SessionRow)) {
      const row = session as SessionRow;
      const { data } = await supabase
        .from('sessions')
        .select('id, student_id, tutor_id, subject_id, start_time, end_time, class_group_id')
        .eq('tutor_id', row.tutor_id)
        .eq('subject_id', row.subject_id)
        .eq('start_time', row.start_time)
        .eq('end_time', row.end_time)
        .is('class_group_id', null);
      siblings = (data || []) as SessionRow[];
    }

    if (privatePortal && siblings.length) {
      const sourceStudents = await supabase.from('students').select('id')
        .eq('organization_id', student.organization_id).in('id', siblings.map((row) => row.student_id));
      if (sourceStudents.error) return res.status(503).json({ error: 'school_family_access_unavailable' });
      const scopedStudents = new Set((sourceStudents.data || []).map((row) => row.id));
      siblings = siblings.filter((row) => scopedStudents.has(row.student_id));
    }
    const folders = isGroupSubjectSession(session as SessionRow)
      ? [...new Set([sessionId, ...siblings.map((row) => row.id)])]
      : siblingFolders(
          session as unknown as Parameters<typeof siblingFolders>[0],
          siblings as unknown as Parameters<typeof siblingFolders>[1],
        );
    const seen = new Set<string>();
    const merged: Array<{
      name: string;
      folderId: string;
      size: number | null;
      signedUrl: string | null;
      downloadUrl: string | null;
      submission: boolean;
      own: boolean;
    }> = [];

    for (const folderId of folders) {
      const { data } = await supabase.storage.from(BUCKET).list(folderId, {
        limit: 50,
        sortBy: { column: 'created_at', order: 'asc' },
      });
      for (const f of data ?? []) {
        if (!f.name || f.name.startsWith('.')) continue;
        if (!studentMaySeeGroupFile(f.name, folderId, sessionId)) continue;
        const key = `${folderId}/${f.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push({
          name: f.name,
          folderId,
          size: f.metadata?.size != null ? Number(f.metadata.size) : null,
          signedUrl: null,
          downloadUrl: privatePortal ? `/api/school-material-file?student=${encodeURIComponent(student.id)}&session=${encodeURIComponent(sessionId)}&folder=${encodeURIComponent(folderId)}&file=${encodeURIComponent(f.name)}` : null,
          submission: isHomeworkSubmissionFile(f.name),
          own: isHomeworkSubmissionFile(f.name)
            && folderId === sessionId
            && f.name.startsWith(`${HOMEWORK_FILE_PREFIX}${mySlug}-`),
        });
      }
    }

    const paths = merged.map((f) => `${f.folderId}/${f.name}`);
    if (paths.length && !privatePortal) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      const urlByPath = new Map(
        (signed || []).filter((row) => row.path && row.signedUrl).map((row) => [row.path!, row.signedUrl!]),
      );
      for (const f of merged) {
        f.signedUrl = urlByPath.get(`${f.folderId}/${f.name}`) || null;
      }
    }

    if (privatePortal) {
      let current: Awaited<ReturnType<typeof resolveSessionAccess>>;
      try { current = await resolveSessionAccess(supabase, auth.userId, sessionId); }
      catch { return res.status(503).json({ error: 'school_family_access_unavailable' }); }
      if (current.ok === false) return res.status(current.status).json({ error: current.error });
      if (!current.privatePortal) return res.status(403).json({ error: 'Forbidden' });
    }

    return res.status(200).json({
      ok: true,
      files: merged,
      limits: { maxBytes: HOMEWORK_MAX_BYTES, allowedExt: HOMEWORK_ALLOWED_EXT },
    });
  }

  if (action === 'upload-url') {
    const fileName = String(body.fileName || '').trim();
    const size = Number(body.size);
    if (!fileName || !isAllowedHomeworkFile(fileName, size)) {
      return res.status(400).json({
        error: 'Leidžiami PDF, nuotraukų, Word, Excel ir tekstiniai failai iki 10 MB.',
      });
    }
    const objectName = homeworkObjectName(student.full_name, fileName);
    const path = `${sessionId}/${objectName}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) return res.status(500).json({ error: error?.message || 'Nepavyko paruošti įkėlimo' });
    return res.status(200).json({ ok: true, path, token: data.token, name: objectName });
  }

  if (action === 'delete') {
    const fileName = String(body.fileName || '').trim();
    const ownPrefix = `${HOMEWORK_FILE_PREFIX}${mySlug}-`;
    if (!fileName || !fileName.startsWith(ownPrefix) || fileName.includes('/')) {
      return res.status(403).json({ error: 'Galima trinti tik savo įkeltus failus' });
    }
    const { error } = await supabase.storage.from(BUCKET).remove([`${sessionId}/${fileName}`]);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
