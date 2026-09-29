import type { SupabaseClient } from '@supabase/supabase-js';
import type { InAppSupportCategory, InAppSupportImpact, InAppSupportPriority, InAppSupportStatus } from '../../src/lib/inAppSupport.js';
import { inAppSupportReference } from './inAppSupportStatusEmail.js';
import { syncInAppSupportTrelloCard } from './inAppSupportTrello.js';

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

export function priorityForSupportImpact(impact: InAppSupportImpact): InAppSupportPriority {
  if (impact === 'blocking') return 'urgent';
  return impact;
}

export async function syncInAppSupportTicket(db: SupabaseClient, row: InAppSupportSyncRow): Promise<boolean> {
  try {
    const result = await syncInAppSupportTrelloCard({
      reference: inAppSupportReference(row.id),
      title: row.title,
      category: row.category,
      status: row.status,
      priority: row.priority,
      page: row.page,
      dueAt: row.target_date,
      cardId: row.trello_card_id,
    });
    if (!result.synced) {
      const { error } = await db.from('in_app_support_requests').update({
        trello_sync_error: 'Trello connection is not configured.',
      }).eq('id', row.id);
      if (error) throw error;
      return false;
    }
    const { error } = await db.from('in_app_support_requests').update({
      trello_card_id: result.cardId,
      trello_card_url: result.cardUrl,
      trello_synced_at: new Date().toISOString(),
      trello_sync_error: null,
    }).eq('id', row.id);
    if (error) throw error;
    return true;
  } catch (error) {
    await db.from('in_app_support_requests').update({
      trello_sync_error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
    }).eq('id', row.id);
    throw error;
  }
}
