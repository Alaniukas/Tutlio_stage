import type { VercelRequest, VercelResponse } from './types.js';
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  createSupportAttachmentUpload,
  isSupportAttachmentType,
  isValidSupportSessionId,
} from './_lib/supportPersistence.js';
import { allowSupportRequest } from './_lib/supportRequest.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowSupportRequest(req, res, 'attachment', 8)) return;

  let body: Record<string, unknown>;
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const sessionId = String(body.sessionId ?? '').trim().slice(0, 100);
  const name = String(body.name ?? '').trim().slice(0, 180);
  const type = String(body.type ?? '').trim();
  const size = Number(body.size);
  const page = String(body.page ?? '/').trim().slice(0, 300) || '/';
  const locale = String(body.locale ?? 'en').trim().slice(0, 12) || 'en';

  if (!isValidSupportSessionId(sessionId)
    || !name
    || !isSupportAttachmentType(type)
    || !Number.isInteger(size)
    || size < 1
    || size > SUPPORT_ATTACHMENT_MAX_BYTES) {
    return res.status(400).json({ error: 'Select a PNG, JPEG, or WebP image up to 5 MB.' });
  }

  try {
    const upload = await createSupportAttachmentUpload({ sessionId, name, type, size, page, locale });
    return res.status(200).json(upload);
  } catch (error) {
    console.error('[support-attachment-upload-url] Failed:', error);
    return res.status(500).json({ error: 'Could not prepare the image upload.' });
  }
}
