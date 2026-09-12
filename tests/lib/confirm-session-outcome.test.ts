import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer test' }) }));

import { confirmSessionOutcome } from '@/lib/confirmSessionOutcome';

describe('confirmSessionOutcome', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('finalizes a still-active lesson without correction flags', async () => {
    await confirmSessionOutcome({
      sessionId: 'session',
      currentStatus: 'active',
      status: 'completed',
      startTime: '2026-09-10T10:00:00Z',
      endTime: '2026-09-10T11:00:00Z',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      sessionId: 'session',
      status: 'completed',
    });
  });

  it('requests an audit stamp when confirming an older matching outcome', async () => {
    await confirmSessionOutcome({
      sessionId: 'session',
      currentStatus: 'completed',
      status: 'completed',
      startTime: '2026-09-10T10:00:00Z',
      endTime: '2026-09-10T11:00:00Z',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ confirmExisting: true });
  });

  it('requests a correction when changing no-show to attended', async () => {
    await confirmSessionOutcome({
      sessionId: 'session',
      currentStatus: 'no_show',
      status: 'completed',
      startTime: '2026-09-10T10:00:00Z',
      endTime: '2026-09-10T11:00:00Z',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ correctExisting: true });
  });
});
