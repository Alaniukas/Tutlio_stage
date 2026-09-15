import type { SupabaseClient } from '@supabase/supabase-js';
import {
  listDriveRecordings,
  recordingRetentionDays,
} from './googleDriveRecordings.js';
import { createSchoolHomeworkRecordingTicket } from './schoolRecordingTicket.js';

export type HomeworkRecordingFile = {
  id: string;
  name: string;
  recordedAt: string | null;
  durationMillis: number | null;
  size: number | null;
  streamUrl: string;
};

export type HomeworkRecordingGroup = {
  id: string;
  name: string;
  recordings: HomeworkRecordingFile[];
  loadError: string | null;
  pending?: boolean;
};

export function schoolRecordingsFeatureOn(features: Record<string, unknown> | null | undefined): boolean {
  return features?.school_lesson_recordings === true;
}

/** Homework GET already lists session files; Drive must not push it into a Vercel timeout. */
export const HOMEWORK_DRIVE_LIST_TIMEOUT_MS = 5_000;
export const HOMEWORK_RECORDING_GROUP_LIMIT = 8;

export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function mapRecordingFiles(
  studentId: string,
  groupId: string,
  recordings: Awaited<ReturnType<typeof listDriveRecordings>>,
): HomeworkRecordingFile[] {
  return recordings.map((file) => {
    const ticket = createSchoolHomeworkRecordingTicket({
      studentId,
      groupId,
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
  });
}

/**
 * Drive recordings for the groups this student currently belongs to.
 * The homework page first asks for group names only (`listFiles: false`) so
 * Google Drive cannot stall lessons/files. Videos load per selected group.
 */
export async function listHomeworkGroupRecordings(
  supabase: SupabaseClient,
  params: {
    studentId: string;
    organizationId: string;
    memberGroupIds: Iterable<string>;
    recordingsEnabled: boolean;
    listFiles?: boolean;
    groupId?: string;
  },
): Promise<{ retentionDays: number; groups: HomeworkRecordingGroup[] }> {
  const retentionDays = recordingRetentionDays();
  const groupIds = [...new Set([...params.memberGroupIds].filter(Boolean))];
  if (!params.recordingsEnabled || !groupIds.length) {
    return { retentionDays, groups: [] };
  }

  const [{ data: groupRows, error: groupError }, { data: mappings, error: mappingError }] = await Promise.all([
    supabase
      .from('school_class_groups')
      .select('id, name, organization_id')
      .eq('organization_id', params.organizationId)
      .in('id', groupIds),
    supabase
      .from('school_recording_drive_folders')
      .select('group_id, organization_id, drive_folder_id')
      .eq('organization_id', params.organizationId)
      .in('group_id', groupIds),
  ]);
  if (groupError) throw groupError;
  if (mappingError) {
    const setupMissing = mappingError.code === '42P01' || /school_recording_drive_folders/i.test(mappingError.message || '');
    if (setupMissing) return { retentionDays, groups: [] };
    throw mappingError;
  }

  const mappingByGroup = new Map(
    ((mappings || []) as Array<{ group_id: string; drive_folder_id: string }>)
      .filter((row) => row.group_id && row.drive_folder_id)
      .map((row) => [row.group_id, row.drive_folder_id]),
  );
  const requestedGroupId = String(params.groupId || '').trim();
  const groups = ((groupRows || []) as Array<{ id: string; name: string | null }>)
    .filter((row) => mappingByGroup.has(row.id))
    .filter((row) => !requestedGroupId || row.id === requestedGroupId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'lt'))
    .slice(0, HOMEWORK_RECORDING_GROUP_LIMIT);

  if (!params.listFiles) {
    return {
      retentionDays,
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name || '',
        recordings: [],
        loadError: null,
        pending: true,
      })),
    };
  }

  const listed = await Promise.all(groups.map(async (group) => {
    const folderId = mappingByGroup.get(group.id)!;
    try {
      const recordings = await withTimeout(
        listDriveRecordings(folderId),
        HOMEWORK_DRIVE_LIST_TIMEOUT_MS,
        'Drive list timed out',
      );
      return {
        id: group.id,
        name: group.name || '',
        recordings: mapRecordingFiles(params.studentId, group.id, recordings),
        loadError: null,
        pending: false,
      } satisfies HomeworkRecordingGroup;
    } catch (error) {
      console.error('[school-homework] Drive list failed', group.id, (error as Error)?.message);
      return {
        id: group.id,
        name: group.name || '',
        recordings: [],
        loadError: 'Įrašai laikinai nepasiekiami.',
        pending: false,
      } satisfies HomeworkRecordingGroup;
    }
  }));

  return {
    retentionDays,
    groups: requestedGroupId
      ? listed
      : listed.filter((group) => group.recordings.length > 0 || Boolean(group.loadError)),
  };
}
