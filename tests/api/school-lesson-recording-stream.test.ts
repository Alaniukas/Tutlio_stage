import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyTicket: vi.fn(),
  verifyViewerSession: vi.fn(),
  verifyHomeworkTicket: vi.fn(),
  resolveAccess: vi.fn(),
  resolveHomeworkGroup: vi.fn(),
  getMetadata: vi.fn(),
  fetchRange: vi.fn(),
  mapping: { drive_folder_id: 'folder-allowed' } as Record<string, unknown> | null,
  slotScope: vi.fn(),
  slotTag: vi.fn(),
  legacyPublication: vi.fn(),
}));

vi.mock('../../api/_lib/schoolMaterialPublications.js', () => ({
  schoolRecordingPublicationAllowsLegacyAccess: mocks.legacyPublication,
}));

vi.mock('../../api/_lib/schoolRecordingTicket.js', () => ({
  verifySchoolRecordingTicket: mocks.verifyTicket,
  verifySchoolRecordingViewerSession: mocks.verifyViewerSession,
  verifySchoolHomeworkRecordingTicket: mocks.verifyHomeworkTicket,
}));
vi.mock('../../api/_lib/schoolRecordingAccess.js', () => ({
  resolveRecordingViewerAccess: mocks.resolveAccess,
  resolveHomeworkRecordingGroup: mocks.resolveHomeworkGroup,
}));
vi.mock('../../api/_lib/schoolRecordingSlotAccess.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../api/_lib/schoolRecordingSlotAccess')>(),
  recordingSlotScope: mocks.slotScope,
  recordingSlotTag: mocks.slotTag,
}));
vi.mock('../../api/_lib/googleDriveRecordings.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../api/_lib/googleDriveRecordings')>(),
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

function withChat(text = '00:00:01.000,00:00:02.000\nTeacher: x² + y² = z²') {
  const video = {
    id: 'file-a', name: 'Pamoka.mp4', mimeType: 'video/mp4',
    createdTime: '2026-09-10T10:00:00Z', modifiedTime: '2026-09-10T10:00:00Z',
    size: 1000, parents: ['folder-allowed'], canDownload: true,
  };
  const chat = { ...video, id: 'chat-a', name: 'Pamoka.sbv', mimeType: 'application/octet-stream', size: Buffer.byteLength(text) };
  const ticket = { userId: 'student-user', groupId: 'group-a', fileId: 'chat-a', recordingFileId: 'file-a' };
  mocks.verifyTicket.mockReturnValue(ticket);
  mocks.getMetadata.mockImplementation(async (id) => id === 'chat-a' ? chat : video);
  mocks.fetchRange.mockResolvedValue(new Response(text));
  return { chat, video, ticket, text };
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
    mocks.verifyHomeworkTicket.mockReset().mockReturnValue(null);
    mocks.resolveHomeworkGroup.mockReset().mockResolvedValue({
      id: 'group-a',
      sourceId: 'group-a',
      kind: 'class_group',
      organizationId: 'org-a',
    });
    mocks.resolveAccess.mockReset().mockResolvedValue({
      groups: [{
        id: 'group-a',
        sourceId: 'group-a',
        kind: 'class_group',
        organizationId: 'org-a',
        name: 'A',
        tutorId: 'teacher-a',
      }],
      organizationIds: ['org-a'],
      canManage: false,
      isAdmin: false,
      isTutor: false,
      isStudentOrParent: true,
      studentIds: ['student-row'],
      adminOrganizationId: null,
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
    mocks.slotScope.mockReset().mockResolvedValue({ unrestricted: true, schedules: [] });
    mocks.slotTag.mockReset().mockResolvedValue(null);
    mocks.legacyPublication.mockReset().mockResolvedValue(true);
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

  it('rejects an old playback ticket after a child is restricted to another day', async () => {
    mocks.slotScope.mockResolvedValue({ unrestricted: false, schedules: [[{ weekday: 4, start_time: '11:00' }]] });
    mocks.slotTag.mockResolvedValue({ weekday: 2, start_time: '11:00' });
    const res = mockRes();
    await handler({ method: 'HEAD', query: { t: 'signed' }, headers: {} } as any, res);
    expect(res.getResult().statusCode).toBe(403);
    expect(mocks.fetchRange).not.toHaveBeenCalled();
  });

  it('re-checks access on the next range even when the playback ticket and viewer cookie still work', async () => {
    const first = mockRes();
    await handler({ method: 'HEAD', query: { t: 'signed' }, headers: { range: 'bytes=0-999' } } as any, first);
    expect(first.getResult().statusCode).toBe(206);
    // An admin revoked the viewer between requests; the signed ticket is unchanged.
    mocks.resolveAccess.mockResolvedValue({ groups: [], organizationIds: [], studentIds: [] });
    const next = mockRes();
    await handler({ method: 'HEAD', query: { t: 'signed' }, headers: { range: 'bytes=1000-1999' } } as any, next);
    expect(next.getResult().statusCode).toBe(403);
    expect(mocks.resolveAccess).toHaveBeenCalledTimes(2);
    expect(mocks.getMetadata).toHaveBeenCalledTimes(1);
  });

  it('lets a homework HMAC ticket stream without a Tutlio login cookie', async () => {
    mocks.verifyHomeworkTicket.mockReturnValue({
      studentId: 'student-row',
      groupId: 'group-a',
      fileId: 'file-a',
      expiresAt: 9999999999,
    });
    const res = mockRes();
    await handler({ method: 'HEAD', query: { t: 'homework' }, headers: {} } as any, res);

    expect(res.getResult().statusCode).toBe(206);
    expect(mocks.verifyViewerSession).not.toHaveBeenCalled();
    expect(mocks.resolveAccess).not.toHaveBeenCalled();
    expect(mocks.resolveHomeworkGroup).toHaveBeenCalledWith(expect.anything(), 'student-row', 'group-a');
  });

  it('revokes a homework ticket after the student leaves the group', async () => {
    mocks.verifyHomeworkTicket.mockReturnValue({
      studentId: 'student-row',
      groupId: 'group-a',
      fileId: 'file-a',
      expiresAt: 9999999999,
    });
    mocks.resolveHomeworkGroup.mockResolvedValue(null);
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'homework' }, headers: {} } as any, res);

    expect(res.getResult().statusCode).toBe(403);
    expect(mocks.getMetadata).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD'])('checks anonymous publication privacy before every %s or Range response', async (method) => {
    mocks.verifyHomeworkTicket.mockReturnValue({ studentId: 'student-row', groupId: 'group-a', fileId: 'file-a' });
    mocks.resolveHomeworkGroup.mockResolvedValue({ id: 'group-a', sourceId: 'group-a', kind: 'class_group', organizationId: 'org-a', features: { school_family_portal: true } });
    mocks.getMetadata.mockResolvedValue({ id: 'file-a', name: 'Pamoka.mp4', mimeType: 'video/mp4', createdTime: '2026-09-10T10:00:00Z', modifiedTime: '2026-09-28T12:00:00Z', size: 1000, parents: ['folder-allowed'], canDownload: true });
    mocks.legacyPublication.mockResolvedValue(false);
    const res = mockRes();
    await handler({ method, query: { t: 'same-old-homework' }, headers: { range: 'bytes=0-99' } } as any, res);
    expect(res.getResult().statusCode).toBe(403);
    expect(mocks.legacyPublication).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ organizationId: 'org-a', targetId: 'group-a', fileId: 'file-a', modifiedTime: '2026-09-28T12:00:00Z', features: { school_family_portal: true } }));
    expect(mocks.fetchRange).not.toHaveBeenCalled();
  });

  it('rechecks a newly chosen no-recording plan for an already issued authenticated ticket', async () => {
    const first = mockRes();
    await handler({ method: 'HEAD', query: { t: 'signed' }, headers: {} } as any, first);
    expect(first.getResult().statusCode).toBe(206);
    mocks.slotScope.mockResolvedValue({ unrestricted: false, schedules: [] });
    const next = mockRes();
    await handler({ method: 'GET', query: { t: 'signed' }, headers: { range: 'bytes=100-199' } } as any, next);
    expect(next.getResult().statusCode).toBe(403);
    expect(mocks.slotScope).toHaveBeenCalledTimes(2);
    expect(mocks.fetchRange).not.toHaveBeenCalled();
    expect(mocks.legacyPublication).not.toHaveBeenCalled();
  });

  it('serves the complete authorized SBV as private plain text and uses the video slot', async () => {
    const { text, chat } = withChat('<script>alert(1)</script>\nTeacher: x² = 4');
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'chat' }, headers: {} } as any, res);
    const result = res.getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body?.toString()).toBe(text);
    expect(result.headers).toMatchObject({ 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store, max-age=0' });
    expect(mocks.fetchRange).toHaveBeenCalledWith('chat-a', { start: 0, end: chat.size - 1 });
    expect(mocks.slotTag).toHaveBeenCalledWith(expect.anything(), 'group-a', 'file-a');
  });

  it('denies a copied chat URL without the matching viewer cookie', async () => {
    withChat();
    mocks.verifyViewerSession.mockReturnValue(null);
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'chat' }, headers: {} } as any, res);
    expect(res.getResult().statusCode).toBe(401);
    expect(mocks.getMetadata).not.toHaveBeenCalled();
  });

  it.each(['– Chat', '– Chat transcript'])('streams a bounded extensionless Meet %s file through the authorized proxy', async (suffix) => {
    const { chat, video, text } = withChat();
    video.name = 'IT - Seniors - 2026/09/14 11:57 BST';
    chat.name = `${video.name} ${suffix}`;
    chat.mimeType = 'text/plain';
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'chat' }, headers: {} } as any, res);
    expect(res.getResult().statusCode).toBe(200);
    expect(res.getResult().body?.toString()).toBe(text);
    expect(res.getResult().headers['Content-Type']).toBe('text/plain; charset=utf-8');
  });

  it('applies the video day restriction to an untagged companion chat', async () => {
    withChat();
    mocks.slotScope.mockResolvedValue({ unrestricted: false, schedules: [[{ weekday: 4, start_time: '11:00' }]] });
    mocks.slotTag.mockResolvedValue({ weekday: 2, start_time: '11:00' });
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'chat' }, headers: {} } as any, res);
    expect(res.getResult().statusCode).toBe(403);
    expect(mocks.fetchRange).not.toHaveBeenCalled();
  });

  it.each(['unbound', 'other-folder', 'other-name', 'oversized'])('rejects a %s chat before fetching its content', async (reason) => {
    const { ticket, video, chat } = withChat();
    if (reason === 'unbound') mocks.verifyTicket.mockReturnValue({ ...ticket, recordingFileId: undefined });
    if (reason === 'other-folder') video.parents = ['another-folder'];
    if (reason === 'other-name') video.name = 'Other lesson.mp4';
    if (reason === 'oversized') chat.size = 1024 * 1024 + 1;
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'chat' }, headers: {} } as any, res);
    expect(res.getResult().statusCode).toBe(404);
    expect(mocks.fetchRange).not.toHaveBeenCalled();
  });

  it('revokes an existing chat ticket when the current group relationship is removed', async () => {
    withChat();
    const first = mockRes();
    await handler({ method: 'HEAD', query: { t: 'chat' }, headers: {} } as any, first);
    expect(first.getResult().statusCode).toBe(200);
    mocks.resolveAccess.mockResolvedValue({ groups: [], organizationIds: [] });
    const next = mockRes();
    await handler({ method: 'GET', query: { t: 'chat' }, headers: {} } as any, next);
    expect(next.getResult().statusCode).toBe(403);
    expect(mocks.fetchRange).not.toHaveBeenCalled();
  });

  it('does not expose a new chat through a legacy homework link to an older allowed video', async () => {
    const { ticket } = withChat();
    mocks.verifyHomeworkTicket.mockReturnValue({ studentId: 'student-row', groupId: ticket.groupId, fileId: ticket.fileId, recordingFileId: ticket.recordingFileId });
    mocks.legacyPublication.mockImplementation(async (_db, publication) => publication.fileId === 'file-a');
    const res = mockRes();
    await handler({ method: 'GET', query: { t: 'homework-chat' }, headers: {} } as any, res);
    expect(res.getResult().statusCode).toBe(403);
    expect(mocks.legacyPublication).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ fileId: 'chat-a' }));
    expect(mocks.fetchRange).not.toHaveBeenCalled();
  });
});
