// Cron: Pro Klasė — remind tutors about missing lesson comments and apply -10€ penalties after 48h.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { isProKlaseOrg, PRO_KLASE_ORG_ID, PRO_KLASE_QA_ORG_ID } from './_lib/marketMoney.js';
import { PRO_KLASE_MISSING_REPORT_PENALTY_EUR } from './_lib/proKlaseTutorPay.js';
import { parseOrgTrialPolicy } from '../src/lib/orgTrialPolicy.js';
import {
  groupProKlaseTrialHistoryByStudent,
  proKlaseSessionEligibleForTrialCommentPenalty,
  proKlaseSessionEligibleForTrialCommentReminder,
  type ProKlaseCommentPenaltySession,
  type ProKlaseTrialHistorySession,
} from './_lib/proKlaseLessonCommentPenalty.js';

const PRO_KLASE_ORG_IDS = [PRO_KLASE_ORG_ID, PRO_KLASE_QA_ORG_ID];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = Date.now();
  const reminderCutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  let reminders = 0;
  let penalties = 0;

  for (const orgId of PRO_KLASE_ORG_IDS) {
    if (!isProKlaseOrg(orgId)) continue;

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('features')
      .eq('id', orgId)
      .maybeSingle();
    if (orgError || !org) {
      console.error('[proklase-lesson-comment-reminders] organization load failed', orgId, orgError);
      continue;
    }
    const features = org.features && typeof org.features === 'object' && !Array.isArray(org.features)
      ? org.features as Record<string, unknown>
      : {};
    const trialPolicy = parseOrgTrialPolicy(features);
    if (!trialPolicy.commentRequired) continue;

    const { data: tutors, error: tutorsError } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('organization_id', orgId);
    if (tutorsError) {
      console.error('[proklase-lesson-comment-reminders] tutors load failed', orgId, tutorsError);
      continue;
    }

    for (const tutor of tutors || []) {
      const tutorId = tutor.id as string;
      const sessions: ProKlaseCommentPenaltySession[] = [];
      let sessionsLoadFailed = false;
      for (let offset = 0; ; offset += 1000) {
        const { data: page, error } = await supabase
          .from('sessions')
          .select('id, student_id, tutor_comment, status, status_confirmed_at, subjects!inner(is_trial)')
          .eq('tutor_id', tutorId)
          .eq('subjects.is_trial', true)
          .in('status', ['completed', 'no_show'])
          .lte('status_confirmed_at', reminderCutoff)
          .order('id', { ascending: true })
          .range(offset, offset + 999);
        if (error) {
          console.error('[proklase-lesson-comment-reminders] sessions load failed', tutorId, error);
          sessionsLoadFailed = true;
          break;
        }
        sessions.push(...(page || []) as ProKlaseCommentPenaltySession[]);
        if (!page || page.length < 1000) break;
      }
      if (sessionsLoadFailed) continue;

      const candidateStudents = [...new Set(sessions
        .filter((session) => {
          const subject = Array.isArray(session.subjects) ? session.subjects[0] : session.subjects;
          return subject?.is_trial === true && session.student_id;
        })
        .map((session) => session.student_id as string))];
      const trialHistory: ProKlaseTrialHistorySession[] = [];
      let historyLoadFailed = false;
      for (let i = 0; i < candidateStudents.length && !historyLoadFailed; i += 100) {
        const studentIds = candidateStudents.slice(i, i + 100);
        for (let offset = 0; ; offset += 1000) {
          const { data: page, error } = await supabase
            .from('sessions')
            .select('id, student_id, start_time, status, subjects!inner(is_trial)')
            .in('student_id', studentIds)
            .eq('subjects.is_trial', true)
            .order('id', { ascending: true })
            .range(offset, offset + 999);
          if (error) {
            console.error('[proklase-lesson-comment-reminders] trial history load failed', tutorId, error);
            historyLoadFailed = true;
            break;
          }
          trialHistory.push(...(page || []) as ProKlaseTrialHistorySession[]);
          if (!page || page.length < 1000) break;
        }
      }
      if (historyLoadFailed) continue;
      const trialsByStudent = groupProKlaseTrialHistoryByStudent(trialHistory);

      for (const session of sessions) {
        const studentTrials = trialsByStudent.get(session.student_id || '') || [];
        if (proKlaseSessionEligibleForTrialCommentPenalty(session, trialPolicy, studentTrials, now)) {
          const { data: existing } = await supabase
            .from('tutor_adjustments')
            .select('id')
            .eq('session_id', session.id)
            .eq('type', 'penalty_missing_report')
            .maybeSingle();
          if (!existing) {
            await supabase.from('tutor_adjustments').insert({
              organization_id: orgId,
              tutor_id: tutorId,
              session_id: session.id,
              type: 'penalty_missing_report',
              amount_eur: PRO_KLASE_MISSING_REPORT_PENALTY_EUR,
              reason: 'Automatinė bauda: neparašytas komentaras po bandomosios pamokos',
            });
            penalties += 1;
          }
        } else if (tutor.email && proKlaseSessionEligibleForTrialCommentReminder(session, trialPolicy, studentTrials, now)) {
          reminders += 1;
        }
      }
    }
  }

  return res.status(200).json({ success: true, reminders, penalties });
}
