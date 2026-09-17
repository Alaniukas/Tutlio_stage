import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from './types.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { allowSupportRequest } from './_lib/supportRequest.js';
import { getSupportServiceClient } from './_lib/supportPersistence.js';
import { parseInAppSupportSubmission } from '../src/lib/inAppSupport.js';
import {
  resolveInAppSupportReporter,
  verifyInAppSupportAttachments,
} from './_lib/inAppSupport.js';
import { sendInAppSupportNotification } from './_lib/inAppSupportEmail.js';
import { buildInAppSupportCodingAgentPrompt } from './_lib/inAppSupportCodingPrompt.js';
import { INTERNAL_NOTIFY_EMAILS } from './_lib/resendConfig.js';
import {
  isLocalInAppSupportPreview,
  LOCAL_IN_APP_SUPPORT_PREVIEW_USER_ID,
} from './_lib/inAppSupportPreview.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowSupportRequest(req, res, 'contact', 8)) return;
  const localPreview = isLocalInAppSupportPreview(req);
  const auth = localPreview
    ? { userId: LOCAL_IN_APP_SUPPORT_PREVIEW_USER_ID, isInternal: false }
    : await verifyRequestAuth(req);
  if (!auth?.userId || auth.isInternal) return res.status(401).json({ error: 'Unauthorized' });

  let raw: unknown;
  try {
    raw = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const input = parseInAppSupportSubmission(raw);
  if (!input) return res.status(400).json({ error: 'Complete every required report step.' });

  try {
    const [reporter, attachments] = await Promise.all([
      localPreview
        ? Promise.resolve({
          name: 'Tutlio local support preview',
          email: INTERNAL_NOTIFY_EMAILS[0],
          role: 'tutor' as const,
          organizationId: null,
          organizationName: null,
        })
        : resolveInAppSupportReporter(auth.userId, input.portal),
      verifyInAppSupportAttachments(auth.userId, input.requestId, input.attachments),
    ]);
    const db = getSupportServiceClient();
    const reporterUserId = localPreview ? null : auth.userId;
    const baseRow = {
        request_id: input.requestId,
        reporter_user_id: reporterUserId,
        reporter_name: reporter.name,
        reporter_email: reporter.email,
        reporter_role: reporter.role,
        organization_id: reporter.organizationId,
        organization_name: reporter.organizationName,
        category: input.category,
        title: input.title,
        context: input.context,
        steps: input.steps,
        expected_outcome: input.expectedOutcome,
        actual_outcome: input.actualOutcome,
        impact: input.impact,
        impact_details: input.impactDetails,
        page: input.page,
        locale: input.locale,
        environment: input.environment,
        transcript: input.transcript,
        attachments,
      };
    const { data: existing, error: existingError } = await db
      .from('in_app_support_requests')
      .select('id, reporter_user_id')
      .eq('request_id', input.requestId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.reporter_user_id !== reporterUserId) {
      return res.status(409).json({ error: 'This support request reference is already in use.' });
    }

    const requestRecordId = existing?.id ? String(existing.id) : randomUUID();
    const reference = `SUP-${requestRecordId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const submittedReport = { ...input, attachments };
    const notificationReporter = { userId: auth.userId, ...reporter };
    const codingAgentPrompt = buildInAppSupportCodingAgentPrompt({
      reference,
      reporter: notificationReporter,
      report: submittedReport,
    });
    const row = { ...baseRow, coding_agent_prompt: codingAgentPrompt };

    const query = existing
      ? db.from('in_app_support_requests').update(row).eq('id', existing.id)
      : db.from('in_app_support_requests').insert({ id: requestRecordId, ...row });
    const { data, error } = await query
      .select('id, status, created_at')
      .single();
    if (error || !data) throw error || new Error('Could not save support request.');

    try {
      await sendInAppSupportNotification({
        db,
        id: String(data.id),
        reference,
        createdAt: String(data.created_at),
        reporter: notificationReporter,
        report: submittedReport,
        codingAgentPrompt,
      });
    } catch (notificationError) {
      console.error('[in-app-support] Team notification failed:', notificationError);
      return res.status(502).json({
        error: 'The report was saved, but the team notification could not be delivered yet.',
        code: 'TEAM_NOTIFICATION_FAILED',
        saved: true,
        reference,
      });
    }

    return res.status(200).json({
      ok: true,
      id: data.id,
      reference,
      status: data.status,
      createdAt: data.created_at,
      notificationSent: true,
    });
  } catch (error) {
    console.error('[in-app-support] Failed:', error);
    return res.status(500).json({ error: 'Could not save the support request.' });
  }
}
