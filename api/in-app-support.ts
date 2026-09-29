import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { allowSupportRequest } from './_lib/supportRequest.js';
import { getSupportServiceClient } from './_lib/supportPersistence.js';
import {
  parseInAppSupportSubmission,
  type InAppSupportPriority,
  type InAppSupportStatus,
  type InAppSupportSubmission,
} from '../src/lib/inAppSupport.js';
import {
  resolveInAppSupportReporter,
  verifyInAppSupportAttachments,
} from './_lib/inAppSupport.js';
import { sendInAppSupportNotification, type InAppSupportEmailReporter } from './_lib/inAppSupportEmail.js';
import { buildInAppSupportCodingAgentPrompt } from './_lib/inAppSupportCodingPrompt.js';
import { INTERNAL_NOTIFY_EMAILS } from './_lib/resendConfig.js';
import {
  allowedInAppSupportSiteOrigin,
  inAppSupportReference,
  inAppSupportStatusSignature,
  notifyInAppSupportStatus,
} from './_lib/inAppSupportStatusEmail.js';
import { priorityForSupportImpact, syncInAppSupportTicket } from './_lib/inAppSupportTicketSync.js';
import {
  isLocalInAppSupportPreview,
  LOCAL_IN_APP_SUPPORT_PREVIEW_USER_ID,
} from './_lib/inAppSupportPreview.js';

type StoredSupportRequest = {
  id: string;
  request_id: string;
  reporter_user_id: string | null;
  reporter_name: string | null;
  reporter_email: string;
  reporter_role: InAppSupportEmailReporter['role'];
  organization_id: string | null;
  organization_name: string | null;
  category: InAppSupportSubmission['category'];
  title: string;
  context: string;
  steps: string[];
  expected_outcome: string;
  actual_outcome: string | null;
  impact: InAppSupportSubmission['impact'];
  impact_details: string;
  page: string;
  locale: string;
  environment: InAppSupportSubmission['environment'] & { supportPortal?: InAppSupportSubmission['portal'] };
  transcript: InAppSupportSubmission['transcript'];
  attachments: InAppSupportSubmission['attachments'];
  coding_agent_prompt: string | null;
  status: InAppSupportStatus;
  priority: InAppSupportPriority;
  target_date: string | null;
  status_updated_at: string;
  status_notified_signature: string | null;
  trello_card_id: string | null;
  trello_sync_error: string | null;
  team_notified_at: string | null;
  created_at: string;
};

function reportFromStored(row: StoredSupportRequest): InAppSupportSubmission {
  const portal = row.environment?.supportPortal
    || (row.reporter_role === 'organization_admin' ? 'organization' : row.reporter_role);
  return {
    requestId: row.request_id,
    category: row.category,
    title: row.title,
    context: row.context,
    steps: row.steps,
    expectedOutcome: row.expected_outcome,
    actualOutcome: row.actual_outcome,
    impact: row.impact,
    impactDetails: row.impact_details,
    page: row.page,
    locale: row.locale,
    portal,
    environment: row.environment,
    transcript: row.transcript,
    attachments: row.attachments,
  };
}

function reporterFromStored(row: StoredSupportRequest, viewerUserId: string): InAppSupportEmailReporter {
  return {
    userId: row.reporter_user_id || viewerUserId,
    name: row.reporter_name,
    email: row.reporter_email,
    role: row.reporter_role,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
  };
}

async function deliverStoredRequest(
  db: SupabaseClient,
  row: StoredSupportRequest,
  viewerUserId: string,
  localPreview: boolean,
) {
  const reference = inAppSupportReference(row.id);
  const report = reportFromStored(row);
  const reporter = reporterFromStored(row, viewerUserId);
  const codingAgentPrompt = row.coding_agent_prompt || buildInAppSupportCodingAgentPrompt({ reference, reporter, report });
  const statusRow = {
    id: row.id,
    reporter_name: row.reporter_name,
    reporter_email: row.reporter_email,
    title: row.title,
    page: row.page,
    locale: row.locale,
    status: row.status,
    target_date: row.target_date,
    status_updated_at: row.status_updated_at || row.created_at,
    status_notified_signature: row.status_notified_signature,
    environment: row.environment,
  };
  const statusAlreadyNotified = row.status_notified_signature === inAppSupportStatusSignature(statusRow);
  const trelloCardLinked = Boolean(row.trello_card_id);
  const trelloAlreadySynced = Boolean(row.trello_card_id && !row.trello_sync_error);

  const delivery = await Promise.allSettled([
    row.team_notified_at
      ? Promise.resolve(false)
      : (async () => {
        try {
          const emailId = await sendInAppSupportNotification({
            db, id: row.id, reference, createdAt: row.created_at, reporter, report, codingAgentPrompt,
          });
          if (!emailId) throw new Error('Team email provider did not confirm delivery.');
          const { error } = await db.from('in_app_support_requests').update({
            team_notified_at: new Date().toISOString(),
            team_notification_email_id: emailId.slice(0, 500),
            team_notification_error: null,
          }).eq('id', row.id);
          if (error) throw error;
          return true;
        } catch (error) {
          await db.from('in_app_support_requests').update({
            team_notification_error: 'The team email could not be delivered or recorded.',
          }).eq('id', row.id);
          throw error;
        }
      })(),
    localPreview || statusAlreadyNotified
      ? Promise.resolve(false)
      : notifyInAppSupportStatus(db, statusRow),
    // Once linked, Trello is the team's source for status/priority changes.
    // A reporter retry must not push an older database status back onto it,
    // including when an inbound webhook recorded a validation error.
    localPreview || trelloCardLinked
      ? Promise.resolve(trelloAlreadySynced)
      : syncInAppSupportTicket(db, {
        id: row.id,
        title: row.title,
        category: row.category,
        status: row.status,
        priority: row.priority,
        page: row.page,
        target_date: row.target_date,
        trello_card_id: row.trello_card_id,
      }),
  ]);
  if (delivery[0].status === 'rejected') console.error('[in-app-support] Team notification failed');
  if (delivery[1].status === 'rejected') console.error('[in-app-support] Reporter confirmation failed');
  if (delivery[2].status === 'rejected') console.error('[in-app-support] Trello sync failed');

  return {
    ok: true,
    id: row.id,
    reference,
    status: row.status,
    createdAt: row.created_at,
    notificationSent: Boolean(row.team_notified_at || (delivery[0].status === 'fulfilled' && delivery[0].value)),
    confirmationSent: Boolean(!localPreview && (statusAlreadyNotified || (delivery[1].status === 'fulfilled' && delivery[1].value))),
    trelloSynced: Boolean(trelloAlreadySynced || (delivery[2].status === 'fulfilled' && delivery[2].value)),
  };
}

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
    const db = getSupportServiceClient();
    const reporterUserId = localPreview ? null : auth.userId;
    const { data: existing, error: existingError } = await db
      .from('in_app_support_requests')
      .select('*')
      .eq('request_id', input.requestId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (existing.reporter_user_id !== reporterUserId) {
        return res.status(409).json({ error: 'This support request reference is already in use.' });
      }
      // A retry must use the original database row. The new request body is
      // ignored, including changed text, screenshots, and reporter metadata.
      return res.status(200).json(await deliverStoredRequest(db, existing as StoredSupportRequest, auth.userId, localPreview));
    }

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
    const requestRecordId = randomUUID();
    const reference = inAppSupportReference(requestRecordId);
    const submittedReport = { ...input, attachments };
    const notificationReporter = { userId: auth.userId, ...reporter };
    const codingAgentPrompt = buildInAppSupportCodingAgentPrompt({
      reference,
      reporter: notificationReporter,
      report: submittedReport,
    });
    const siteOrigin = allowedInAppSupportSiteOrigin(req.headers.origin);
    const row = {
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
        environment: {
          ...input.environment,
          supportPortal: input.portal,
          ...(siteOrigin ? { siteOrigin } : {}),
          ...(process.env.VERCEL_DEPLOYMENT_ID ? { deploymentId: process.env.VERCEL_DEPLOYMENT_ID } : {}),
        },
        transcript: input.transcript,
        attachments,
        coding_agent_prompt: codingAgentPrompt,
        priority: priorityForSupportImpact(input.impact),
      };
    const { data, error } = await db.from('in_app_support_requests')
      .insert({ id: requestRecordId, ...row })
      .select('*')
      .single();
    if (error) {
      // Another request with the same requestId may have won the insert race.
      if (error.code === '23505') {
        const { data: winner, error: reloadError } = await db.from('in_app_support_requests')
          .select('*').eq('request_id', input.requestId).maybeSingle();
        if (reloadError) throw reloadError;
        if (winner && winner.reporter_user_id !== reporterUserId) {
          return res.status(409).json({ error: 'This support request reference is already in use.' });
        }
        if (winner) return res.status(200).json(await deliverStoredRequest(db, winner as StoredSupportRequest, auth.userId, localPreview));
      }
      throw error;
    }
    if (!data) throw new Error('Could not save support request.');
    return res.status(200).json(await deliverStoredRequest(db, data as StoredSupportRequest, auth.userId, localPreview));
  } catch (error) {
    console.error('[in-app-support] Failed:', error);
    return res.status(500).json({ error: 'Could not save the support request.' });
  }
}
