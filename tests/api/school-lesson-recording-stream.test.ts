import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyTicket: vi.fn(),
  verifyViewerSession: vi.fn(),
  resolveAccess: vi.fn(),
  getMetadata: vi.fn(),
  fetchRange: vi.fn(),
  mapping: { drive_folder_id: 'folder-allowed' } as Record<string, unknown> | null,
}));

vi.mock('../../api/_lib/schoolRecordingTicket.js', () => ({
  verifySchoolRecordingTicket: mocks.verifyTicket,
  verifySchoolRecordingViewerSession: mocks.verifyViewerSession,
}));
vi.mock('../../api/_lib/schoolRecordingAccess.js', () => ({
  resolveRecordingViewerAccess: mocks.resolveAccess,
}));
vi.mock('../../api/_lib/googleDriveRecordings.js', () => ({
  getDriveFileMetadata: mocks.getMetadata,
  fetchDriveRecordingRange: mocks.fetchRange,
  isRecordingWithinRetention: () => true,
  normalizeDriveByteRange: () => ({ start: 0, end: 999 }),
}));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({
  serviceSupabase: () => ({
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: mocks.mapping, error: null }),
      };
      return query;
    },
  }),
}));

import handler from '../../api/school-lesson-recording-stream';

function mockRes() {
  const output = { statusCode: 0, body: null as unknown, ended: false, headers: {} as Record<string, string> };
  const response: any = {
    headersSent: false,
    setHeader(name: string, value: string) { output.headers[name] = value; return response; },
    status(code: number) { output.statusCode = code; response.statusCode = code; return response; },
    json(body: unknown) { output.body = body; return response; },
    send(body: unknown) { output.body = body; return response; },
    end() { output.ended = true; return response; },
    destroy: vi.fn(),
    getResult: () => ({ ...output, statusCode: response.statusCode || output.statusCode }),
  };
  return response;
}

describe('GET /api/school-lesson-recording-stream', () => {
  beforeEach(() => {
    mocks.verifyTicket.mockReset().mockReturnValue({
      userId: 'student-user',
      groupId: 'group-a',
      fileId: 'file-a',
      expiresAt: 9999999999,
    });
    mocks.verifyViewerSession.mockReset().mockReturnValue({
      userId: 'student-user',
      expiresAt: 9999999999,
    });
    mocks.resolveAccess.mockReset().mockResolvedValue({
      groups: [{ id: 'group-a', organizationId: 'org-a', name: 'A', tutorId: 'teacher-a' }],
      organizationIds: ['org-a'],
      canManage: false,
      isAdmin: false,
      isTutor: false,
      isStudentOrParent: true,
    });
    mocks.mapping = { drive_folder_id: 'folder-allowed' };
    mocks.getMetadata.mockReset().mockResolvedValue({
      id: 'file-a',
      name: 'Pamoka.mp4',
      mimeType: 'video/mp4',
      createdTime: '2026-09-10T10:00:00Z',
      size: 1000,
      parents: ['folder-allowed'],
      canDownload: true,
    });
    mocks.fetchRange.mockReset();
  });

  it('rejects a copied playback URL when the browser has no matching viewer session', async () => {
    mocks.verifyViewerSession.mockReturnValue(null);
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'signed' }, headers: {} } as any, res);

    expect(res.getResult().statusCode).toBe(401);
    expect(mocks.resolveAccess).not.toHaveBeenCalled();
  });

  it('re-checks live group membership before looking up the Drive file', async () => {
    mocks.resolveAccess.mockResolvedValue({ groups: [], organizationIds: [] });
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'signed' }, headers: {} } as any, res);

    expect(res.getResult().statusCode).toBe(403);
    expect(mocks.getMetadata).not.toHaveBeenCalled();
  });

  it('denies a valid file ticket after the file is moved outside the assigned group folder', async () => {
    mocks.getMetadata.mockResolvedValue({
      id: 'file-a',
      name: 'Pamoka.mp4',
      mimeType: 'video/mp4',
      createdTime: '2026-09-10T10:00:00Z',
      size: 1000,
      parents: ['different-folder'],
      canDownload: true,
    });
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'signed' }, headers: {} } as any, res);

    expect(res.getResult().statusCode).toBe(404);
    expect(mocks.fetchRange).not.toHaveBeenCalled();
  });

  it('returns private range metadata for an authorized HEAD request without fetching media', async () => {
    const res = mockRes();
    await handler({ method: 'HEAD', query: { t: 'signed' }, headers: {} } as any, res);

    expect(res.getResult()).toMatchObject({
      statusCode: 206,
      ended: true,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Range': 'bytes 0-999/1000',
        'Content-Type': 'video/mp4',
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
    expect(mocks.fetchRange).not.toHaveBeenCalled();
  });
});
