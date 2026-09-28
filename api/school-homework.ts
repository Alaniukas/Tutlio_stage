// ─── Public homework page for school parents without an account ─────────────
// GET  /api/school-homework?student=<id>&t=<token>
//      → child's lessons (last 60 / next 45 days), teacher materials per lesson
//        (files of every parallel group row), the parent's own uploads, a
//        tracked join link per lesson, and Drive recordings for groups the
//        child currently belongs to (no Tutlio account).
// POST /api/school-homework { student, t, action: 'upload-url' | 'delete', sessionId, fileName, ... }
//      → signed direct-to-storage upload of a homework file into the lesson's
//        folder (`nd-<student>-<file>`, visible to the teacher in SessionFiles),
//        or removal of one of the parent's own uploads.
//
// The link token is an HMAC over the student id (api/_lib/publicLinkToken.ts);
// it is placed in the school reminder / invitation emails.
import type { VercelRequest, VercelResponse } from './types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { loadSchoolFamilyGuardianAccess, schoolFamilyPortalEnabled } from './_lib/schoolFamilyGuardianAccess.js';
import { legacySessionMaterialPaths } from './_lib/schoolMaterialPublications.js';
import { createSchoolRecordingViewerSession } from './_lib/schoolRecordingTicket.js';
import { deniedRecordingOrganizations } from './_lib/schoolRecordingAccessDenials.js';
import { verifyPublicLinkToken } from './_lib/publicLinkToken.js';
import { buildTrackedJoinUrl } from './_lib/joinLink.js';
import { schoolSessionContractAllowsAccess, type SchoolAccessContract } from './_lib/schoolContractAccess.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { schoolTerminologyForOrg } from '../src/lib/i18n/schoolTerminology.js';
import { resolveSessionMeetingLink } from '../src/lib/meetingLink.js';
import {
  HOMEWORK_FILE_PREFIX,
  isHomeworkSubmissionFile,
  studentMaySeeGroupFile,
} from '../src/lib/sessionFileVisibility.js';
import {
  listHomeworkGroupRecordings,
  schoolRecordingsFeatureOn,
} from './_lib/schoolHomeworkRecordings.js';

const BUCKET = 'session-files';
export const HOMEWORK_MAX_BYTES = 10 * 1024 * 1024;
export const HOMEWORK_ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xlsx', '.txt'];
export const HOMEWORK_PREFIX = HOMEWORK_FILE_PREFIX;
const PAST_DAYS = 60;
const FUTURE_DAYS = 45;
const FILE_SCAN_PAST_DAYS = 21;
const MAX_FILE_FOLDERS = 40;
const FILE_LIST_CONCURRENCY = 2;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type SessionRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string | null;
  meeting_link: string | null;
  tutor_id: string | null;
  class_group_id: string | null;
  subject_id: string | null;
  student_id?: string;
  topic: string | null;
  tutor_comment?: string | null;
  show_comment_to_student?: boolean;
  show_comment_to_parent?: boolean;
};

function serviceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Storage rejects diacritics / odd punctuation in object keys (same rule as SessionFiles.tsx). */
export function safeObjectName(originalName: string): string {
  const trimmed = String(originalName || '').trim();
  const dot = trimmed.lastIndexOf('.');
  const base = (dot > 0 ? trimmed.slice(0, dot) : trimmed) || 'file';
  const ext = dot > 0 ? trimmed.slice(dot).toLowerCase() : '';
  const ascii = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safeBase = ascii.length > 0 ? ascii.slice(0, 100) : 'file';
  return `${safeBase}${ext}`.slice(0, 120);
}

export function studentSlug(fullName: string): string {
  const ascii = String(fullName || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii.slice(0, 40) || 'mokinys';
}

/** `nd-<student>-<file>` — the teacher sees who handed the work in. */
export function homeworkObjectName(studentName: string, originalName: string): string {
  return `${HOMEWORK_PREFIX}${studentSlug(studentName)}-${safeObjectName(originalName)}`;
}

export function isAllowedHomeworkFile(name: string, size: number): boolean {
  const lower = String(name || '').toLowerCase();
  if (!HOMEWORK_ALLOWED_EXT.some((ext) => lower.endsWith(ext))) return false;
  return Number.isFinite(size) && size > 0 && size <= HOMEWORK_MAX_BYTES;
}

function readBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
  }
  return raw as Record<string, unknown>;
}

export async function authorizeSchoolHomework(
  supabase: SupabaseClient,
  studentId: string,
  token: string,
  viewerUserId?: string | null,
): Promise<
  | { ok: true; student: { id: string; full_name: string; organization_id: string | null; personal_meeting_link: string | null; viewerIsStudent?: boolean }; org: { id: string; name: string | null; entity_type: string | null; features: Record<string, unknown> | null } }
  | { ok: false; status: number; error: string }
> {
  if (!studentId || (!viewerUserId && !verifyPublicLinkToken('homework', studentId, token))) {
    return { ok: false, status: 403, error: 'Nuoroda negalioja' };
  }
  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, organization_id, detached_at, personal_meeting_link, linked_user_id')
    .eq('id', studentId)
    .maybeSingle();
  if (!student || (student as { detached_at?: string | null }).detached_at) {
    return { ok: false, status: 404, error: 'Mokinys nerastas' };
  }
  const orgId = (student as { organization_id?: string | null }).organization_id || null;
  if (!orgId) return { ok: false, status: 403, error: 'Nuoroda negalioja' };
  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, entity_type, features')
    .eq('id', orgId)
    .maybeSingle();
  if (!org || String((org as { entity_type?: string | null }).entity_type || '') !== 'school') {
    return { ok: false, status: 403, error: 'Nuoroda negalioja' };
  }
  if (viewerUserId) {
    if (!schoolFamilyPortalEnabled(org.features)) return { ok: false, status: 404, error: 'school_family_portal_disabled' };
    let allowed = student.linked_user_id === viewerUserId;
    if (!allowed) {
      const parent = await loadSchoolFamilyGuardianAccess(supabase, viewerUserId, orgId);
      allowed = parent.distinctParent && parent.studentIds.includes(studentId);
    }
    if (!allowed) return { ok: false, status: 403, error: 'Forbidden' };
  }
  return {
    ok: true,
    student: {
      id: student.id,
      full_name: String(student.full_name || ''),
      organization_id: orgId,
      personal_meeting_link: String(student.personal_meeting_link || '').trim() || null,
      viewerIsStudent: Boolean(viewerUserId && student.linked_user_id === viewerUserId),
    },
    org: org as { id: string; name: string | null; entity_type: string | null; features: Record<string, unknown> | null },
  };
}

async function loadMemberGroupIds(
  supabase: SupabaseClient,
  studentId: string,
): Promise<Set<string>> {
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

/** Group lessons are one row per member — teacher materials may sit in any sibling folder. */
export function siblingFolders(session: SessionRow, all: SessionRow[]): string[] {
  if (!session.class_group_id) return [session.id];
  const startMs = Date.parse(session.start_time);
  const ids = all
    .filter((row) => row.class_group_id === session.class_group_id && Date.parse(row.start_time) === startMs
      && (row.end_time ? Date.parse(row.end_time) : null) === (session.end_time ? Date.parse(session.end_time) : null))
    .map((row) => row.id);
  return ids.length ? [...new Set([session.id, ...ids])] : [session.id];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = serviceClient();
  if (!supabase) return res.status(500).json({ error: 'Server misconfigured' });
  res.setHeader('Cache-Control', 'private, no-store');
  const bearerSupplied = req.headers.authorization !== undefined;
  const viewer = bearerSupplied ? await verifyRequestAuth(req) : null;
  if (bearerSupplied && !viewer?.userId) return res.status(401).json({ error: 'Unauthorized' });
  const viewerUserId = viewer?.userId || null;

  if (req.method === 'GET' && req.query.children === '1') {
    if (!viewerUserId) return res.status(401).json({ error: 'Unauthorized' });
    const [own, guardians] = await Promise.all([
      supabase.from('students').select('id,full_name,organization_id').eq('linked_user_id', viewerUserId).is('detached_at', null).limit(100),
      supabase.from('school_family_guardians').select('student_id,organization_id').eq('guardian_user_id', viewerUserId).limit(100),
    ]);
    if (own.error || guardians.error) return res.status(503).json({ error: 'school_family_access_unavailable' });
    const orgIds = [...new Set([...(own.data || []).map((s) => s.organization_id), ...(guardians.data || []).map((g) => g.organization_id)].filter(Boolean))];
    const childIds = new Set<string>();
    for (const orgId of orgIds) {
      const org = await supabase.from('organizations').select('entity_type,features').eq('id', orgId).single();
      if (org.error) return res.status(503).json({ error: 'school_family_access_unavailable' });
      if (org.data.entity_type !== 'school' || !schoolFamilyPortalEnabled(org.data.features)) continue;
      for (const child of own.data || []) if (child.organization_id === orgId) childIds.add(child.id);
      const parent = await loadSchoolFamilyGuardianAccess(supabase, viewerUserId, orgId);
      if (parent.distinctParent) for (const id of parent.studentIds) childIds.add(id);
    }
    const children = childIds.size ? await supabase.from('students').select('id,full_name').in('id', [...childIds]).is('detached_at', null).order('full_name') : { data: [], error: null };
    if (children.error) return res.status(503).json({ error: 'school_family_access_unavailable' });
    return res.status(200).json({ ok: true, children: children.data });
  }

  if (req.method === 'GET') {
    const studentId = String(req.query?.student || '').trim();
    const token = String(req.query?.t || '').trim();
    const auth = await authorizeSchoolHomework(supabase, studentId, token, viewerUserId);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

    const privatePortal = schoolFamilyPortalEnabled(auth.org.features);
    let recordingsEnabled = schoolRecordingsFeatureOn(auth.org.features);
    if (viewerUserId && recordingsEnabled) {
      const user = await supabase.auth.admin.getUserById(viewerUserId);
      const denied = await deniedRecordingOrganizations(supabase, [auth.org.id], viewerUserId, user.data?.user?.email ? [user.data.user.email] : []);
      recordingsEnabled = !denied.has(auth.org.id);
      const secure = process.env.VERCEL_ENV ? '; Secure' : '';
      res.setHeader('Set-Cookie', `tutlio_recording_viewer=${encodeURIComponent(createSchoolRecordingViewerSession(viewerUserId))}; HttpOnly; SameSite=Strict; Path=/api/school-lesson-recording-stream; Max-Age=7200${secure}`);
    }

    const requestedGroupId = String(req.query?.group || '').trim();
    if (requestedGroupId) {
      const memberGroupIds = await loadMemberGroupIds(supabase, studentId);
      let recordingGroups: Awaited<ReturnType<typeof listHomeworkGroupRecordings>> = {
        retentionDays: 30,
        groups: [],
      };
      try {
        recordingGroups = await listHomeworkGroupRecordings(supabase, {
          studentId: auth.student.id,
          organizationId: auth.org.id,
          memberGroupIds,
          recordingsEnabled,
          viewerUserId, features: auth.org.features,
          listFiles: true,
          groupId: requestedGroupId,
        });
      } catch (error) {
        console.error('[school-homework] recordings list failed', (error as Error)?.message);
      }
      if (privatePortal) {
        const current = await authorizeSchoolHomework(supabase, studentId, token, viewerUserId);
        if (current.ok === false) return res.status(current.status).json({ error: current.error });
        if (!schoolFamilyPortalEnabled(current.org.features)) return res.status(403).json({ error: 'Forbidden' });
      }
      return res.status(200).json({
        ok: true,
        retentionDays: recordingGroups.retentionDays,
        recordingGroups: recordingGroups.groups,
      });
    }

    const now = new Date();
    const from = new Date(now.getTime() - PAST_DAYS * 86_400_000);
    const to = new Date(now.getTime() + FUTURE_DAYS * 86_400_000);
    const { data: own } = await supabase
      .from('sessions')
      .select('id, start_time, end_time, status, meeting_link, tutor_id, class_group_id, subject_id, topic, tutor_comment, show_comment_to_student, show_comment_to_parent')
      .eq('student_id', studentId)
      .neq('status', 'cancelled')
      .gte('start_time', from.toISOString())
      .lte('start_time', to.toISOString())
      .order('start_time', { ascending: true })
      .limit(200);
    const memberGroupIds = await loadMemberGroupIds(supabase, studentId);
    let sessions = ((own || []) as SessionRow[]).filter((row) => sessionAllowedForStudent(row, memberGroupIds));
    if (privatePortal) {
      const ids = [...new Set(sessions.map((row) => row.class_group_id).filter(Boolean))] as string[];
      if (ids.length) {
        const groups = await supabase.from('school_class_groups').select('id')
          .eq('organization_id', auth.org.id).in('id', ids);
        if (groups.error) return res.status(503).json({ error: 'school_material_access_unavailable' });
        const scoped = new Set((groups.data || []).map((row) => row.id));
        sessions = sessions.filter((row) => !row.class_group_id || scoped.has(row.class_group_id));
      }
    }
    const { data: contractRows, error: contractError } = await supabase
      .from('school_contracts')
      .select('*')
      .eq('organization_id', auth.org.id)
      .eq('student_id', studentId);
    if (contractError) {
      console.error('[school-homework] contract access load failed', contractError.message);
    }
    const accessContracts = (contractRows || []) as SchoolAccessContract[];

    // Parallel group rows (other members) that share a folder set with these lessons.
    const groupIds = [...new Set(sessions.map((s) => s.class_group_id).filter(Boolean))] as string[];
    let siblings: SessionRow[] = [];
    if (groupIds.length) {
      const { data } = await supabase
        .from('sessions')
        .select('id, student_id, start_time, end_time, status, meeting_link, tutor_id, class_group_id, subject_id, topic')
        .in('class_group_id', groupIds)
        .gte('start_time', from.toISOString())
        .lte('start_time', to.toISOString())
        .limit(2000);
      siblings = (data || []) as SessionRow[];
      if (privatePortal && siblings.length) {
        const sourceStudents = await supabase.from('students').select('id').eq('organization_id', auth.org.id)
          .in('id', siblings.map((row) => row.student_id).filter(Boolean) as string[]);
        if (sourceStudents.error) return res.status(503).json({ error: 'school_material_access_unavailable' });
        const scoped = new Set((sourceStudents.data || []).map((row) => row.id));
        siblings = siblings.filter((row) => row.student_id && scoped.has(row.student_id));
      }
    }

    const tutorIds = [...new Set(sessions.map((s) => s.tutor_id).filter(Boolean))] as string[];
    const subjectIds = [...new Set(sessions.map((s) => s.subject_id).filter(Boolean))] as string[];
    const [tutorsRes, groupsRes, subjectsRes] = await Promise.all([
      tutorIds.length ? supabase.from('profiles').select('id, full_name, personal_meeting_link').in('id', tutorIds) : Promise.resolve({ data: [] }),
      groupIds.length ? supabase.from('school_class_groups').select('id, name').in('id', groupIds) : Promise.resolve({ data: [] }),
      subjectIds.length ? supabase.from('subjects').select('id, name, meeting_link').in('id', subjectIds) : Promise.resolve({ data: [] }),
    ]);
    const tutorName = new Map(((tutorsRes.data || []) as Array<{ id: string; full_name: string | null }>).map((t) => [t.id, t.full_name || '']));
    const tutorLink = new Map(((tutorsRes.data || []) as Array<{ id: string; personal_meeting_link: string | null }>).map((t) => [t.id, t.personal_meeting_link]));
    const groupName = new Map(((groupsRes.data || []) as Array<{ id: string; name: string | null }>).map((g) => [g.id, g.name || '']));
    const subjectName = new Map(((subjectsRes.data || []) as Array<{ id: string; name: string | null }>).map((s) => [s.id, s.name || '']));
    const subjectLink = new Map(((subjectsRes.data || []) as Array<{ id: string; meeting_link: string | null }>).map((s) => [s.id, s.meeting_link]));

    // Files: only lessons close enough to matter (recent past + upcoming), capped.
    const fileScanFrom = now.getTime() - FILE_SCAN_PAST_DAYS * 86_400_000;
    const scanSessions = sessions.filter((s) => Date.parse(s.start_time) >= fileScanFrom).slice(0, MAX_FILE_FOLDERS);
    const folderSets = new Map<string, string[]>();
    for (const s of scanSessions) folderSets.set(s.id, siblingFolders(s, siblings));
    const allFolders = [...new Set([...folderSets.values()].flat())];
    const listed: Array<readonly [string, Array<{ name: string; metadata?: { size?: number } | null }>]> = [];
    for (let i = 0; i < allFolders.length; i += FILE_LIST_CONCURRENCY) {
      const chunk = allFolders.slice(i, i + FILE_LIST_CONCURRENCY);
      const part = await Promise.all(
        chunk.map(async (folder) => {
          const { data } = await supabase.storage.from(BUCKET).list(folder, {
            limit: 50,
            sortBy: { column: 'created_at', order: 'asc' },
          });
          return [folder, (data || []).filter((f) => f.name && !f.name.startsWith('.'))] as const;
        }),
      );
      listed.push(...part);
    }
    const filesByFolder = new Map(listed);
    let paths: string[] = [];
    for (const [folder, files] of filesByFolder) for (const f of files) paths.push(`${folder}/${f.name}`);
    if (privatePortal && !viewerUserId) {
      const legacy = await legacySessionMaterialPaths(supabase, auth.org.id, paths);
      paths = paths.filter((path) => legacy.has(path));
      for (const [folder, files] of filesByFolder) filesByFolder.set(folder, files.filter((f) => legacy.has(`${folder}/${f.name}`)));
    }
    const signed = new Map<string, string>();
    if (paths.length) {
      if (!privatePortal) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
        for (const row of data || []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
      }
    }

    let recordingGroups: Awaited<ReturnType<typeof listHomeworkGroupRecordings>> = {
      retentionDays: 30,
      groups: [],
    };
    try {
      recordingGroups = await listHomeworkGroupRecordings(supabase, {
        studentId: auth.student.id,
        organizationId: auth.org.id,
        memberGroupIds,
        recordingsEnabled,
        viewerUserId, features: auth.org.features,
        listFiles: false,
      });
    } catch (error) {
      console.error('[school-homework] recordings list failed', (error as Error)?.message);
    }

    const origin = publicOriginFromRequest(req);
    const mySlug = studentSlug(auth.student.full_name);
    const out = sessions.map((s) => {
      const folders = folderSets.get(s.id) || [];
      const seen = new Set<string>();
      const files: Array<{ name: string; folderId: string; size: number | null; url: string | null; submission: boolean; own: boolean }> = [];
      for (const folder of folders) {
        for (const f of filesByFolder.get(folder) || []) {
          if (!studentMaySeeGroupFile(f.name, folder, s.id)) continue;
          if (seen.has(f.name)) continue;
          seen.add(f.name);
          const submission = isHomeworkSubmissionFile(f.name);
          files.push({
            name: f.name,
            folderId: folder,
            size: (f.metadata as { size?: number } | null)?.size != null ? Number((f.metadata as { size?: number }).size) : null,
            url: privatePortal ? `/api/school-material-file?student=${encodeURIComponent(studentId)}&session=${encodeURIComponent(s.id)}&folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(f.name)}${viewerUserId ? '' : `&t=${encodeURIComponent(token)}`}` : signed.get(`${folder}/${f.name}`) || null,
            submission,
            own: submission && folder === s.id && f.name.startsWith(`${HOMEWORK_PREFIX}${mySlug}-`),
          });
        }
      }
      let joinUrl: string | null = null;
      const contractAllowsJoin = !contractError && schoolSessionContractAllowsAccess(accessContracts, s, now);
      const meetingLink = resolveSessionMeetingLink({
        sessionLink: s.meeting_link,
        studentPersonalLink: auth.student.personal_meeting_link,
        tutorPersonalLink: s.tutor_id ? tutorLink.get(s.tutor_id) : null,
        subjectLink: s.subject_id ? subjectLink.get(s.subject_id) : null,
      });
      if (contractAllowsJoin && meetingLink && s.status === 'active') {
        try { joinUrl = buildTrackedJoinUrl(origin, s.id, 'student'); } catch { joinUrl = null; }
      }
      return {
        id: s.id,
        start: s.start_time,
        end: s.end_time,
        status: s.status,
        teacher: s.tutor_id ? tutorName.get(s.tutor_id) || '' : '',
        group: s.class_group_id ? groupName.get(s.class_group_id) || '' : '',
        subject: s.subject_id ? subjectName.get(s.subject_id) || '' : '',
        topic: s.topic || '',
        tutorComment: viewerUserId && (auth.student.viewerIsStudent ? s.show_comment_to_student : s.show_comment_to_parent) ? s.tutor_comment || '' : '',
        joinUrl,
        hasMeetingLink: Boolean(meetingLink),
        joinBlockedByContract: Boolean(meetingLink) && !contractAllowsJoin,
        files,
      };
    });

    if (privatePortal) {
      const current = await authorizeSchoolHomework(supabase, studentId, token, viewerUserId);
      if (current.ok === false) return res.status(current.status).json({ error: current.error });
      if (!schoolFamilyPortalEnabled(current.org.features)) return res.status(403).json({ error: 'Forbidden' });
    }
    return res.status(200).json({
      ok: true,
      now: now.toISOString(),
      school: { name: auth.org.name || '' },
      student: { id: auth.student.id, name: auth.student.full_name },
      terminology: schoolTerminologyForOrg(auth.org.entity_type, auth.org.features),
      limits: { maxBytes: HOMEWORK_MAX_BYTES, allowedExt: HOMEWORK_ALLOWED_EXT },
      sessions: out,
      retentionDays: recordingGroups.retentionDays,
      recordingGroups: recordingGroups.groups,
      loginRequiredForNewMaterials: privatePortal && !viewerUserId,
    });
  }

  if (req.method === 'POST') {
    const body = readBody(req);
    const studentId = String(body.student || '').trim();
    const token = String(body.t || '').trim();
    const auth = await authorizeSchoolHomework(supabase, studentId, token, viewerUserId);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });
    if (!viewerUserId && schoolFamilyPortalEnabled(auth.org.features)) return res.status(403).json({ error: 'school_homework_login_required' });

    const action = String(body.action || '').trim();
    const sessionId = String(body.sessionId || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
    const { data: session } = await supabase
      .from('sessions')
      .select('id, student_id, status, class_group_id')
      .eq('id', sessionId)
      .eq('student_id', studentId)
      .maybeSingle();
    if (!session) return res.status(404).json({ error: 'Pamoka nerasta' });
    const memberGroupIds = await loadMemberGroupIds(supabase, studentId);
    if (!sessionAllowedForStudent(session as unknown as SessionRow, memberGroupIds)) {
      return res.status(403).json({ error: 'Nuoroda negalioja' });
    }

    if (action === 'upload-url') {
      const fileName = String(body.fileName || '').trim();
      const size = Number(body.size);
      if (!fileName || !isAllowedHomeworkFile(fileName, size)) {
        return res.status(400).json({ error: 'Leidžiami PDF, nuotraukų, Word, Excel ir tekstiniai failai iki 10 MB.' });
      }
      const objectName = homeworkObjectName(auth.student.full_name, fileName);
      const path = `${sessionId}/${objectName}`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
      if (error || !data) return res.status(500).json({ error: error?.message || 'Nepavyko paruošti įkėlimo' });
      return res.status(200).json({ ok: true, path, token: data.token, name: objectName });
    }

    if (action === 'delete') {
      const fileName = String(body.fileName || '').trim();
      const ownPrefix = `${HOMEWORK_PREFIX}${studentSlug(auth.student.full_name)}-`;
      if (!fileName || !fileName.startsWith(ownPrefix) || fileName.includes('/')) {
        return res.status(403).json({ error: 'Galima trinti tik savo įkeltus failus' });
      }
      const { error } = await supabase.storage.from(BUCKET).remove([`${sessionId}/${fileName}`]);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
