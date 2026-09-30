import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyInAppSupportStatus, type InAppSupportStatusRow } from './inAppSupportStatusEmail.js';
import { syncInAppSupportTicket, type InAppSupportSyncRow } from './inAppSupportTicketSync.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TICKETS = 20;
const DELIVERY_ERROR = 'Support release email or Trello delivery could not be completed.';
const SUPERSEDED_ERROR = 'The ticket status changed after this release was applied.';

export type InAppSupportReleaseInput = {
  releaseId: string;
  ticketIds: string[];
  deploymentId: string;
  eventId: string;
  gitSha: string;
  deadlineAt?: number;
  retryOnly?: boolean;
};

export type InAppSupportReleaseResult = {
  applied: number;
  retried: number;
  complete: number;
  skipped: number;
  busy: number;
  failed: number;
  pending: number;
};

type ReleaseTicket = Omit<InAppSupportReleaseInput, 'ticketIds' | 'deadlineAt'> & { ticketId: string };
type ReleaseRequest = InAppSupportStatusRow & InAppSupportSyncRow;
type Claim = {
  outcome: 'applied' | 'retry' | 'complete' | 'skipped' | 'busy';
  request?: ReleaseRequest | null;
};

function validateRelease(input: InAppSupportReleaseInput): void {
  if (!UUID.test(input.releaseId) || !Array.isArray(input.ticketIds) || input.ticketIds.length > MAX_TICKETS
    || input.ticketIds.some((id) => typeof id !== 'string' || !UUID.test(id))
    || typeof input.deploymentId !== 'string' || !input.deploymentId.trim() || input.deploymentId.length > 200
    || typeof input.eventId !== 'string' || !input.eventId.trim() || input.eventId.length > 200
    || !/^[0-9a-f]{40}$/i.test(input.gitSha)
    || (input.deadlineAt !== undefined && !Number.isFinite(input.deadlineAt))) {
    throw new Error('Invalid support release input.');
  }
}

function databaseError(): Error {
  return new Error('Support release database operation failed.');
}

async function currentClaimedRequest(db: SupabaseClient, ticketId: string, statusUpdatedAt: string): Promise<ReleaseRequest | null> {
  const { data, error } = await db.from('in_app_support_requests').select('*')
    .eq('id', ticketId).eq('status', 'resolved').eq('status_updated_at', statusUpdatedAt).maybeSingle();
  if (error) throw databaseError();
  return data as ReleaseRequest | null;
}

async function updateOwnedDelivery(
  db: SupabaseClient,
  ticket: ReleaseTicket,
  leaseToken: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await db.from('support_release_tickets').update({
    ...patch, lease_token: null, lease_until: null, updated_at: new Date().toISOString(),
  }).eq('release_id', ticket.releaseId).eq('ticket_id', ticket.ticketId)
    .eq('lease_token', leaseToken).eq('outcome', 'applied').is('completed_at', null)
    .select('ticket_id').maybeSingle();
  if (error) throw databaseError();
  return Boolean(data);
}

async function deliverTicket(
  db: SupabaseClient,
  ticket: ReleaseTicket,
  result: InAppSupportReleaseResult,
  newlyApplied: boolean,
): Promise<void> {
  const leaseToken = randomUUID();
  const { data, error } = await db.rpc('claim_support_release_ticket', {
    p_release_id: ticket.releaseId,
    p_ticket_id: ticket.ticketId,
    p_deployment_id: ticket.deploymentId,
    p_event_id: ticket.eventId,
    p_git_sha: ticket.gitSha,
    p_lease_token: leaseToken,
    p_retry_only: Boolean(ticket.retryOnly),
  });
  if (error || !data || !['applied', 'retry', 'complete', 'skipped', 'busy'].includes(data.outcome)) {
    throw databaseError();
  }
  const claim = data as Claim;
  if (claim.outcome === 'complete') { result.complete += 1; return; }
  if (claim.outcome === 'skipped') { result.skipped += 1; return; }
  if (claim.outcome === 'busy') { result.busy += 1; result.pending += 1; return; }
  // Delivery and cron paths may only resume the preceding durable admission.
  if (claim.outcome === 'applied') throw databaseError();
  if (!newlyApplied) result.retried += 1;
  if (!claim.request || claim.request.id !== ticket.ticketId || claim.request.status !== 'resolved'
    || typeof claim.request.status_updated_at !== 'string') throw databaseError();
  const claimedStatusUpdatedAt = claim.request.status_updated_at;

  const skipSuperseded = async () => {
    const owned = await updateOwnedDelivery(db, ticket, leaseToken, {
      outcome: 'skipped', completed_at: new Date().toISOString(), last_error: SUPERSEDED_ERROR,
    });
    if (owned) result.skipped += 1;
    else { result.busy += 1; result.pending += 1; }
  };

  let current = await currentClaimedRequest(db, ticket.ticketId, claimedStatusUpdatedAt);
  if (!current) { await skipSuperseded(); return; }
  try {
    // A false notification result means this exact status was already delivered.
    await notifyInAppSupportStatus(db, current);
    current = await currentClaimedRequest(db, ticket.ticketId, claimedStatusUpdatedAt);
    if (!current) { await skipSuperseded(); return; }
    if (!await syncInAppSupportTicket(db, current)) throw new Error(DELIVERY_ERROR);
  } catch {
    await updateOwnedDelivery(db, ticket, leaseToken, { last_error: DELIVERY_ERROR });
    result.failed += 1;
    result.pending += 1;
    return;
  }
  current = await currentClaimedRequest(db, ticket.ticketId, claimedStatusUpdatedAt);
  if (!current) { await skipSuperseded(); return; }
  const owned = await updateOwnedDelivery(db, ticket, leaseToken, {
    completed_at: new Date().toISOString(), last_error: null,
  });
  if (owned) result.complete += 1;
  else { result.busy += 1; result.pending += 1; }
}

async function applyTickets(
  db: SupabaseClient,
  tickets: ReleaseTicket[],
  deadlineAt: number,
  initial: Partial<InAppSupportReleaseResult> = {},
  newlyApplied = new Set<string>(),
): Promise<InAppSupportReleaseResult> {
  const result: InAppSupportReleaseResult = {
    applied: 0, retried: 0, complete: 0, skipped: 0, busy: 0, failed: 0, pending: 0, ...initial,
  };
  let next = 0;
  let dbFailed = false;
  await Promise.all(Array.from({ length: Math.min(4, tickets.length) }, async () => {
    while (next < tickets.length) {
      if (Date.now() >= deadlineAt) {
        result.pending += tickets.length - next;
        next = tickets.length;
        return;
      }
      const ticket = tickets[next++];
      try {
        await deliverTicket(db, ticket, result, newlyApplied.has(ticket.ticketId));
      } catch {
        // Finish the other independent tickets before reporting a database failure.
        result.failed += 1;
        result.pending += 1;
        dbFailed = true;
      }
    }
  }));
  if (dbFailed) throw databaseError();
  return result;
}

/** A signed, verified production release may resolve only the supplied in-progress tickets. */
export async function applyInAppSupportRelease(db: SupabaseClient, input: InAppSupportReleaseInput): Promise<InAppSupportReleaseResult> {
  validateRelease(input);
  const deadlineAt = input.deadlineAt ?? Date.now() + 20_000;
  const ticketIds = [...new Set(input.ticketIds.map((id) => id.toLowerCase()))];
  const newlyApplied = new Set<string>();
  const initial = { applied: 0, complete: 0, skipped: 0 };
  let pendingIds = ticketIds;
  if (!input.retryOnly && ticketIds.length) {
    // Admit the full verified selection atomically before the delivery budget.
    // Otherwise a later deployment could strand tickets never reached in time.
    const { data, error } = await db.rpc('admit_support_release', {
      p_release_id: input.releaseId.toLowerCase(), p_ticket_ids: ticketIds,
      p_deployment_id: input.deploymentId, p_event_id: input.eventId, p_git_sha: input.gitSha.toLowerCase(),
    });
    const admissions = data?.tickets as Array<{ ticketId: string; outcome: Claim['outcome'] }> | undefined;
    if (error || !Array.isArray(admissions) || admissions.length !== ticketIds.length
      || new Set(admissions.map((row) => row?.ticketId)).size !== ticketIds.length
      || admissions.some((row) => !row || !ticketIds.includes(row.ticketId)
        || !['applied', 'retry', 'complete', 'skipped', 'busy'].includes(row.outcome))) throw databaseError();
    pendingIds = [];
    for (const admission of admissions) {
      if (admission.outcome === 'complete') initial.complete += 1;
      else if (admission.outcome === 'skipped') initial.skipped += 1;
      else {
        pendingIds.push(admission.ticketId);
        if (admission.outcome === 'applied') {
          initial.applied += 1;
          newlyApplied.add(admission.ticketId);
        }
      }
    }
  }
  return applyTickets(db, pendingIds.map((ticketId) => ({
    releaseId: input.releaseId.toLowerCase(), ticketId,
    deploymentId: input.deploymentId, eventId: input.eventId, gitSha: input.gitSha.toLowerCase(),
    retryOnly: true,
  })), deadlineAt, initial, newlyApplied);
}

/** Recovery resumes only existing trusted release claims; it never authorizes new tickets. */
export async function retryPendingInAppSupportReleases(
  db: SupabaseClient,
  options: { deadlineAt?: number; limit?: number } = {},
): Promise<InAppSupportReleaseResult> {
  const deadlineAt = options.deadlineAt ?? Date.now() + 20_000;
  const limit = Math.min(MAX_TICKETS, Math.max(1, Math.floor(options.limit ?? MAX_TICKETS)));
  if (!Number.isFinite(deadlineAt) || !Number.isFinite(limit)) throw new Error('Invalid support release recovery options.');
  const { data, error } = await db.from('support_release_tickets')
    .select('release_id,ticket_id,deployment_id,event_id,git_sha')
    .eq('outcome', 'applied').is('completed_at', null)
    .or(`lease_until.is.null,lease_until.lte.${new Date().toISOString()}`)
    .order('updated_at', { ascending: true }).limit(limit);
  if (error || !Array.isArray(data)) throw databaseError();
  const tickets: ReleaseTicket[] = data.map((row) => {
    const input = {
      releaseId: row.release_id, ticketIds: [row.ticket_id],
      deploymentId: row.deployment_id, eventId: row.event_id, gitSha: row.git_sha,
    } as InAppSupportReleaseInput;
    validateRelease(input);
    return {
      releaseId: input.releaseId, ticketId: input.ticketIds[0], deploymentId: input.deploymentId,
      eventId: input.eventId, gitSha: input.gitSha, retryOnly: true,
    };
  });
  return applyTickets(db, tickets, deadlineAt);
}
