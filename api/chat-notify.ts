// Deprecated hourly digest — chat email alerts are now sent from /api/chat-notify-on-message
// (throttled per conversation via chat_participants.email_notify_last_sent_at).
// Kept so old cron URLs return 200 instead of 404.

import type { VercelRequest, VercelResponse } from './types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  return res.status(200).json({ ok: true, deprecated: true });
}
