import type { VercelRequest, VercelResponse } from './types.js';
import {
  isValidSupportSessionId,
  markSupportConversationClosed,
} from './_lib/supportPersistence.js';
import { allowSupportRequest } from './_lib/supportRequest.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowSupportRequest(req, res, 'close', 30)) return;

  let body: Record<string, unknown>;
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const sessionId = String(body.sessionId ?? '').trim().slice(0, 100);
  const page = String(body.page ?? '/').trim().slice(0, 300) || '/';
  const locale = String(body.locale ?? 'en').trim().slice(0, 12) || 'en';
  if (!isValidSupportSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid support session.' });
  }

  try {
    await markSupportConversationClosed({ sessionId, page, locale });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[support-chat-close] Failed:', error);
    return res.status(500).json({ error: 'Could not close the support session.' });
  }
}
