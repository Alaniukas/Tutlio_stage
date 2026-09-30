import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InAppSupportCategory, InAppSupportImpact, InAppSupportPriority, InAppSupportStatus } from '../../src/lib/inAppSupport.js';
import { inAppSupportReference } from './inAppSupportStatusEmail.js';
import { syncInAppSupportTrelloCard, type InAppSupportTrelloInput } from './inAppSupportTrello.js';

export type InAppSupportSyncRow = {
  id: string;
  title: string;
  category: InAppSupportCategory;
  status: InAppSupportStatus;
  priority: InAppSupportPriority;
  page: string;
  target_date: string | null;
  trello_card_id: string | null;
};

type ClaimedRow = InAppSupportSyncRow & { status_updated_at: string };
type SyncOptions = { onlyIfUnlinked?: boolean };
const CLAIM_ERROR = 'Trello synchronization claim could not be obtained. Apply the support Trello synchronization migration before retrying.';
const LOST_CLAIM = 'Trello synchronization ownership expired. Retry to recover the card safely.';
const STALE_SYNC = 'Ticket changed during Trello synchronization. Retry to synchronize its current status.';

class AlreadyLinked extends Error {}

export function priorityForSupportImpact(impact: InAppSupportImpact): InAppSupportPriority {
  if (impact === 'blocking') return 'urgent';
  return impact;
}

function canonicalRow(value: unknown, id: string): ClaimedRow {
  const row = value as ClaimedRow | null;
  if (!row || row.id !== id || typeof row.status_updated_at !== 'string'
    || typeof row.title !== 'string' || typeof row.page !== 'string'
    || !['bug', 'feature'].includes(row.category)
    || !['registered', 'in_progress', 'resolved'].includes(row.status)
    || !['untriaged', 'low', 'medium', 'high', 'urgent'].includes(row.priority)
    || (row.trello_card_id !== null && typeof row.trello_card_id !== 'string')
    || (row.target_date !== null && typeof row.target_date !== 'string')) throw new Error(CLAIM_ERROR);
  return row;
}

function trelloInput(row: InAppSupportSyncRow): InAppSupportTrelloInput {
  return {
    reference: inAppSupportReference(row.id), title: row.title, category: row.category,
    status: row.status, priority: row.priority, page: row.page,
    dueAt: row.target_date, cardId: row.trello_card_id,
  };
}

/** All workers share a database lease; an uncertain POST is recovered by lookup only. */
export async function syncInAppSupportTicket(
  db: SupabaseClient,
  row: InAppSupportSyncRow,
  options: SyncOptions = {},
): Promise<boolean> {
  const leaseToken = randomUUID();
  const { data: claim, error: claimError } = await db.rpc('claim_support_trello_sync', {
    p_ticket_id: row.id, p_lease_token: leaseToken,
  });
  // Never fall back to an unlocked Trello request if storage is unavailable.
  if (claimError || !claim || typeof claim !== 'object') throw new Error(CLAIM_ERROR);
  if (claim.outcome === 'busy' || claim.outcome === 'missing') return false;
  if (claim.outcome !== 'claimed' || typeof claim.creationUncertain !== 'boolean') throw new Error(CLAIM_ERROR);

  let finished = false;
  let written: ClaimedRow | null = null;
  const finish = async (cardId: string | null, cardUrl: string | null, error: string | null) => {
    const { data, error: finishError } = await db.rpc('finish_support_trello_sync', {
      p_ticket_id: row.id, p_lease_token: leaseToken,
      p_card_id: cardId, p_card_url: cardUrl, p_error: error,
      p_expected_status_updated_at: written?.status_updated_at ?? null,
      p_expected_priority: written?.priority ?? null,
    });
    if (finishError || !data || typeof data !== 'object' || data.saved !== true) throw new Error(LOST_CLAIM);
    finished = true;
    return data.stale === true;
  };
  try {
    let current = canonicalRow(claim.request, row.id);
    if (options.onlyIfUnlinked && current.trello_card_id) {
      await finish(null, null, null);
      return true;
    }
    const result = await syncInAppSupportTrelloCard(trelloInput(current), {
      allowCreate: !claim.creationUncertain,
      beforeWrite: async () => {
        const { data, error } = await db.rpc('current_support_trello_sync', {
          p_ticket_id: row.id, p_lease_token: leaseToken,
        });
        if (error || !data) throw new Error(LOST_CLAIM);
        current = canonicalRow(data, row.id);
        if (options.onlyIfUnlinked && current.trello_card_id) throw new AlreadyLinked();
        written = current;
        return trelloInput(current);
      },
      beforeCreate: async () => {
        const { data, error } = await db.rpc('mark_support_trello_creation', {
          p_ticket_id: row.id, p_lease_token: leaseToken,
        });
        if (error || data !== true) throw new Error(LOST_CLAIM);
      },
    });
    if (!result.synced) {
      await finish(null, null, 'Trello connection is not configured.');
      return false;
    }
    const stale = await finish(result.cardId, result.cardUrl, null);
    if (stale) throw new Error(STALE_SYNC);
    return true;
  } catch (error) {
    if (error instanceof AlreadyLinked) {
      await finish(null, null, null);
      return true;
    }
    if (!finished) {
      // Token-owned release keeps the uncertainty marker. A delayed worker
      // cannot clear a newer lease or overwrite its synchronization result.
      try { await finish(null, null, (error instanceof Error ? error.message : String(error)).slice(0, 500)); }
      catch { /* A lost lease or DB failure must remain quarantined for recovery. */ }
    }
    throw error;
  }
}
