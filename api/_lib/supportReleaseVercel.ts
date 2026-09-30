import { createHmac, timingSafeEqual } from 'node:crypto';

export type SupportReleaseVercelSettings = {
  secret: string;
  projectId: string;
  token: string;
  teamId: string | null;
  runtimeDeploymentId: string;
};

export function getSupportReleaseVercelSettings(): SupportReleaseVercelSettings | null {
  const secret = process.env.SUPPORT_RELEASE_WEBHOOK_SECRET?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  const token = process.env.SUPPORT_RELEASE_VERCEL_TOKEN?.trim();
  const runtimeDeploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim();
  if (!secret || !projectId || !token || !runtimeDeploymentId || process.env.VERCEL !== '1') return null;
  return { secret, projectId, token, runtimeDeploymentId,
    teamId: process.env.SUPPORT_RELEASE_VERCEL_TEAM_ID?.trim() || null };
}

export function validSupportReleaseSignature(raw: Buffer, signature: unknown, secret: string): boolean {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{40}$/i.test(signature)) return false;
  return timingSafeEqual(createHmac('sha1', secret).update(raw).digest(), Buffer.from(signature, 'hex'));
}

function object(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
}

export type SupportPromotionEvent = { eventId: string; deploymentId: string; projectId: string };

export function parseSupportPromotionEvent(value: unknown): SupportPromotionEvent | null {
  const event = object(value);
  if (!event || event.type !== 'deployment.promoted') return null;
  const payload = object(event.payload);
  const deployment = object(payload?.deployment);
  const project = object(payload?.project);
  if (![event.id, deployment?.id, project?.id].every((id) => typeof id === 'string' && /^[a-z0-9_-]{1,200}$/i.test(id))) {
    throw new Error('Invalid production promotion event.');
  }
  return { eventId: event.id, deploymentId: deployment!.id, projectId: project!.id };
}

async function vercelRead(path: string, settings: SupportReleaseVercelSettings, gitInfo = false) {
  const url = new URL(path, 'https://api.vercel.com');
  if (settings.teamId) url.searchParams.set('teamId', settings.teamId);
  if (gitInfo) url.searchParams.set('withGitRepoInfo', 'true');
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${settings.token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(5_000), redirect: 'error', cache: 'no-store',
  });
  // Never include a provider body: deployment responses may contain secrets.
  if (!response.ok) throw new Error('Vercel production verification failed.');
  const result = object(await response.json());
  if (!result) throw new Error('Vercel returned invalid deployment metadata.');
  return result;
}

function gitIdentity(deployment: Record<string, any>): { branch: string; sha: string } | null {
  const meta = object(deployment.meta) || {};
  const source = object(deployment.gitSource) || {};
  const branches = [source.ref, meta.gitCommitRef, meta.githubCommitRef, meta.gitlabCommitRef, meta.bitbucketCommitRef]
    .filter((item): item is string => typeof item === 'string' && item.length > 0);
  const shas = [source.sha, meta.gitCommitSha, meta.githubCommitSha, meta.gitlabCommitSha, meta.bitbucketCommitSha]
    .filter((item): item is string => typeof item === 'string' && item.length > 0).map((sha) => sha.toLowerCase());
  if (!branches.length || !shas.length || new Set(branches).size !== 1 || new Set(shas).size !== 1
    || !/^[a-f0-9]{40}$/.test(shas[0])) return null;
  return { branch: branches[0], sha: shas[0] };
}

export type SupportProductionVerification =
  | { verified: true; gitSha: string }
  | { verified: false; reason: 'other_project' | 'obsolete_deployment' | 'not_production' | 'wrong_branch' };

/** A signed promotion authorizes only the manifest in the deployment now serving production. */
export async function verifySupportProductionPromotion(
  event: SupportPromotionEvent, settings: SupportReleaseVercelSettings, productionBranch: string,
): Promise<SupportProductionVerification> {
  if (event.projectId !== settings.projectId) return { verified: false, reason: 'other_project' };
  const results = await Promise.allSettled([
    vercelRead(`/v9/projects/${encodeURIComponent(settings.projectId)}`, settings),
    vercelRead(`/v13/deployments/${encodeURIComponent(event.deploymentId)}`, settings, true),
  ]);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
  const project = (results[0] as PromiseFulfilledResult<Record<string, any>>).value;
  const deployment = (results[1] as PromiseFulfilledResult<Record<string, any>>).value;
  if (project.id !== settings.projectId || deployment.id !== event.deploymentId
    || deployment.projectId !== settings.projectId) throw new Error('Vercel deployment identity could not be verified.');
  const currentId = object(object(project.targets)?.production)?.id;
  if (typeof currentId !== 'string' || !currentId) throw new Error('Current production deployment is unavailable.');
  if (currentId !== event.deploymentId) return { verified: false, reason: 'obsolete_deployment' };
  // A callback may reach the previous instance while production routes propagate.
  // Ask Vercel to retry instead of acknowledging a promotion we have not loaded.
  if (settings.runtimeDeploymentId !== event.deploymentId) throw new Error('Production route has not switched to this deployment.');
  if (deployment.target !== 'production' || deployment.readyState !== 'READY' || project.paused === true) {
    return { verified: false, reason: 'not_production' };
  }
  const git = gitIdentity(deployment);
  if (!git) throw new Error('Production Git metadata is unavailable or inconsistent.');
  if (git.branch !== productionBranch) return { verified: false, reason: 'wrong_branch' };
  const runtimeSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase();
  if (runtimeSha && runtimeSha !== git.sha) throw new Error('Production Git revision does not match this deployment.');
  return { verified: true, gitSha: git.sha };
}
