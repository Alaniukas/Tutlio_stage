import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncCreatedSessionsToGoogle } from '../../src/lib/syncCreatedSessionsToGoogle';
vi.mock('../../src/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer test', 'Content-Type': 'application/json' }) }));

const fetchMock = vi.fn();
const lookup = vi.fn();
const client: any = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: lookup }) }) })) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  lookup.mockResolvedValue({ data: { google_calendar_connected: true, google_calendar_sync_enabled: true } });
  fetchMock.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllGlobals());

describe('post-save Google Calendar work', () => {
  it.each([
    { google_calendar_connected: false, google_calendar_sync_enabled: true },
    { google_calendar_connected: true, google_calendar_sync_enabled: false },
  ])('does not send requests when sync is unavailable', async (profile) => {
    lookup.mockResolvedValue({ data: profile });
    await syncCreatedSessionsToGoogle(client, 'tutor', ['one', 'two']);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('checks once and batches 24 unique lessons into three authenticated requests', async () => {
    const ids = Array.from({ length: 24 }, (_, i) => `s${i}`);
    await syncCreatedSessionsToGoogle(client, 'tutor', [...ids, ids[0]]);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.flatMap(([, options]) => JSON.parse(options.body).sessionIds)).toEqual(ids);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test');
  });
  it('waits for each batch and stops on failure', async () => {
    let release!: (value: any) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const pending = syncCreatedSessionsToGoogle(client, 'tutor', Array.from({ length: 24 }, (_, i) => `s${i}`));
    const assertion = expect(pending).rejects.toThrow('502');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    release({ ok: false, status: 502 });
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does no work for an empty save and does not hide a settings read failure', async () => {
    await syncCreatedSessionsToGoogle(client, 'tutor', []);
    expect(lookup).not.toHaveBeenCalled();
    lookup.mockResolvedValue({ error: { message: 'database unavailable' } });
    await expect(syncCreatedSessionsToGoogle(client, 'tutor', ['one'])).rejects.toThrow('settings');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
