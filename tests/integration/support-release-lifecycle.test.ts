// @vitest-environment node
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The build's committed manifest is configuration. Its parser stays real.
const configuration = vi.hoisted(() => ({ manifest: {
  version: 1, releaseId: '8cb31cd5-7c88-43ea-b850-a337c92099c1',
  productionBranch: 'simo-local', ticketIds: [] as string[],
} }));
vi.mock('../../api/_lib/supportReleaseManifest.js', () => ({ supportReleaseManifest: configuration.manifest }));

import promotionHandler from '../../api/vercel-support-release';
import recoveryHandler from '../../api/retry-support-releases';
import customerHandler from '../../api/my-support-requests';
import trelloHandler from '../../api/trello-support-webhook';

const releaseId = configuration.manifest.releaseId;
const featureId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';
const bugId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f5';
const registeredId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f6';
const unselectedId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f7';
const customerId = '68ab61bc-8303-49b7-9e12-44e7b2288eb1';
const otherUserId = '68ab61bc-8303-49b7-9e12-44e7b2288eb2';
const deploymentId = 'dpl_release1';
const projectId = 'prj_tutlio';
const gitSha = 'a'.repeat(40);
const secret = 'isolated-release-secret';
const trelloSecret = 'isolated-trello-secret';
const trelloCallback = 'https://tutlio.lt/api/trello-support-webhook';
const deadline = '2026-10-05T12:00:00+00:00';
const boardId = 'b'.repeat(24);
const featureCard = 'a'.repeat(24);
const bugCard = 'f'.repeat(24);
const lists = { featuresResolved: '3'.repeat(24), bugsResolved: 'e'.repeat(24) };

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function response() {
  let code = 200;
  let body: any;
  const headers: Record<string, string> = {};
  const res: any = {
    setHeader: (key: string, value: string) => { headers[key] = value; },
    status: (value: number) => { code = value; return res; },
    json: (value: unknown) => { body = value; return res; },
  };
  return { res, result: () => ({ code, body, headers }) };
}

function signedPromotion(signature?: string) {
  const raw = Buffer.from(JSON.stringify({ id: 'evt_release1', type: 'deployment.promoted', payload: {
    project: { id: projectId }, deployment: { id: deploymentId, target: 'production' },
    // Payload-supplied ticket selections must not override the build manifest.
    ticketIds: [unselectedId], releaseId: 'untrusted-release',
  } }));
  const req = Readable.from([raw.subarray(0, 19), raw.subarray(19)]) as any;
  req.method = 'POST';
  req.headers = { 'x-vercel-signature': signature ?? createHmac('sha1', secret).update(raw).digest('hex') };
  return req;
}

async function promote(signature?: string) {
  const output = response();
  await promotionHandler(signedPromotion(signature), output.res);
  return output.result();
}

async function customerTickets(token = 'customer-token') {
  const output = response();
  await customerHandler({ method: 'GET', headers: { authorization: `Bearer ${token}` }, query: { ticket: featureId } } as any, output.res);
  return output.result();
}

async function recover() {
  const output = response();
  await recoveryHandler({ method: 'GET', headers: { authorization: 'Bearer isolated-cron-secret' } } as any, output.res);
  return output.result();
}

async function cardMoved(signature?: string) {
  const raw = Buffer.from(JSON.stringify({ model: { id: boardId }, action: { type: 'updateCard', data: {
    board: { id: boardId }, card: { id: featureCard },
    // Actions can arrive late; fetched card state is authoritative.
    listAfter: { id: lists.featuresResolved },
  } } }));
  const req = Readable.from([raw]) as any;
  req.method = 'POST';
  req.headers = { 'x-trello-webhook': signature ?? createHmac('sha1', trelloSecret).update(raw).update(trelloCallback).digest('base64') };
  const output = response();
  await trelloHandler(req, output.res);
  return output.result();
}

async function isolatedDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.organizations(id uuid primary key);`);
  for (const filename of [
    '20260916150000_in_app_support_requests.sql',
    '20260918130000_in_app_support_completion_notifications.sql',
    '20260929203658_in_app_support_ticket_lifecycle.sql',
    '20260930120000_support_release_completion.sql',
    '20260930190000_support_trello_sync_claims.sql',
  ]) await db.exec(readFileSync(`supabase/migrations/${filename}`, 'utf8'));
  await db.query('insert into auth.users(id) values($1),($2)', [customerId, otherUserId]);
  for (const [ticketId, category, status, reporter, card] of [
    [featureId, 'feature', 'in_progress', customerId, featureCard],
    [bugId, 'bug', 'in_progress', otherUserId, bugCard],
    [registeredId, 'feature', 'registered', customerId, null],
    [unselectedId, 'feature', 'in_progress', customerId, null],
  ]) {
    await db.query(`insert into public.in_app_support_requests (
      id,request_id,reporter_user_id,reporter_name,reporter_email,reporter_role,category,title,
      context,steps,expected_outcome,impact,impact_details,page,locale,environment,
      status,priority,target_date,trello_card_id
    ) values($1,$2,$3,'Jonas','reporter@example.com','parent',$4,'Requested improvement',
      'A useful requested improvement','["Open the lesson"]','The requested result','medium','Several users',
      '/parent/lessons','en','{"siteOrigin":"https://tutlio.pl"}',$5,'medium',$6,$7)`,
    [ticketId, `request-${ticketId}`, reporter, category, status, status === 'in_progress' ? deadline : null, card]);
  }
  // Every HTTP-backed database operation below executes with real service-role privileges.
  await db.exec('set role service_role');
  return db;
}

// A small, closed PostgREST transport adapter runs actual SQL, rather than mocking
// RPC outcomes or persistence. JSON rows preserve PostgreSQL's microsecond stamps.
function identifier(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Unexpected SQL identifier: ${value}`);
  return `"${value}"`;
}

async function postgrest(db: PGlite, url: URL, options: RequestInit) {
  const resource = url.pathname.slice('/rest/v1/'.length);
  const method = options.method || 'GET';
  if (resource.startsWith('rpc/')) {
    const args = JSON.parse(String(options.body));
    if (resource === 'rpc/admit_support_release') {
      const result = await db.query<{ result: unknown }>(
        'select public.admit_support_release($1::uuid,$2::uuid[],$3,$4,$5) as result',
        [args.p_release_id, `{${args.p_ticket_ids.join(',')}}`, args.p_deployment_id, args.p_event_id, args.p_git_sha],
      );
      return json(result.rows[0].result);
    }
    if (resource === 'rpc/claim_support_release_ticket') {
      const result = await db.query<{ result: unknown }>(
        'select public.claim_support_release_ticket($1::uuid,$2::uuid,$3,$4,$5,$6::uuid,$7::boolean) as result',
        [args.p_release_id, args.p_ticket_id, args.p_deployment_id, args.p_event_id, args.p_git_sha, args.p_lease_token, args.p_retry_only],
      );
      return json(result.rows[0].result);
    }
    if (resource === 'rpc/claim_support_trello_sync' || resource === 'rpc/current_support_trello_sync'
      || resource === 'rpc/mark_support_trello_creation') {
      const name = resource.slice('rpc/'.length);
      const result = await db.query<{ result: unknown }>(
        `select public.${identifier(name)}($1::uuid,$2::uuid) as result`, [args.p_ticket_id, args.p_lease_token],
      );
      return json(result.rows[0].result);
    }
    if (resource === 'rpc/finish_support_trello_sync') {
      const result = await db.query<{ result: unknown }>(
        'select public.finish_support_trello_sync($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::timestamptz,$7::text) as result',
        [args.p_ticket_id, args.p_lease_token, args.p_card_id ?? null, args.p_card_url ?? null,
          args.p_error ?? null, args.p_expected_status_updated_at ?? null, args.p_expected_priority ?? null],
      );
      return json(result.rows[0].result);
    }
    throw new Error(`Unexpected RPC: ${resource}`);
  }
  if (!['in_app_support_requests', 'support_release_tickets'].includes(resource)) throw new Error(`Unexpected table: ${resource}`);
  const parameters: unknown[] = [];
  const bind = (value: unknown) => { parameters.push(value); return `$${parameters.length}`; };
  const conditions: string[] = [];
  for (const [column, expression] of url.searchParams) {
    if (['select', 'order', 'limit'].includes(column)) continue;
    if (column === 'or') {
      const match = /^\(lease_until\.is\.null,lease_until\.lte\.(.+)\)$/.exec(expression);
      if (!match) throw new Error(`Unexpected disjunction: ${expression}`);
      conditions.push(`(lease_until is null or lease_until <= ${bind(match[1])}::timestamptz)`);
    } else if (expression === 'is.null') conditions.push(`${identifier(column)} is null`);
    else if (expression.startsWith('eq.')) conditions.push(`${identifier(column)}=${bind(expression.slice(3))}`);
    else throw new Error(`Unexpected filter: ${expression}`);
  }
  const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
  const columns = url.searchParams.get('select') || '*';
  const projection = columns === '*' ? '*' : columns.split(',').map(identifier).join(',');
  let sql: string;
  if (method === 'PATCH') {
    const patch = JSON.parse(String(options.body));
    const changes = Object.entries(patch).map(([column, value]) => `${identifier(column)}=${bind(value)}`);
    sql = `with changed as (update public.${identifier(resource)} set ${changes.join(',')} ${where} returning *)
      select to_jsonb(selected) as row from (select ${projection} from changed) selected`;
  } else if (method === 'GET') {
    let suffix = '';
    const order = url.searchParams.get('order');
    if (order) suffix += ` order by ${order.split(',').map((value) => {
      const [column, direction] = value.split('.');
      if (!['asc', 'desc'].includes(direction)) throw new Error('Unexpected order');
      return `${identifier(column)} ${direction}`;
    }).join(',')}`;
    const limit = url.searchParams.get('limit');
    if (limit) suffix += ` limit ${bind(Number(limit))}`;
    sql = `select to_jsonb(selected) as row from (select ${projection} from public.${identifier(resource)} ${where}${suffix}) selected`;
  } else throw new Error(`Unexpected database method: ${method}`);
  const result = await db.query<{ row: Record<string, unknown> }>(sql, parameters);
  const headers = new Headers(options.headers);
  if (method === 'PATCH' && !headers.get('Prefer')?.includes('return=representation')) return new Response(null, { status: 204 });
  const rows = result.rows.map((item) => item.row);
  return json(headers.get('Accept')?.includes('application/vnd.pgrst.object+json') ? rows[0] ?? null : rows);
}

function transports(db: PGlite) {
  const state = {
    currentProduction: deploymentId,
    trelloFailures: 0,
    emails: [] as Array<{ message: Record<string, any>; key: string | null }>,
    trello: [] as Array<{ url: string; method: string; body: Record<string, any> }>,
    database: [] as Array<{ resource: string; method: string; body: any }>,
    vercel: [] as URL[],
    trelloReads: [] as URL[],
    featureSnapshot: {
      id: featureCard, idBoard: boardId, idList: '2'.repeat(24),
      name: 'SUP-17EE7859 · [P2] Feature /parent/lessons',
      desc: 'Tutlio support reference: SUP-17EE7859\nType: Feature request',
      due: '2026-10-05T12:00:00.000Z' as string | null, labels: [], closed: false,
    },
  };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    const headers = new Headers(options.headers);
    if (url.origin === 'https://release-db.example.invalid') {
      if (url.pathname === '/auth/v1/user') {
        const authenticatedId = headers.get('Authorization') === 'Bearer customer-token' ? customerId : otherUserId;
        return json({ id: authenticatedId, aud: 'authenticated', role: 'authenticated', email: 'reporter@example.com' });
      }
      expect(headers.get('Authorization')).toBe('Bearer isolated-service-key');
      state.database.push({ resource: url.pathname, method: options.method || 'GET', body: options.body ? JSON.parse(String(options.body)) : null });
      try { return await postgrest(db, url, options); }
      catch (error) { return json({ code: 'TEST_SQL_ERROR', message: String(error) }, 400); }
    }
    if (url.origin === 'https://api.vercel.com') {
      state.vercel.push(url);
      expect(headers.get('Authorization')).toBe('Bearer isolated-vercel-token');
      expect(url.searchParams.get('teamId')).toBe('team_isolated');
      if (url.pathname === `/v9/projects/${projectId}`) return json({ id: projectId, targets: { production: { id: state.currentProduction } } });
      if (url.pathname === `/v13/deployments/${deploymentId}`) return json({
        id: deploymentId, projectId, target: 'production', readyState: 'READY',
        gitSource: { ref: 'simo-local', sha: gitSha }, meta: { githubCommitRef: 'simo-local', githubCommitSha: gitSha },
      });
      throw new Error(`Unexpected Vercel URL: ${url}`);
    }
    if (url.origin === 'https://api.resend.com' && url.pathname === '/emails') {
      expect(headers.get('Authorization')).toBe('Bearer isolated-resend-key');
      state.emails.push({ message: JSON.parse(String(options.body)), key: headers.get('Idempotency-Key') });
      return json({ id: `email-${state.emails.length}` });
    }
    if (url.origin === 'https://api.trello.com' && [featureCard, bugCard].some((card) => url.pathname === `/1/cards/${card}`)) {
      expect(headers.get('Authorization')).toContain('isolated-trello-token');
      if (options.method === 'GET' && url.pathname.endsWith(featureCard)) {
        state.trelloReads.push(url);
        return json(state.featureSnapshot);
      }
      state.trello.push({ url: url.href, method: options.method!, body: JSON.parse(String(options.body)) });
      if (state.trelloFailures > 0) { state.trelloFailures -= 1; return json({ error: 'Simulated upstream outage' }, 503); }
      if (url.pathname.endsWith(featureCard)) Object.assign(state.featureSnapshot, JSON.parse(String(options.body)));
      return json({ id: url.pathname.split('/').at(-1), url: 'https://trello.com/c/isolated' });
    }
    // No request may fall through to the network or a developer's live accounts.
    throw new Error(`Unexpected external request: ${url}`);
  }));
  return state;
}

let db: PGlite;
let transport: ReturnType<typeof transports>;

beforeEach(async () => {
  for (const [name, value] of Object.entries({
    VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_ID: projectId, VERCEL_DEPLOYMENT_ID: deploymentId,
    VERCEL_GIT_COMMIT_SHA: gitSha, SUPPORT_RELEASE_WEBHOOK_SECRET: secret,
    SUPPORT_RELEASE_VERCEL_TOKEN: 'isolated-vercel-token', SUPPORT_RELEASE_VERCEL_TEAM_ID: 'team_isolated',
    SUPABASE_URL: 'https://release-db.example.invalid', VITE_SUPABASE_URL: 'https://release-db.example.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'isolated-service-key', CRON_SECRET: 'isolated-cron-secret',
    RESEND_API_KEY: 'isolated-resend-key', FROM_EMAIL: 'Tutlio <test@example.com>', APP_URL: 'https://tutlio.lt',
    TRELLO_API_KEY: 'isolated-trello-key', TRELLO_TOKEN: 'isolated-trello-token', TRELLO_BOARD_ID: boardId,
    TRELLO_APPLICATION_SECRET: trelloSecret, TRELLO_WEBHOOK_CALLBACK_URL: trelloCallback, TRELLO_WEBHOOK_ID: '',
    TRELLO_LIST_NEW_ID: 'c'.repeat(24), TRELLO_LIST_IN_PROGRESS_ID: 'd'.repeat(24), TRELLO_LIST_RESOLVED_ID: lists.bugsResolved,
    TRELLO_FEATURE_LIST_NEW_ID: '1'.repeat(24), TRELLO_FEATURE_LIST_IN_PROGRESS_ID: '2'.repeat(24), TRELLO_FEATURE_LIST_RESOLVED_ID: lists.featuresResolved,
  })) vi.stubEnv(name, value);
  configuration.manifest.ticketIds = [featureId, bugId, registeredId];
  db = await isolatedDatabase();
  transport = transports(db);
  vi.spyOn(console, 'error').mockImplementation(() => {});
}, 30_000);

afterEach(async () => {
  if (db) await db.close();
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('signed production promotion to customer completion', () => {
  it('authenticates a Trello drag, reads the latest card, requires a deadline, and promotes the feature through customer completion', async () => {
    configuration.manifest.ticketIds = [featureId];
    await db.query(`update public.in_app_support_requests set status='registered',target_date=null where id=$1`, [featureId]);
    expect(await cardMoved('invalid')).toMatchObject({ code: 403 });
    expect(transport.trelloReads).toHaveLength(0);
    transport.featureSnapshot.due = null;
    expect(await cardMoved()).toMatchObject({ code: 200, body: { result: 'updated' } });
    expect((await customerTickets()).body.requests.find((ticket: any) => ticket.id === featureId).status).toBe('registered');
    expect(transport.emails).toHaveLength(0);
    transport.featureSnapshot.due = '2026-10-05T12:00:00.000Z';
    expect(await cardMoved()).toMatchObject({ code: 200, body: { result: 'updated' } });
    const implementing = (await customerTickets()).body.requests.find((ticket: any) => ticket.id === featureId);
    expect(implementing.status).toBe('in_progress');
    expect(Date.parse(implementing.target_date)).toBe(Date.parse(deadline));
    expect(transport.emails[0].message.html).toContain('implementing your requested feature');
    expect(await cardMoved()).toMatchObject({ code: 200, body: { result: 'unchanged' } });
    expect(transport.emails).toHaveLength(1);
    expect(transport.trelloReads).toHaveLength(6);
    expect(await promote()).toMatchObject({ code: 200, body: { applied: 1, complete: 1, pending: 0 } });
    expect((await customerTickets()).body.requests.find((ticket: any) => ticket.id === featureId).status).toBe('resolved');
    expect(transport.emails).toHaveLength(2);
    expect(transport.emails[1].message.html).toContain('implemented and is now available');
    expect(transport.featureSnapshot.idList).toBe(lists.featuresResolved);
  }, 30_000);

  it('resolves only selected in-progress tickets, delivers feature/bug completion, and makes the result visible to its owner', async () => {
    expect((await customerTickets()).body.requests.find((ticket: any) => ticket.id === featureId)).toMatchObject({ status: 'in_progress' });
    expect(await promote()).toMatchObject({ code: 200, body: { ok: true, applied: 2, complete: 2, skipped: 1, pending: 0 } });
    expect(transport.vercel).toHaveLength(2);
    expect(transport.vercel.some((url) => url.searchParams.get('withGitRepoInfo') === 'true')).toBe(true);
    const admitted = transport.database.find((call) => call.resource.endsWith('/rpc/admit_support_release'))!;
    expect(admitted.body.p_ticket_ids).toEqual(configuration.manifest.ticketIds);
    const claims = transport.database.filter((call) => call.resource.endsWith('/rpc/claim_support_release_ticket'));
    expect(claims).toHaveLength(2);
    expect(claims.every((call) => call.body.p_retry_only === true)).toBe(true);
    expect(transport.emails).toHaveLength(2);
    const featureEmail = transport.emails.find((email) => email.message.subject.includes('feature request'))!;
    expect(featureEmail.message.html).toContain('implemented and is now available');
    expect(featureEmail.message.html).toContain(`https://tutlio.pl/parent/support/tickets?ticket=${featureId}`);
    expect(featureEmail.key).toContain(`in-app-support-status-${featureId}-`);
    expect(transport.trello).toHaveLength(2);
    for (const call of transport.trello) {
      expect(call.method).toBe('PUT');
      expect(call.body.idList).toBe(call.url.endsWith(featureCard) ? lists.featuresResolved : lists.bugsResolved);
      expect(call.body.due).toBeNull();
      expect(JSON.stringify(call.body)).not.toContain('reporter@example.com');
    }
    const ledger = (await db.query(`select l.ticket_id,l.outcome,l.completed_at is not null as complete,
      l.lease_token,l.git_sha,l.deployment_id,l.claimed_status_updated_at=r.status_updated_at as same_revision
      from public.support_release_tickets l join public.in_app_support_requests r on r.id=l.ticket_id order by l.ticket_id`)).rows;
    expect(ledger.slice(0, 2)).toEqual([featureId, bugId].map((ticketId) => ({ ticket_id: ticketId, outcome: 'applied',
      complete: true, lease_token: null, git_sha: gitSha, deployment_id: deploymentId, same_revision: true })));
    const visible = await customerTickets();
    expect(visible.code).toBe(200);
    const completedFeature = visible.body.requests.find((ticket: any) => ticket.id === featureId);
    expect(completedFeature).toMatchObject({ status: 'resolved', target_date: null });
    expect(visible.body.requests.find((ticket: any) => ticket.id === registeredId)).toMatchObject({ status: 'registered' });
    expect(visible.body.requests.find((ticket: any) => ticket.id === unselectedId)).toMatchObject({ status: 'in_progress' });
    expect(visible.body.requests.some((ticket: any) => ticket.id === bugId)).toBe(false);
    expect(JSON.stringify(visible.body)).not.toMatch(/reporter_email|trello_card_id|status_notified_signature/);

    expect(await promote()).toMatchObject({ code: 200, body: { applied: 0, complete: 2, skipped: 1, pending: 0 } });
    await db.query('update public.in_app_support_requests set status=$1 where id=$2', ['in_progress', featureId]);
    expect(await promote()).toMatchObject({ code: 200, body: { applied: 0, complete: 2, pending: 0 } });
    expect((await customerTickets()).body.requests.find((ticket: any) => ticket.id === featureId)).toMatchObject({ status: 'in_progress' });
    expect(transport.emails).toHaveLength(2);
    expect(transport.trello).toHaveLength(2);
  }, 30_000);

  it('keeps a failed Trello delivery pending and redelivers the same promotion without another completion email', async () => {
    configuration.manifest.ticketIds = [featureId];
    transport.trelloFailures = 1;
    expect(await promote()).toMatchObject({ code: 503, headers: { 'Retry-After': '30' }, body: { applied: 1, failed: 1, pending: 1 } });
    expect((await db.query(`select outcome,completed_at,lease_token,last_error from public.support_release_tickets`)).rows[0])
      .toMatchObject({ outcome: 'applied', completed_at: null, lease_token: null, last_error: 'Support release email or Trello delivery could not be completed.' });
    expect((await customerTickets()).body.requests.find((ticket: any) => ticket.id === featureId).status).toBe('resolved');
    // A human's priority-only edit in Done must not create another completion
    // revision or supersede delivery still pending from the promoted release.
    transport.featureSnapshot.idList = lists.featuresResolved;
    transport.featureSnapshot.due = null;
    transport.featureSnapshot.name = 'SUP-17EE7859 · [P1] Feature /parent/lessons';
    expect(await cardMoved()).toMatchObject({ code: 200, body: { result: 'updated' } });
    expect(transport.emails).toHaveLength(1);
    expect((await db.query(`select r.status_updated_at=l.claimed_status_updated_at as same_revision,r.priority,r.target_date
      from public.support_release_tickets l join public.in_app_support_requests r on r.id=l.ticket_id`)).rows[0])
      .toEqual({ same_revision: true, priority: 'high', target_date: null });
    expect(await promote()).toMatchObject({ code: 200, body: { applied: 0, retried: 1, complete: 1, pending: 0 } });
    expect(transport.emails).toHaveLength(1);
    expect(transport.trello).toHaveLength(2);
    expect((await db.query(`select completed_at is not null as complete,last_error from public.support_release_tickets`)).rows[0])
      .toEqual({ complete: true, last_error: null });
  }, 30_000);

  it('recovers trusted older delivery after a new deployment and skips a pending ticket that was reopened', async () => {
    configuration.manifest.ticketIds = [featureId, bugId];
    transport.trelloFailures = 2;
    expect(await promote()).toMatchObject({ code: 503, body: { applied: 2, pending: 2 } });
    await db.query('update public.in_app_support_requests set status=$1 where id=$2', ['in_progress', bugId]);
    transport.currentProduction = 'dpl_newer';
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_newer');
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'b'.repeat(40));
    expect(await promote()).toMatchObject({ code: 200, body: { ignored: 'obsolete_deployment' } });
    expect(await recover()).toMatchObject({ code: 200, body: { retried: 1, complete: 1, skipped: 1, pending: 0 } });
    expect(transport.emails).toHaveLength(2);
    expect(transport.trello).toHaveLength(3);
    const ledger = (await db.query(`select ticket_id,outcome,completed_at is not null as complete,git_sha
      from public.support_release_tickets order by ticket_id`)).rows;
    expect(ledger).toEqual([
      { ticket_id: featureId, outcome: 'applied', complete: true, git_sha: gitSha },
      { ticket_id: bugId, outcome: 'skipped', complete: true, git_sha: gitSha },
    ]);
    expect((await customerTickets('other-user-token')).body.requests.find((ticket: any) => ticket.id === bugId).status).toBe('in_progress');
    expect(await recover()).toMatchObject({ code: 200, body: { complete: 0, retried: 0, pending: 0 } });
    expect(transport.trello).toHaveLength(3);
  }, 30_000);

  it('rejects an invalid signature and ignores a signed obsolete promotion before any release mutation', async () => {
    expect(await promote('0'.repeat(40))).toMatchObject({ code: 403 });
    expect(transport.vercel).toHaveLength(0);
    transport.currentProduction = 'dpl_newer';
    expect(await promote()).toMatchObject({ code: 200, body: { ignored: 'obsolete_deployment' } });
    expect(transport.database.filter((call) => call.resource.includes('/rpc/'))).toHaveLength(0);
    expect((await db.query('select count(*)::integer as count from public.support_release_tickets')).rows[0]).toEqual({ count: 0 });
    expect(transport.emails).toHaveLength(0);
    expect(transport.trello).toHaveLength(0);
    expect((await customerTickets()).body.requests.find((ticket: any) => ticket.id === featureId).status).toBe('in_progress');
  }, 30_000);
});
