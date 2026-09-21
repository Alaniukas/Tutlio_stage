import type { SupabaseClient } from '@supabase/supabase-js';
import {
  listDriveRecordings,
  recordingRetentionDays,
} from './googleDriveRecordings.js';
import { createSchoolHomeworkRecordingTicket } from './schoolRecordingTicket.js';
import { recordingSlotScope, recordingSlotTags, recordingVisibleToScope } from './schoolRecordingSlotAccess.js';

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
  targetId: string,
  recordings: Awaited<ReturnType<typeof listDriveRecordings>>,
): HomeworkRecordingFile[] {
  return recordings.map((file) => {
    const ticket = createSchoolHomeworkRecordingTicket({
      studentId,
      groupId: targetId,
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
  if (!params.recordingsEnabled) {
    return { retentionDays, groups: [] };
  }

  const groupQuery = groupIds.length
    ? supabase
      .from('school_class_groups')
      .select('id, name, organization_id')
      .eq('organization_id', params.organizationId)
      .in('id', groupIds)
    : Promise.resolve({ data: [], error: null });
  const [{ data: groupRows, error: groupError }, { data: recurringRows, error: recurringError }, { data: mappings, error: mappingError }] = await Promise.all([
    groupQuery,
    supabase
      .from('recurring_individual_sessions')
      .select('subject_id, subject:subjects(id, name), tutor:profiles!recurring_individual_sessions_tutor_id_fkey!inner(organization_id)')
      .eq('student_id', params.studentId)
      .eq('active', true)
      .eq('tutor.organization_id', params.organizationId),
    supabase
      .from('school_recording_drive_folders')
      .select('group_id, subject_id, organization_id, drive_folder_id')
      .eq('organization_id', params.organizationId),
  ]);
  if (groupError) throw groupError;
  if (recurringError) throw recurringError;
  if (mappingError) {
    const setupMissing = mappingError.code === '42P01' || /school_recording_drive_folders/i.test(mappingError.message || '');
    if (setupMissing) return { retentionDays, groups: [] };
    throw mappingError;
  }

  const mappingByGroup = new Map(
    ((mappings || []) as Array<{ group_id: string | null; subject_id: string | null; drive_folder_id: string }>)
      .filter((row) => (row.group_id || row.subject_id) && row.drive_folder_id)
      .map((row) => [row.subject_id ? `subject:${row.subject_id}` : row.group_id!, row.drive_folder_id]),
  );
  const requestedGroupId = String(params.groupId || '').trim();
  const subjectsById = new Map<string, string>();
  for (const raw of (recurringRows || []) as Array<{
    subject_id: string | null;
    subject?: { id?: string; name?: string | null } | Array<{ id?: string; name?: string | null }> | null;
  }>) {
    const subject = Array.isArray(raw.subject) ? raw.subject[0] : raw.subject;
    if (raw.subject_id && subject?.id === raw.subject_id) {
      subjectsById.set(raw.subject_id, String(subject.name || ''));
    }
  }
  const groups = [
    ...((groupRows || []) as Array<{ id: string; name: string | null }>).map((row) => ({
      id: row.id,
      name: row.name || '',
    })),
    ...[...subjectsById].map(([subjectId, name]) => ({
      id: `subject:${subjectId}`,
      name,
    })),
  ]
    .filter((row) => mappingByGroup.has(row.id))
    .filter((row) => !requestedGroupId || row.id === requestedGroupId)
    .sort((a, b) => a.name.localeCompare(b.name, 'lt'))
    .slice(0, HOMEWORK_RECORDING_GROUP_LIMIT);

  if (!params.listFiles) {
    return {
      retentionDays,
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
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
      const visible = group.id.startsWith('subject:')
        ? recordings
        : await (async () => {
            const [scope, tags] = await Promise.all([
              recordingSlotScope(supabase, group.id, [params.studentId]),
              recordingSlotTags(supabase, group.id),
            ]);
            return recordings.filter((file) => recordingVisibleToScope(scope, tags.get(file.id) || null));
          })();
      return {
        id: group.id,
        name: group.name,
        recordings: mapRecordingFiles(params.studentId, group.id, visible),
        loadError: null,
        pending: false,
      } satisfies HomeworkRecordingGroup;
    } catch (error) {
      console.error('[school-homework] Drive list failed', group.id, (error as Error)?.message);
      return {
        id: group.id,
        name: group.name,
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
