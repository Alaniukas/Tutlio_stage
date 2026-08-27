/**
 * POST /api/continue-trial-learning
 * Pro Klasė org admin: convert a trial slot into a weekly 60-minute series.
 */
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import {
  CONTINUE_LEARNING_DURATION_MINUTES,
  continueLearningClockTime,
  continueLearningDayOfWeek,
  continueLearningEndClockTime,
  continueLearningEndFromStart,
  continueLearningFirstOccurrence,
} from '../src/lib/continueTrialLearning.js';
import {
  iterateRecurringOccurrences,
  recurringMaterializeEndDate,
} from '../src/lib/recurringSessions.js';
import { defaultSessionPaymentStatusForStudent } from '../src/lib/studentPaymentModel.js';

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return json(res, 401, { error: 'Unauthorized' });

  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  if (!sessionId) return json(res, 400, { error: 'sessionId required' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) return json(res, 500, { error: 'Missing Supabase env' });

  const supabase = createClient(supabaseUrl, serviceKey, supabaseServiceRoleClientOptions() as any);
  const access = await getOrgAdminAccessByUserId(supabase, auth.userId);
  if (!access || !hasOrgAdminPermission(access.role, access.permissions, 'sessions.edit')) {
    return json(res, 403, { error: 'Insufficient organization permission' });
  }
  if (!isProKlaseOrg(access.organizationId)) {
    return json(res, 403, { error: 'Continue learning is only available for Pro Klasė' });
  }

  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, subject_id, start_time, end_time, status, meeting_link, topic, price')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessErr) return json(res, 500, { error: sessErr.message });
  if (!session) return json(res, 404, { error: 'Session not found' });
  if (session.status === 'cancelled') {
    return json(res, 400, { error: 'Cannot continue a cancelled trial' });
  }

  const { data: tutor } = await supabase
    .from('profiles')
    .select('id, organization_id')
    .eq('id', session.tutor_id)
    .maybeSingle();
  if (!tutor?.organization_id || tutor.organization_id !== access.organizationId) {
    return json(res, 403, { error: 'Session not in your organization' });
  }

  const { data: trialSubject } = session.subject_id
    ? await supabase.from('subjects').select('id, is_trial').eq('id', session.subject_id).maybeSingle()
    : { data: null };
  if (!trialSubject?.is_trial) {
    return json(res, 400, { error: 'This lesson is not a trial' });
  }

  const { data: ongoingSubjects } = await supabase
    .from('subjects')
    .select('id, name, price, duration_minutes, is_trial')
    .eq('tutor_id', session.tutor_id)
    .or('is_trial.is.null,is_trial.eq.false');
  const ongoing = (ongoingSubjects || []).find((row: { is_trial?: boolean | null }) => row.is_trial !== true);
  if (!ongoing?.id) {
    return json(res, 400, { error: 'Assign a regular subject to the tutor before continuing learning' });
  }

  const trialStart = new Date(session.start_time);
  if (Number.isNaN(trialStart.getTime())) return json(res, 400, { error: 'Invalid trial start time' });

  const firstOccurrence = continueLearningFirstOccurrence(trialStart);
  const dayOfWeek = continueLearningDayOfWeek(trialStart);
  const startTime = continueLearningClockTime(trialStart);
  const endTime = continueLearningEndClockTime(firstOccurrence);

  const { data: existingTpl } = await supabase
    .from('recurring_individual_sessions')
    .select('id')
    .eq('tutor_id', session.tutor_id)
    .eq('student_id', session.student_id)
    .eq('day_of_week', dayOfWeek)
    .eq('start_time', startTime)
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  if (existingTpl?.id) {
    return json(res, 409, { error: 'already_exists' });
  }

  const { data: studentRow } = await supabase
    .from('students')
    .select('id, payment_model, per_lesson_payment_timing, per_lesson_payment_deadline_hours')
    .eq('id', session.student_id)
    .maybeSingle();

  const price = Number(ongoing.price) > 0 ? Number(ongoing.price) : Number(session.price) || 0;
  const { data: template, error: tplErr } = await supabase
    .from('recurring_individual_sessions')
    .insert({
      tutor_id: session.tutor_id,
      student_id: session.student_id,
      subject_id: ongoing.id,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      start_date: format(firstOccurrence, 'yyyy-MM-dd'),
      end_date: null,
      meeting_link: session.meeting_link || null,
      topic: ongoing.name || session.topic || null,
      price,
      active: true,
      frequency: 'weekly',
    })
    .select('id')
    .single();
  if (tplErr || !template) {
    return json(res, 500, { error: tplErr?.message || 'Failed to create recurring schedule' });
  }

  const endLimit = recurringMaterializeEndDate(null, firstOccurrence);
  const occurrences = iterateRecurringOccurrences(firstOccurrence, endLimit, 'weekly');
  const paymentStatus = defaultSessionPaymentStatusForStudent(studentRow?.payment_model, {
    paid: false,
    hasPackage: false,
  });
  const rows = occurrences.map((start) => {
    const end = continueLearningEndFromStart(start);
    return {
      tutor_id: session.tutor_id,
      student_id: session.student_id,
      subject_id: ongoing.id,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'active',
      meeting_link: session.meeting_link || null,
      topic: ongoing.name || session.topic || null,
      price,
      paid: false,
      payment_status: paymentStatus,
      recurring_session_id: template.id,
      created_by_role: 'org_admin',
    };
  });

  if (rows.length === 0) {
    await supabase.from('recurring_individual_sessions').delete().eq('id', template.id);
    return json(res, 500, { error: 'Failed to generate lessons' });
  }

  const { error: insertErr } = await supabase.from('sessions').insert(rows);
  if (insertErr) {
    await supabase.from('recurring_individual_sessions').delete().eq('id', template.id);
    return json(res, 500, { error: insertErr.message });
  }

  return json(res, 200, {
    success: true,
    templateId: template.id,
    createdCount: rows.length,
    durationMinutes: CONTINUE_LEARNING_DURATION_MINUTES,
  });
}
