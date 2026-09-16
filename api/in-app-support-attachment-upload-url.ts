import type { VercelRequest, VercelResponse } from './types.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { allowSupportRequest } from './_lib/supportRequest.js';
import {
  IN_APP_SUPPORT_MAX_ATTACHMENT_BYTES,
} from '../src/lib/inAppSupport.js';
import { createInAppSupportUpload, validInAppAttachmentType } from './_lib/inAppSupport.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowSupportRequest(req, res, 'attachment', 30)) return;
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId || auth.isInternal) return res.status(401).json({ error: 'Unauthorized' });

  let body: Record<string, unknown>;
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const requestId = String(body.requestId ?? '').trim().slice(0, 100);
  const name = String(body.name ?? '').trim().slice(0, 180);
  const type = String(body.type ?? '').trim();
  const size = Number(body.size);
  if (!/^[a-zA-Z0-9._:-]{8,100}$/.test(requestId)
    || !name
    || !validInAppAttachmentType(type)
    || !Number.isInteger(size)
    || size < 1
    || size > IN_APP_SUPPORT_MAX_ATTACHMENT_BYTES) {
    return res.status(400).json({ error: 'Select a PNG, JPEG, or WebP image up to 5 MB.' });
  }

  try {
    const upload = await createInAppSupportUpload({
      userId: auth.userId,
      requestId,
      name,
      type,
      size,
    });
    return res.status(200).json(upload);
  } catch (error) {
    console.error('[in-app-support-upload] Failed:', error);
    return res.status(500).json({ error: 'Could not prepare the image upload.' });
  }
}
