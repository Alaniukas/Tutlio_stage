import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getClient: vi.fn(), notify: vi.fn() }));
vi.mock('../../api/_lib/supportPersistence.js', () => ({ getSupportServiceClient: mocks.getClient }));
vi.mock('../../api/_lib/inAppSupportStatusEmail.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../api/_lib/inAppSupportStatusEmail.js')>(),
  notifyInAppSupportStatus: mocks.notify,
}));

import handler, { applyTrelloSupportCard, config } from '../../api/trello-support-webhook';
import { inAppSupportStatusSignature } from '../../api/_lib/inAppSupportStatusEmail';
import {
  cardIdFromTrelloWebhook,
  deriveTrelloTicketState,
  getTrelloWebhookSettings,
  normalizedTrelloPriorityTitle,
  validTrelloWebhookSignature,
  type TrelloSupportCard,
  type TrelloWebhookSettings,
} from '../../api/_lib/inAppSupportTrelloWebhook';

const boardId = 'b'.repeat(24);
const cardId = 'a'.repeat(24);
const settings: TrelloWebhookSettings = {
  apiKey: 'test-key', token: 'test-token', applicationSecret: 'app-secret',
  callbackUrl: 'https://tutlio.lt/api/trello-support-webhook', boardId, webhookId: 'f'.repeat(24),
  lists: { registered: 'c'.repeat(24), inProgress: 'd'.repeat(24), resolved: 'e'.repeat(24) },
};
const featureLists = {
  registered: '1'.repeat(24), inProgress: '2'.repeat(24), resolved: '3'.repeat(24),
};
const featureSettings: TrelloWebhookSettings = { ...settings, featureLists };
const id = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';

function configureFeatureLists() {
  process.env.TRELLO_FEATURE_LIST_NEW_ID = featureLists.registered;
  process.env.TRELLO_FEATURE_LIST_IN_PROGRESS_ID = featureLists.inProgress;
  process.env.TRELLO_FEATURE_LIST_RESOLVED_ID = featureLists.resolved;
}

function card(overrides: Partial<TrelloSupportCard> = {}): TrelloSupportCard {
  return {
    id: cardId, idBoard: boardId, idList: settings.lists.registered,
    name: 'SUP-17EE7859 · [P2] Bug /calendar',
    desc: 'Tutlio support reference: SUP-17EE7859\nType: Bug',
    due: null, labels: [], closed: false, ...overrides,
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    model: { id: boardId }, webhook: { id: settings.webhookId, idModel: boardId },
    action: { type: 'updateCard', data: { board: { id: boardId }, card: { id: cardId } } },
    ...overrides,
  };
}

function signedRequest(payload: unknown, headers: Record<string, string> = {}) {
  const raw = Buffer.from(JSON.stringify(payload));
  const req = Readable.from([raw]) as any;
  req.method = 'POST';
  req.headers = {
    'x-trello-webhook': createHmac('sha1', settings.applicationSecret)
      .update(raw).update(settings.callbackUrl).digest('base64'),
    ...headers,
  };
  return req;
}

function response() {
  let code = 200;
  let body: any = null;
  const res: any = {
    status: vi.fn((value: number) => { code = value; return res; }),
    json: vi.fn((value: unknown) => { body = value; return res; }),
    setHeader: vi.fn(),
  };
  return { res, result: () => ({ code, body }) };
}

function fakeDb(initial: Record<string, unknown>, options: { conflictOnce?: boolean } = {}) {
  let row = { ...initial };
  let updates = 0;
  let conflicted = false;
  const from = vi.fn(() => {
    let patch: Record<string, unknown> | null = null;
    let expectedUpdatedAt: unknown;
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        if (column === 'updated_at') expectedUpdatedAt = value;
        return query;
      }),
      update: vi.fn((value: Record<string, unknown>) => { patch = value; return query; }),
      maybeSingle: vi.fn(async () => {
        if (!patch) return { data: { ...row }, error: null };
        if (options.conflictOnce && !conflicted) {
          conflicted = true;
          row.updated_at = '2026-09-29T12:00:09Z';
          return { data: null, error: null };
        }
        if (expectedUpdatedAt !== row.updated_at) return { data: null, error: null };
        const visible = patch.status !== row.status || patch.target_date !== row.target_date;
        updates += 1;
        row = {
          ...row, ...patch, updated_at: `2026-09-29T12:00:0${updates}Z`,
          status_updated_at: visible ? `2026-09-29T12:00:0${updates}Z` : row.status_updated_at,
        };
        return { data: { ...row }, error: null };
      }),
    };
    return query;
  });
  return {
    db: { from } as any,
    current: () => row,
    markNotified: (signature: string) => { row.status_notified_signature = signature; },
    updates: () => updates,
  };
}

const originalEnv = new Map<string, string | undefined>();
const envNames = [
  'TRELLO_API_KEY', 'TRELLO_TOKEN', 'TRELLO_APPLICATION_SECRET',
  'TRELLO_WEBHOOK_CALLBACK_URL', 'TRELLO_BOARD_ID', 'TRELLO_WEBHOOK_ID',
  'TRELLO_LIST_NEW_ID', 'TRELLO_LIST_IN_PROGRESS_ID', 'TRELLO_LIST_RESOLVED_ID',
  'TRELLO_FEATURE_LIST_NEW_ID', 'TRELLO_FEATURE_LIST_IN_PROGRESS_ID', 'TRELLO_FEATURE_LIST_RESOLVED_ID',
];

beforeEach(() => {
  for (const key of envNames) originalEnv.set(key, process.env[key]);
  process.env.TRELLO_API_KEY = settings.apiKey;
  process.env.TRELLO_TOKEN = settings.token;
  process.env.TRELLO_APPLICATION_SECRET = settings.applicationSecret;
  process.env.TRELLO_WEBHOOK_CALLBACK_URL = settings.callbackUrl;
  process.env.TRELLO_BOARD_ID = settings.boardId;
  process.env.TRELLO_WEBHOOK_ID = settings.webhookId!;
  process.env.TRELLO_LIST_NEW_ID = settings.lists.registered;
  process.env.TRELLO_LIST_IN_PROGRESS_ID = settings.lists.inProgress;
  process.env.TRELLO_LIST_RESOLVED_ID = settings.lists.resolved;
  delete process.env.TRELLO_FEATURE_LIST_NEW_ID;
  delete process.env.TRELLO_FEATURE_LIST_IN_PROGRESS_ID;
  delete process.env.TRELLO_FEATURE_LIST_RESOLVED_ID;
  mocks.getClient.mockReset();
  mocks.notify.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  for (const key of envNames) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  originalEnv.clear();
  vi.unstubAllGlobals();
});

describe('Trello support webhook', () => {
  it('uses raw body parsing and accepts Trello HEAD registration probes', async () => {
    expect(config.api.bodyParser).toBe(false);
    const req = Readable.from([]) as any;
    req.method = 'HEAD';
    const res: any = { status: vi.fn(() => res), end: vi.fn() };
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  });

  it('verifies the exact raw body and callback URL before using server credentials', async () => {
    const raw = Buffer.from(' { "action" : 1 } ', 'utf8');
    const signature = createHmac('sha1', settings.applicationSecret)
      .update(raw).update(settings.callbackUrl).digest('base64');
    expect(validTrelloWebhookSignature(raw, signature, settings.applicationSecret, settings.callbackUrl)).toBe(true);
    expect(validTrelloWebhookSignature(Buffer.from('{"action":1}'), signature, settings.applicationSecret, settings.callbackUrl)).toBe(false);
    expect(validTrelloWebhookSignature(raw, signature, settings.applicationSecret, 'https://tutlio.pl/api/trello-support-webhook')).toBe(false);

    const req = Readable.from([raw]) as any;
    req.method = 'POST';
    req.headers = { 'x-trello-webhook': '0'.repeat(28) };
    let statusCode = 200;
    const res: any = {
      status: vi.fn((code: number) => { statusCode = code; return res; }),
      json: vi.fn(), setHeader: vi.fn(),
    };
    await handler(req, res);
    expect(statusCode).toBe(403);
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it('wires a signed board action through a fresh card fetch, DB update, and user email', async () => {
    const store = fakeDb({
      id, trello_card_id: cardId, status: 'registered', target_date: null, priority: 'untriaged',
      trello_sync_error: null, updated_at: '2026-09-29T12:00:00Z',
      status_updated_at: '2026-09-29T12:00:00Z', status_notified_signature: 'already-sent',
    });
    mocks.getClient.mockReturnValue(store.db);
    const fresh = card({ idList: settings.lists.inProgress, due: '2026-10-05T12:00:00.000Z' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => fresh });
    vi.stubGlobal('fetch', fetchMock);
    const { res, result } = response();

    await handler(signedRequest(event()), res);

    expect(result()).toEqual({ code: 200, body: { ok: true, result: 'updated' } });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/1/cards/${cardId}?`),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(store.current()).toMatchObject({
      status: 'in_progress', target_date: '2026-10-05T12:00:00.000Z', priority: 'medium',
    });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(store.db, expect.objectContaining({ status: 'in_progress' }));
  });

  it('ignores a signed echo of our own Trello card write before fetching or updating', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { res, result } = response();

    await handler(signedRequest(event(), { 'x-trello-client-identifier': 'tutlio-support-sync' }), res);

    expect(result()).toEqual({ code: 200, body: { ok: true, ignored: 'own_change' } });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it('accepts only card changes on the configured board and webhook', () => {
    expect(cardIdFromTrelloWebhook(event(), settings)).toBe(cardId);
    expect(cardIdFromTrelloWebhook(event({ model: { id: '0'.repeat(24) } }), settings)).toBeNull();
    expect(cardIdFromTrelloWebhook(event({ webhook: { id: '0'.repeat(24), idModel: boardId } }), settings)).toBeNull();
    expect(cardIdFromTrelloWebhook(event({ action: {
      type: 'updateCard', data: { board: { id: '0'.repeat(24) }, card: { id: cardId } },
    } }), settings)).toBeNull();
    expect(cardIdFromTrelloWebhook(event({ action: {
      type: 'commentCard', data: { board: { id: boardId }, card: { id: cardId } },
    } }), settings)).toBeNull();
  });

  it('uses priority labels ahead of title prefixes and requires a due date for in-progress', () => {
    const current = { status: 'registered' as const, target_date: null, priority: 'untriaged' as const };
    const withoutDue = card({ idList: settings.lists.inProgress, labels: [{ name: 'P0' }] });
    expect(deriveTrelloTicketState(withoutDue, current, settings)).toEqual({
      ...current, priority: 'urgent',
      trello_sync_error: 'Set a Trello due date before moving this card to the In Progress list.',
    });
    expect(normalizedTrelloPriorityTitle(withoutDue)).toBe('SUP-17EE7859 · [P0] Bug /calendar');
    expect(deriveTrelloTicketState(card({
      ...withoutDue, due: '2026-10-05T12:00:00.000Z',
    }), current, settings)).toMatchObject({
      status: 'in_progress', target_date: '2026-10-05T12:00:00.000Z', priority: 'urgent',
      trello_sync_error: null,
    });
    expect(deriveTrelloTicketState(card(), current, settings).priority).toBe('medium');
  });

  it('applies a current card once and sends only one status notification on redelivery', async () => {
    const row = {
      id, trello_card_id: cardId, status: 'registered', target_date: null, priority: 'untriaged',
      trello_sync_error: null, updated_at: '2026-09-29T12:00:00Z',
      status_updated_at: '2026-09-29T12:00:00Z', status_notified_signature: null,
    };
    row.status_notified_signature = inAppSupportStatusSignature(row as any);
    const store = fakeDb(row);
    mocks.notify.mockImplementation(async (_db, updated) => {
      store.markNotified(inAppSupportStatusSignature(updated));
      return true;
    });
    const moved = card({ idList: settings.lists.inProgress, due: '2026-10-05T12:00:00.000Z' });
    expect(await applyTrelloSupportCard(store.db, moved, settings)).toBe('updated');
    expect(await applyTrelloSupportCard(store.db, moved, settings)).toBe('unchanged');
    expect(store.updates()).toBe(1);
    expect(store.current()).toMatchObject({ status: 'in_progress', priority: 'medium' });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it('does not change status when due is missing or card reference is altered', async () => {
    const store = fakeDb({
      id, trello_card_id: cardId, status: 'registered', target_date: null, priority: 'untriaged',
      trello_sync_error: null, updated_at: '2026-09-29T12:00:00Z',
      status_updated_at: '2026-09-29T12:00:00Z', status_notified_signature: 'already-sent',
    });
    expect(await applyTrelloSupportCard(store.db, card({ idList: settings.lists.inProgress }), settings)).toBe('updated');
    expect(store.current()).toMatchObject({ status: 'registered', target_date: null, priority: 'medium' });
    expect(String(store.current().trello_sync_error)).toContain('due date');
    expect(await applyTrelloSupportCard(store.db, card({
      idList: settings.lists.resolved, desc: 'Tutlio support reference: SUP-DEADBEEF',
    }), settings)).toBe('reference_mismatch');
    expect(store.current().status).toBe('registered');
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('re-reads the current Trello card after a concurrent DB update', async () => {
    const store = fakeDb({
      id, trello_card_id: cardId, status: 'registered', target_date: null, priority: 'untriaged',
      trello_sync_error: null, updated_at: '2026-09-29T12:00:00Z',
      status_updated_at: '2026-09-29T12:00:00Z', status_notified_signature: 'already-sent',
    }, { conflictOnce: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => card({ idList: settings.lists.resolved }),
    }));
    expect(await applyTrelloSupportCard(store.db, card({ idList: settings.lists.inProgress,
      due: '2026-10-05T12:00:00.000Z' }), settings)).toBe('updated');
    expect(store.current()).toMatchObject({ status: 'resolved', target_date: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['registered', 'registered'], ['inProgress', 'in_progress'], ['resolved', 'resolved'],
  ] as const)('tracks feature %s lists and legacy shared lists during rollout', (stage, status) => {
    const current = {
      category: 'feature' as const, status: 'registered' as const, target_date: null, priority: 'untriaged' as const,
    };
    for (const idList of [featureLists[stage], settings.lists[stage]]) {
      expect(deriveTrelloTicketState(card({
        idList, due: stage === 'inProgress' ? '2026-10-05T12:00:00.000Z' : null,
      }), current, featureSettings)).toEqual({
        status, target_date: stage === 'inProgress' ? '2026-10-05T12:00:00.000Z' : null,
        priority: 'medium', trello_sync_error: null,
      });
    }
  });

  it('retains legacy feature tracking when the separate pipeline is not configured', () => {
    expect(deriveTrelloTicketState(card({ idList: settings.lists.resolved }), {
      category: 'feature', status: 'registered', target_date: null, priority: 'low',
    }, settings)).toMatchObject({ status: 'resolved', trello_sync_error: null });
  });

  it('requires a feature deadline and preserves label priority before starting work', () => {
    expect(deriveTrelloTicketState(card({
      idList: featureLists.inProgress, labels: [{ name: 'P0' }],
    }), {
      category: 'feature', status: 'registered', target_date: null, priority: 'untriaged',
    }, featureSettings)).toEqual({
      status: 'registered', target_date: null, priority: 'urgent',
      trello_sync_error: 'Set a Trello due date before moving this card to the In Progress list.',
    });
  });

  it('does not mark a bug complete or send a completion email when moved into a feature list', async () => {
    const row = {
      id, category: 'bug', trello_card_id: cardId, status: 'registered', target_date: null, priority: 'medium',
      trello_sync_error: null, updated_at: '2026-09-29T12:00:00Z',
      status_updated_at: '2026-09-29T12:00:00Z', status_notified_signature: '',
    };
    row.status_notified_signature = inAppSupportStatusSignature(row as any);
    const store = fakeDb(row);
    const moved = card({
      idList: featureLists.resolved,
      name: 'SUP-17EE7859 · [P2] Feature /calendar',
      desc: 'Tutlio support reference: SUP-17EE7859\nType: Feature request',
    });

    expect(await applyTrelloSupportCard(store.db, moved, featureSettings)).toBe('updated');
    expect(await applyTrelloSupportCard(store.db, moved, featureSettings)).toBe('unchanged');

    expect(store.current()).toMatchObject({ status: 'registered', target_date: null });
    expect(String(store.current().trello_sync_error)).toContain('configured support lists');
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('uses the saved feature category for signed completion webhooks and notifies once on redelivery', async () => {
    configureFeatureLists();
    const row = {
      id, category: 'feature', trello_card_id: cardId, status: 'in_progress',
      target_date: '2026-10-05T12:00:00.000Z', priority: 'medium',
      trello_sync_error: null, updated_at: '2026-09-29T12:00:00Z',
      status_updated_at: '2026-09-29T12:00:00Z', status_notified_signature: '',
    };
    row.status_notified_signature = inAppSupportStatusSignature(row as any);
    const store = fakeDb(row);
    mocks.getClient.mockReturnValue(store.db);
    mocks.notify.mockImplementation(async (_db, updated) => {
      store.markNotified(inAppSupportStatusSignature(updated));
      return true;
    });
    // Editable card text cannot change the category stored in Tutlio.
    const completed = card({ idList: featureLists.resolved });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => completed }));
    const first = response();
    const repeated = response();

    await handler(signedRequest(event()), first.res);
    await handler(signedRequest(event()), repeated.res);

    expect(first.result()).toEqual({ code: 200, body: { ok: true, result: 'updated' } });
    expect(repeated.result()).toEqual({ code: 200, body: { ok: true, result: 'unchanged' } });
    expect(store.current()).toMatchObject({ category: 'feature', status: 'resolved', target_date: null });
    expect(store.updates()).toBe(1);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(store.db, expect.objectContaining({ category: 'feature', status: 'resolved' }));
  });

  it('keeps feature status unchanged when its Trello reference was altered', async () => {
    const store = fakeDb({
      id, category: 'feature', trello_card_id: cardId, status: 'registered', target_date: null, priority: 'medium',
      trello_sync_error: null, updated_at: '2026-09-29T12:00:00Z',
      status_updated_at: '2026-09-29T12:00:00Z', status_notified_signature: 'already-sent',
    });

    expect(await applyTrelloSupportCard(store.db, card({
      idList: featureLists.resolved, desc: 'Tutlio support reference: SUP-DEADBEEF',
    }), featureSettings)).toBe('reference_mismatch');

    expect(store.current()).toMatchObject({ status: 'registered', target_date: null });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it.each([
    ['partial', () => { delete process.env.TRELLO_FEATURE_LIST_RESOLVED_ID; }],
    ['malformed', () => { process.env.TRELLO_FEATURE_LIST_NEW_ID = 'not-a-list-id'; }],
    ['duplicate', () => { process.env.TRELLO_FEATURE_LIST_RESOLVED_ID = featureLists.registered; }],
    ['overlapping support', () => { process.env.TRELLO_FEATURE_LIST_NEW_ID = settings.lists.registered; }],
  ] as const)('isolates %s feature configuration errors from the bug webhook', (_name, invalidate) => {
    configureFeatureLists();
    invalidate();
    const configured = getTrelloWebhookSettings();
    expect(configured).not.toBeNull();
    expect(configured?.featureListConfigurationError).toContain('TRELLO_FEATURE_LIST_*_ID');
    const moved = card({ idList: settings.lists.inProgress, due: '2026-10-05T12:00:00.000Z' });
    const current = { status: 'registered' as const, target_date: null, priority: 'untriaged' as const };

    expect(deriveTrelloTicketState(moved, { ...current, category: 'bug' }, configured!))
      .toMatchObject({ status: 'in_progress', trello_sync_error: null });
    expect(deriveTrelloTicketState(moved, { ...current, category: 'feature' }, configured!))
      .toMatchObject({ status: 'registered', target_date: null, trello_sync_error: configured?.featureListConfigurationError });
  });
});
