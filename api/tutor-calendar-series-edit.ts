import type { VercelRequest, VercelResponse } from './types.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/schoolConsultationsAccess.js';

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ code: 'method_not_allowed' });
  try {
    const auth = await verifyRequestAuth(req);
    if (!auth?.userId || auth.isInternal) return res.status(401).json({ code: 'unauthorized' });
    const input = req.body || {};
    if (!uuid.test(String(input.sessionId)) || !Array.isArray(input.recurringIds)
      || !input.recurringIds.length || input.recurringIds.length > 100
      || !input.recurringIds.every((id: unknown) => typeof id === 'string' && uuid.test(id))
      || ![input.oldStart, input.oldEnd, input.newStart, input.newEnd]
        .every(v => typeof v === 'string' && Number.isFinite(Date.parse(v)))
      || !['tutor', 'student'].includes(input.requestedBy) || typeof input.reason !== 'string') {
      return res.status(400).json({ code: 'reschedule_invalid' });
    }
    const { data, error } = await serviceSupabase().rpc('edit_tutor_calendar_series', {
      p_tutor: auth.userId, p_session: input.sessionId, p_recurrence_ids: input.recurringIds,
      p_expected_start: input.oldStart, p_expected_end: input.oldEnd,
      p_start: input.newStart, p_end: input.newEnd, p_fields: input.fields ?? {},
      p_reason: input.reason.trim(), p_requested_by: input.requestedBy,
    });
    if (error) throw error;
    return res.status(200).json({ sessions: data });
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
    const code = message.match(/reschedule_[a-z_]+/)?.[0] || 'reschedule_error';
    console.error('[tutor-calendar-series-edit]', code);
    return res.status(code === 'reschedule_error' ? 500 : 409).json({ code });
  }
}
