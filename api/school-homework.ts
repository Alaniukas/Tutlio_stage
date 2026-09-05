// ─── Public homework page for school parents without an account ─────────────
// GET  /api/school-homework?student=<id>&t=<token>
//      → child's lessons (last 60 / next 45 days), teacher materials per lesson
//        (files of every parallel group row), the parent's own uploads, and a
//        tracked join link per lesson.
// POST /api/school-homework { student, t, action: 'upload-url' | 'delete', sessionId, fileName, ... }
//      → signed direct-to-storage upload of a homework file into the lesson's
//        folder (`nd-<student>-<file>`, visible to the teacher in SessionFiles),
//        or removal of one of the parent's own uploads.
//
// The link token is an HMAC over the student id (api/_lib/publicLinkToken.ts);
// it is placed in the school reminder / invitation emails.
import type { VercelRequest, VercelResponse } from './types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { verifyPublicLinkToken } from './_lib/publicLinkToken.js';
import { buildTrackedJoinUrl } from './_lib/joinLink.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { schoolTerminologyForOrg } from '../src/lib/i18n/schoolTerminology.js';

const BUCKET = 'session-files';
export const HOMEWORK_MAX_BYTES = 10 * 1024 * 1024;
export const HOMEWORK_ALLOWED_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx', '.xlsx', '.txt'];
export const HOMEWORK_PREFIX = 'nd-';
const PAST_DAYS = 60;
const FUTURE_DAYS = 45;
const FILE_SCAN_PAST_DAYS = 21;
const MAX_FILE_FOLDERS = 80;
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
  topic: string | null;
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

async function authorize(
  supabase: SupabaseClient,
  studentId: string,
  token: string,
): Promise<
  | { ok: true; student: { id: string; full_name: string; organization_id: string | null }; org: { id: string; name: string | null; entity_type: string | null; features: Record<string, unknown> | null } }
  | { ok: false; status: number; error: string }
> {
  if (!studentId || !verifyPublicLinkToken('homework', studentId, token)) {
    return { ok: false, status: 403, error: 'Nuoroda negalioja' };
  }
  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, organization_id, detached_at')
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
  return {
    ok: true,
    student: { id: student.id, full_name: String(student.full_name || ''), organization_id: orgId },
    org: org as { id: string; name: string | null; entity_type: string | null; features: Record<string, unknown> | null },
  };
}

/** Group lessons are one row per member — teacher materials may sit in any sibling folder. */
export function siblingFolders(session: SessionRow, all: SessionRow[]): string[] {
  if (!session.class_group_id) return [session.id];
  const startMs = Date.parse(session.start_time);
  const ids = all
    .filter((row) => row.class_group_id === session.class_group_id && Date.parse(row.start_time) === startMs)
    .map((row) => row.id);
  return ids.length ? [...new Set([session.id, ...ids])] : [session.id];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = serviceClient();
  if (!supabase) return res.status(500).json({ error: 'Server misconfigured' });

  if (req.method === 'GET') {
    const studentId = String(req.query?.student || '').trim();
    const token = String(req.query?.t || '').trim();
    const auth = await authorize(supabase, studentId, token);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

    const now = new Date();
    const from = new Date(now.getTime() - PAST_DAYS * 86_400_000);
    const to = new Date(now.getTime() + FUTURE_DAYS * 86_400_000);
    const { data: own } = await supabase
      .from('sessions')
      .select('id, start_time, end_time, status, meeting_link, tutor_id, class_group_id, subject_id, topic')
      .eq('student_id', studentId)
      .neq('status', 'cancelled')
      .gte('start_time', from.toISOString())
      .lte('start_time', to.toISOString())
      .order('start_time', { ascending: true })
      .limit(200);
    const sessions = (own || []) as SessionRow[];

    // Parallel group rows (other members) that share a folder set with these lessons.
    const groupIds = [...new Set(sessions.map((s) => s.class_group_id).filter(Boolean))] as string[];
    let siblings: SessionRow[] = [];
    if (groupIds.length) {
      const { data } = await supabase
        .from('sessions')
        .select('id, start_time, end_time, status, meeting_link, tutor_id, class_group_id, subject_id, topic')
        .in('class_group_id', groupIds)
        .gte('start_time', from.toISOString())
        .lte('start_time', to.toISOString())
        .limit(2000);
      siblings = (data || []) as SessionRow[];
    }

    const tutorIds = [...new Set(sessions.map((s) => s.tutor_id).filter(Boolean))] as string[];
    const subjectIds = [...new Set(sessions.map((s) => s.subject_id).filter(Boolean))] as string[];
    const [tutorsRes, groupsRes, subjectsRes] = await Promise.all([
      tutorIds.length ? supabase.from('profiles').select('id, full_name').in('id', tutorIds) : Promise.resolve({ data: [] }),
      groupIds.length ? supabase.from('school_class_groups').select('id, name').in('id', groupIds) : Promise.resolve({ data: [] }),
      subjectIds.length ? supabase.from('subjects').select('id, name').in('id', subjectIds) : Promise.resolve({ data: [] }),
    ]);
    const tutorName = new Map(((tutorsRes.data || []) as Array<{ id: string; full_name: string | null }>).map((t) => [t.id, t.full_name || '']));
    const groupName = new Map(((groupsRes.data || []) as Array<{ id: string; name: string | null }>).map((g) => [g.id, g.name || '']));
    const subjectName = new Map(((subjectsRes.data || []) as Array<{ id: string; name: string | null }>).map((s) => [s.id, s.name || '']));

    // Files: only lessons close enough to matter (recent past + upcoming), capped.
    const fileScanFrom = now.getTime() - FILE_SCAN_PAST_DAYS * 86_400_000;
    const scanSessions = sessions.filter((s) => Date.parse(s.start_time) >= fileScanFrom).slice(0, MAX_FILE_FOLDERS);
    const folderSets = new Map<string, string[]>();
    for (const s of scanSessions) folderSets.set(s.id, siblingFolders(s, siblings));
    const allFolders = [...new Set([...folderSets.values()].flat())];
    const listed = await Promise.all(
      allFolders.map(async (folder) => {
        const { data } = await supabase.storage.from(BUCKET).list(folder, { sortBy: { column: 'created_at', order: 'asc' } });
        return [folder, (data || []).filter((f) => f.name && !f.name.startsWith('.'))] as const;
      }),
    );
    const filesByFolder = new Map(listed);
    const paths: string[] = [];
    for (const [folder, files] of filesByFolder) for (const f of files) paths.push(`${folder}/${f.name}`);
    const signed = new Map<string, string>();
    if (paths.length) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      for (const row of data || []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
    }

    const origin = publicOriginFromRequest(req);
    const mySlug = studentSlug(auth.student.full_name);
    const out = sessions.map((s) => {
      const folders = folderSets.get(s.id) || [];
      const seen = new Set<string>();
      const files: Array<{ name: string; folderId: string; size: number | null; url: string | null; submission: boolean; own: boolean }> = [];
      for (const folder of folders) {
        for (const f of filesByFolder.get(folder) || []) {
          if (seen.has(f.name)) continue;
          seen.add(f.name);
          const submission = f.name.startsWith(HOMEWORK_PREFIX);
          files.push({
            name: f.name,
            folderId: folder,
            size: (f.metadata as { size?: number } | null)?.size != null ? Number((f.metadata as { size?: number }).size) : null,
            url: signed.get(`${folder}/${f.name}`) || null,
            submission,
            own: submission && folder === s.id && f.name.startsWith(`${HOMEWORK_PREFIX}${mySlug}-`),
          });
        }
      }
      let joinUrl: string | null = null;
      if (s.meeting_link && s.status === 'active') {
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
        joinUrl,
        hasMeetingLink: Boolean(s.meeting_link),
        files,
      };
    });

    return res.status(200).json({
      ok: true,
      now: now.toISOString(),
      school: { name: auth.org.name || '' },
      student: { id: auth.student.id, name: auth.student.full_name },
      terminology: schoolTerminologyForOrg(auth.org.entity_type, auth.org.features),
      limits: { maxBytes: HOMEWORK_MAX_BYTES, allowedExt: HOMEWORK_ALLOWED_EXT },
      sessions: out,
    });
  }

  if (req.method === 'POST') {
    const body = readBody(req);
    const studentId = String(body.student || '').trim();
    const token = String(body.t || '').trim();
    const auth = await authorize(supabase, studentId, token);
    if (auth.ok === false) return res.status(auth.status).json({ error: auth.error });

    const action = String(body.action || '').trim();
    const sessionId = String(body.sessionId || '').trim();
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });
    const { data: session } = await supabase
      .from('sessions')
      .select('id, student_id, status')
      .eq('id', sessionId)
      .eq('student_id', studentId)
      .maybeSingle();
    if (!session) return res.status(404).json({ error: 'Pamoka nerasta' });

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
