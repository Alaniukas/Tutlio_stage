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
import { recordingSlotScope, recordingSlotTags, recordingVisibleToScope } from './_lib/schoolRecordingSlotAccess.js';
import { schoolMemberSlotKey } from '../src/lib/schoolClassGroups.js';
import {
  createSchoolRecordingTicket,
  createSchoolRecordingViewerSession,
} from './_lib/schoolRecordingTicket.js';

type FolderMapping = {
  group_id: string | null;
  subject_id: string | null;
  organization_id: string;
  drive_folder_id: string;
  drive_folder_name: string | null;
};

function firstQueryValue(value: string | string[] | undefined): string {
  return String(Array.isArray(value) ? value[0] || '' : value || '').trim();
}

function mappingTargetId(mapping: FolderMapping): string {
  return mapping.subject_id ? `subject:${mapping.subject_id}` : String(mapping.group_id || '');
}

function publicGroup(group: {
  id: string;
  kind: 'class_group' | 'individual';
  organizationId: string;
  name: string;
}, mapping?: FolderMapping) {
  return {
    id: group.id,
    kind: group.kind,
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
    let mappings: FolderMapping[] = [];
    if (access.organizationIds.length) {
      const { data, error } = await supabase
        .from('school_recording_drive_folders')
        .select('group_id, subject_id, organization_id, drive_folder_id, drive_folder_name')
        .in('organization_id', access.organizationIds);
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

    const allowedTargetIds = new Set(access.groups.map((group) => group.id));
    const mappingByGroup = new Map(
      mappings
        .map((mapping) => [mappingTargetId(mapping), mapping] as const)
        .filter(([targetId]) => allowedTargetIds.has(targetId)),
    );
    const requestedGroupId = firstQueryValue(req.query?.groupId);
    if (requestedGroupId && !access.groups.some((group) => group.id === requestedGroupId)) {
      return res.status(404).json({ error: 'Grupė arba individuali pamoka nerasta.' });
    }
    const groups = await Promise.all(access.groups.map(async (group) => {
      const mapping = mappingByGroup.get(group.id);
      const canManageGroup = access.canManage && access.adminOrganizationId === group.organizationId;
      const base = { ...publicGroup(group, mapping), canManage: canManageGroup };
      const manageFields = canManageGroup ? {
        driveFolderId: mapping?.drive_folder_id || '',
        driveFolderName: mapping?.drive_folder_name || null,
      } : {};
      if (!mapping) {
        return {
          ...base,
          ...manageFields,
          recordings: [],
          recordingsPending: false,
        };
      }
      if (!requestedGroupId || group.id !== requestedGroupId) {
        return {
          ...base,
          ...(canManageGroup ? {
            driveFolderId: mapping.drive_folder_id,
            driveFolderName: mapping.drive_folder_name,
          } : {}),
          recordings: [],
          recordingsPending: true,
        };
      }
      try {
        const recordings = await listDriveRecordings(mapping.drive_folder_id);
        const classGroup = group.kind === 'class_group';
        const [scope, tags, groupSlots] = classGroup
          ? await Promise.all([
              recordingSlotScope(
                supabase,
                group.sourceId,
                access.studentIds || [],
                access.adminOrganizationId === group.organizationId || group.tutorId === auth.userId,
              ),
              recordingSlotTags(supabase, group.sourceId),
              canManageGroup
                ? supabase.from('school_class_group_slots').select('weekday, start_time').eq('group_id', group.sourceId)
                : Promise.resolve({ data: [], error: null }),
            ])
          : [{ unrestricted: true, schedules: [] }, new Map(), { data: [], error: null }] as const;
        if (groupSlots.error) throw groupSlots.error;
        const visible = classGroup
          ? recordings.filter((file) => recordingVisibleToScope(scope, tags.get(file.id) || null))
          : recordings;
        return {
          ...base,
          ...(canManageGroup ? {
            driveFolderId: mapping.drive_folder_id,
            driveFolderName: mapping.drive_folder_name,
          } : {}),
          ...(canManageGroup && classGroup ? {
            slots: (groupSlots.data || []).map((slot) => ({ weekday: Number(slot.weekday), start_time: String(slot.start_time).slice(0, 5) })),
          } : {}),
          recordings: visible.map((file) => {
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
              ...(canManageGroup && classGroup ? { slot: tags.get(file.id) || null } : {}),
              streamUrl: `/api/school-lesson-recording-stream?t=${encodeURIComponent(ticket)}`,
            };
          }),
          loadError: null,
          recordingsPending: false,
        };
      } catch (error) {
        console.error('[school-recordings] Drive list failed', group.id, (error as Error)?.message);
        return {
          ...base,
          ...(canManageGroup ? {
            driveFolderId: mapping.drive_folder_id,
            driveFolderName: mapping.drive_folder_name,
          } : {}),
          recordings: [],
          loadError: canManageGroup
            ? 'Nepavyko perskaityti šio Drive aplanko. Patikrinkite, ar jis bendrinamas su tarnybine paskyra.'
            : 'Įrašai laikinai nepasiekiami.',
          recordingsPending: false,
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
    if (!group) return res.status(404).json({ error: 'Grupė arba individuali pamoka nerasta.' });
    if (access.adminOrganizationId !== group.organizationId) {
      return res.status(403).json({ error: 'Insufficient organization permission' });
    }

    if (body.action === 'assign_slot') {
      if (group.kind !== 'class_group') return res.status(400).json({ error: 'Laiką galima priskirti tik grupės įrašui.' });
      const fileId = String(body.fileId || '').trim();
      if (!fileId) return res.status(400).json({ error: 'Trūksta įrašo ID.' });
      const { data: mapping, error: mappingError } = await supabase.from('school_recording_drive_folders')
        .select('drive_folder_id').eq('group_id', group.sourceId).eq('organization_id', group.organizationId).maybeSingle();
      if (mappingError || !mapping?.drive_folder_id) return res.status(404).json({ error: 'Grupės įrašų aplankas nerastas.' });
      const file = await getDriveFileMetadata(fileId).catch(() => null);
      if (!file || !file.mimeType.startsWith('video/') || !file.parents.includes(mapping.drive_folder_id)) {
        return res.status(400).json({ error: 'Įrašas nepriklauso šios grupės aplankui.' });
      }
      if (body.slot == null) {
        const { error } = await supabase.from('school_recording_file_slots').delete()
          .eq('group_id', group.sourceId).eq('drive_file_id', fileId);
        if (error) return res.status(500).json({ error: 'Nepavyko pašalinti įrašo laiko.' });
        return res.status(200).json({ ok: true });
      }
      const rawSlot = body.slot as { weekday?: unknown; start_time?: unknown };
      const slot = { weekday: Number(rawSlot.weekday), start_time: String(rawSlot.start_time || '').slice(0, 5) };
      if (!Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6 || !/^\d{2}:\d{2}$/.test(slot.start_time)) {
        return res.status(400).json({ error: 'Neteisingas grupės laikas.' });
      }
      const { data: slots, error: slotsError } = await supabase.from('school_class_group_slots')
        .select('weekday, start_time').eq('group_id', group.sourceId);
      if (slotsError) return res.status(500).json({ error: 'Nepavyko patikrinti grupės laikų.' });
      if (!(slots || []).some((candidate) => schoolMemberSlotKey(candidate) === schoolMemberSlotKey(slot))) {
        return res.status(400).json({ error: 'Šis laikas nebėra grupės tvarkaraštyje.' });
      }
      const { error } = await supabase.from('school_recording_file_slots').upsert({
        group_id: group.sourceId,
        drive_file_id: fileId,
        weekday: slot.weekday,
        start_time: slot.start_time,
        assigned_by: auth.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'group_id,drive_file_id' });
      if (error) return res.status(500).json({ error: 'Nepavyko priskirti įrašo laikui.' });
      return res.status(200).json({ ok: true });
    }

    const rawFolder = String(body.driveFolderId || '').trim();
    if (!rawFolder) {
      const column = group.kind === 'individual' ? 'subject_id' : 'group_id';
      const { error } = await supabase
        .from('school_recording_drive_folders')
        .delete()
        .eq(column, group.sourceId)
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

    const conflictColumn = group.kind === 'individual' ? 'subject_id' : 'group_id';
    const { error } = await supabase
      .from('school_recording_drive_folders')
      .upsert({
        group_id: group.kind === 'class_group' ? group.sourceId : null,
        subject_id: group.kind === 'individual' ? group.sourceId : null,
        organization_id: group.organizationId,
        drive_folder_id: folder.id,
        drive_folder_name: folder.name,
        configured_by: auth.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: conflictColumn });
    if (error) {
      const duplicate = error.code === '23505';
      return res.status(duplicate ? 409 : 500).json({
        error: duplicate
          ? 'Šis Drive aplankas jau priskirtas kitai grupei arba individualiai pamokai.'
          : 'Nepavyko išsaugoti Drive aplanko priskyrimo.',
      });
    }
    return res.status(200).json({ ok: true, folderId: folder.id, folderName: folder.name });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
}
