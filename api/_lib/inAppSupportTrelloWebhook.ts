import { createHmac, timingSafeEqual } from 'node:crypto';
import type { InAppSupportPriority, InAppSupportStatus } from '../../src/lib/inAppSupport.js';

export const TRELLO_SUPPORT_CLIENT_IDENTIFIER = 'tutlio-support-sync';

export interface TrelloWebhookSettings {
  apiKey: string;
  token: string;
  applicationSecret: string;
  callbackUrl: string;
  boardId: string;
  webhookId: string | null;
  lists: { registered: string; inProgress: string; resolved: string };
}

export interface TrelloSupportCard {
  id: string;
  idBoard: string;
  idList: string;
  name: string;
  desc: string;
  due: string | null;
  labels: Array<{ name: string }>;
  closed: boolean;
}

export interface TrelloTicketState {
  status: InAppSupportStatus;
  target_date: string | null;
  priority: InAppSupportPriority;
  trello_sync_error: string | null;
}

const CARD_ID = /^[a-f\d]{24}$/i;
const PRIORITY_BY_CODE: Record<string, InAppSupportPriority> = {
  P0: 'urgent', P1: 'high', P2: 'medium', P3: 'low',
};

export function getTrelloWebhookSettings(): TrelloWebhookSettings | null {
  const apiKey = process.env.TRELLO_API_KEY?.trim();
  const token = process.env.TRELLO_TOKEN?.trim();
  const applicationSecret = process.env.TRELLO_APPLICATION_SECRET?.trim();
  const callbackUrl = process.env.TRELLO_WEBHOOK_CALLBACK_URL?.trim();
  const boardId = process.env.TRELLO_BOARD_ID?.trim();
  const registered = process.env.TRELLO_LIST_NEW_ID?.trim();
  const inProgress = process.env.TRELLO_LIST_IN_PROGRESS_ID?.trim();
  const resolved = process.env.TRELLO_LIST_RESOLVED_ID?.trim();
  if (!apiKey || !token || !applicationSecret || !callbackUrl || !boardId
    || !registered || !inProgress || !resolved) return null;
  if (!/^https:\/\//.test(callbackUrl) || !CARD_ID.test(boardId)
    || ![registered, inProgress, resolved].every((id) => CARD_ID.test(id))
    || new Set([registered, inProgress, resolved]).size !== 3) return null;
  return {
    apiKey, token, applicationSecret, callbackUrl, boardId,
    webhookId: process.env.TRELLO_WEBHOOK_ID?.trim() || null,
    lists: { registered, inProgress, resolved },
  };
}

/** Trello signs the unparsed body followed by the exact registered callback URL. */
export function validTrelloWebhookSignature(
  raw: Buffer,
  signature: unknown,
  applicationSecret: string,
  callbackUrl: string,
): boolean {
  if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]{27}=$/.test(signature)
    || !applicationSecret || !callbackUrl) return false;
  const expected = createHmac('sha1', applicationSecret)
    .update(raw)
    .update(callbackUrl, 'utf8')
    .digest();
  const received = Buffer.from(signature, 'base64');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** Board webhooks also emit list/board actions, which are not ticket updates. */
export function cardIdFromTrelloWebhook(payload: unknown, settings: TrelloWebhookSettings): string | null {
  const root = record(payload);
  const model = record(root?.model);
  const webhook = record(root?.webhook);
  const action = record(root?.action);
  const data = record(action?.data);
  const board = record(data?.board);
  const card = record(data?.card);
  if (model?.id !== settings.boardId || board?.id !== settings.boardId
    || (webhook?.idModel !== undefined && webhook.idModel !== settings.boardId)
    || (settings.webhookId && webhook?.id !== settings.webhookId)) return null;
  if (action?.type !== 'updateCard' && action?.type !== 'addLabelToCard'
    && action?.type !== 'removeLabelFromCard') return null;
  return typeof card?.id === 'string' && CARD_ID.test(card.id) ? card.id : null;
}

/** Read current card state: action payloads omit fields and may arrive out of order. */
export async function fetchTrelloSupportCard(cardId: string, settings: TrelloWebhookSettings): Promise<TrelloSupportCard> {
  if (!CARD_ID.test(cardId)) throw new Error('Invalid Trello card ID.');
  const query = new URLSearchParams({ fields: 'id,idBoard,idList,name,desc,due,labels,closed' });
  const response = await fetch(`https://api.trello.com/1/cards/${cardId}?${query}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `OAuth oauth_consumer_key="${settings.apiKey}", oauth_token="${settings.token}"`,
      'X-Trello-Client-Identifier': TRELLO_SUPPORT_CLIENT_IDENTIFIER,
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Trello card lookup failed (${response.status}).`);
  const raw = record(await response.json());
  if (raw?.id !== cardId || raw.idBoard !== settings.boardId
    || typeof raw.idList !== 'string' || !CARD_ID.test(raw.idList)
    || typeof raw.name !== 'string' || typeof raw.desc !== 'string'
    || (raw.due !== null && typeof raw.due !== 'string')
    || !Array.isArray(raw.labels) || typeof raw.closed !== 'boolean') {
    throw new Error('Trello card lookup returned an invalid or foreign card.');
  }
  return {
    id: raw.id, idBoard: raw.idBoard, idList: raw.idList,
    name: raw.name, desc: raw.desc, due: raw.due as string | null, closed: raw.closed,
    labels: raw.labels.map((value) => record(value))
      .filter((value): value is Record<string, unknown> => Boolean(value))
      .map((value) => ({ name: typeof value.name === 'string' ? value.name : '' })),
  };
}

export function cardHasSupportReference(card: TrelloSupportCard, reference: string): boolean {
  return card.desc.split(/\r?\n/, 1)[0] === `Tutlio support reference: ${reference}`;
}

function cardPriority(card: TrelloSupportCard): { priority: InAppSupportPriority; code: string; fromLabel: boolean } | null {
  const codes = card.labels.map((label) => label.name.trim())
    .filter((name) => Object.hasOwn(PRIORITY_BY_CODE, name)).sort();
  if (codes[0]) return { priority: PRIORITY_BY_CODE[codes[0]], code: codes[0], fromLabel: true };
  const prefix = /^(?:SUP-[A-F\d]{8}\s*·\s*)?\[(P[0-3])\](?:\s|$)/i.exec(card.name);
  const code = prefix?.[1]?.toUpperCase();
  return code ? { priority: PRIORITY_BY_CODE[code], code, fromLabel: false } : null;
}

export function normalizedTrelloPriorityTitle(card: TrelloSupportCard): string | null {
  const selected = cardPriority(card);
  if (!selected?.fromLabel) return null;
  const prefix = /^(SUP-[A-F\d]{8}\s*·\s*)?\[P[0-3?]\](?=\s|$)/i.exec(card.name);
  if (!prefix) return null;
  const next = `${prefix[1] || ''}[${selected.code}]${card.name.slice(prefix[0].length)}`;
  return next === card.name ? null : next;
}

export async function normalizeTrelloPriorityTitle(
  card: TrelloSupportCard,
  settings: TrelloWebhookSettings,
): Promise<void> {
  const name = normalizedTrelloPriorityTitle(card);
  if (!name) return;
  const response = await fetch(`https://api.trello.com/1/cards/${card.id}`, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `OAuth oauth_consumer_key="${settings.apiKey}", oauth_token="${settings.token}"`,
      'X-Trello-Client-Identifier': TRELLO_SUPPORT_CLIENT_IDENTIFIER,
    },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Trello priority title update failed (${response.status}).`);
}

export function deriveTrelloTicketState(
  card: TrelloSupportCard,
  current: Pick<TrelloTicketState, 'status' | 'target_date' | 'priority'>,
  settings: TrelloWebhookSettings,
): TrelloTicketState {
  const priority = cardPriority(card)?.priority || current.priority;
  if (card.closed) return { ...current, priority, trello_sync_error: 'Unarchive the Trello support card before changing its status.' };
  if (card.idList === settings.lists.inProgress) {
    const due = card.due && Date.parse(card.due);
    if (!due || !Number.isFinite(due)) return {
      ...current, priority,
      trello_sync_error: 'Set a Trello due date before moving this card to the In Progress list.',
    };
    return { status: 'in_progress', target_date: new Date(due).toISOString(), priority, trello_sync_error: null };
  }
  if (card.idList === settings.lists.registered) {
    return { status: 'registered', target_date: null, priority, trello_sync_error: null };
  }
  if (card.idList === settings.lists.resolved) {
    return { status: 'resolved', target_date: null, priority, trello_sync_error: null };
  }
  return { ...current, priority, trello_sync_error: 'Move the Trello support card to one of the three configured support lists.' };
}
