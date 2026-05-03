// POST /api/chat-notify-on-message — after a chat message is sent:
// - Web push to other participants (PWA), jei turi push_subscriptions (nepriklauso nuo email_notify).
// - El. laiškas, jei įjungtas ir praėjo email_notify_delay_hours nuo paskutinio laiško šiam pokalbiui.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { sendPushForUserId } from './_lib/sendPush.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Base URL to reach our own /api/* from this serverless function (same host in dev; VERCEL_URL in prod). */
function internalApiBaseUrl(req: VercelRequest): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, '');
  }
  const host = req.headers.host;
  if (host) {
    const xfProto = req.headers['x-forwarded-proto'];
    const proto =
      typeof xfProto === 'string' ? xfProto.split(',')[0].trim() : host.includes('localhost') ? 'http' : 'https';
    return `${proto}://${host}`.replace(/\/$/, '');
  }
  return (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt').replace(/\/$/, '');
}

async function resolveDisplayName(sb: any, userId: string): Promise<string> {
  const { data: profile } = await sb.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  const p = profile as any;
  if (p?.full_name?.trim()) return String(p.full_name).trim();
  const { data: stu } = await sb
    .from('students')
    .select('full_name')
    .eq('linked_user_id', userId)
    .limit(1)
    .maybeSingle();
  const s = stu as any;
  return s?.full_name?.trim() || 'Tutlio';
}

async function resolveRecipientEmail(
  sb: any,
  userId: string,
): Promise<{ email: string | null; name: string }> {
  const { data: profile } = await sb.from('profiles').select('full_name, email').eq('id', userId).maybeSingle();
  const p = profile as any;
  if (p?.email?.trim()) {
    return { email: String(p.email).trim(), name: p.full_name?.trim() || '' };
  }
  const { data: stu } = await sb
    .from('students')
    .select('full_name, email')
    .eq('linked_user_id', userId)
    .limit(1)
    .maybeSingle();
  const s = stu as any;
  if (s?.email?.trim()) {
    return { email: String(s.email).trim(), name: s.full_name?.trim() || '' };
  }
  try {
    const { data: authData } = await sb.auth.admin.getUserById(userId);
    const authEmail = authData?.user?.email?.trim();
    if (authEmail) {
      return {
        email: authEmail,
        name: profile?.full_name?.trim() || stu?.full_name?.trim() || authData.user.user_metadata?.full_name || '',
      };
    }
  } catch {
    /* ignore */
  }
  return { email: null, name: p?.full_name?.trim() || s?.full_name?.trim() || '' };
}

async function messagesPathForUser(sb: any, userId: string): Promise<string> {
  const { data: stu } = await sb
    .from('students')
    .select('id')
    .eq('linked_user_id', userId)
    .limit(1)
    .maybeSingle();
  const s = stu as any;
  if (s?.id) return '/student/messages';
  return '/messages';
}

function previewFromMessage(msg: { content: string | null; message_type: string; metadata: unknown }): string {
  if (msg.message_type === 'file') {
    const meta = (msg.metadata ?? {}) as { file_name?: string };
    return meta.file_name ? `📎 ${meta.file_name}` : '📎 Failas';
  }
  if (msg.message_type === 'lesson_proposal') return '📘 Pamokos pasiūlymas';
  const t = (msg.content || '').trim();
  if (t.length > 160) return `${t.slice(0, 157)}…`;
  return t || '…';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyRequestAuth(req);
  if (!auth || auth.isInternal || !auth.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const body = req.body as { conversationId?: string; messageId?: string };
  const conversationId = body.conversationId;
  const messageId = body.messageId;
  if (!conversationId || !messageId) {
    return res.status(400).json({ error: 'conversationId and messageId required' });
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: msg, error: msgErr } = await sb
    .from('chat_messages')
    .select('id, sender_id, conversation_id, content, message_type, metadata')
    .eq('id', messageId)
    .maybeSingle();

  if (msgErr || !msg) {
    return res.status(400).json({ error: 'Message not found' });
  }
  if (msg.sender_id !== auth.userId || msg.conversation_id !== conversationId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  type ParticipantNotifyRow = {
    user_id: string;
    email_notify_enabled: boolean | null;
    email_notify_delay_hours: number | null;
    email_notify_last_sent_at: string | null;
  };

  let participants: ParticipantNotifyRow[];

  const full = await sb
    .from('chat_participants')
    .select('user_id, email_notify_enabled, email_notify_delay_hours, email_notify_last_sent_at')
    .eq('conversation_id', conversationId);

  if (!full.error && full.data && full.data.length > 0) {
    participants = full.data as ParticipantNotifyRow[];
  } else {
    const slim = await sb
      .from('chat_participants')
      .select('user_id, email_notify_enabled, email_notify_delay_hours')
      .eq('conversation_id', conversationId);
    if (slim.error) {
      console.error('[chat-notify-on-message] participants:', full.error?.message, slim.error.message);
      return res.status(500).json({
        error: 'Failed to load participants',
        detail: full.error?.message || slim.error.message,
      });
    }
    if (!slim.data?.length) {
      console.error('[chat-notify-on-message] no participants for conversation', conversationId);
      return res.status(500).json({
        error: 'Failed to load participants',
        detail: full.error?.message || 'no_rows',
      });
    }
    participants = slim.data.map((row) => ({
      ...row,
      email_notify_last_sent_at: null,
    })) as ParticipantNotifyRow[];
  }

  const now = Date.now();
  const senderName = await resolveDisplayName(sb, auth.userId);
  const preview = previewFromMessage(msg);
  const publicAppUrl = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt').replace(/\/$/, '');
  const apiBase = internalApiBaseUrl(req);

  for (const p of participants) {
    if (p.user_id === auth.userId) continue;

    const path = await messagesPathForUser(sb, p.user_id as string);
    const messagesUrl = `${publicAppUrl}${path}`;

    /** Web push nepriklauso nuo el. laiško throttling / email_notify_* (PWA vartotojai tikisi momentinių žinučių). */
    try {
      const pushed = await sendPushForUserId(p.user_id as string, 'chat_new_message', {
        senderName,
        preview,
        messagesUrl,
      });
      if (pushed > 0) {
        console.log('[chat-notify-on-message] push ok user', p.user_id, 'devices', pushed);
      }
    } catch (e: unknown) {
      console.error('[chat-notify-on-message] push failed:', e);
    }

    if (p.email_notify_enabled === false) continue;

    const delayH = Math.min(168, Math.max(1, Number(p.email_notify_delay_hours) || 12));
    const windowMs = delayH * 60 * 60 * 1000;
    const lastSent = p.email_notify_last_sent_at ? new Date(p.email_notify_last_sent_at).getTime() : 0;
    if (lastSent > 0 && now - lastSent < windowMs) continue;

    const { email, name } = await resolveRecipientEmail(sb, p.user_id as string);
    if (!email) continue;

    try {
      const emailRes = await fetch(`${apiBase}/api/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': serviceKey,
        },
        body: JSON.stringify({
          type: 'chat_new_message',
          to: email,
          data: {
            recipientName: name,
            senderName,
            preview,
            messagesUrl,
          },
        }),
      });

      if (!emailRes.ok) {
        console.error('[chat-notify-on-message] send-email failed:', await emailRes.text());
        continue;
      }

      const { error: updErr } = await sb
        .from('chat_participants')
        .update({ email_notify_last_sent_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', p.user_id);
      if (updErr) {
        console.warn('[chat-notify-on-message] email_notify_last_sent_at update:', updErr.message);
      }
    } catch (e: unknown) {
      console.error('[chat-notify-on-message]', e);
    }
  }

  return res.status(200).json({ ok: true });
}
