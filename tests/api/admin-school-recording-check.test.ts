import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), inventory: vi.fn(), recordings: vi.fn(), from: vi.fn() }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({ serviceSupabase: () => ({ from: mocks.from }) }));
vi.mock('../../api/_lib/schoolRecordingAccess.js', () => ({ resolveRecordingViewerAccess: mocks.access }));
vi.mock('../../api/_lib/googleDriveRecordings.js', () => ({
  listDriveRecordingFolderFiles: mocks.inventory, listDriveRecordings: mocks.recordings,
}));
import handler from '../../api/admin-school-recording-check';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const groupId = '33333333-3333-4333-8333-333333333333';
function response() {
  const result = { status: 0, body: null as any };
  const res: any = { setHeader: vi.fn(), status(code: number) { result.status = code; return res; },
    json(body: unknown) { result.body = body; } };
  return { result, res };
}
function request(headers = { 'x-internal-key': 'service-key' }, query = { organizationId, userId }) {
  return { method: 'GET', headers, query } as any;
}
describe('read-only production recording check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('SCHOOL_RECORDING_STREAM_SECRET', 'recording-secret');
    vi.stubEnv('APP_URL', 'https://tutlio.lt');
    mocks.access.mockResolvedValue({ groups: [{ id: groupId, sourceId: groupId,
      organizationId, kind: 'class_group' }] });
    mocks.from.mockReturnValue({ select: () => ({ eq: async () => ({ error: null,
      data: [{ group_id: groupId, drive_folder_id: 'PRIVATE-FOLDER' }] }) }) });
    const chat = { id: 'chat', name: 'Lesson.sbv', mimeType: 'text/plain', size: 7 };
    mocks.inventory.mockResolvedValue([chat]);
    mocks.recordings.mockResolvedValue([{ id: 'video', chatFiles: [chat] }]);
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if (!init.headers || !('Cookie' in init.headers)) return new Response(null, { status: 401 });
      if (init.method === 'HEAD') return new Response(null, { status: 206 });
      return new Response('PRIVATE', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('denies public and signed-in callers without the internal key before reading data', async () => {
    const { res, result } = response();
    await handler(request({} as any), res);
    expect(result.status).toBe(401);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it('requires an exact organization and viewer scope', async () => {
    const { res, result } = response();
    await handler(request(undefined, { organizationId: 'invalid', userId }), res);
    expect(result.status).toBe(400);
    mocks.access.mockResolvedValue({ groups: [{ organizationId: userId }] });
    await handler(request(), res);
    expect(result.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('probes the real stream without returning private messages, folder IDs or credentials', async () => {
    const { res, result } = response();
    await handler(request(), res);
    expect(result.status).toBe(200);
    expect(result.body.results[0]).toMatchObject({ videoStatus: 206, pairedChats: 1,
      fileTypes: { 'text/plain': 1 },
      checks: [{ status: 200, copiedUrlStatus: 401, bytes: 7, valid: true }] });
    expect(vi.mocked(fetch).mock.calls.every(([url]) => new URL(String(url)).origin === 'https://www.tutlio.lt')).toBe(true);
    expect(JSON.stringify(result.body)).not.toMatch(/PRIVATE|service-key|recording-secret|tutlio_recording_viewer/);
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith('school_recording_drive_folders');
  });
  it('keeps a failed access probe visible and never exposes provider error bodies', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));
    const { res, result } = response();
    await handler(request(), res);
    expect(result.body.results[0].checks[0].valid).toBe(false);
    mocks.inventory.mockRejectedValue(new Error('PRIVATE PROVIDER CREDENTIAL'));
    await handler(request(), res);
    expect(result).toEqual({ status: 502, body: { error: 'Recording verification failed' } });
  });
});
