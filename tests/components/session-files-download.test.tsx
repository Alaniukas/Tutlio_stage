import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({ signed: vi.fn(), storageList: vi.fn(), fetch: vi.fn(), object: vi.fn(), revoke: vi.fn() }));
vi.mock('../../src/lib/supabase', () => ({ supabase: {
  from: () => { const query: any = { select: () => query, eq: () => query, in: () => query,
    single: async () => ({ data: null }), then: (resolve: (value: unknown) => void) => resolve({ data: [] }) }; return query; },
  storage: { from: () => ({ list: state.storageList, createSignedUrl: state.signed }) },
} }));
vi.mock('../../src/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer current-session' }) }));
vi.mock('../../src/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import SessionFiles from '../../src/components/SessionFiles';

const proxyUrl = '/api/school-material-file?student=child&session=lesson&folder=lesson&file=teacher.pdf';
const groupIds = ['lesson'];
let anchor: ReturnType<typeof vi.spyOn>;
function listing(file: Record<string, unknown>) {
  state.fetch.mockImplementation(async (url: string) => url === '/api/student-session-files'
    ? { ok: true, json: async () => ({ files: [{ name: 'teacher.pdf', folderId: 'lesson', size: 20, ...file }] }) }
    : { ok: true, blob: async () => new Blob(['material'], { type: 'application/pdf' }) });
}
beforeEach(() => {
  state.fetch.mockReset(); state.object.mockReset().mockReturnValue('blob:local-material'); state.revoke.mockReset();
  state.signed.mockReset().mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed' }, error: null });
  state.storageList.mockReset().mockResolvedValue({ data: [{ name: 'teacher.pdf', metadata: { size: 20 } }], error: null });
  vi.stubGlobal('fetch', state.fetch);
  Object.assign(URL, { createObjectURL: state.object, revokeObjectURL: state.revoke });
  anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('session file downloads', () => {
  it('fetches a family download with current authorization before offering only a local blob URL', async () => {
    listing({ signedUrl: null, downloadUrl: proxyUrl });
    render(<SessionFiles sessionId="lesson" role="student" groupSessionIds={groupIds} />);
    fireEvent.click(await screen.findByTitle('common.download'));
    await waitFor(() => expect(state.object).toHaveBeenCalledOnce());
    expect(state.fetch).toHaveBeenCalledWith(proxyUrl, { headers: { Authorization: 'Bearer current-session' }, cache: 'no-store' });
    expect(state.signed).not.toHaveBeenCalled(); expect(anchor).toHaveBeenCalledOnce();
    const link = anchor.mock.instances[0] as HTMLAnchorElement;
    expect(link.href).toBe('blob:local-material'); expect(link.download).toBe('teacher.pdf');
  });
  it('shows a revoked access error without falling back to Storage or downloading a response body', async () => {
    listing({ signedUrl: null, downloadUrl: proxyUrl });
    const blob = vi.fn();
    state.fetch.mockImplementation(async (url: string) => url === '/api/student-session-files'
      ? { ok: true, json: async () => ({ files: [{ name: 'teacher.pdf', folderId: 'lesson', size: 20, downloadUrl: proxyUrl }] }) }
      : { ok: false, status: 403, blob });
    render(<SessionFiles sessionId="lesson" role="student" groupSessionIds={groupIds} />);
    fireEvent.click(await screen.findByTitle('common.download'));
    await screen.findByText('files.downloadFailed');
    expect(blob).not.toHaveBeenCalled(); expect(state.object).not.toHaveBeenCalled();
    expect(state.signed).not.toHaveBeenCalled(); expect(anchor).not.toHaveBeenCalled();
  });
  it('does not mint a direct Storage URL for a student listing with no usable download grant', async () => {
    listing({ signedUrl: null, downloadUrl: null });
    render(<SessionFiles sessionId="lesson" role="student" groupSessionIds={groupIds} />);
    fireEvent.click(await screen.findByTitle('common.download'));
    await screen.findByText('files.downloadFailed');
    expect(state.signed).not.toHaveBeenCalled(); expect(anchor).not.toHaveBeenCalled();
  });
  it('preserves the existing non-opted student URL and tutor signed URL behavior', async () => {
    listing({ signedUrl: 'https://storage.test/legacy', downloadUrl: null });
    const view = render(<SessionFiles sessionId="lesson" role="student" groupSessionIds={groupIds} />);
    fireEvent.click(await screen.findByTitle('common.download'));
    expect((anchor.mock.instances[0] as HTMLAnchorElement).href).toBe('https://storage.test/legacy');
    view.unmount(); anchor.mockClear();
    render(<SessionFiles sessionId="lesson" role="tutor" groupSessionIds={groupIds} />);
    fireEvent.click(await screen.findByTitle('common.download'));
    await waitFor(() => expect(state.signed).toHaveBeenCalledWith('lesson/teacher.pdf', 60));
    expect((anchor.mock.instances[0] as HTMLAnchorElement).href).toBe('https://storage.test/signed');
  });
});
