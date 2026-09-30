import { supportReleaseManifest } from './supportReleaseManifest.js';

export const SUPPORT_RELEASE_PRODUCTION_BRANCH = 'simo-local' as const;
export const SUPPORT_RELEASE_MAX_TICKETS = 20;

export type SupportReleaseManifest = {
  version: 1;
  releaseId: string | null;
  productionBranch: typeof SUPPORT_RELEASE_PRODUCTION_BRANCH;
  ticketIds: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MANIFEST_KEYS = new Set(['version', 'releaseId', 'productionBranch', 'ticketIds']);

function canonicalUuid(input: unknown, label: string): string {
  if (typeof input !== 'string' || input.length !== 36 || !UUID.test(input)) {
    throw new Error(`Invalid support release manifest: ${label} must be a full UUID.`);
  }
  return input.toLowerCase();
}

export function parseSupportReleaseTicketIds(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > SUPPORT_RELEASE_MAX_TICKETS) {
    throw new Error(`Invalid support release manifest: ticketIds must be an array of at most ${SUPPORT_RELEASE_MAX_TICKETS} UUIDs.`);
  }
  const ticketIds: string[] = [];
  const seen = new Set<string>();
  for (const inputId of input) {
    const id = canonicalUuid(inputId, 'Each ticket ID');
    if (seen.has(id)) throw new Error('Invalid support release manifest: duplicate ticket IDs.');
    seen.add(id);
    ticketIds.push(id);
  }
  return ticketIds;
}

/** Reject an invalid release selection rather than guessing or dropping tickets. */
export function parseSupportReleaseManifest(input: unknown): SupportReleaseManifest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid support release manifest: expected an object.');
  }
  const keys = Reflect.ownKeys(input);
  if (keys.length !== MANIFEST_KEYS.size || keys.some((key) => typeof key !== 'string' || !MANIFEST_KEYS.has(key))) {
    throw new Error('Invalid support release manifest: expected only version, releaseId, productionBranch and ticketIds.');
  }
  const value = input as Record<string, unknown>;
  if (value.version !== 1) throw new Error('Invalid support release manifest: version must be 1.');
  if (value.productionBranch !== SUPPORT_RELEASE_PRODUCTION_BRANCH) {
    throw new Error('Invalid support release manifest: productionBranch must be simo-local.');
  }
  const ticketIds = parseSupportReleaseTicketIds(value.ticketIds);
  let releaseId: string | null = null;
  if (ticketIds.length === 0) {
    if (value.releaseId !== null) {
      throw new Error('Invalid support release manifest: an empty selection must have a null releaseId.');
    }
  } else {
    releaseId = canonicalUuid(value.releaseId, 'releaseId');
  }
  return { version: 1, releaseId, productionBranch: SUPPORT_RELEASE_PRODUCTION_BRANCH, ticketIds };
}

export function loadSupportReleaseManifest(): SupportReleaseManifest {
  return parseSupportReleaseManifest(supportReleaseManifest);
}
