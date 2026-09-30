import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './types.js';
import { getPlatformAdminSecret } from './_lib/adminSecret.js';
import { sendInAppSupportCompletionEmail } from './_lib/inAppSupportCompletionEmail.js';
import { notifyInAppSupportStatus } from './_lib/inAppSupportStatusEmail.js';
import { syncInAppSupportTicket } from './_lib/inAppSupportTicketSync.js';
import { getSupportServiceClient, SUPPORT_ATTACHMENT_BUCKET } from './_lib/supportPersistence.js';
import { parseInAppSupportDiagnostics, type InAppSupportAttachment } from '../src/lib/inAppSupport.js';
import { getCorrelatedSupportVercelLogs } from './_lib/supportVercelLogs.js';
import type { SupportDiagnostic } from '../src/lib/supportDiagnostics.js';

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
    if (!/^[a-f0-9-]{36}$/i.test(id)
      || !['notify_completion', 'notify_status', 'sync_trello', 'get_logs'].includes(String(body.action))) {
      return res.status(400).json({ error: 'Invalid completion notification request' });
    }

    if (body.action === 'get_logs') {
      const { data: request, error: requestError } = await db.from('in_app_support_requests')
        .select('id, environment').eq('id', id).maybeSingle();
      if (requestError) return res.status(500).json({ error: 'Failed to load support request' });
      if (!request) return res.status(404).json({ error: 'Support request not found' });
      const environment = request.environment && typeof request.environment === 'object' ? request.environment : {};
      const failures = parseInAppSupportDiagnostics(environment.diagnostics)
        .filter((item): item is Extract<SupportDiagnostic, { type: 'api_failure' }> => item.type === 'api_failure' && Boolean(item.vercelId));
      try {
        const logs = await getCorrelatedSupportVercelLogs(failures.map((item) => item.vercelId!));
        return res.status(200).json({ logs: logs.filter((log) => failures.some((failure) => (
          failure.vercelId === log.vercel_id
          && failure.endpoint === log.path
          && Math.abs(Date.parse(failure.at) - Date.parse(log.occurred_at)) <= 120_000
        ))).slice(0, 50) });
      } catch (logError) {
        console.error('[admin-support-requests] Vercel log lookup failed:', logError);
        return res.status(502).json({ error: 'Could not load correlated Vercel logs' });
      }
    }

    if (body.action === 'notify_status' || body.action === 'sync_trello') {
      const { data: request, error: requestError } = await db.from('in_app_support_requests')
        .select('*').eq('id', id).maybeSingle();
      if (requestError) return res.status(500).json({ error: 'Failed to load support request' });
      if (!request) return res.status(404).json({ error: 'Support request not found' });
      try {
        if (body.action === 'notify_status') await notifyInAppSupportStatus(db, request);
        else if (!await syncInAppSupportTicket(db, request)) {
          res.setHeader('Retry-After', '30');
          return res.status(503).json({ error: 'Trello synchronization is pending. Check the connection and retry.' });
        }
      } catch (error) {
        console.error('[admin-support-requests] Retry failed:', error);
        return res.status(502).json({ error: body.action === 'notify_status'
          ? 'The user notification could not be sent.'
          : 'The Trello card could not be synchronized.' });
      }
      const { data: refreshed, error: refreshError } = await db.from('in_app_support_requests')
        .select('*').eq('id', id).single();
      if (refreshError || !refreshed) return res.status(500).json({ error: 'Could not reload support request' });
      return res.status(200).json({ request: refreshed });
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
    const targetDate = body.targetDate === null || body.targetDate === '' ? null
      : typeof body.targetDate === 'string' ? body.targetDate.trim() : undefined;
    if (!/^[a-f0-9-]{36}$/i.test(id)
      || !['registered', 'in_progress', 'resolved'].includes(status)
      || !['untriaged', 'low', 'medium', 'high', 'urgent'].includes(priority)
      || targetDate === undefined
      || (targetDate !== null && (!Number.isFinite(Date.parse(targetDate)) || targetDate.length > 40))
      || (status === 'in_progress' && !targetDate)) {
      return res.status(400).json({ error: 'Invalid support request update' });
    }
    const { data: before, error: beforeError } = await db.from('in_app_support_requests')
      .select('id, status, target_date, priority, status_updated_at, trello_card_id, status_notified_signature')
      .eq('id', id).maybeSingle();
    if (beforeError) return res.status(500).json({ error: 'Failed to load support request' });
    if (!before) return res.status(404).json({ error: 'Support request not found' });
    if ((body.expectedStatusUpdatedAt && body.expectedStatusUpdatedAt !== before.status_updated_at)
      || (body.expectedPriority && body.expectedPriority !== before.priority)) {
      return res.status(409).json({ error: 'This ticket changed in Trello. Refresh before saving.' });
    }
    const normalizedTargetDate = status === 'in_progress' && targetDate
      ? new Date(targetDate).toISOString() : null;
    const previousTargetDate = before.target_date ? new Date(before.target_date).toISOString() : null;
    const visibleChange = before.status !== status || previousTargetDate !== normalizedTargetDate;
    const trelloChange = visibleChange || before.priority !== priority || !before.trello_card_id;
    const { data, error } = await db
      .from('in_app_support_requests')
      .update({ status, priority, internal_note: internalNote, target_date: normalizedTargetDate })
      .eq('id', id)
      .eq('status_updated_at', before.status_updated_at)
      .eq('priority', before.priority)
      .select('*')
      .single();
    if (error || !data) {
      if (error?.code === 'PGRST116') return res.status(409).json({ error: 'This ticket changed in Trello. Refresh before saving.' });
      console.error('[admin-support-requests] Update failed:', error);
      return res.status(500).json({ error: 'Failed to update support request' });
    }
    const warnings: string[] = [];
    const work: Promise<unknown>[] = [];
    if (visibleChange || !data.status_notified_signature) {
      work.push(notifyInAppSupportStatus(db, data).catch((notifyError) => {
        console.error('[admin-support-requests] Status email failed:', notifyError);
        warnings.push('The status was saved, but the user email could not be delivered.');
      }));
    }
    if (trelloChange) {
      work.push(syncInAppSupportTicket(db, data).then((synced) => {
        if (!synced) warnings.push('The status was saved, but Trello synchronization is pending. Retry synchronization.');
      }).catch((trelloError) => {
        console.error('[admin-support-requests] Trello sync failed:', trelloError);
        warnings.push('The status was saved, but Trello could not be synchronized.');
      }));
    }
    await Promise.all(work);
    const { data: refreshed } = await db.from('in_app_support_requests').select('*').eq('id', id).single();
    return res.status(200).json({ request: refreshed || data, warnings });
  }

  res.setHeader('Allow', 'GET, PATCH, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
