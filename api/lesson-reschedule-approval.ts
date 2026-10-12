import type { VercelRequest, VercelResponse } from './types.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/schoolConsultationsAccess.js';
import { effectiveLessonRescheduleStatus } from '../src/lib/lessonRescheduleApproval.js';
import { emailRescheduleProposal, notifyRescheduleDecision, reschedulePreview, verifyRescheduleApprovalToken,
  type RescheduleRequestRow, type RescheduleRecipientRow } from './_lib/lessonRescheduleApproval.js';

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
function errorCode(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
  return message.match(/reschedule_[a-z_]+/)?.[0] || 'reschedule_error';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ code: 'method_not_allowed' });
  const input = (req.method === 'GET' ? req.query : req.body) || {};
  try {
    const db = serviceSupabase();
    if (input.action === 'request' || input.action === 'list') {
      const auth = await verifyRequestAuth(req);
      if (!auth?.userId) return res.status(401).json({ code: 'unauthorized' });
      if (input.action === 'list' && req.method === 'GET') {
        let query = db.from('lesson_reschedule_requests')
          .select('id, changes, status, scope, expires_at').eq('tutor_id', auth.userId);
        if (typeof input.session === 'string' && uuid.test(input.session)) query = query.contains('changes', [{ id: input.session }]);
        const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        return res.status(200).json({ requests: (data || []).map(row => ({
          id: row.id, sessionIds: row.changes.map((c: { id: string }) => c.id), scope: row.scope,
          status: effectiveLessonRescheduleStatus(row.status, row.expires_at),
        })) });
      }
      if (input.action !== 'request' || req.method !== 'POST') return res.status(400).json({ code: 'reschedule_invalid' });
      if (!uuid.test(String(input.sessionId)) || !['single', 'future'].includes(input.scope)
        || !['tutor', 'student'].includes(input.requestedBy) || String(input.reason || '').trim().length < 5
        || ![input.oldStart, input.oldEnd, input.newStart, input.newEnd].every(v => typeof v === 'string' && Number.isFinite(Date.parse(v)))) {
        return res.status(400).json({ code: 'reschedule_invalid' });
      }
      const { data: id, error } = await db.rpc('create_lesson_reschedule_request', {
        p_tutor: auth.userId, p_session: input.sessionId, p_expected_start: input.oldStart, p_expected_end: input.oldEnd,
        p_start: input.newStart, p_end: input.newEnd, p_scope: input.scope, p_reason: String(input.reason).trim(),
        p_requested_by: input.requestedBy, p_fields: input.fields || {}, p_leave_free_time: input.leaveFreeTime === true,
      });
      if (error) throw error;
      const { data: request, error: loadError } = await db.from('lesson_reschedule_requests').select('*').eq('id', id).single();
      if (loadError) throw loadError;
      let delivered = await emailRescheduleProposal(req, db, request).catch(() => false);
      if (delivered) {
        const { error: publishError } = await db.from('lesson_reschedule_requests')
          .update({ email_ready: true }).eq('id', id).eq('status', 'pending');
        delivered = !publishError;
      }
      if (!delivered) {
        // A partially delivered group proposal must not become actionable.
        const { error: cancelError } = await db.from('lesson_reschedule_requests')
          .update({ status: 'cancelled', resolved_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending');
        if (cancelError) throw cancelError;
        return res.status(503).json({ code: 'reschedule_email_failed' });
      }
      return res.status(200).json({ id, status: 'pending' });
    }

    const requestId = String(input.request || '');
    const recipientId = String(input.recipient || '');
    if (!uuid.test(requestId) || !uuid.test(recipientId)
      || !verifyRescheduleApprovalToken(requestId, recipientId, String(input.t || ''))) {
      return res.status(404).json({ code: 'reschedule_unavailable' });
    }
    const [{ data: request, error: requestError }, { data: recipient, error: recipientError }] = await Promise.all([
      db.from('lesson_reschedule_requests').select('*').eq('id', requestId).maybeSingle(),
      db.from('lesson_reschedule_recipients').select('id, email, student_ids, status')
        .eq('request_id', requestId).eq('id', recipientId).maybeSingle(),
    ]);
    if (requestError) throw requestError;
    if (recipientError) throw recipientError;
    if (!request || !recipient) return res.status(404).json({ code: 'reschedule_unavailable' });
    let row = request as RescheduleRequestRow;
    let client = recipient as RescheduleRecipientRow;
    if (req.method === 'POST') {
      if (!['approved', 'rejected'].includes(input.decision)) return res.status(400).json({ code: 'reschedule_invalid' });
      const { error } = await db.rpc('respond_lesson_reschedule_request', {
        p_request: requestId, p_email: client.email, p_decision: input.decision,
      });
      if (error) throw error;
      const [{ data: latest, error: latestError }, { data: latestRecipient, error: latestRecipientError }] = await Promise.all([
        db.from('lesson_reschedule_requests').select('*').eq('id', requestId).single(),
        db.from('lesson_reschedule_recipients').select('id, email, student_ids, status').eq('id', recipientId).single(),
      ]);
      if (latestError) throw latestError;
      if (latestRecipientError) throw latestRecipientError;
      row = latest;
      client = latestRecipient;
      // Keep the saved answer successful even if email/calendar delivery fails.
      try { await notifyRescheduleDecision(req, db, row); }
      catch (cause) { console.error('[lesson-reschedule-approval] decision delivery failed', errorCode(cause)); }
    }
    // GET is always read-only: email security scanners cannot approve a move.
    return res.status(200).json(await reschedulePreview(db, row, client));
  } catch (error) {
    const code = errorCode(error);
    console.error('[lesson-reschedule-approval]', code);
    return res.status(code === 'reschedule_error' ? 500 : 409).json({ code });
  }
}
