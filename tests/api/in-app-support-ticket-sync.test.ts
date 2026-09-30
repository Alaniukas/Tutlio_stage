import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncInAppSupportTicket } from '../../api/_lib/inAppSupportTicketSync';

const id = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';
const otherId = '27ee7859-5c8a-4fba-9dbd-9259ccad28f4';
const cardId = 'a'.repeat(24);
const boardId = 'b'.repeat(24);
function ticket(ticketId = id, patch: Record<string, any> = {}) {
  return { id: ticketId, title: 'Support request', category: 'feature' as const,
    status: 'registered' as const, priority: 'medium' as const, page: '/parent/lessons',
    target_date: null, trello_card_id: null, status_updated_at: '2026-09-30T10:00:00.000Z',
    trello_sync_error: null, ...patch };
}
function store(initial = [ticket()]) {
  const rows = new Map(initial.map(row => [row.id, { ...row }]));
  const claims = new Map<string, { token: string | null; uncertain: boolean }>();
  const rpc = vi.fn(async (name: string, args: Record<string, any>) => {
    const row = rows.get(args.p_ticket_id);
    const claim = claims.get(args.p_ticket_id) ?? { token: null, uncertain: false };
    if (name === 'claim_support_trello_sync') {
      if (!row) return { data: { outcome: 'missing' }, error: null };
      if (claim.token) return { data: { outcome: 'busy' }, error: null };
      claim.token = args.p_lease_token;
      claims.set(row.id, claim);
      return { data: { outcome: 'claimed', request: { ...row }, creationUncertain: claim.uncertain }, error: null };
    }
    const owned = claim.token !== null && claim.token === args.p_lease_token;
    if (name === 'current_support_trello_sync') return { data: owned ? { ...row } : null, error: null };
    if (name === 'mark_support_trello_creation') {
      if (!owned || row?.trello_card_id || claim.uncertain) return { data: false, error: null };
      claim.uncertain = true;
      return { data: true, error: null };
    }
    expect(name).toBe('finish_support_trello_sync');
    if (!owned || !row) return { data: { saved: false, stale: false }, error: null };
    const stale = Boolean(args.p_card_id && (row.status_updated_at !== args.p_expected_status_updated_at
      || row.priority !== args.p_expected_priority));
    if (args.p_card_id) {
      Object.assign(row, { trello_card_id: args.p_card_id, trello_card_url: args.p_card_url,
        trello_sync_error: stale ? 'Ticket changed during Trello synchronization.' : null });
      claim.uncertain = false;
    } else if (args.p_error) row.trello_sync_error = args.p_error;
    claim.token = null;
    return { data: { saved: true, stale }, error: null };
  });
  // Workers may hold separate client and module instances; only the DB claim is shared.
  return { client: () => ({ rpc }) as any, rows, claims, rpc };
}
function response(body: unknown) { return new Response(JSON.stringify(body)); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}
beforeEach(() => {
  for (const [name, value] of Object.entries({ TRELLO_API_KEY: 'test-key', TRELLO_TOKEN: 'test-token',
    TRELLO_BOARD_ID: boardId, TRELLO_LIST_NEW_ID: 'registered-list',
    TRELLO_LIST_IN_PROGRESS_ID: 'progress-list', TRELLO_LIST_RESOLVED_ID: 'resolved-list',
    TRELLO_FEATURE_LIST_NEW_ID: '', TRELLO_FEATURE_LIST_IN_PROGRESS_ID: '', TRELLO_FEATURE_LIST_RESOLVED_ID: '' })) vi.stubEnv(name, value);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('distributed support Trello synchronization', () => {
  it('allows only one creation across isolated workers sharing the DB while the first POST is stalled', async () => {
    const db = store();
    const posted = deferred<void>();
    const pending = deferred<Response>();
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'GET') return response({ cards: [] });
      posted.resolve();
      return pending.promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = syncInAppSupportTicket(db.client(), ticket());
    await posted.promise;
    vi.resetModules();
    const { syncInAppSupportTicket: otherWorker } = await import('../../api/_lib/inAppSupportTicketSync');
    await expect(otherWorker(db.client(), ticket())).resolves.toBe(false);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    pending.resolve(response({ id: cardId }));
    await expect(first).resolves.toBe(true);
    expect(db.rows.get(id)?.trello_card_id).toBe(cardId);
    await expect(otherWorker(db.client(), ticket(), { onlyIfUnlinked: true })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('allows unrelated tickets to create in parallel', async () => {
    const db = store([ticket(), ticket(otherId)]);
    const pending = deferred<Response>();
    const bothPosted = deferred<void>();
    let posts = 0;
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'GET') return response({ cards: [] });
      if (++posts === 2) bothPosted.resolve();
      await pending.promise;
      return response({ id: JSON.parse(String(options.body)).name.startsWith('SUP-17') ? cardId : 'c'.repeat(24) });
    });
    vi.stubGlobal('fetch', fetchMock);
    const work = Promise.all([syncInAppSupportTicket(db.client(), ticket()), syncInAppSupportTicket(db.client(), ticket(otherId))]);
    await bothPosted.promise;
    expect(posts).toBe(2);
    pending.resolve(response({}));
    await expect(work).resolves.toEqual([true, true]);
  });

  it('makes zero Trello calls if the claim migration is missing or storage fails', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(syncInAppSupportTicket({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } }) } as any, ticket()))
      .rejects.toThrow('Apply the support Trello synchronization migration');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-reads current status after lookup rather than using a stale caller snapshot', async () => {
    const db = store();
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'GET') {
        Object.assign(db.rows.get(id)!, { status: 'in_progress', target_date: '2026-10-05T12:00:00.000Z',
          priority: 'high', status_updated_at: '2026-09-30T11:00:00.000Z' });
        return response({ cards: [] });
      }
      expect(JSON.parse(String(options.body))).toMatchObject({ idList: 'progress-list', due: '2026-10-05T12:00:00.000Z' });
      return response({ id: cardId });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(syncInAppSupportTicket(db.client(), ticket())).resolves.toBe(true);
  });

  it('preserves a discovered card ID and reports retry when status changes during the outbound write', async () => {
    const db = store();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'GET') return response({ cards: [] });
      Object.assign(db.rows.get(id)!, { status: 'resolved', status_updated_at: '2026-09-30T11:00:00.000Z' });
      return response({ id: cardId });
    }));
    await expect(syncInAppSupportTicket(db.client(), ticket())).rejects.toThrow('Ticket changed during Trello synchronization');
    expect(db.rows.get(id)).toMatchObject({ trello_card_id: cardId, status: 'resolved',
      trello_sync_error: expect.stringContaining('Ticket changed') });
    expect(db.claims.get(id)?.uncertain).toBe(false);
  });

  it('skips an outbound reporter retry if another worker linked the ticket during lookup', async () => {
    const db = store();
    const fetchMock = vi.fn(async () => {
      Object.assign(db.rows.get(id)!, { trello_card_id: cardId, status: 'in_progress',
        trello_sync_error: 'Set a due date before moving to In Progress.' });
      return response({ cards: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(syncInAppSupportTicket(db.client(), ticket(), { onlyIfUnlinked: true })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.rows.get(id)?.trello_sync_error).toBe('Set a due date before moving to In Progress.');
  });

  it('requires review if multiple cards match rather than selecting an arbitrary duplicate', async () => {
    const db = store();
    const fetchMock = vi.fn(async () => response({ cards: [cardId, 'c'.repeat(24)].map(id => ({
      id, idBoard: boardId, name: 'SUP-17EE7859 · Feature', desc: '',
    })) }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(syncInAppSupportTicket(db.client(), ticket())).rejects.toThrow('Multiple Trello cards match');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.rows.get(id)?.trello_card_id).toBeNull();
  });

  it('quarantines an ambiguous POST and retries by lookup only until the existing card is found', async () => {
    const db = store();
    const fetchMock = vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === 'GET') return response({ cards: [] });
      throw new Error('Response timed out after card creation');
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(syncInAppSupportTicket(db.client(), ticket())).rejects.toThrow('Response timed out');
    expect(db.claims.get(id)).toMatchObject({ token: null, uncertain: true });
    await expect(syncInAppSupportTicket(db.client(), ticket())).rejects.toThrow('A previous Trello card creation may have succeeded');
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    fetchMock.mockImplementation(async (_url, options) => options.method === 'GET'
      ? response({ cards: [{ id: cardId, idBoard: boardId, name: 'SUP-17EE7859 · Feature', desc: '' }] })
      : response({ id: cardId }));
    await expect(syncInAppSupportTicket(db.client(), ticket())).resolves.toBe(true);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    expect(db.rows.get(id)?.trello_card_id).toBe(cardId);
  });

  it('does not POST after losing the lease before the uncertainty marker can be recorded', async () => {
    const db = store();
    const fetchMock = vi.fn(async () => {
      const token = db.claims.get(id)!.token;
      db.claims.get(id)!.token = 'replacement-owner';
      expect(token).not.toBe('replacement-owner');
      return response({ cards: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(syncInAppSupportTicket(db.client(), ticket())).rejects.toThrow('ownership expired');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.claims.get(id)?.token).toBe('replacement-owner');
    expect(db.rows.get(id)?.trello_sync_error).toBeNull();
  });
});
