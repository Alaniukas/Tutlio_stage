import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listDrive = vi.hoisted(() => vi.fn());

vi.mock('../../api/_lib/googleDriveRecordings.js', () => ({
  listDriveRecordings: listDrive,
  recordingRetentionDays: () => 30,
}));

import { listHomeworkGroupRecordings } from '../../api/_lib/schoolHomeworkRecordings';

function supabaseFixture(opts: {
  groups: Array<{ id: string; name: string; organization_id: string }>;
  mappings: Array<{ group_id: string; organization_id: string; drive_folder_id: string }>;
}) {
  return {
    from(table: string) {
      const query: any = {
        select: () => query,
        eq: () => query,
        in: () => query,
        then: (resolve: (value: unknown) => unknown) => {
          if (table === 'school_class_groups') return resolve({ data: opts.groups, error: null });
          if (table === 'school_recording_drive_folders') return resolve({ data: opts.mappings, error: null });
          return resolve({ data: [], error: null });
        },
      };
      return query;
    },
  } as any;
}

describe('listHomeworkGroupRecordings', () => {
  beforeEach(() => {
    listDrive.mockReset();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns nothing when the org flag is off or the child has no groups', async () => {
    const empty = await listHomeworkGroupRecordings(supabaseFixture({ groups: [], mappings: [] }), {
      studentId: 's1',
      organizationId: 'org-1',
      memberGroupIds: ['g1'],
      recordingsEnabled: false,
    });
    expect(empty.groups).toEqual([]);
    expect(listDrive).not.toHaveBeenCalled();

    const noGroups = await listHomeworkGroupRecordings(supabaseFixture({ groups: [], mappings: [] }), {
      studentId: 's1',
      organizationId: 'org-1',
      memberGroupIds: [],
      recordingsEnabled: true,
    });
    expect(noGroups.groups).toEqual([]);
  });

  it('lists only groups that have a Drive folder and signs a homework stream ticket', async () => {
    listDrive.mockResolvedValue([{
      id: 'file-1',
      name: 'Pamoka.mp4',
      createdTime: '2026-09-10T10:00:00Z',
      durationMillis: 60_000,
      size: 1_000,
    }]);
    const result = await listHomeworkGroupRecordings(supabaseFixture({
      groups: [
        { id: 'g1', name: 'Matematika', organization_id: 'org-1' },
        { id: 'g2', name: 'Be aplanko', organization_id: 'org-1' },
      ],
      mappings: [{ group_id: 'g1', organization_id: 'org-1', drive_folder_id: 'folder-1' }],
    }), {
      studentId: 'student-1',
      organizationId: 'org-1',
      memberGroupIds: ['g1', 'g2'],
      recordingsEnabled: true,
      listFiles: true,
    });

    expect(result.groups.map((group) => group.id)).toEqual(['g1']);
    expect(result.groups[0].recordings[0].name).toBe('Pamoka.mp4');
    expect(result.groups[0].recordings[0].streamUrl).toMatch(/^\/api\/school-lesson-recording-stream\?t=/);
    expect(listDrive).toHaveBeenCalledWith('folder-1');
  });

  it('omits mapped groups that have no videos so the homework page stays quiet', async () => {
    listDrive.mockResolvedValue([]);
    const result = await listHomeworkGroupRecordings(supabaseFixture({
      groups: [{ id: 'g1', name: 'Tuščia', organization_id: 'org-1' }],
      mappings: [{ group_id: 'g1', organization_id: 'org-1', drive_folder_id: 'folder-1' }],
    }), {
      studentId: 'student-1',
      organizationId: 'org-1',
      memberGroupIds: ['g1'],
      recordingsEnabled: true,
      listFiles: true,
    });
    expect(result.groups).toEqual([]);
  });

  it('returns mapped groups as pending without touching Drive on the first homework load', async () => {
    const result = await listHomeworkGroupRecordings(supabaseFixture({
      groups: [{ id: 'g1', name: 'Matematika', organization_id: 'org-1' }],
      mappings: [{ group_id: 'g1', organization_id: 'org-1', drive_folder_id: 'folder-1' }],
    }), {
      studentId: 'student-1',
      organizationId: 'org-1',
      memberGroupIds: ['g1'],
      recordingsEnabled: true,
    });
    expect(result.groups).toEqual([{
      id: 'g1',
      name: 'Matematika',
      recordings: [],
      loadError: null,
      pending: true,
    }]);
    expect(listDrive).not.toHaveBeenCalled();
  });

  it('keeps a Drive timeout as a per-group error instead of hanging the homework GET', async () => {
    vi.useFakeTimers();
    listDrive.mockImplementation(() => new Promise(() => {}));
    const pending = listHomeworkGroupRecordings(supabaseFixture({
      groups: [{ id: 'g1', name: 'Matematika', organization_id: 'org-1' }],
      mappings: [{ group_id: 'g1', organization_id: 'org-1', drive_folder_id: 'folder-1' }],
    }), {
      studentId: 'student-1',
      organizationId: 'org-1',
      memberGroupIds: ['g1'],
      recordingsEnabled: true,
      listFiles: true,
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].loadError).toBeTruthy();
    expect(result.groups[0].recordings).toEqual([]);
  });
});
