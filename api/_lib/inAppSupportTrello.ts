import type { InAppSupportPriority } from '../../src/lib/inAppSupport.js';

export type TrelloSupportStatus =
  | 'registered'
  | 'in_progress'
  | 'resolved'
  // Existing requests can still have these values until the status migration runs.
  | 'new'
  | 'in_review'
  | 'planned'
  | 'closed';

export interface InAppSupportTrelloInput {
  reference: string;
  title: string;
  category: 'bug' | 'feature';
  status: TrelloSupportStatus;
  priority: InAppSupportPriority;
  page?: string | null;
  dueAt?: string | null;
  cardId?: string | null;
}

export type InAppSupportTrelloResult =
  | { synced: false; reason: 'not_configured' }
  | { synced: true; cardId: string; cardUrl: string | null; created: boolean };

interface TrelloConfig {
  key: string;
  token: string;
  boardId: string;
  lists: { registered: string; inProgress: string; resolved: string };
}

function config(): TrelloConfig | null {
  const key = process.env.TRELLO_API_KEY?.trim();
  const token = process.env.TRELLO_TOKEN?.trim();
  const boardId = process.env.TRELLO_BOARD_ID?.trim();
  const registered = process.env.TRELLO_LIST_NEW_ID?.trim();
  const inProgress = process.env.TRELLO_LIST_IN_PROGRESS_ID?.trim();
  const resolved = process.env.TRELLO_LIST_RESOLVED_ID?.trim();
  if (!key || !token || !boardId || !registered || !inProgress || !resolved) return null;
  return { key, token, boardId, lists: { registered, inProgress, resolved } };
}

function stage(status: TrelloSupportStatus): keyof TrelloConfig['lists'] {
  if (status === 'registered' || status === 'new') return 'registered';
  if (status === 'in_progress' || status === 'in_review' || status === 'planned') return 'inProgress';
  if (status === 'resolved' || status === 'closed') return 'resolved';
  throw new Error('Invalid Trello support status.');
}

function safePage(value: string | null | undefined): string {
  const path = String(value || '').split(/[?#]/, 1)[0].trim();
  if (!path.startsWith('/')) return '/';
  const known = new Set([
    'account', 'admin', 'availability', 'billing', 'calendar', 'company', 'contracts',
    'dashboard', 'finance', 'groups', 'homework', 'invoices', 'lessons', 'login',
    'messages', 'parent', 'payments', 'profile', 'recordings', 'schedule', 'school',
    'sessions', 'settings', 'student', 'students', 'support', 'tutors',
  ]);
  const segments = path.split('/').filter(Boolean);
  return segments.length === 0 ? '/' : `/${segments.map((segment, index) => (
    index < 2 && known.has(segment.toLowerCase()) ? segment.toLowerCase() : ':detail'
  )).join('/')}`;
}

function dueValue(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error('Invalid Trello support deadline.');
  return new Date(time).toISOString();
}

function cardDescription(input: InAppSupportTrelloInput): string {
  const origin = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt').replace(/\/+$/, '');
  const mappedStage = stage(input.status);
  const lines = [
    `Tutlio support reference: ${input.reference}`,
    `Type: ${input.category === 'bug' ? 'Bug' : 'Feature request'}`,
    `Status: ${mappedStage === 'registered' ? 'Registered' : mappedStage === 'inProgress' ? 'In progress' : 'Resolved'}`,
    `Priority: ${input.priority}`,
    `Page: ${safePage(input.page)}`,
    `Full report and private diagnostics: ${origin}/admin (Support tab; search ${input.reference})`,
  ];
  if (input.dueAt) lines.splice(4, 0, `Deadline: ${dueValue(input.dueAt)}`);
  return lines.join('\n');
}

function priorityLabel(priority: InAppSupportPriority): string {
  if (priority === 'urgent') return 'P0';
  if (priority === 'high') return 'P1';
  if (priority === 'medium') return 'P2';
  if (priority === 'low') return 'P3';
  return 'P?';
}

type TrelloCard = { id?: unknown; idBoard?: unknown; name?: unknown; desc?: unknown; url?: unknown };

function trelloHeaders(trello: TrelloConfig): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `OAuth oauth_consumer_key="${trello.key}", oauth_token="${trello.token}"`,
    'X-Trello-Client-Identifier': 'tutlio-support-sync',
  };
}

async function findCardByReference(trello: TrelloConfig, reference: string): Promise<TrelloCard | null> {
  const params = new URLSearchParams({
    query: reference,
    idBoards: trello.boardId,
    modelTypes: 'cards',
    card_fields: 'id,idBoard,name,desc,url',
    cards_limit: '100',
  });
  const response = await fetch(`https://api.trello.com/1/search?${params}`, {
    method: 'GET',
    headers: trelloHeaders(trello),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Trello support card lookup failed (${response.status}).`);
  const result = await response.json() as { cards?: unknown } | TrelloCard[];
  const cards = Array.isArray(result) ? result : result.cards;
  if (!Array.isArray(cards)) throw new Error('Trello card lookup returned an invalid response.');
  return cards.find((card) => card && typeof card === 'object' && card.idBoard === trello.boardId && (
    String(card.name || '').startsWith(`${reference} · `)
    || String(card.desc || '').split('\n', 1)[0] === `Tutlio support reference: ${reference}`
  )) || null;
}

function cardUrl(card: TrelloCard): string | null {
  return typeof card.url === 'string' && /^https:\/\/trello\.com\/c\//i.test(card.url)
    ? card.url
    : null;
}

/**
 * Sync only a safe backlog summary. The full transcript, contact details, and
 * attachments stay in Tutlio. Persist the returned cardId before the next sync;
 * passing it back turns subsequent calls into idempotent updates.
 */
export async function syncInAppSupportTrelloCard(input: InAppSupportTrelloInput): Promise<InAppSupportTrelloResult> {
  const trello = config();
  if (!trello) return { synced: false, reason: 'not_configured' };

  // Search before creating to recover a card when an earlier POST succeeded but
  // the database write of its ID failed. Match the exact reference on this board.
  const existingCard = input.cardId?.trim() ? null : await findCardByReference(trello, input.reference);
  const existingId = input.cardId?.trim() || (typeof existingCard?.id === 'string' ? existingCard.id : null);
  const url = existingId
    ? `https://api.trello.com/1/cards/${encodeURIComponent(existingId)}`
    : 'https://api.trello.com/1/cards';
  const due = dueValue(input.dueAt);
  const body: Record<string, string | null> = {
    idList: trello.lists[stage(input.status)],
    // Ticket titles may contain student names or other free-form personal data.
    // The team can open the full report in Tutlio using the reference below.
    name: `${input.reference} · [${priorityLabel(input.priority)}] ${input.category === 'bug' ? 'Bug' : 'Feature'} ${safePage(input.page)}`,
    desc: cardDescription(input),
  };
  if (!existingId && (input.priority === 'urgent' || input.priority === 'high')) body.pos = 'top';
  if (due !== undefined && (existingId || due !== null)) body.due = due;

  const response = await fetch(url, {
    method: existingId ? 'PUT' : 'POST',
    headers: trelloHeaders(trello),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  // Do not include response text or the Authorization header in errors: Trello
  // may echo request details, and these contain a privileged account token.
  if (!response.ok) throw new Error(`Trello support card sync failed (${response.status}).`);
  const card = await response.json() as TrelloCard;
  const cardId = typeof card.id === 'string' && card.id.trim() ? card.id.trim() : null;
  if (!cardId) throw new Error('Trello did not return a card ID.');
  return { synced: true, cardId, cardUrl: cardUrl(card) || (existingCard ? cardUrl(existingCard) : null), created: !existingId };
}
