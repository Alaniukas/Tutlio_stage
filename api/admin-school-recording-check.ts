import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './types.js';
import { isInternalRequest } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { isDriveRecordingChatFile, listDriveRecordingFolderFiles, listDriveRecordings } from './_lib/googleDriveRecordings.js';
import { resolveRecordingViewerAccess } from './_lib/schoolRecordingAccess.js';
import { createSchoolRecordingTicket, createSchoolRecordingViewerSession } from './_lib/schoolRecordingTicket.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Internal, read-only production check. Never returns cookies, tickets or messages. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isInternalRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
  const organizationId = typeof req.query.organizationId === 'string' ? req.query.organizationId : '';
  const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
  if (!UUID.test(organizationId) || !UUID.test(userId)) return res.status(400).json({ error: 'Invalid scope' });
  try {
    const db = serviceSupabase();
    const access = await resolveRecordingViewerAccess(db, userId);
    const groups = access.groups.filter((group) => group.organizationId === organizationId);
    if (!groups.length) return res.status(403).json({ error: 'Viewer has no recording access in this organization' });
    const mappings = await db.from('school_recording_drive_folders')
      .select('group_id,subject_id,drive_folder_id').eq('organization_id', organizationId);
    if (mappings.error) throw new Error('Folder lookup failed');
    const cookie = `tutlio_recording_viewer=${encodeURIComponent(createSchoolRecordingViewerSession(userId))}`;
    const configuredOrigin = new URL(process.env.APP_URL || 'https://www.tutlio.lt').origin;
    const origin = configuredOrigin === 'https://tutlio.lt' ? 'https://www.tutlio.lt' : configuredOrigin;
    const probe = (fileId: string, groupId: string, method: 'GET' | 'HEAD', recordingFileId?: string, signedIn = true) => {
      const ticket = createSchoolRecordingTicket({ userId, groupId, fileId, ...(recordingFileId ? { recordingFileId } : {}) });
      return fetch(`${origin}/api/school-lesson-recording-stream?t=${encodeURIComponent(ticket)}`, {
        method, headers: signedIn ? { Cookie: cookie } : {}, redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    };
    const results = await Promise.all(groups.slice(0, 5).map(async (group) => {
      const mapping = (mappings.data || []).find((row) => group.kind === 'individual'
        ? row.subject_id === group.sourceId : row.group_id === group.sourceId);
      if (!mapping) return { groupId: group.id, configured: false };
      const [inventory, recordings] = await Promise.all([
        listDriveRecordingFolderFiles(mapping.drive_folder_id), listDriveRecordings(mapping.drive_folder_id),
      ]);
      const chats = inventory.filter(isDriveRecordingChatFile);
      const fileTypes: Record<string, number> = {};
      for (const file of inventory) fileTypes[file.mimeType] = (fileTypes[file.mimeType] || 0) + 1;
      const otherFiles = inventory.filter(file => !file.mimeType.startsWith('video/') && !isDriveRecordingChatFile(file))
        .slice(0, 5).map(file => ({ name: file.name, mimeType: file.mimeType, bytes: file.size }));
      const pairs = recordings.flatMap((recording) => (recording.chatFiles || []).map((chat) => ({ recording, chat })));
      const unpaired = chats.filter((chat) => !pairs.some((pair) => pair.chat.id === chat.id));
      const video = recordings[0] ? await probe(recordings[0].id, group.id, 'HEAD') : null;
      const checks = await Promise.all(pairs.slice(0, 2).map(async ({ recording, chat }) => {
        const [allowed, denied] = await Promise.all([
          probe(chat.id, group.id, 'GET', recording.id), probe(chat.id, group.id, 'GET', recording.id, false),
        ]);
        const contentType = allowed.headers.get('content-type');
        const body = allowed.ok ? Buffer.from(await allowed.arrayBuffer()) : Buffer.alloc(0);
        return { status: allowed.status, copiedUrlStatus: denied.status, contentType, bytes: body.byteLength,
          valid: allowed.status === 200 && contentType === 'text/plain; charset=utf-8'
            && body.byteLength === chat.size && denied.status === 401,
          ...(allowed.ok ? { sha256: createHash('sha256').update(body).digest('hex') } : {}),
        };
      }));
      return { groupId: group.id, configured: true, inventory: inventory.length, fileTypes, otherFiles, retainedVideos: recordings.length,
        chatFiles: chats.length, pairedChats: pairs.length, videoStatus: video?.status ?? null, checks,
        unpairedNames: unpaired.slice(0, 5).map((file) => file.name),
        ...(unpaired.length ? { recordingNames: recordings.slice(0, 5).map((file) => file.name) } : {}) };
    }));
    return res.status(200).json({ groups: groups.length, truncated: groups.length > 5, results });
  } catch {
    // Provider error bodies and credentials must never leak into this response.
    return res.status(502).json({ error: 'Recording verification failed' });
  }
}
