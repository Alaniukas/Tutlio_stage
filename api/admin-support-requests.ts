import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './types.js';
import { getPlatformAdminSecret } from './_lib/adminSecret.js';
import { getSupportServiceClient, SUPPORT_ATTACHMENT_BUCKET } from './_lib/supportPersistence.js';
import type { InAppSupportAttachment } from '../src/lib/inAppSupport.js';

function isAdmin(req: VercelRequest): boolean {
  const expected = getPlatformAdminSecret();
  const raw = req.headers['x-admin-secret'];
  const provided = typeof raw === 'string' ? raw : '';
  if (!expected || !provided || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const db = getSupportServiceClient();

  if (req.method === 'GET') {
    const limit = Math.min(300, Math.max(1, Number(req.query.limit) || 200));
    const { data, error } = await db
      .from('in_app_support_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[admin-support-requests] Load failed:', error);
      return res.status(500).json({ error: 'Failed to load support requests' });
    }

    const requests = await Promise.all((data || []).map(async (row) => {
      const attachments = Array.isArray(row.attachments) ? row.attachments as InAppSupportAttachment[] : [];
      const signedAttachments = await Promise.all(attachments.map(async (attachment) => {
        const { data: signed } = await db.storage
          .from(SUPPORT_ATTACHMENT_BUCKET)
          .createSignedUrl(attachment.path, 60 * 60);
        return { ...attachment, signedUrl: signed?.signedUrl || null };
      }));
      return { ...row, attachments: signedAttachments };
    }));
    return res.status(200).json({ requests });
  }

  if (req.method === 'PATCH') {
    let body: Record<string, unknown>;
    try {
      body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    const id = String(body.id || '').trim();
    const status = String(body.status || '');
    const priority = String(body.priority || '');
    const internalNote = String(body.internalNote || '').trim().slice(0, 10_000) || null;
    if (!/^[a-f0-9-]{36}$/i.test(id)
      || !['new', 'in_review', 'planned', 'resolved', 'closed'].includes(status)
      || !['untriaged', 'low', 'medium', 'high', 'urgent'].includes(priority)) {
      return res.status(400).json({ error: 'Invalid support request update' });
    }
    const { data, error } = await db
      .from('in_app_support_requests')
      .update({ status, priority, internal_note: internalNote })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) {
      console.error('[admin-support-requests] Update failed:', error);
      return res.status(500).json({ error: 'Failed to update support request' });
    }
    return res.status(200).json({ request: data });
  }

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
}
