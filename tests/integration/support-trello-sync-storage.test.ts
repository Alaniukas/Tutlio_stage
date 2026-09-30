// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const ticketId = '10000000-0000-4000-8000-000000000001';
const secondTicket = '10000000-0000-4000-8000-000000000002';
const missingTicket = '10000000-0000-4000-8000-000000000003';
const leaseA = '20000000-0000-4000-8000-000000000001';
const leaseB = '20000000-0000-4000-8000-000000000002';
const cardId = 'a'.repeat(24);
const cardUrl = `https://trello.com/c/${cardId}`;

describe('distributed support Trello synchronization storage', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create table public.organizations(id uuid primary key);`);
    for (const file of [
      '20260916150000_in_app_support_requests.sql',
      '20260929203658_in_app_support_ticket_lifecycle.sql',
      '20260930190000_support_trello_sync_claims.sql',
    ]) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }, 30_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec('reset role; truncate public.in_app_support_requests cascade');
    for (const id of [ticketId, secondTicket]) {
      await db.query(`insert into public.in_app_support_requests (
        id,request_id,reporter_email,reporter_role,category,title,context,steps,expected_outcome,
        impact,impact_details,status,priority,target_date
      ) values($1,$2,'isolated@example.com','parent','feature','Requested improvement',
        'An isolated useful improvement','["Open the lesson"]','The requested result','medium',
        'Several users','in_progress','medium','2026-10-05T12:00:00Z')`, [id, `request-${id}`]);
    }
    await db.exec('set role service_role');
  });

  async function value<T = any>(sql: string, args: unknown[] = []): Promise<T> {
    const row = (await db.query<Record<string, T>>(sql, args)).rows[0];
    return Object.values(row)[0];
  }
  const claim = (id = ticketId, token = leaseA) => value(
    'select public.claim_support_trello_sync($1::uuid,$2::uuid)', [id, token]);
  const current = (id = ticketId, token = leaseA) => value(
    'select public.current_support_trello_sync($1::uuid,$2::uuid)', [id, token]);
  const mark = (id = ticketId, token = leaseA) => value<boolean>(
    'select public.mark_support_trello_creation($1::uuid,$2::uuid)', [id, token]);
  const finish = (options: { token?: string; card?: string | null; url?: string | null; error?: string | null;
    revision?: string | null; priority?: string | null } = {}) => value(
    'select public.finish_support_trello_sync($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::timestamptz,$7::text)',
    [ticketId, options.token ?? leaseA, options.card ?? null, options.url ?? null, options.error ?? null,
      options.revision ?? null, options.priority ?? null]);
  const ticket = () => value('select to_jsonb(r) from public.in_app_support_requests r where id=$1', [ticketId]);
  const ledger = () => value('select to_jsonb(c) from public.support_trello_sync_claims c where ticket_id=$1', [ticketId]);

  it('denies browser roles both the private ledger and every synchronization RPC', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`reset role; set role ${role}`);
      await expect(db.query('select * from public.support_trello_sync_claims')).rejects.toThrow(/permission denied/i);
      await expect(claim()).rejects.toThrow(/permission denied/i);
      await expect(current()).rejects.toThrow(/permission denied/i);
      await expect(mark()).rejects.toThrow(/permission denied/i);
      await expect(finish()).rejects.toThrow(/permission denied/i);
    }
    await db.exec('reset role');
    expect(await value("select relrowsecurity from pg_class where oid='public.support_trello_sync_claims'::regclass")).toBe(true);
  });

  it('grants only one shared lease for a ticket while unrelated tickets remain independent', async () => {
    const outcomes = await Promise.all([claim(), claim(ticketId, leaseB)]);
    expect(outcomes.map((result) => result.outcome).sort()).toEqual(['busy', 'claimed']);
    const owned = outcomes.find((result) => result.outcome === 'claimed');
    expect(owned).toMatchObject({ creationUncertain: false, request: { id: ticketId, status: 'in_progress' } });
    expect(await claim(secondTicket, leaseB)).toMatchObject({ outcome: 'claimed' });
    expect(await claim(missingTicket)).toEqual({ outcome: 'missing' });
    expect(await value('select count(*)::integer from public.support_trello_sync_claims')).toBe(2);
    const held = await ledger();
    expect(Date.parse(held.lease_until) - Date.parse(held.updated_at)).toBe(120_000);
  });

  it('lets expiry reclaim a lease while the old token cannot read, create, save, or release it', async () => {
    await claim();
    await db.query("update public.support_trello_sync_claims set lease_until=clock_timestamp()-interval '1 second' where ticket_id=$1", [ticketId]);
    expect(await finish({ card: cardId })).toEqual({ saved: false, stale: false });
    expect(await claim(ticketId, leaseB)).toMatchObject({ outcome: 'claimed' });
    expect(await current()).toBeNull();
    expect(await mark()).toBe(false);
    expect(await finish({ error: 'A delayed old failure' })).toEqual({ saved: false, stale: false });
    expect((await ledger()).lease_token).toBe(leaseB);
    expect((await ticket()).trello_card_id).toBeNull();
    expect(await finish({ token: leaseB })).toEqual({ saved: true, stale: false });
    expect((await ledger()).lease_token).toBeNull();
  });

  it('persists ambiguous creation across failure/reclaim and clears it only after a known card is linked', async () => {
    await claim();
    expect(await mark()).toBe(true);
    expect(await mark()).toBe(false);
    expect(await finish({ error: 'External creation timed out.' })).toEqual({ saved: true, stale: false });
    expect(await claim(ticketId, leaseB)).toMatchObject({ outcome: 'claimed', creationUncertain: true });
    expect(await mark(ticketId, leaseB)).toBe(false);
    expect(await finish({ token: leaseB, card: cardId, url: cardUrl })).toEqual({ saved: true, stale: false });
    expect(await ledger()).toMatchObject({ creation_uncertain: false, lease_token: null, lease_until: null });
    expect(await ticket()).toMatchObject({ trello_card_id: cardId, trello_card_url: cardUrl, trello_sync_error: null });
    await claim();
    expect(await mark()).toBe(false);
  });

  it('releases a skipped worker without overwriting existing metadata or uncertain creation', async () => {
    await claim();
    await mark();
    await db.query(`update public.in_app_support_requests set trello_sync_error='Keep this error',
      trello_synced_at='2026-09-20T10:00:00Z' where id=$1`, [ticketId]);
    const before = await ticket();
    expect(await finish()).toEqual({ saved: true, stale: false });
    expect(await ticket()).toEqual(before);
    expect(await ledger()).toMatchObject({ lease_token: null, lease_until: null, creation_uncertain: true });
  });

  it('returns fresh canonical state and preserves a created card when status or priority changed during HTTP', async () => {
    const first = await claim();
    await mark();
    await db.query("update public.in_app_support_requests set status='resolved',target_date=null where id=$1", [ticketId]);
    expect(await current()).toMatchObject({ id: ticketId, status: 'resolved', target_date: null });
    const canonical = await ticket();
    expect(await finish({ card: cardId, url: cardUrl, revision: first.request.status_updated_at,
      priority: first.request.priority })).toEqual({ saved: true, stale: true });
    expect(await ticket()).toMatchObject({ trello_card_id: cardId, status: 'resolved', target_date: null,
      status_updated_at: canonical.status_updated_at, trello_synced_at: null,
      trello_sync_error: 'Ticket changed during Trello synchronization. Retry to synchronize its current status.' });
    expect((await ledger()).creation_uncertain).toBe(false);

    const retry = await claim(ticketId, leaseB);
    await db.query("update public.in_app_support_requests set priority='high' where id=$1", [ticketId]);
    const priorityEdit = await ticket();
    expect(priorityEdit.status_updated_at).toBe(retry.request.status_updated_at);
    expect(await finish({ token: leaseB, card: cardId, url: cardUrl, revision: retry.request.status_updated_at,
      priority: 'medium' })).toEqual({ saved: true, stale: true });
    await claim();
    expect(await finish({ card: cardId, url: cardUrl, revision: priorityEdit.status_updated_at, priority: 'high' }))
      .toEqual({ saved: true, stale: false });
    const repaired = await ticket();
    expect(repaired.trello_sync_error).toBeNull();
    expect(repaired.trello_synced_at).not.toBeNull();
    expect(repaired.status_updated_at).toBe(priorityEdit.status_updated_at);
  });

  it('changes only Trello metadata on successful/error saves and cascades a deleted ticket claim', async () => {
    const first = await claim();
    const before = await ticket();
    await finish({ card: cardId, url: cardUrl, revision: first.request.status_updated_at, priority: 'medium' });
    const linked = await ticket();
    for (const field of ['status', 'status_updated_at', 'priority', 'target_date', 'title', 'reporter_email']) {
      expect(linked[field]).toBe(before[field]);
    }
    await claim();
    await finish({ error: 'x'.repeat(800) });
    const failed = await ticket();
    expect(failed.trello_sync_error).toHaveLength(500);
    expect(failed.trello_card_id).toBe(cardId);
    expect(failed.trello_synced_at).toBe(linked.trello_synced_at);
    expect(failed.status_updated_at).toBe(before.status_updated_at);
    await db.query('delete from public.in_app_support_requests where id=$1', [ticketId]);
    expect(await value('select count(*)::integer from public.support_trello_sync_claims')).toBe(0);
  });
});
