import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteSessionFromGoogle } from '../../api/_lib/google-calendar.js';

const mock = vi.hoisted(() => ({
  tables: [] as string[],
  updates: [] as Array<{ table: string; values: unknown }>,
  connected: true,
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from: (table: string) => {
    mock.tables.push(table);
    const result = { data: table === 'profiles' ? {
      google_calendar_connected: mock.connected,
      google_calendar_access_token: 'test-google-token',
      google_calendar_token_expiry: '2099-01-01T00:00:00Z',
    } : { google_calendar_event_id: 'stored-event' }, error: null };
    const query = {
      select: () => query,
      eq: () => query,
      single: async () => result,
      update: (values: unknown) => { mock.updates.push({ table, values }); return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return query;
  },
}) }));

beforeEach(() => {
  mock.tables = [];
  mock.updates = [];
  mock.connected = true;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204 })));
});
afterEach(() => vi.unstubAllGlobals());

describe('Google cleanup after lesson deletion', () => {
  it('uses the event snapshot after the session row has been deleted', async () => {
    await deleteSessionFromGoogle('deleted-session', 'tutor', 'snapshot-event');

    expect(fetch).toHaveBeenCalledWith('https://www.googleapis.com/calendar/v3/calendars/primary/events/snapshot-event', {
      method: 'DELETE', headers: { Authorization: 'Bearer test-google-token' },
    });
    expect(mock.tables).toEqual(['profiles']);
    expect(mock.updates).toEqual([]);
  });

  it('does no lookup or external deletion when the snapshot has no event', async () => {
    await deleteSessionFromGoogle('deleted-session', 'tutor', null);

    expect(mock.tables).toEqual([]);
    expect(mock.updates).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps existing callers looking up and clearing the live session event', async () => {
    await deleteSessionFromGoogle('live-session', 'tutor');

    expect(fetch).toHaveBeenCalledWith('https://www.googleapis.com/calendar/v3/calendars/primary/events/stored-event', expect.anything());
    expect(mock.tables).toEqual(['profiles', 'sessions', 'sessions']);
    expect(mock.updates).toEqual([{ table: 'sessions', values: { google_calendar_event_id: null } }]);
  });

  it('skips external deletion for a disconnected tutor even when an event snapshot exists', async () => {
    mock.connected = false;
    await deleteSessionFromGoogle('deleted-session', 'tutor', 'snapshot-event');

    expect(fetch).not.toHaveBeenCalled();
    expect(mock.updates).toEqual([]);
  });
});
