import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types.js';
import {
  inAppSupportReference,
  inAppSupportStatusSignature,
  notifyInAppSupportStatus,
} from './_lib/inAppSupportStatusEmail.js';
import { getSupportServiceClient } from './_lib/supportPersistence.js';
import {
  cardHasSupportReference,
  cardIdFromTrelloWebhook,
  deriveTrelloTicketState,
  fetchTrelloSupportCard,
  getTrelloWebhookSettings,
  normalizeTrelloPriorityTitle,
  TRELLO_SUPPORT_CLIENT_IDENTIFIER,
  validTrelloWebhookSignature,
  type TrelloSupportCard,
  type TrelloWebhookSettings,
} from './_lib/inAppSupportTrelloWebhook.js';

const MAX_BODY_BYTES = 1024 * 1024;
const REFERENCE_MISMATCH = 'Trello card reference does not match this ticket. Restore its Tutlio support reference.';

export const config = { api: { bodyParser: false }, maxDuration: 30 };

class BodyTooLargeError extends Error {}

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_BODY_BYTES) throw new BodyTooLargeError('Trello webhook body is too large.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

function dateValue(value: string | null): string | null {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : value;
}

/**
 * Fetching the current card makes redelivery and out-of-order actions converge.
 * The updated_at guard retries with a new card snapshot after a concurrent write.
 */
export async function applyTrelloSupportCard(
  db: SupabaseClient,
  card: TrelloSupportCard,
  settings: TrelloWebhookSettings,
): Promise<'updated' | 'unchanged' | 'ignored' | 'reference_mismatch'> {
  let snapshot = card;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: row, error: loadError } = await db.from('in_app_support_requests')
      .select('*').eq('trello_card_id', snapshot.id).maybeSingle();
    if (loadError) throw loadError;
    if (!row) return 'ignored';

    const owned = cardHasSupportReference(snapshot, inAppSupportReference(row.id));
    const next = owned
      ? deriveTrelloTicketState(snapshot, row, settings)
      : { status: row.status, target_date: row.target_date, priority: row.priority, trello_sync_error: REFERENCE_MISMATCH };
    const visibleChange = owned && (
      row.status !== next.status || dateValue(row.target_date) !== dateValue(next.target_date)
    );
    const changed = visibleChange || row.priority !== next.priority
      || row.trello_sync_error !== next.trello_sync_error;
    if (!changed) {
      if (owned && row.status_notified_signature !== inAppSupportStatusSignature(row)) {
        // A prior email failure can be retried safely because Resend gets an idempotency key.
        await notifyInAppSupportStatus(db, row);
      }
      return owned ? 'unchanged' : 'reference_mismatch';
    }

    const { data: updated, error: updateError } = await db.from('in_app_support_requests')
      .update({
        status: next.status,
        target_date: next.target_date,
        priority: next.priority,
        trello_sync_error: next.trello_sync_error,
        trello_synced_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('trello_card_id', snapshot.id)
      .eq('updated_at', row.updated_at)
      .select('*').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) {
      snapshot = await fetchTrelloSupportCard(snapshot.id, settings);
      continue;
    }

    if (visibleChange) await notifyInAppSupportStatus(db, updated);
    return owned ? 'updated' : 'reference_mismatch';
  }
  throw new Error('Concurrent ticket changes prevented Trello synchronization.');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Trello probes the callback with HEAD before allowing webhook registration.
  if (req.method === 'HEAD') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'HEAD, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const settings = getTrelloWebhookSettings();
  if (!settings) return res.status(503).json({ error: 'Trello support webhook is not configured' });

  let raw: Buffer;
  try {
    raw = await readRawBody(req);
  } catch (error) {
    return res.status(error instanceof BodyTooLargeError ? 413 : 400)
      .json({ error: 'Could not read Trello webhook body' });
  }
  if (!validTrelloWebhookSignature(raw, req.headers['x-trello-webhook'],
    settings.applicationSecret, settings.callbackUrl)) {
    return res.status(403).json({ error: 'Invalid Trello webhook signature' });
  }
  // Trello echoes this header from our own card writes; those writes must not
  // re-enter the user notification path.
  if (req.headers['x-trello-client-identifier'] === TRELLO_SUPPORT_CLIENT_IDENTIFIER) {
    return res.status(200).json({ ok: true, ignored: 'own_change' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid Trello webhook JSON' });
  }
  const cardId = cardIdFromTrelloWebhook(payload, settings);
  if (!cardId) return res.status(200).json({ ok: true, ignored: 'other_action' });

  try {
    const card = await fetchTrelloSupportCard(cardId, settings);
    const result = await applyTrelloSupportCard(getSupportServiceClient(), card, settings);
    if (result === 'updated' || result === 'unchanged') {
      try {
        const latestCard = await fetchTrelloSupportCard(cardId, settings);
        if (latestCard.desc.split(/\r?\n/, 1)[0] === card.desc.split(/\r?\n/, 1)[0]) {
          await normalizeTrelloPriorityTitle(latestCard, settings);
        }
      } catch (error) {
        // A title correction is cosmetic; the ticket priority is already saved.
        console.warn('[trello-support-webhook] Priority title update failed:', error);
      }
    }
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error('[trello-support-webhook] Processing failed:', error);
    return res.status(500).json({ error: 'Could not synchronize Trello support card' });
  }
}
