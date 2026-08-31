import type { VercelRequest, VercelResponse } from '../types.js';
import {
  SUPPORTED_LOCALES,
  SUPPORT_LOCALE_NAMES,
  type Locale,
} from '../../src/lib/i18n/locales.js';

export const SUPPORT_LOCALES = SUPPORTED_LOCALES;
export type SupportLocale = Locale;

export type SupportMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

export function parseSupportBody(body: unknown): {
  messages: SupportMessage[];
  locale: SupportLocale;
  page: string;
  sessionId: string;
  requestId: string;
} | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.messages)) return null;

  const messages = raw.messages
    .slice(-10)
    .map((item): SupportMessage | null => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const message = item as Record<string, unknown>;
      const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : null;
      const content = String(message.content ?? '').trim().slice(0, 2_000);
      return role && content ? { role, content } : null;
    })
    .filter((message): message is SupportMessage => Boolean(message));

  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'user') return null;

  const localeValue = String(raw.locale ?? 'en').toLowerCase();
  const locale = SUPPORT_LOCALES.includes(localeValue as SupportLocale)
    ? localeValue as SupportLocale
    : 'en';
  const page = String(raw.page ?? '/').trim().slice(0, 300) || '/';
  const sessionId = String(raw.sessionId ?? '').trim().slice(0, 100);
  const requestId = String(raw.requestId ?? '').trim().slice(0, 100);

  return { messages, locale, page, sessionId, requestId };
}

export function supportLocaleName(locale: SupportLocale): string {
  return SUPPORT_LOCALE_NAMES[locale];
}

const SUPPORT_GENERAL_FOLLOW_UP: Record<SupportLocale, string> = {
  lt: 'Kuo dar galiu jums padėti?',
  en: 'What else can I help you with?',
  pl: 'W czym jeszcze mogę pomóc?',
  lv: 'Ar ko vēl varu jums palīdzēt?',
  ee: 'Millega saan teid veel aidata?',
  fr: 'Comment puis-je vous aider autrement ?',
  es: '¿En qué más puedo ayudarte?',
  de: 'Wobei kann ich Ihnen noch helfen?',
  se: 'Vad mer kan jag hjälpa dig med?',
  dk: 'Hvad kan jeg ellers hjælpe dig med?',
  fi: 'Miten voin vielä auttaa?',
  no: 'Hva mer kan jeg hjelpe deg med?',
  nl: 'Waarmee kan ik je nog meer helpen?',
};

export function supportGeneralFollowUp(locale: SupportLocale): string {
  return SUPPORT_GENERAL_FOLLOW_UP[locale];
}

export function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return raw?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

export function allowSupportRequest(
  req: VercelRequest,
  res: VercelResponse,
  scope: 'chat' | 'contact' | 'attachment' | 'close',
  limit: number,
  windowMs = 10 * 60_000,
): boolean {
  const now = Date.now();
  const key = `${scope}:${clientIp(req)}`;
  const current = rateBuckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowMs }
    : current;

  bucket.count += 1;
  rateBuckets.set(key, bucket);

  if (rateBuckets.size > 1_000) {
    for (const [bucketKey, value] of rateBuckets) {
      if (value.resetAt <= now) rateBuckets.delete(bucketKey);
    }
  }

  if (bucket.count <= limit) return true;

  res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000))));
  res.status(429).json({ error: 'Too many support requests. Please wait a few minutes.' });
  return false;
}
