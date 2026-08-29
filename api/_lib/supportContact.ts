import type { SupportMessage } from './supportRequest.js';
import type { SupportAttachment } from './supportPersistence.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SupportContactPayload {
  name: string;
  email: string;
  phone: string | null;
  message: string;
  page: string;
  locale: string;
  conversation: SupportMessage[];
  sessionId: string;
  requestId: string;
  attachment: SupportAttachment | null;
  isBot: boolean;
}

export function parseSupportContact(body: unknown): SupportContactPayload | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  const name = String(raw.name ?? '').trim().slice(0, 100);
  const email = String(raw.email ?? '').trim().toLowerCase().slice(0, 200);
  const phone = String(raw.phone ?? '').trim().slice(0, 50) || null;
  const message = String(raw.message ?? '').trim().slice(0, 4_000);
  const page = String(raw.page ?? '/').trim().slice(0, 300) || '/';
  const locale = String(raw.locale ?? 'en').trim().slice(0, 12) || 'en';
  const sessionId = String(raw.sessionId ?? '').trim().slice(0, 100);
  const requestId = String(raw.requestId ?? '').trim().slice(0, 100);
  const isBot = Boolean(String(raw.website ?? '').trim());

  if (!name || !EMAIL_RE.test(email) || message.length < 10) return null;

  const conversation = Array.isArray(raw.conversation)
    ? raw.conversation
      .slice(-6)
      .map((item): SupportMessage | null => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const value = item as Record<string, unknown>;
        const role = value.role === 'assistant' ? 'assistant' : value.role === 'user' ? 'user' : null;
        const content = String(value.content ?? '').trim().slice(0, 1_000);
        return role && content ? { role, content } : null;
      })
      .filter((item): item is SupportMessage => Boolean(item))
    : [];

  let attachment: SupportAttachment | null = null;
  if (raw.attachment != null) {
    if (!raw.attachment || typeof raw.attachment !== 'object' || Array.isArray(raw.attachment)) return null;
    const value = raw.attachment as Record<string, unknown>;
    const path = String(value.path ?? '').trim().slice(0, 300);
    const attachmentName = String(value.name ?? '').trim().slice(0, 180);
    const type = String(value.type ?? '').trim();
    const size = Number(value.size);
    if (!path
      || !attachmentName
      || !['image/png', 'image/jpeg', 'image/webp'].includes(type)
      || !Number.isInteger(size)
      || size < 1
      || size > 5 * 1024 * 1024) {
      return null;
    }
    attachment = {
      path,
      name: attachmentName,
      type: type as SupportAttachment['type'],
      size,
    };
  }

  return {
    name,
    email,
    phone,
    message,
    page,
    locale,
    conversation,
    sessionId,
    requestId,
    attachment,
    isBot,
  };
}

export function escapeSupportHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
