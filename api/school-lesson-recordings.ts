import type { VercelRequest, VercelResponse } from './types';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import {
  extractGoogleDriveId,
  getDriveFileMetadata,
  listDriveRecordings,
  recordingRetentionDays,
} from './_lib/googleDriveRecordings.js';
import { resolveRecordingViewerAccess } from './_lib/schoolRecordingAccess.js';
import {
  createSchoolRecordingTicket,
  createSchoolRecordingViewerSession,
} from './_lib/schoolRecordingTicket.js';

type FolderMapping = {
  group_id: string;
  organization_id: string;
  drive_folder_id: string;
  drive_folder_name: string | null;
};

function firstQueryValue(value: string | string[] | undefined): string {
  return String(Array.isArray(value) ? value[0] || '' : value || '').trim();
}

function publicGroup(group: { id: string; organizationId: string; name: string }, mapping?: FolderMapping) {
  return {
    id: group.id,
    organizationId: group.organizationId,
    name: group.name,
    configured: Boolean(mapping),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId || auth.isInternal) return res.status(401).json({ error: 'Unauthorized' });
  const supabase = serviceSupabase();
  const requestedStudentId = firstQueryValue(req.query?.studentId) || undefined;

  let access: Awaited<ReturnType<typeof resolveRecordingViewerAccess>>;
  try {
    access = await resolveRecordingViewerAccess(supabase, auth.userId, requestedStudentId);
  } catch (error) {
    console.error('[school-recordings] access resolution failed', (error as Error)?.message);
    return res.status(500).json({ error: 'Nepavyko patikrinti prieigos prie įrašų.' });
  }

  if (req.method === 'GET') {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const secure = forwardedProto === 'https' ? '; Secure' : '';
    const viewerSession = createSchoolRecordingViewerSession(auth.userId);
    res.setHeader(
      'Set-Cookie',
      `tutlio_recording_viewer=${encodeURIComponent(viewerSession)}; HttpOnly; SameSite=Strict; Path=/api/school-lesson-recording-stream; Max-Age=7200${secure}`,
    );
    const groupIds = access.groups.map((group) => group.id);
    let mappings: FolderMapping[] = [];
    if (groupIds.length) {
      const { data, error } = await supabase
        .from('school_recording_drive_folders')
        .select('group_id, organization_id, drive_folder_id, drive_folder_name')
        .in('group_id', groupIds);
      if (error) {
        const setupMissing = error.code === '42P01' || /school_recording_drive_folders/i.test(error.message || '');
        return res.status(setupMissing ? 503 : 500).json({
          error: setupMissing
            ? 'Įrašų duomenų bazės migracija dar nepritaikyta.'
            : 'Nepavyko įkelti įrašų aplankų.',
          setupRequired: setupMissing,
        });
      }
      mappings = (data || []) as FolderMapping[];
    }

    const mappingByGroup = new Map(mappings.map((mapping) => [mapping.group_id, mapping]));
    const groups = await Promise.all(access.groups.map(async (group) => {
      const mapping = mappingByGroup.get(group.id);
      const base = publicGroup(group, mapping);
      if (!mapping) {
        return {
          ...base,
          ...(access.canManage ? { driveFolderId: '', driveFolderName: null } : {}),
          recordings: [],
        };
      }
      try {
        const recordings = await listDriveRecordings(mapping.drive_folder_id);
        return {
          ...base,
          ...(access.canManage ? {
            driveFolderId: mapping.drive_folder_id,
            driveFolderName: mapping.drive_folder_name,
          } : {}),
          recordings: recordings.map((file) => {
            const ticket = createSchoolRecordingTicket({
              userId: auth.userId!,
              groupId: group.id,
              fileId: file.id,
            });
            return {
              id: file.id,
              name: file.name,
              recordedAt: file.createdTime,
              durationMillis: file.durationMillis,
              size: file.size,
              streamUrl: `/api/school-lesson-recording-stream?t=${encodeURIComponent(ticket)}`,
            };
          }),
          loadError: null,
        };
      } catch (error) {
        console.error('[school-recordings] Drive list failed', group.id, (error as Error)?.message);
        return {
          ...base,
          ...(access.canManage ? {
            driveFolderId: mapping.drive_folder_id,
            driveFolderName: mapping.drive_folder_name,
          } : {}),
          recordings: [],
          loadError: access.canManage
            ? 'Nepavyko perskaityti šio Drive aplanko. Patikrinkite, ar jis bendrinamas su tarnybine paskyra.'
            : 'Įrašai laikinai nepasiekiami.',
        };
      }
    }));

    return res.status(200).json({
      ok: true,
      enabled: access.organizationIds.length > 0,
      canManage: access.canManage,
      retentionDays: recordingRetentionDays(),
      groups,
    });
  }

  if (req.method === 'PUT') {
    if (!access.canManage) return res.status(403).json({ error: 'Insufficient organization permission' });
    const body = (req.body || {}) as Record<string, unknown>;
    const groupId = String(body.groupId || '').trim();
    const group = access.groups.find((candidate) => candidate.id === groupId);
    if (!group) return res.status(404).json({ error: 'Grupė nerasta.' });

    const rawFolder = String(body.driveFolderId || '').trim();
    if (!rawFolder) {
      const { error } = await supabase
        .from('school_recording_drive_folders')
        .delete()
        .eq('group_id', group.id)
        .eq('organization_id', group.organizationId);
      if (error) return res.status(500).json({ error: 'Nepavyko pašalinti Drive aplanko priskyrimo.' });
      return res.status(200).json({ ok: true, removed: true });
    }

    const folderId = extractGoogleDriveId(rawFolder);
    if (!folderId) return res.status(400).json({ error: 'Neteisingas Google Drive aplanko ID arba URL.' });
    let folder;
    try {
      folder = await getDriveFileMetadata(folderId);
    } catch (error) {
      console.error('[school-recordings] Drive folder validation failed', (error as Error)?.message);
      return res.status(400).json({
        error: 'Aplankas nepasiekiamas. Bendrinkite jį su Tutlio tarnybine Google paskyra ir bandykite dar kartą.',
      });
    }
    if (folder.mimeType !== 'application/vnd.google-apps.folder') {
      return res.status(400).json({ error: 'Nurodyta nuoroda nėra Google Drive aplankas.' });
    }

    const { error } = await supabase
      .from('school_recording_drive_folders')
      .upsert({
        group_id: group.id,
        organization_id: group.organizationId,
        drive_folder_id: folder.id,
        drive_folder_name: folder.name,
        configured_by: auth.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'group_id' });
    if (error) {
      const duplicate = error.code === '23505';
      return res.status(duplicate ? 409 : 500).json({
        error: duplicate
          ? 'Šis Drive aplankas jau priskirtas kitai grupei.'
          : 'Nepavyko išsaugoti Drive aplanko priskyrimo.',
      });
    }
    return res.status(200).json({ ok: true, folderId: folder.id, folderName: folder.name });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}
