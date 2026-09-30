import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ notify: vi.fn(), sync: vi.fn() }));
vi.mock('../../api/_lib/inAppSupportStatusEmail.js', () => ({ notifyInAppSupportStatus: mocks.notify }));
vi.mock('../../api/_lib/inAppSupportTicketSync.js', () => ({ syncInAppSupportTicket: mocks.sync }));

import { applyInAppSupportRelease, retryPendingInAppSupportReleases } from '../../api/_lib/inAppSupportRelease';

const releaseId = '00000000-0000-4000-8000-000000000001';
const id = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';
const secondId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f5';
const thirdId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f6';
const fourthId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f7';
const gitSha = 'a'.repeat(40);
const input = { releaseId, ticketIds: [id], deploymentId: 'dpl_release', eventId: 'evt_release', gitSha };

function request(ticketId = id) {
  return {
    id: ticketId, title: 'Feature requested by a user', category: 'feature',
    status: 'resolved', status_updated_at: '2026-09-30T12:00:00.123456+00:00',
    reporter_name: 'Jonas', reporter_email: 'reporter@example.com', locale: 'en',
    page: '/school/groups', priority: 'medium', target_date: null,
    status_notified_signature: null, trello_card_id: 'a'.repeat(24),
  };
}

type Outcome = 'applied' | 'retry' | 'complete' | 'skipped' | 'busy';

function database(options: {
  outcomes?: Partial<Record<string, Outcome[]>>;
  recovery?: Array<Record<string, unknown>>;
  lostLease?: boolean;
  rpcErrorTicket?: string;
} = {}) {
  const requests = new Map([id, secondId, thirdId, fourthId].map((ticketId) => [ticketId, request(ticketId)]));
  const outcomes = Object.fromEntries(Object.entries(options.outcomes || {}).map(([ticketId, values]) => [ticketId, [...values!]]));
  const ledgerOutcomes = new Map<string, Outcome>();
  const updates: Array<{ patch: Record<string, unknown>; filters: Record<string, unknown> }> = [];
  const queries: Array<{ table: string; filters: Record<string, unknown>; order?: string; or?: string; limit?: number }> = [];
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    if (_name === 'admit_support_release') return { data: { tickets: (args.p_ticket_ids as string[]).map((ticketId) => {
      const initial = outcomes[ticketId]?.[0];
      const outcome = ledgerOutcomes.get(ticketId) || (initial && ['skipped', 'busy', 'complete'].includes(initial) ? initial : 'applied');
      if (outcome === 'applied') ledgerOutcomes.set(ticketId, 'retry');
      return { ticketId, outcome };
    }) }, error: null };
    const ticketId = String(args.p_ticket_id);
    if (ticketId === options.rpcErrorTicket) return { data: null, error: { message: 'private database details' } };
    const outcome = outcomes[ticketId]?.shift() || 'retry';
    return { data: { outcome, request: requests.get(ticketId) }, error: null };
  });
  const from = vi.fn((table: string) => {
    const state: typeof queries[number] = { table, filters: {} };
    queries.push(state);
    let patch: Record<string, unknown> | null = null;
    const resolve = async () => {
      if (table === 'in_app_support_requests') {
        const row = requests.get(String(state.filters.id));
        return { data: row && Object.entries(state.filters).every(([key, value]) => row[key as keyof typeof row] === value)
          ? { ...row } : null, error: null };
      }
      if (patch) {
        updates.push({ patch, filters: { ...state.filters } });
        if (!options.lostLease && patch.completed_at) ledgerOutcomes.set(String(state.filters.ticket_id), patch.outcome === 'skipped' ? 'skipped' : 'complete');
        return { data: options.lostLease ? null : { ticket_id: state.filters.ticket_id }, error: null };
      }
      return { data: options.recovery || [], error: null };
    };
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((key: string, value: unknown) => { state.filters[key] = value; return query; }),
      is: vi.fn((key: string, value: unknown) => { state.filters[key] = value; return query; }),
      or: vi.fn((value: string) => { state.or = value; return query; }),
      order: vi.fn((column: string) => { state.order = column; return query; }),
      limit: vi.fn((value: number) => { state.limit = value; return query; }),
      update: vi.fn((value: Record<string, unknown>) => { patch = value; return query; }),
      maybeSingle: vi.fn(resolve),
      then: (done: (value: unknown) => unknown) => resolve().then(done),
    };
    return query;
  });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from, requests, updates, queries };
}

beforeEach(() => {
  mocks.notify.mockReset().mockResolvedValue(true);
  mocks.sync.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('support release application engine', () => {
  it('delivers the claimed revision once and completes only its owned lease', async () => {
    const db = database();

    expect(await applyInAppSupportRelease(db.client, input)).toMatchObject({ applied: 1, complete: 1, pending: 0 });
    expect(await applyInAppSupportRelease(db.client, input)).toMatchObject({ applied: 0, complete: 1, pending: 0 });

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith('claim_support_release_ticket', expect.objectContaining({
      p_release_id: releaseId, p_ticket_id: id, p_deployment_id: 'dpl_release', p_event_id: 'evt_release',
      p_git_sha: gitSha, p_lease_token: expect.stringMatching(/^[a-f0-9-]{36}$/), p_retry_only: true,
    }));
    expect(db.updates).toEqual([expect.objectContaining({
      patch: expect.objectContaining({ completed_at: expect.any(String), lease_token: null, lease_until: null, last_error: null }),
      filters: expect.objectContaining({ release_id: releaseId, ticket_id: id,
        lease_token: db.rpc.mock.calls.find(([name]) => name === 'claim_support_release_ticket')![1].p_lease_token }),
    })]);
    expect(db.queries.filter((query) => query.table === 'in_app_support_requests').every((query) => (
      query.filters.status === 'resolved' && query.filters.status_updated_at === request().status_updated_at
    ))).toBe(true);
  });

  it('deduplicates manifest ticket IDs before claiming them', async () => {
    const db = database();
    await applyInAppSupportRelease(db.client, { ...input, ticketIds: [id, id.toUpperCase()] });
    expect(db.rpc.mock.calls.filter(([name]) => name === 'claim_support_release_ticket')).toHaveLength(1);
  });

  it('does not deliver or resolve an already skipped/reopened replay', async () => {
    const db = database({ outcomes: { [id]: ['skipped'] } });
    db.requests.get(id)!.status = 'in_progress';

    expect(await applyInAppSupportRelease(db.client, input)).toMatchObject({ skipped: 1, pending: 0 });

    expect(db.requests.get(id)!.status).toBe('in_progress');
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('keeps failed notification delivery pending and retries through the existing helpers', async () => {
    const db = database({ outcomes: { [id]: ['retry', 'retry'] } });
    mocks.notify.mockRejectedValueOnce(new Error('provider-secret must not be stored'));

    expect(await applyInAppSupportRelease(db.client, input)).toMatchObject({ applied: 1, failed: 1, pending: 1 });
    expect(db.updates[0].patch).toMatchObject({ lease_token: null, lease_until: null });
    expect(JSON.stringify(db.updates)).not.toContain('provider-secret');
    expect(db.updates[0].patch).not.toHaveProperty('completed_at');
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(await applyInAppSupportRelease(db.client, input)).toMatchObject({ retried: 1, complete: 1, pending: 0 });
    expect(mocks.notify).toHaveBeenCalledTimes(2);
  });

  it('treats a false Trello sync as pending while a previously delivered email is safely skipped on retry', async () => {
    const db = database({ outcomes: { [id]: ['retry', 'retry'] } });
    mocks.sync.mockResolvedValueOnce(false);
    mocks.notify.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    expect(await applyInAppSupportRelease(db.client, input)).toMatchObject({ failed: 1, pending: 1, complete: 0 });
    expect(await applyInAppSupportRelease(db.client, input)).toMatchObject({ retried: 1, pending: 0, complete: 1 });
    expect(mocks.sync).toHaveBeenCalledTimes(2);
    expect(db.updates[0].patch).not.toHaveProperty('completed_at');
  });

  it('processes successful and skipped tickets even when another delivery fails or is busy', async () => {
    const db = database({ outcomes: { [secondId]: ['busy'], [fourthId]: ['skipped'] } });
    mocks.notify.mockImplementation(async (_client, row) => {
      if (row.id === id) throw new Error('Email failed');
      return true;
    });

    expect(await applyInAppSupportRelease(db.client, { ...input, ticketIds: [id, secondId, thirdId, fourthId] }))
      .toEqual({ applied: 2, retried: 0, complete: 1, skipped: 1, busy: 1, failed: 1, pending: 2 });
    expect(db.rpc).toHaveBeenCalledTimes(4);
    expect(mocks.sync).toHaveBeenCalledWith(db.client, expect.objectContaining({ id: thirdId }));
  });

  it('stops observed supersession before synchronizing a stale completion into Trello', async () => {
    const db = database();
    mocks.notify.mockImplementation(async () => {
      db.requests.get(id)!.status = 'in_progress';
      return true;
    });

    expect(await applyInAppSupportRelease(db.client, input)).toMatchObject({ skipped: 1, pending: 0 });

    expect(mocks.sync).not.toHaveBeenCalled();
    expect(db.updates[0].patch).toMatchObject({ outcome: 'skipped', completed_at: expect.any(String) });
  });

  it('does not complete a lease that has changed ownership', async () => {
    const db = database({ lostLease: true });
    expect(await applyInAppSupportRelease(db.client, input)).toMatchObject({ busy: 1, pending: 1, complete: 0 });
  });

  it('admits the entire release durably before an expired delivery budget', async () => {
    const db = database();
    vi.spyOn(Date, 'now').mockReturnValue(1000);

    expect(await applyInAppSupportRelease(db.client, { ...input, ticketIds: [id, secondId], deadlineAt: 1000 }))
      .toMatchObject({ pending: 2, applied: 2 });
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith('admit_support_release', expect.objectContaining({ p_ticket_ids: [id, secondId] }));
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('continues the independent batch before surfacing a bounded database error', async () => {
    const db = database({ rpcErrorTicket: id });
    await expect(applyInAppSupportRelease(db.client, { ...input, ticketIds: [id, secondId] }))
      .rejects.toThrow('Support release database operation failed.');
    expect(mocks.sync).toHaveBeenCalledWith(db.client, expect.objectContaining({ id: secondId }));
  });

  it('recovers only previously applied private records using retry-only claims', async () => {
    const prior = {
      release_id: releaseId, ticket_id: id, deployment_id: 'dpl_older_release', event_id: 'evt_older_release', git_sha: 'b'.repeat(40),
    };
    const db = database({ recovery: [prior], outcomes: { [id]: ['retry'] } });

    expect(await retryPendingInAppSupportReleases(db.client, { limit: 50 })).toMatchObject({ retried: 1, complete: 1, pending: 0 });

    expect(db.rpc).toHaveBeenCalledWith('claim_support_release_ticket', expect.objectContaining({
      p_release_id: prior.release_id, p_ticket_id: prior.ticket_id, p_deployment_id: prior.deployment_id,
      p_event_id: prior.event_id, p_git_sha: prior.git_sha, p_retry_only: true,
    }));
    expect(db.queries[0]).toMatchObject({
      table: 'support_release_tickets', filters: { outcome: 'applied', completed_at: null },
      order: 'updated_at', limit: 20, or: expect.stringContaining('lease_until.is.null,lease_until.lte.'),
    });
  });

  it('skips superseded recovery records without authorizing a new resolution', async () => {
    const db = database({ recovery: [{
      release_id: releaseId, ticket_id: id, deployment_id: input.deploymentId, event_id: input.eventId, git_sha: gitSha,
    }], outcomes: { [id]: ['skipped'] } });
    db.requests.get(id)!.status = 'in_progress';
    expect(await retryPendingInAppSupportReleases(db.client)).toMatchObject({ skipped: 1, pending: 0 });
    expect(db.rpc.mock.calls[0][1].p_retry_only).toBe(true);
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('rejects an oversized or malformed manifest before any database or delivery operation', async () => {
    const db = database();
    await expect(applyInAppSupportRelease(db.client, { ...input, ticketIds: Array(21).fill(id) })).rejects.toThrow('Invalid support release input');
    await expect(applyInAppSupportRelease(db.client, { ...input, ticketIds: ['SUP-17EE7859'] })).rejects.toThrow('Invalid support release input');
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

async function migrationDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.in_app_support_requests (
      id uuid primary key, status text not null default 'new',
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      category text not null default 'feature', title text not null default 'Requested feature',
      reporter_email text not null default 'reporter@example.com'
    );
    alter table public.in_app_support_requests enable row level security;
    grant select, update on public.in_app_support_requests to service_role;
  `);
  await db.exec(readFileSync('supabase/migrations/20260929203658_in_app_support_ticket_lifecycle.sql', 'utf8'));
  await db.exec(`create trigger in_app_support_requests_updated_at before update
    on public.in_app_support_requests for each row execute function public.set_in_app_support_updated_at();`);
  await db.exec(readFileSync('supabase/migrations/20260930120000_support_release_completion.sql', 'utf8'));
  return db;
}

async function claimSql(db: PGlite, ticketId = id, retryOnly = false) {
  const { rows } = await db.query<{ result: { outcome: Outcome; request?: Record<string, unknown> } }>(`
    select public.claim_support_release_ticket($1::uuid,$2::uuid,$3,$4,$5,$6::uuid,$7::boolean) as result
  `, [releaseId, ticketId, input.deploymentId, input.eventId, gitSha, randomUUID(), retryOnly]);
  return rows[0].result;
}

async function admitSql(db: PGlite, ticketIds: string[], selectedReleaseId = releaseId, sha = gitSha) {
  const { rows } = await db.query<{ result: { tickets: Array<{ ticketId: string; outcome: Outcome }> } }>(`
    select public.admit_support_release($1::uuid,$2::uuid[],$3,$4,$5) as result
  `, [selectedReleaseId, `{${ticketIds.join(',')}}`, input.deploymentId, input.eventId, sha]);
  return rows[0].result;
}

describe('support release claim migration', () => {
  it('durably admits the full selection as service role and recovers it after a newer deployment supersedes delivery', async () => {
    const db = await migrationDatabase();
    try {
      await db.query(`insert into public.in_app_support_requests(id,status)
        values($1,'in_progress'),($2,'in_progress'),($3,'registered')`, [id, secondId, thirdId]);
      await db.exec('set role service_role');
      expect(await admitSql(db, [thirdId, secondId, id, id])).toEqual({ tickets: [
        { ticketId: id, outcome: 'applied' }, { ticketId: secondId, outcome: 'applied' },
        { ticketId: thirdId, outcome: 'skipped' },
      ] });
      const pending = (await db.query(`select ticket_id,lease_token,lease_until,completed_at
        from public.support_release_tickets where outcome='applied' order by ticket_id`)).rows;
      expect(pending).toEqual([id, secondId].map((ticketId) => ({
        ticket_id: ticketId, lease_token: null, lease_until: null, completed_at: null,
      })));
      // No delivery happened for release A before B became current. A remains
      // trusted in the ledger, and recovery needs no authorization from B.
      expect(await admitSql(db, [id, secondId], '00000000-0000-4000-8000-000000000002', 'b'.repeat(40)))
        .toEqual({ tickets: [{ ticketId: id, outcome: 'skipped' }, { ticketId: secondId, outcome: 'skipped' }] });
      for (const ticketId of [id, secondId]) expect((await claimSql(db, ticketId, true)).outcome).toBe('retry');
      expect((await db.query(`select count(*)::integer as count from public.support_release_tickets
        where release_id=$1::uuid and outcome='applied'`, [releaseId])).rows[0]).toEqual({ count: 2 });
    } finally { await db.exec('reset role'); await db.close(); }
  }, 30_000);

  it('preserves another delivery lease while admitting all other selected tickets', async () => {
    const db = await migrationDatabase();
    try {
      await db.query(`insert into public.in_app_support_requests(id,status)
        values($1,'in_progress'),($2,'in_progress')`, [id, secondId]);
      expect((await claimSql(db)).outcome).toBe('applied');
      const before = (await db.query(`select lease_token from public.support_release_tickets where ticket_id=$1`, [id])).rows[0];
      expect(await admitSql(db, [secondId, id])).toEqual({ tickets: [
        { ticketId: id, outcome: 'busy' }, { ticketId: secondId, outcome: 'applied' },
      ] });
      expect((await db.query(`select lease_token from public.support_release_tickets where ticket_id=$1`, [id])).rows[0]).toEqual(before);
      expect((await db.query(`select lease_token,lease_until from public.support_release_tickets where ticket_id=$1`, [secondId])).rows[0])
        .toEqual({ lease_token: null, lease_until: null });
    } finally { await db.close(); }
  }, 30_000);

  it('rolls back the entire admission if any selected ticket update fails', async () => {
    const db = await migrationDatabase();
    try {
      await db.query(`insert into public.in_app_support_requests(id,status)
        values($1,'in_progress'),($2,'in_progress')`, [id, secondId]);
      await db.exec(`create function public.reject_second_release_ticket() returns trigger language plpgsql as $$
        begin if new.id='${secondId}'::uuid then raise exception 'blocked ticket'; end if; return new; end $$;
        create trigger reject_second_release_ticket before update on public.in_app_support_requests
        for each row execute function public.reject_second_release_ticket();`);
      await expect(admitSql(db, [secondId, id])).rejects.toThrow('blocked ticket');
      expect((await db.query(`select status from public.in_app_support_requests`)).rows.every((row) => row.status === 'in_progress')).toBe(true);
      expect((await db.query(`select count(*)::integer as count from public.support_release_tickets`)).rows[0]).toEqual({ count: 0 });
    } finally { await db.close(); }
  }, 30_000);

  it('atomically resolves in-progress tickets, clears their deadline, and leases retry delivery of the same revision', async () => {
    const db = await migrationDatabase();
    try {
      await db.query(`insert into public.in_app_support_requests(id,status,target_date)
        values($1,'in_progress','2026-10-05T12:00:00Z')`, [id]);
      const applied = await claimSql(db);
      expect(applied.outcome).toBe('applied');
      expect(applied.request).toMatchObject({ id, status: 'resolved', target_date: null });
      expect((await claimSql(db)).outcome).toBe('busy');
      await db.query(`update public.support_release_tickets set lease_until = now() - interval '1 second'`);
      const retry = await claimSql(db, id, true);
      expect(retry.outcome).toBe('retry');
      expect(retry.request?.status_updated_at).toBe(applied.request?.status_updated_at);
      const ledger = (await db.query(`select l.outcome,
        l.claimed_status_updated_at = r.status_updated_at as same_revision,
        l.lease_until > now() as leased, l.deployment_id,l.event_id,l.git_sha
        from public.support_release_tickets l join public.in_app_support_requests r on r.id=l.ticket_id`)).rows[0];
      expect(ledger).toMatchObject({ outcome: 'applied', same_revision: true, leased: true, deployment_id: input.deploymentId, event_id: input.eventId, git_sha: gitSha });
    } finally { await db.close(); }
  }, 30_000);

  it('permanently skips registered, already resolved, and missing IDs for that release', async () => {
    const db = await migrationDatabase();
    try {
      await db.query(`insert into public.in_app_support_requests(id,status) values($1,'registered'),($2,'resolved')`, [id, secondId]);
      for (const ticketId of [id, secondId, thirdId]) expect((await claimSql(db, ticketId)).outcome).toBe('skipped');
      await db.exec(`update public.in_app_support_requests set status='in_progress';
        insert into public.in_app_support_requests(id,status) values('${thirdId}','in_progress');`);
      for (const ticketId of [id, secondId, thirdId]) expect((await claimSql(db, ticketId)).outcome).toBe('skipped');
      const statuses = (await db.query(`select status from public.in_app_support_requests`)).rows;
      expect(statuses.every((row) => row.status === 'in_progress')).toBe(true);
      expect((await db.query(`select count(*)::integer as count from public.support_release_tickets where outcome='skipped'`)).rows[0])
        .toEqual({ count: 3 });
    } finally { await db.close(); }
  }, 30_000);

  it('supersedes pending claims after reopening and never re-resolves a completed replay', async () => {
    const db = await migrationDatabase();
    try {
      await db.query(`insert into public.in_app_support_requests(id,status) values($1,'in_progress'),($2,'in_progress')`, [id, secondId]);
      expect((await claimSql(db, id)).outcome).toBe('applied');
      expect((await claimSql(db, secondId)).outcome).toBe('applied');
      await db.query(`update public.support_release_tickets set completed_at=now(),lease_token=null,lease_until=null where ticket_id=$1`, [secondId]);
      await db.query(`update public.in_app_support_requests set status='in_progress'`);
      expect((await claimSql(db, id, true)).outcome).toBe('skipped');
      expect((await claimSql(db, secondId)).outcome).toBe('complete');
      expect((await db.query(`select status from public.in_app_support_requests`)).rows.every((row) => row.status === 'in_progress')).toBe(true);
      expect((await db.query(`select outcome,completed_at is not null as terminal,lease_token from public.support_release_tickets where ticket_id=$1`, [id])).rows[0])
        .toEqual({ outcome: 'skipped', terminal: true, lease_token: null });
    } finally { await db.close(); }
  }, 30_000);

  it('refuses a recovery-only claim for an unrecorded ticket without inserting a ledger or resolving it', async () => {
    const db = await migrationDatabase();
    try {
      await db.query(`insert into public.in_app_support_requests(id,status) values($1,'in_progress')`, [id]);
      expect((await claimSql(db, id, true)).outcome).toBe('skipped');
      expect((await db.query(`select status from public.in_app_support_requests`)).rows[0]).toEqual({ status: 'in_progress' });
      expect((await db.query(`select count(*)::integer as count from public.support_release_tickets`)).rows[0]).toEqual({ count: 0 });
    } finally { await db.close(); }
  }, 30_000);

  it('rejects a status revision superseded by one microsecond while the ticket remains resolved', async () => {
    const db = await migrationDatabase();
    try {
      await db.query(`insert into public.in_app_support_requests(id,status) values($1,'in_progress')`, [id]);
      expect((await claimSql(db)).outcome).toBe('applied');
      await db.query(`update public.in_app_support_requests set status_updated_at=status_updated_at+interval '1 microsecond' where id=$1`, [id]);
      expect((await db.query(`select r.status_updated_at-l.claimed_status_updated_at = interval '1 microsecond' as microsecond_changed
        from public.in_app_support_requests r join public.support_release_tickets l on l.ticket_id=r.id`)).rows[0])
        .toEqual({ microsecond_changed: true });
      expect((await claimSql(db, id, true)).outcome).toBe('skipped');
      expect((await db.query(`select status from public.in_app_support_requests`)).rows[0]).toEqual({ status: 'resolved' });
    } finally { await db.close(); }
  }, 30_000);

  it('keeps the ledger and resolving RPC inaccessible to anonymous and signed-in client roles', async () => {
    const db = await migrationDatabase();
    try {
      const signature = 'public.claim_support_release_ticket(uuid,uuid,text,text,text,uuid,boolean)';
      const admissionSignature = 'public.admit_support_release(uuid,uuid[],text,text,text)';
      const privileges = (await db.query(`select
        has_table_privilege('anon','public.support_release_tickets','select') as anon_read,
        has_table_privilege('authenticated','public.support_release_tickets','update') as user_write,
        has_function_privilege('anon',$1,'execute') as anon_claim,
        has_function_privilege('authenticated',$1,'execute') as user_claim,
        has_function_privilege('service_role',$1,'execute') as service_claim,
        has_function_privilege('anon',$2,'execute') as anon_admit,
        has_function_privilege('authenticated',$2,'execute') as user_admit,
        has_function_privilege('service_role',$2,'execute') as service_admit`, [signature, admissionSignature])).rows[0];
      expect(privileges).toEqual({ anon_read: false, user_write: false, anon_claim: false, user_claim: false, service_claim: true,
        anon_admit: false, user_admit: false, service_admit: true });
      expect((await db.query(`select relrowsecurity from pg_class where oid='public.support_release_tickets'::regclass`)).rows[0])
        .toEqual({ relrowsecurity: true });
      expect((await db.query(`select count(*)::integer as count from pg_policies where tablename='support_release_tickets'`)).rows[0])
        .toEqual({ count: 0 });
      await db.query(`insert into public.in_app_support_requests(id,status) values($1,'in_progress')`, [id]);
      await db.exec('set role service_role');
      expect((await claimSql(db)).outcome).toBe('applied');
      await db.exec('reset role; set role anon');
      await expect(claimSql(db)).rejects.toThrow('permission denied');
      await expect(admitSql(db, [id])).rejects.toThrow('permission denied');
      await expect(db.query('select * from public.support_release_tickets')).rejects.toThrow('permission denied');
    } finally { await db.exec('reset role'); await db.close(); }
  }, 30_000);
});
