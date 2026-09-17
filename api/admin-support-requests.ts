import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './types.js';
import { getPlatformAdminSecret } from './_lib/adminSecret.js';
import { sendInAppSupportCompletionEmail } from './_lib/inAppSupportCompletionEmail.js';
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

  if (req.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    const id = String(body.id || '').trim();
    if (!/^[a-f0-9-]{36}$/i.test(id) || body.action !== 'notify_completion') {
      return res.status(400).json({ error: 'Invalid completion notification request' });
    }

    const { data: supportRequest, error: loadError } = await db
      .from('in_app_support_requests')
      .select('id, reporter_name, reporter_email, category, title, locale, status, completion_notified_at')
      .eq('id', id)
      .maybeSingle();
    if (loadError) {
      console.error('[admin-support-requests] Completion request load failed:', loadError);
      return res.status(500).json({ error: 'Failed to load support request' });
    }
    if (!supportRequest) return res.status(404).json({ error: 'Support request not found' });
    if (supportRequest.status !== 'resolved') {
      return res.status(409).json({ error: 'Mark and save this request as resolved before notifying the user' });
    }
    if (supportRequest.completion_notified_at) {
      return res.status(409).json({ error: 'The user has already been notified about this request' });
    }

    let emailId: string;
    try {
      emailId = await sendInAppSupportCompletionEmail({
        id: supportRequest.id,
        reference: `SUP-${supportRequest.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        reporterName: supportRequest.reporter_name,
        reporterEmail: supportRequest.reporter_email,
        category: supportRequest.category,
        title: supportRequest.title,
        locale: supportRequest.locale,
      });
    } catch (emailError) {
      console.error('[admin-support-requests] Completion email failed:', emailError);
      return res.status(502).json({ error: 'Failed to send the completion email' });
    }

    const notifiedAt = new Date().toISOString();
    const { data, error } = await db
      .from('in_app_support_requests')
      .update({
        completion_notified_at: notifiedAt,
        completion_notification_email_id: emailId.slice(0, 500),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error || !data) {
      console.error('[admin-support-requests] Completion notification update failed:', error);
      return res.status(500).json({ error: 'Email sent, but the notification status could not be saved' });
    }
    return res.status(200).json({ request: data });
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

  res.setHeader('Allow', 'GET, PATCH, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
