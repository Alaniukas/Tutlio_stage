// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncInAppSupportTicket } from '../../api/_lib/inAppSupportTicketSync';

const ticketId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';
const missingId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f5';
const cardId = 'a'.repeat(24);
const boardId = 'b'.repeat(24);
const cardUrl = 'https://trello.com/c/isolated';
const featureLists = { registered: '1'.repeat(24), progress: '2'.repeat(24), resolved: '3'.repeat(24) };
let db: PGlite;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function rpc(name: string, args: Record<string, any>) {
  const names = ['claim_support_trello_sync', 'current_support_trello_sync', 'mark_support_trello_creation'];
  let result;
  if (names.includes(name)) result = await db.query<{ result: any }>(
    `select public.${name}($1::uuid,$2::uuid) as result`, [args.p_ticket_id, args.p_lease_token]);
  else if (name === 'finish_support_trello_sync') result = await db.query<{ result: any }>(
    'select public.finish_support_trello_sync($1::uuid,$2::uuid,$3,$4,$5,$6::timestamptz,$7) as result',
    [args.p_ticket_id, args.p_lease_token, args.p_card_id ?? null, args.p_card_url ?? null, args.p_error ?? null,
      args.p_expected_status_updated_at ?? null, args.p_expected_priority ?? null]);
  else throw new Error(`Unexpected RPC: ${name}`);
  return result.rows[0].result;
}

function client() {
  return { rpc: async (name: string, args: Record<string, unknown>) => {
    try { return { data: await rpc(name, args), error: null }; }
    catch (error) { return { data: null, error }; }
  } } as unknown as SupabaseClient;
}

async function current() {
  return (await db.query<{ row: any }>('select to_jsonb(r) as row from public.in_app_support_requests r where id=$1', [ticketId])).rows[0].row;
}

async function claim(token = randomUUID(), id = ticketId) {
  return rpc('claim_support_trello_sync', { p_ticket_id: id, p_lease_token: token });
}

async function finish(token: string, patch: Record<string, unknown> = {}) {
  return rpc('finish_support_trello_sync', { p_ticket_id: ticketId, p_lease_token: token, ...patch });
}

async function expire() {
  await db.query("update public.support_trello_sync_claims set lease_until=clock_timestamp()-interval '1 second' where ticket_id=$1", [ticketId]);
}

function foundCard() {
  return { id: cardId, idBoard: boardId, url: cardUrl,
    name: 'SUP-17EE7859 · [P2] Feature /parent/lessons',
    desc: 'Tutlio support reference: SUP-17EE7859\nType: Feature request' };
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.in_app_support_requests (
      id uuid primary key,status text not null default 'new',created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),category text not null default 'feature',
      title text not null default 'Feature request',priority text not null default 'medium',page text not null default '/parent/lessons'
    ); alter table public.in_app_support_requests enable row level security;
    grant select,insert,update,delete on public.in_app_support_requests to service_role;`);
  for (const filename of ['20260929203658_in_app_support_ticket_lifecycle.sql', '20260930190000_support_trello_sync_claims.sql']) {
    await db.exec(readFileSync(`supabase/migrations/${filename}`, 'utf8'));
  }
  await db.exec(`create trigger in_app_support_requests_updated_at before update on public.in_app_support_requests
    for each row execute function public.set_in_app_support_updated_at(); set role service_role;`);
  await db.query("insert into public.in_app_support_requests(id,status) values($1,'registered')", [ticketId]);
  for (const [name, value] of Object.entries({
    TRELLO_API_KEY: 'isolated-key', TRELLO_TOKEN: 'isolated-token', TRELLO_BOARD_ID: boardId,
    TRELLO_LIST_NEW_ID: 'c'.repeat(24), TRELLO_LIST_IN_PROGRESS_ID: 'd'.repeat(24), TRELLO_LIST_RESOLVED_ID: 'e'.repeat(24),
    TRELLO_FEATURE_LIST_NEW_ID: featureLists.registered, TRELLO_FEATURE_LIST_IN_PROGRESS_ID: featureLists.progress,
    TRELLO_FEATURE_LIST_RESOLVED_ID: featureLists.resolved, APP_URL: 'https://tutlio.lt',
  })) vi.stubEnv(name, value);
}, 30_000);

afterEach(async () => { if (db) await db.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Trello cross-worker claim migration and real synchronization', () => {
  it('executes for service role while rejecting actual client RPC and private-ledger access', async () => {
    const token = randomUUID();
    const claimed = await claim(token);
    expect(claimed).toMatchObject({ outcome: 'claimed', creationUncertain: false, request: { id: ticketId } });
    expect(await rpc('current_support_trello_sync', { p_ticket_id: ticketId, p_lease_token: token })).toMatchObject({ id: ticketId });
    expect(await rpc('mark_support_trello_creation', { p_ticket_id: ticketId, p_lease_token: token })).toBe(true);
    expect(await finish(token, { p_error: 'Simulated failure' })).toEqual({ saved: true, stale: false });
    expect((await db.query("select relrowsecurity from pg_class where oid='public.support_trello_sync_claims'::regclass")).rows[0])
      .toEqual({ relrowsecurity: true });
    expect((await db.query("select count(*)::integer as count from pg_policies where tablename='support_trello_sync_claims'")).rows[0])
      .toEqual({ count: 0 });
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`reset role; set role ${role}`);
      for (const name of ['claim_support_trello_sync', 'current_support_trello_sync', 'mark_support_trello_creation']) {
        await expect(rpc(name, { p_ticket_id: ticketId, p_lease_token: token })).rejects.toThrow('permission denied');
      }
      await expect(finish(token)).rejects.toThrow('permission denied');
      await expect(db.query('select * from public.support_trello_sync_claims')).rejects.toThrow('permission denied');
    }
  }, 30_000);

  it('returns missing without creating a claim and allows one claimant for competing requests', async () => {
    expect(await claim(randomUUID(), missingId)).toEqual({ outcome: 'missing' });
    expect((await db.query('select count(*)::integer as count from public.support_trello_sync_claims')).rows[0]).toEqual({ count: 0 });
    const outcomes = await Promise.all([claim(), claim(), claim()]);
    expect(outcomes.map((value) => value.outcome).sort()).toEqual(['busy', 'busy', 'claimed']);
  }, 30_000);

  it('prevents concurrent initial sync workers from issuing duplicate searches or POSTs', async () => {
    const reachedSearch = deferred();
    const searchResult = deferred<Response>();
    const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
      if (url.includes('/search?')) { reachedSearch.resolve(); return searchResult.promise; }
      expect(options.method).toBe('POST');
      return json({ id: cardId, url: cardUrl });
    });
    vi.stubGlobal('fetch', fetchMock);
    const supplied = await current();
    const first = syncInAppSupportTicket(client(), supplied);
    await reachedSearch.promise;
    await expect(syncInAppSupportTicket(client(), supplied)).resolves.toBe(false);
    searchResult.resolve(json({ cards: [] }));
    await expect(first).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    expect(await current()).toMatchObject({ trello_card_id: cardId, trello_sync_error: null });
    expect((await db.query('select lease_token,creation_uncertain from public.support_trello_sync_claims')).rows[0])
      .toEqual({ lease_token: null, creation_uncertain: false });
  }, 30_000);

  it('quarantines an ambiguous POST, refuses a second create during index lag, and recovers the found card by PUT', async () => {
    let indexed = false;
    const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
      if (url.includes('/search?')) return json({ cards: indexed ? [foundCard()] : [] });
      if (options.method === 'POST') throw new TypeError('Response lost after provider accepted the POST');
      expect(options.method).toBe('PUT');
      return json({ id: cardId, url: cardUrl });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(syncInAppSupportTicket(client(), await current())).rejects.toThrow('Response lost');
    expect((await db.query('select lease_token,creation_uncertain from public.support_trello_sync_claims')).rows[0])
      .toEqual({ lease_token: null, creation_uncertain: true });
    await expect(syncInAppSupportTicket(client(), await current())).rejects.toThrow('No matching card was found');
    indexed = true;
    await expect(syncInAppSupportTicket(client(), await current())).resolves.toBe(true);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(1);
    expect((await db.query('select lease_token,creation_uncertain from public.support_trello_sync_claims')).rows[0])
      .toEqual({ lease_token: null, creation_uncertain: false });
    expect(await current()).toMatchObject({ trello_card_id: cardId, trello_sync_error: null });
  }, 30_000);

  it('refuses expired and superseded tokens without clearing the newer lease or creation uncertainty', async () => {
    const oldToken = randomUUID();
    const newToken = randomUUID();
    await claim(oldToken);
    await rpc('mark_support_trello_creation', { p_ticket_id: ticketId, p_lease_token: oldToken });
    await expire();
    expect(await claim(newToken)).toMatchObject({ outcome: 'claimed', creationUncertain: true });
    expect(await rpc('current_support_trello_sync', { p_ticket_id: ticketId, p_lease_token: oldToken })).toBeNull();
    expect(await rpc('mark_support_trello_creation', { p_ticket_id: ticketId, p_lease_token: oldToken })).toBe(false);
    expect(await finish(oldToken, { p_card_id: 'old-card', p_error: 'stale worker' })).toEqual({ saved: false, stale: false });
    expect((await db.query('select lease_token,creation_uncertain from public.support_trello_sync_claims')).rows[0])
      .toEqual({ lease_token: newToken, creation_uncertain: true });
    expect((await current()).trello_card_id).toBeNull();
    expect(await finish(newToken)).toEqual({ saved: true, stale: false });
    expect(await claim()).toMatchObject({ creationUncertain: true });
  }, 30_000);

  it('rejects a delayed former worker after a new worker has recovered and linked its created card', async () => {
    const reachedPost = deferred();
    const firstResponse = deferred<Response>();
    let exists = false;
    const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
      if (url.includes('/search?')) return json({ cards: exists ? [foundCard()] : [] });
      if (options.method === 'POST') { exists = true; reachedPost.resolve(); return firstResponse.promise; }
      return json({ id: cardId, url: cardUrl });
    });
    vi.stubGlobal('fetch', fetchMock);
    const oldWorker = syncInAppSupportTicket(client(), await current());
    // Attach the rejection assertion before releasing the delayed HTTP response.
    const oldOutcome = expect(oldWorker).rejects.toThrow('ownership expired');
    await reachedPost.promise;
    await expire();
    await expect(syncInAppSupportTicket(client(), await current())).resolves.toBe(true);
    firstResponse.resolve(json({ id: cardId, url: cardUrl }));
    await oldOutcome;
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(1);
    expect(await current()).toMatchObject({ trello_card_id: cardId, trello_sync_error: null });
    expect((await db.query('select lease_token,creation_uncertain from public.support_trello_sync_claims')).rows[0])
      .toEqual({ lease_token: null, creation_uncertain: false });
  }, 30_000);

  it('refreshes status after lookup and preserves a known card when the ticket changes during POST', async () => {
    let changedDuringPost = false;
    const fetchMock = vi.fn(async (url: string, options: RequestInit) => {
      if (url.includes('/search?')) {
        await db.query("update public.in_app_support_requests set status='in_progress',target_date='2026-10-05T12:00:00Z' where id=$1", [ticketId]);
        return json({ cards: [] });
      }
      const body = JSON.parse(String(options.body));
      if (options.method === 'POST') {
        expect(body.idList).toBe(featureLists.progress);
        changedDuringPost = true;
        await db.query("update public.in_app_support_requests set status='resolved',target_date=null where id=$1", [ticketId]);
      } else expect(body.idList).toBe(featureLists.resolved);
      return json({ id: cardId, url: cardUrl });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(syncInAppSupportTicket(client(), await current())).rejects.toThrow('Ticket changed during Trello synchronization');
    expect(changedDuringPost).toBe(true);
    expect(await current()).toMatchObject({ status: 'resolved', trello_card_id: cardId,
      trello_sync_error: 'Ticket changed during Trello synchronization. Retry to synchronize its current status.' });
    await expect(syncInAppSupportTicket(client(), await current())).resolves.toBe(true);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(1);
    expect((await current()).trello_sync_error).toBeNull();
  }, 30_000);

  it('detects a one-microsecond status change and a priority change in the finishing SQL guard', async () => {
    const token = randomUUID();
    const original = (await claim(token)).request;
    await db.query("update public.in_app_support_requests set status_updated_at=status_updated_at+interval '1 microsecond' where id=$1", [ticketId]);
    expect(await finish(token, { p_card_id: cardId, p_card_url: cardUrl,
      p_expected_status_updated_at: original.status_updated_at, p_expected_priority: original.priority }))
      .toEqual({ saved: true, stale: true });
    const nextToken = randomUUID();
    const next = (await claim(nextToken)).request;
    await db.query("update public.in_app_support_requests set priority='high' where id=$1", [ticketId]);
    expect(await finish(nextToken, { p_card_id: cardId, p_card_url: cardUrl,
      p_expected_status_updated_at: next.status_updated_at, p_expected_priority: next.priority }))
      .toEqual({ saved: true, stale: true });
    expect((await current()).trello_card_id).toBe(cardId);
  }, 30_000);
});
