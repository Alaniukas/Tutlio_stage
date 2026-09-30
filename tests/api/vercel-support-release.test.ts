import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getClient: vi.fn(), applyRelease: vi.fn(), manifest: vi.fn() }));
vi.mock('../../api/_lib/supportPersistence.js', () => ({ getSupportServiceClient: mocks.getClient }));
vi.mock('../../api/_lib/inAppSupportRelease.js', () => ({ applyInAppSupportRelease: mocks.applyRelease }));
vi.mock('../../api/_lib/inAppSupportReleaseManifest.js', () => ({ loadSupportReleaseManifest: mocks.manifest }));

import handler, { config } from '../../api/vercel-support-release';
import {
  getSupportReleaseVercelSettings,
  parseSupportPromotionEvent,
  validSupportReleaseSignature,
  verifySupportProductionPromotion,
  type SupportReleaseVercelSettings,
} from '../../api/_lib/supportReleaseVercel';

const secret = 'release-webhook-secret';
const token = 'private-vercel-token';
const deploymentId = 'dpl_currentRelease1';
const projectId = 'prj_tutlio';
const eventId = 'evt_release1';
const teamId = 'team_tutlio';
const gitSha = 'a'.repeat(40);
const releaseId = '8cb31cd5-7c88-43ea-b850-a337c92099c1';
const ticketId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';
const client = { marker: 'service-client' };
const settings: SupportReleaseVercelSettings = { secret, token, projectId, teamId,
  runtimeDeploymentId: deploymentId };

function event(overrides: Record<string, unknown> = {}) {
  return { id: eventId, type: 'deployment.promoted', payload: {
    project: { id: projectId }, deployment: { id: deploymentId },
  }, ...overrides };
}

function signedRawRequest(raw: Buffer, headers: Record<string, unknown> = {}) {
  const request = Readable.from([raw.subarray(0, 11), raw.subarray(11)]) as any;
  request.method = 'POST';
  request.headers = { 'x-vercel-signature': createHmac('sha1', secret).update(raw).digest('hex'), ...headers };
  return request;
}

function signedRequest(payload: unknown, headers: Record<string, unknown> = {}) {
  return signedRawRequest(Buffer.from(JSON.stringify(payload)), headers);
}

function response() {
  let code = 200;
  let body: any = null;
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn((value: number) => { code = value; return res; }),
    json: vi.fn((value: unknown) => { body = value; return res; }),
  };
  return { res, result: () => ({ code, body }) };
}

function vercelResponses(overrides: {
  project?: Record<string, unknown>;
  deployment?: Record<string, unknown>;
  projectStatus?: number;
  deploymentStatus?: number;
} = {}) {
  const project = { id: projectId, targets: { production: { id: deploymentId } }, ...overrides.project };
  const deployment = {
    id: deploymentId, projectId, target: 'production', readyState: 'READY',
    gitSource: { ref: 'simo-local', sha: gitSha },
    meta: { githubCommitRef: 'simo-local', githubCommitSha: gitSha },
    ...overrides.deployment,
  };
  const fetchMock = vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    const isProject = url.pathname.startsWith('/v9/projects/');
    return new Response(JSON.stringify(isProject ? project : deployment), {
      status: (isProject ? overrides.projectStatus : overrides.deploymentStatus) || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const [name, value] of Object.entries({
    VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_ID: projectId,
    VERCEL_DEPLOYMENT_ID: deploymentId, VERCEL_GIT_COMMIT_SHA: gitSha,
    SUPPORT_RELEASE_WEBHOOK_SECRET: secret, SUPPORT_RELEASE_VERCEL_TOKEN: token,
    SUPPORT_RELEASE_VERCEL_TEAM_ID: teamId,
  })) vi.stubEnv(name, value);
  mocks.getClient.mockReturnValue(client);
  mocks.manifest.mockReturnValue({ version: 1, releaseId, productionBranch: 'simo-local', ticketIds: [ticketId] });
  mocks.applyRelease.mockResolvedValue({ completed: 1, skipped: 0, pending: 0 });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vercelResponses();
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('production release event authentication and verification', () => {
  it('verifies the original raw bytes with the webhook secret', () => {
    const raw = Buffer.from('{ "type": "deployment.promoted", "name": "Žinutė" }\n');
    const signature = createHmac('sha1', secret).update(raw).digest('hex');
    expect(validSupportReleaseSignature(raw, signature, secret)).toBe(true);
    expect(validSupportReleaseSignature(raw, signature.toUpperCase(), secret)).toBe(true);
    expect(validSupportReleaseSignature(Buffer.from('{}'), signature, secret)).toBe(false);
    expect(validSupportReleaseSignature(raw, signature, 'wrong-secret')).toBe(false);
    for (const invalid of [undefined, [], 'invalid', 'a'.repeat(39), 'g'.repeat(40)]) {
      expect(validSupportReleaseSignature(raw, invalid, secret)).toBe(false);
    }
    expect(validSupportReleaseSignature(raw, signature, '')).toBe(false);
  });

  it('extracts only promotion identity, ignoring payload release and target claims', () => {
    expect(parseSupportPromotionEvent(event({ payload: {
      project: { id: projectId }, deployment: { id: deploymentId, target: 'production', meta: { gitSha: 'untrusted' } },
      releaseId: 'untrusted', ticketIds: ['untrusted'],
    } }))).toEqual({ eventId, deploymentId, projectId });
    expect(parseSupportPromotionEvent(event({ type: 'deployment.ready' }))).toBeNull();
    expect(parseSupportPromotionEvent(null)).toBeNull();
    expect(() => parseSupportPromotionEvent(event({ payload: { project: { id: projectId }, deployment: { id: '../other' } } })))
      .toThrow('Invalid production promotion event');
  });

  it.each(['VERCEL_PROJECT_ID', 'VERCEL_DEPLOYMENT_ID', 'SUPPORT_RELEASE_WEBHOOK_SECRET', 'SUPPORT_RELEASE_VERCEL_TOKEN'])
  ('requires server setting %s', (name) => {
    vi.stubEnv(name, '');
    expect(getSupportReleaseVercelSettings()).toBeNull();
  });

  it('does not enable release processing outside Vercel and trims server settings', () => {
    vi.stubEnv('VERCEL', '');
    expect(getSupportReleaseVercelSettings()).toBeNull();
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('SUPPORT_RELEASE_VERCEL_TEAM_ID', ` ${teamId} `);
    expect(getSupportReleaseVercelSettings()).toEqual({ secret, token, projectId, teamId, runtimeDeploymentId: deploymentId });
  });

  it('verifies production and Git identity through fixed authenticated Vercel API URLs', async () => {
    const fetchMock = vercelResponses();
    await expect(verifySupportProductionPromotion({ eventId, deploymentId, projectId }, settings, 'simo-local'))
      .resolves.toEqual({ verified: true, gitSha });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [input, options] of fetchMock.mock.calls as unknown as Array<[URL, RequestInit]>) {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://api.vercel.com');
      expect(url.searchParams.get('teamId')).toBe(teamId);
      expect(url.href).not.toContain(token);
      expect(options).toMatchObject({ redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
      if (url.pathname.includes('/deployments/')) expect(url.searchParams.get('withGitRepoInfo')).toBe('true');
    }
  });

  it('ignores a foreign project before calling Vercel', async () => {
    await expect(verifySupportProductionPromotion({ eventId, deploymentId, projectId: 'prj_other' }, settings, 'simo-local'))
      .resolves.toEqual({ verified: false, reason: 'other_project' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('distinguishes an obsolete promotion from a current promotion reaching the previous runtime', async () => {
    vercelResponses({ project: { targets: { production: { id: 'dpl_later' } } } });
    await expect(verifySupportProductionPromotion({ eventId, deploymentId, projectId },
      { ...settings, runtimeDeploymentId: 'dpl_later' }, 'simo-local'))
      .resolves.toEqual({ verified: false, reason: 'obsolete_deployment' });
    vercelResponses();
    await expect(verifySupportProductionPromotion({ eventId, deploymentId, projectId },
      { ...settings, runtimeDeploymentId: 'dpl_previous' }, 'simo-local'))
      .rejects.toThrow('Production route has not switched');
  });

  it.each([
    { gitSource: { ref: 'simo-local', sha: 'b'.repeat(40) } },
    { gitSource: { ref: 'main', sha: gitSha } },
    { gitSource: null, meta: {} },
    { gitSource: { ref: 'simo-local', sha: 'short-sha' }, meta: {} },
  ])('fails closed for missing or inconsistent API Git metadata: %j', async (deployment) => {
    vercelResponses({ deployment });
    await expect(verifySupportProductionPromotion({ eventId, deploymentId, projectId }, settings, 'simo-local'))
      .rejects.toThrow('Git metadata is unavailable or inconsistent');
  });

  it('fails closed when the API Git SHA differs from the runtime build', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', 'b'.repeat(40));
    await expect(verifySupportProductionPromotion({ eventId, deploymentId, projectId }, settings, 'simo-local'))
      .rejects.toThrow('Git revision does not match');
  });
});

describe('production support release webhook', () => {
  it('requires POST and a configured signed raw-body endpoint', async () => {
    expect(config.api.bodyParser).toBe(false);
    const wrongMethod = response();
    await handler({ method: 'GET', headers: {} } as any, wrongMethod.res);
    expect(wrongMethod.result().code).toBe(405);
    expect(wrongMethod.res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
    vi.stubEnv('SUPPORT_RELEASE_WEBHOOK_SECRET', '');
    const unconfigured = response();
    await handler(signedRequest(event()), unconfigured.res);
    expect(unconfigured.result().code).toBe(503);
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it.each([
    { signature: undefined }, { signature: ['a'.repeat(40)] }, { signature: 'a'.repeat(40) },
  ])('rejects invalid signature $signature before processing', async ({ signature }) => {
    const result = response();
    await handler(signedRequest(event(), { 'x-vercel-signature': signature }), result.res);
    expect(result.result().code).toBe(403);
    expect(mocks.manifest).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects oversized raw bodies before opening a client', async () => {
    const result = response();
    await handler(signedRawRequest(Buffer.alloc(256 * 1024 + 1, 'a')), result.res);
    expect(result.result().code).toBe(413);
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects signed malformed JSON and malformed promotion identity', async () => {
    for (const raw of [Buffer.from('{invalid'), Buffer.from(JSON.stringify(event({ payload: {} })))]) {
      const result = response();
      await handler(signedRawRequest(raw), result.res);
      expect(result.result().code).toBe(400);
    }
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it.each([
    [event({ type: 'deployment.error' }), 'other_event'],
    [event({ type: 'deployment.ready' }), 'other_event'],
    [event({ payload: { project: { id: 'prj_other' }, deployment: { id: deploymentId } } }), 'other_project'],
  ])('ignores unrelated signed event without database access', async (payload, ignored) => {
    const result = response();
    await handler(signedRequest(payload), result.res);
    expect(result.result()).toEqual({ code: 200, body: { ok: true, ignored } });
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [{ deployment: { target: null } }, 'not_production'],
    [{ deployment: { target: 'preview' } }, 'not_production'],
    [{ deployment: { readyState: 'ERROR' } }, 'not_production'],
    [{ project: { paused: true } }, 'not_production'],
    [{ project: { targets: { production: { id: 'dpl_later' } } } }, 'obsolete_deployment'],
    [{ deployment: { gitSource: { ref: 'main', sha: gitSha }, meta: { githubCommitRef: 'main', githubCommitSha: gitSha } } }, 'wrong_branch'],
  ] as const)('does not close tickets for unsupported authoritative deployment metadata', async (metadata, ignored) => {
    vercelResponses(metadata);
    const result = response();
    await handler(signedRequest(event()), result.res);
    expect(result.result()).toEqual({ code: 200, body: { ok: true, ignored } });
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.applyRelease).not.toHaveBeenCalled();
  });

  it.each([
    { project: { id: 'prj_other' } },
    { deployment: { projectId: 'prj_other' } },
    { deployment: { id: 'dpl_other' } },
    { project: { targets: {} } },
    { deployment: { gitSource: { ref: 'simo-local', sha: 'b'.repeat(40) } } },
  ])('requests retry without mutation when API identity or Git metadata cannot be verified: %j', async (metadata) => {
    vercelResponses(metadata);
    const result = response();
    await handler(signedRequest(event()), result.res);
    expect(result.result().code).toBe(503);
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it('requests retry when production routes still reach the previous deployment, including its empty manifest', async () => {
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_previous');
    for (const ticketIds of [[ticketId], []]) {
      mocks.manifest.mockReturnValue({ version: 1, releaseId: ticketIds.length ? releaseId : null, productionBranch: 'simo-local', ticketIds });
      const result = response();
      await handler(signedRequest(event()), result.res);
      expect(result.result().code).toBe(503);
    }
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it('does not echo secrets or provider response bodies and never follows API redirects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token, secret }), { status: 302 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = response();
    await handler(signedRequest(event()), result.res);
    expect(result.result().code).toBe(503);
    expect(JSON.stringify(result.result().body)).not.toContain(token);
    expect(JSON.stringify(result.result().body)).not.toContain(secret);
    expect(console.error).toHaveBeenCalledWith('[vercel-support-release] Production verification or release processing failed.');
    for (const [, options] of fetchMock.mock.calls) expect(options.redirect).toBe('error');
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it.each([403, 429, 500])('requests retry without mutation when Vercel returns HTTP %s', async (projectStatus) => {
    vercelResponses({ projectStatus });
    const result = response();
    await handler(signedRequest(event()), result.res);
    expect(result.result().code).toBe(503);
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.applyRelease).not.toHaveBeenCalled();
  });

  it('uses committed manifest tickets and authoritative production SHA rather than payload claims', async () => {
    const result = response();
    await handler(signedRequest(event({ payload: {
      project: { id: projectId }, deployment: { id: deploymentId, meta: { githubCommitSha: 'b'.repeat(40) } },
      releaseId: 'untrusted-release', ticketIds: ['untrusted-ticket'], gitSha: 'untrusted-sha',
    } })), result.res);
    expect(result.result()).toEqual({ code: 200, body: { ok: true, completed: 1, skipped: 0, pending: 0 } });
    expect(mocks.applyRelease).toHaveBeenCalledWith(client, {
      releaseId, ticketIds: [ticketId], deploymentId, eventId, gitSha, deadlineAt: expect.any(Number),
    });
  });

  it('acknowledges an empty manifest in its own deployment without opening a service client', async () => {
    mocks.manifest.mockReturnValue({ version: 1, releaseId: null, productionBranch: 'simo-local', ticketIds: [] });
    const result = response();
    await handler(signedRequest(event()), result.res);
    expect(result.result()).toEqual({ code: 200, body: { ok: true, ignored: 'empty_release' } });
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.applyRelease).not.toHaveBeenCalled();
  });

  it('requests delivery retry for partial results or engine failures', async () => {
    mocks.applyRelease.mockResolvedValueOnce({ completed: 0, skipped: 0, pending: 1 });
    const partial = response();
    await handler(signedRequest(event()), partial.res);
    expect(partial.result().code).toBe(503);
    expect(partial.res.setHeader).toHaveBeenCalledWith('Retry-After', '30');
    mocks.applyRelease.mockRejectedValueOnce(new Error(`Provider secret: ${token}`));
    const failure = response();
    await handler(signedRequest(event()), failure.res);
    expect(failure.result().code).toBe(503);
    expect(JSON.stringify(failure.result().body)).not.toContain(token);
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining(token));
  });
});
