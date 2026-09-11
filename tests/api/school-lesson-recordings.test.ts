import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyAuth: vi.fn(),
  resolveAccess: vi.fn(),
  listRecordings: vi.fn(),
  createTicket: vi.fn(),
  createViewerSession: vi.fn(),
  mappings: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.verifyAuth }));
vi.mock('../../api/_lib/schoolRecordingAccess.js', () => ({
  resolveRecordingViewerAccess: mocks.resolveAccess,
}));
vi.mock('../../api/_lib/googleDriveRecordings.js', () => ({
  extractGoogleDriveId: vi.fn(),
  getDriveFileMetadata: vi.fn(),
  listDriveRecordings: mocks.listRecordings,
  recordingRetentionDays: () => 30,
}));
vi.mock('../../api/_lib/schoolRecordingTicket.js', () => ({
  createSchoolRecordingTicket: mocks.createTicket,
  createSchoolRecordingViewerSession: mocks.createViewerSession,
}));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({
  serviceSupabase: () => ({
    from: () => {
      const query: any = {
        select: () => query,
        in: async () => ({ data: mocks.mappings, error: null }),
      };
      return query;
    },
  }),
}));

import handler from '../../api/school-lesson-recordings';

function mockRes() {
  const output = { statusCode: 0, body: null as any };
  return {
    setHeader: vi.fn(),
    status(code: number) { output.statusCode = code; return this; },
    json(body: unknown) { output.body = body; return this; },
    getResult: () => output,
  };
}

describe('GET /api/school-lesson-recordings', () => {
  beforeEach(() => {
    mocks.verifyAuth.mockReset().mockResolvedValue({ userId: 'student-user', isInternal: false });
    mocks.resolveAccess.mockReset().mockResolvedValue({
      groups: [{ id: 'group-allowed', organizationId: 'org-1', name: '7 klasė', tutorId: 'teacher-1' }],
      organizationIds: ['org-1'],
      canManage: false,
      isAdmin: false,
      isTutor: false,
      isStudentOrParent: true,
    });
    mocks.mappings = [{
      group_id: 'group-allowed',
      organization_id: 'org-1',
      drive_folder_id: 'private-folder-id',
      drive_folder_name: 'Private group folder',
    }];
    mocks.listRecordings.mockReset().mockResolvedValue([{
      id: 'drive-file-id',
      name: 'Pamoka.mp4',
      mimeType: 'video/mp4',
      createdTime: '2026-09-10T10:00:00Z',
      modifiedTime: '2026-09-10T10:00:00Z',
      size: 1234,
      parents: ['private-folder-id'],
      canDownload: true,
      durationMillis: 3600000,
    }]);
    mocks.createTicket.mockReset().mockReturnValue('signed-playback-ticket');
    mocks.createViewerSession.mockReset().mockReturnValue('signed-viewer-session');
  });

  it('returns only the resolved group and a Tutlio stream URL, never the private Drive location', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: {}, headers: {} } as any, res as any);

    const result = res.getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body.groups).toHaveLength(1);
    expect(result.body.groups[0].recordings[0].streamUrl).toContain('/api/school-lesson-recording-stream?t=');
    expect(result.body.groups[0].driveFolderId).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain('private-folder-id');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('HttpOnly; SameSite=Strict; Path=/api/school-lesson-recording-stream'),
    );
    expect(mocks.createTicket).toHaveBeenCalledWith({
      userId: 'student-user',
      groupId: 'group-allowed',
      fileId: 'drive-file-id',
    });
  });

  it('does not touch Drive when the viewer has no authorized groups', async () => {
    mocks.resolveAccess.mockResolvedValue({
      groups: [],
      organizationIds: [],
      canManage: false,
      isAdmin: false,
      isTutor: false,
      isStudentOrParent: true,
    });
    const res = mockRes();
    await handler({ method: 'GET', query: {}, headers: {} } as any, res as any);

    expect(res.getResult()).toMatchObject({ statusCode: 200, body: { groups: [] } });
    expect(mocks.listRecordings).not.toHaveBeenCalled();
  });
});
