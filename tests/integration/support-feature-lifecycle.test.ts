import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), getClient: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock('../../api/_lib/adminSecret.js', () => ({ getPlatformAdminSecret: () => 'admin-secret' }));
vi.mock('../../api/_lib/supportPersistence.js', () => ({
  getSupportServiceClient: mocks.getClient,
  SUPPORT_ATTACHMENT_BUCKET: 'support-attachments',
}));

import { syncInAppSupportTicket } from '../../api/_lib/inAppSupportTicketSync';
import { notifyInAppSupportStatus } from '../../api/_lib/inAppSupportStatusEmail';
import { getTrelloWebhookSettings, type TrelloSupportCard } from '../../api/_lib/inAppSupportTrelloWebhook';
import { applyTrelloSupportCard } from '../../api/trello-support-webhook';
import adminHandler from '../../api/admin-support-requests';

const id = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';
const cardId = 'a'.repeat(24);
const boardId = 'b'.repeat(24);
const featureLists = { registered: '1'.repeat(24), inProgress: '2'.repeat(24), resolved: '3'.repeat(24) };

// Model the status trigger and Trello claim contract; SQL behavior is checked separately.
function ticketStore(initial: Record<string, unknown> = {}) {
  let revision = 0;
  let leaseToken: string | null = null;
  let leaseUntil: number | null = null;
  let creationUncertain = false;
  let row: Record<string, any> = {
    id, category: 'feature', title: 'Let parents reschedule from reminders',
    reporter_name: 'Jonas', reporter_email: 'jonas@example.com', locale: 'en',
    page: '/parent/lessons', environment: { siteOrigin: 'https://tutlio.pl' },
    status: 'registered', priority: 'medium', target_date: null,
    trello_card_id: null, trello_sync_error: null,
    status_updated_at: '2026-09-30T10:00:00.000Z', updated_at: '2026-09-30T10:00:00.000Z',
    status_notified_signature: null, completion_notified_at: null,
    ...initial,
  };
  const updateRow = (patch: Record<string, unknown>) => {
    const visibleChange = (Object.hasOwn(patch, 'status') && patch.status !== row.status)
      || (Object.hasOwn(patch, 'target_date') && patch.target_date !== row.target_date);
    const updated = new Date(Date.parse('2026-09-30T10:00:00.000Z') + ++revision * 1000).toISOString();
    row = { ...row, ...patch, updated_at: updated, status_updated_at: visibleChange ? updated : row.status_updated_at };
  };
  const db = {
    rpc: async (name: string, args: Record<string, any>) => {
      expect(args.p_ticket_id).toBe(row.id);
      if (name === 'claim_support_trello_sync') {
        if (leaseUntil !== null && leaseUntil > Date.now()) return { data: { outcome: 'busy' }, error: null };
        leaseToken = args.p_lease_token;
        leaseUntil = Date.now() + 120_000;
        return { data: { outcome: 'claimed', request: { ...row }, creationUncertain }, error: null };
      }
      const owned = leaseToken === args.p_lease_token && leaseToken !== null
        && leaseUntil !== null && leaseUntil > Date.now();
      if (name === 'current_support_trello_sync') return { data: owned ? { ...row } : null, error: null };
      if (name === 'mark_support_trello_creation') {
        if (!owned || row.trello_card_id || creationUncertain) return { data: false, error: null };
        creationUncertain = true;
        return { data: true, error: null };
      }
      expect(name).toBe('finish_support_trello_sync');
      if (!owned) return { data: { saved: false, stale: false }, error: null };
      const stale = Boolean(args.p_card_id !== null && (
        (args.p_expected_status_updated_at !== null && row.status_updated_at !== args.p_expected_status_updated_at)
        || (args.p_expected_priority !== null && row.priority !== args.p_expected_priority)
      ));
      if (args.p_card_id !== null) {
        updateRow({ trello_card_id: args.p_card_id, trello_card_url: args.p_card_url,
          trello_synced_at: stale ? row.trello_synced_at : new Date().toISOString(),
          trello_sync_error: stale ? 'Ticket changed during Trello synchronization. Retry to synchronize its current status.' : null });
        creationUncertain = false;
      } else if (args.p_error !== null) updateRow({ trello_sync_error: args.p_error.slice(0, 500) });
      leaseToken = null;
      leaseUntil = null;
      return { data: { saved: true, stale }, error: null };
    },
    from: (table: string) => {
      expect(table).toBe('in_app_support_requests');
      let patch: Record<string, unknown> | null = null;
      const filters: Array<[string, unknown]> = [];
      const execute = () => {
        if (filters.some(([key, value]) => row[key] !== value)) return { data: null, error: null };
        if (patch) {
          updateRow(patch);
          patch = null;
        }
        return { data: { ...row }, error: null };
      };
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        update: (value: Record<string, unknown>) => { patch = value; return query; },
        maybeSingle: async () => execute(),
        single: async () => execute(),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject),
      };
      return query;
    },
  };
  return { db: db as any, current: () => ({ ...row }) as any };
}

function featureCard(list = featureLists.inProgress): TrelloSupportCard {
  return {
    id: cardId, idBoard: boardId, idList: list,
    name: 'SUP-17EE7859 · [P2] Feature /parent/lessons',
    desc: 'Tutlio support reference: SUP-17EE7859\nType: Feature request',
    due: '2026-10-05T12:00:00.000Z', labels: [], closed: false,
  };
}

function adminResponse() {
  const result = { statusCode: 200, body: null as any };
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn((code: number) => { result.statusCode = code; return res; }),
    json: vi.fn((body: unknown) => { result.body = body; return res; }),
  };
  return { result, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockReset();
  mocks.getClient.mockReset();
  const environment = {
    TRELLO_API_KEY: 'test-key', TRELLO_TOKEN: 'test-token', TRELLO_BOARD_ID: boardId,
    TRELLO_APPLICATION_SECRET: 'test-secret', TRELLO_WEBHOOK_CALLBACK_URL: 'https://tutlio.lt/api/trello-support-webhook',
    TRELLO_WEBHOOK_ID: '',
    TRELLO_LIST_NEW_ID: 'c'.repeat(24), TRELLO_LIST_IN_PROGRESS_ID: 'd'.repeat(24), TRELLO_LIST_RESOLVED_ID: 'e'.repeat(24),
    TRELLO_FEATURE_LIST_NEW_ID: featureLists.registered,
    TRELLO_FEATURE_LIST_IN_PROGRESS_ID: featureLists.inProgress,
    TRELLO_FEATURE_LIST_RESOLVED_ID: featureLists.resolved,
    RESEND_API_KEY: 'test-resend-key', APP_URL: 'https://tutlio.lt',
  };
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
  mocks.send.mockImplementation(async () => ({ data: { id: `email-${mocks.send.mock.calls.length}` }, error: null }));
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('feature request backlog and reporter lifecycle', () => {
  it('keeps one linked feature card through registration, implementation and completion, with one email per change', async () => {
    const store = ticketStore();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ cards: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: cardId, url: 'https://trello.com/c/feature' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: cardId, url: 'https://trello.com/c/feature' })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncInAppSupportTicket(store.db, store.current())).resolves.toBe(true);
    const created = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(created.idList).toBe(featureLists.registered);
    expect(created.name).toContain('Feature');
    expect(created.desc).not.toContain('jonas@example.com');
    expect(store.current().trello_card_id).toBe(cardId);
    await expect(notifyInAppSupportStatus(store.db, store.current())).resolves.toBe(true);

    const settings = getTrelloWebhookSettings()!;
    const card: TrelloSupportCard = {
      id: cardId, idBoard: boardId, idList: featureLists.inProgress, name: created.name, desc: created.desc,
      due: null, labels: [], closed: false,
    };
    await applyTrelloSupportCard(store.db, card, settings);
    expect(store.current().status).toBe('registered');
    expect(store.current().trello_sync_error).toContain('due date');
    expect(mocks.send).toHaveBeenCalledTimes(1);

    card.due = '2026-10-05T12:00:00.000Z';
    await expect(applyTrelloSupportCard(store.db, card, settings)).resolves.toBe('updated');
    expect(store.current()).toMatchObject({ status: 'in_progress', target_date: card.due });
    await expect(applyTrelloSupportCard(store.db, card, settings)).resolves.toBe('unchanged');
    expect(mocks.send).toHaveBeenCalledTimes(2);

    card.idList = featureLists.resolved;
    card.due = null;
    await expect(applyTrelloSupportCard(store.db, card, settings)).resolves.toBe('updated');
    await expect(applyTrelloSupportCard(store.db, card, settings)).resolves.toBe('unchanged');
    expect(store.current()).toMatchObject({ status: 'resolved', target_date: null, completion_notification_email_id: 'email-3' });
    expect(store.current().completion_notified_at).toBeTruthy();
    expect(mocks.send).toHaveBeenCalledTimes(3);
    for (const [message, options] of mocks.send.mock.calls) {
      expect(message.to).toBe('jonas@example.com');
      expect(message.html).toContain(`https://tutlio.pl/parent/support/tickets?ticket=${id}`);
      expect(options.idempotencyKey).toContain(`in-app-support-status-${id}-`);
    }
    expect(mocks.send.mock.calls[2][0].html).toMatch(/feature|idea/i);
    expect(mocks.send.mock.calls[2][0].html).not.toContain('Your ticket has been resolved.');

    // An admin resync updates the same card in its Features completion list.
    await syncInAppSupportTicket(store.db, store.current());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toBe(`https://api.trello.com/1/cards/${cardId}`);
    expect(fetchMock.mock.calls[2][1].method).toBe('PUT');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).idList).toBe(featureLists.resolved);
  });

  it('emails one updated deadline and ignores equivalent dates and internal priority changes', async () => {
    const store = ticketStore({ trello_card_id: cardId });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
    const settings = getTrelloWebhookSettings()!;
    const card = featureCard();

    await applyTrelloSupportCard(store.db, card, settings);
    const originalKey = mocks.send.mock.calls[0][1].idempotencyKey;
    card.due = '2026-10-09T12:00:00.000Z';
    await expect(applyTrelloSupportCard(store.db, card, settings)).resolves.toBe('updated');
    expect(store.current().target_date).toBe('2026-10-09T12:00:00.000Z');
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1][0].html).toContain('Expected deadline');
    expect(mocks.send.mock.calls[1][0].html).toContain('October 9');
    expect(mocks.send.mock.calls[1][1].idempotencyKey).not.toBe(originalKey);

    card.due = '2026-10-09T14:00:00+02:00';
    await expect(applyTrelloSupportCard(store.db, card, settings)).resolves.toBe('unchanged');
    card.labels = [{ name: 'P0' }];
    await expect(applyTrelloSupportCard(store.db, card, settings)).resolves.toBe('updated');
    expect(store.current().priority).toBe('urgent');
    await expect(applyTrelloSupportCard(store.db, card, settings)).resolves.toBe('unchanged');
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it('recovers a failed completion email on redelivery using the same key, then stops sending', async () => {
    const store = ticketStore({ trello_card_id: cardId });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
    const settings = getTrelloWebhookSettings()!;
    const card = featureCard();
    await applyTrelloSupportCard(store.db, card, settings);
    mocks.send.mockResolvedValueOnce({ data: null, error: { message: 'Temporary email outage' } });

    card.idList = featureLists.resolved;
    await expect(applyTrelloSupportCard(store.db, card, settings)).rejects.toThrow('Temporary email outage');
    expect(store.current()).toMatchObject({
      status: 'resolved', target_date: null, completion_notified_at: null,
      status_notification_error: 'Temporary email outage',
    });
    const failedKey = mocks.send.mock.calls[1][1].idempotencyKey;
    const resolvedRevision = store.current().status_updated_at;
    await expect(applyTrelloSupportCard(store.db, card, settings)).resolves.toBe('unchanged');
    expect(mocks.send.mock.calls[2][1].idempotencyKey).toBe(failedKey);
    expect(store.current()).toMatchObject({
      status_updated_at: resolvedRevision, status_notification_error: null,
      completion_notification_email_id: 'email-3',
    });
    expect(store.current().completion_notified_at).toBeTruthy();
    await expect(applyTrelloSupportCard(store.db, card, settings)).resolves.toBe('unchanged');
    await expect(notifyInAppSupportStatus(store.db, store.current())).resolves.toBe(false);
    expect(mocks.send).toHaveBeenCalledTimes(3);
  });

  it('keeps feature wording and one existing card when the shared backlog is configured', async () => {
    for (const name of ['TRELLO_FEATURE_LIST_NEW_ID', 'TRELLO_FEATURE_LIST_IN_PROGRESS_ID', 'TRELLO_FEATURE_LIST_RESOLVED_ID']) {
      vi.stubEnv(name, '');
    }
    const store = ticketStore({ trello_card_id: cardId });
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ id: cardId })));
    vi.stubGlobal('fetch', fetchMock);
    const settings = getTrelloWebhookSettings()!;
    const card = featureCard(settings.lists.inProgress);

    await notifyInAppSupportStatus(store.db, store.current());
    await applyTrelloSupportCard(store.db, card, settings);
    await syncInAppSupportTicket(store.db, store.current());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.trello.com/1/cards/${cardId}`);
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).idList).toBe(settings.lists.inProgress);
    card.idList = settings.lists.resolved;
    await applyTrelloSupportCard(store.db, card, settings);
    await applyTrelloSupportCard(store.db, card, settings);
    expect(store.current()).toMatchObject({ category: 'feature', status: 'resolved', trello_card_id: cardId });
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(mocks.send.mock.calls[0][0].html).toContain('Your feature request has been received.');
    expect(mocks.send.mock.calls[1][0].html).toContain('We are implementing your requested feature.');
    expect(mocks.send.mock.calls[2][0].html).toContain('Your requested feature has been implemented');
  });

  it('creates one feature card when the same unsynced ticket is delivered concurrently', async () => {
    const store = ticketStore();
    const beforeCreation = store.current();
    const fetchMock = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
      if (options.method === 'GET') return new Response(JSON.stringify({ cards: [] }));
      if (options.method === 'POST') return new Response(JSON.stringify({ id: cardId }));
      throw new Error(`Unexpected Trello request: ${options.method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(Promise.all([
      syncInAppSupportTicket(store.db, beforeCreation),
      syncInAppSupportTicket(store.db, beforeCreation),
    ])).resolves.toEqual([true, false]);

    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    expect(store.current().trello_card_id).toBe(cardId);
    expect(store.current().trello_sync_error).toBeNull();
    // A delayed reporter retry carries the old unlinked row; the claim sees the
    // persisted card and avoids another lookup, creation, or status overwrite.
    await expect(syncInAppSupportTicket(store.db, beforeCreation, { onlyIfUnlinked: true })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('recovers an uncertain feature-card creation by lookup without issuing another POST', async () => {
    const store = ticketStore();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ cards: [] })))
      .mockRejectedValueOnce(new Error('Provider connection lost after creation'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ cards: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ cards: [{
        id: cardId, idBoard: boardId, name: 'SUP-17EE7859 · [P2] Feature /parent/lessons',
        url: 'https://trello.com/c/feature',
      }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: cardId, url: 'https://trello.com/c/feature' })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(syncInAppSupportTicket(store.db, store.current())).rejects.toThrow('Provider connection lost after creation');
    expect(store.current()).toMatchObject({ trello_card_id: null, trello_sync_error: 'Provider connection lost after creation' });
    await expect(syncInAppSupportTicket(store.db, store.current())).rejects.toThrow('previous Trello card creation may have succeeded');
    await expect(syncInAppSupportTicket(store.db, store.current())).resolves.toBe(true);

    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    expect(fetchMock.mock.calls[4][0]).toBe(`https://api.trello.com/1/cards/${cardId}`);
    expect(fetchMock.mock.calls[4][1].method).toBe('PUT');
    expect(store.current()).toMatchObject({ trello_card_id: cardId, trello_sync_error: null });
  });

  it('finishes an admin implementation once even when a later Trello edit carries the old due date', async () => {
    const store = ticketStore({ trello_card_id: cardId });
    mocks.getClient.mockReturnValue(store.db);
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ id: cardId })));
    vi.stubGlobal('fetch', fetchMock);
    const settings = getTrelloWebhookSettings()!;
    const card = featureCard();
    await applyTrelloSupportCard(store.db, card, settings);
    const { result, res } = adminResponse();

    await adminHandler({ method: 'PATCH', headers: { 'x-admin-secret': 'admin-secret' }, body: {
      id, status: 'resolved', priority: 'medium', targetDate: null,
      expectedStatusUpdatedAt: store.current().status_updated_at, expectedPriority: 'medium',
    } } as any, res);
    expect(result.statusCode).toBe(200);
    expect(result.body.request).toMatchObject({ status: 'resolved', target_date: null });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      idList: featureLists.resolved, due: null,
    });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    card.idList = featureLists.resolved;
    card.labels = [{ name: 'P1' }];
    await applyTrelloSupportCard(store.db, card, settings);

    expect(store.current()).toMatchObject({ status: 'resolved', target_date: null, priority: 'high' });
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });
});
