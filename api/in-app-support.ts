import type { VercelRequest, VercelResponse } from './types.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { allowSupportRequest } from './_lib/supportRequest.js';
import { getSupportServiceClient } from './_lib/supportPersistence.js';
import { parseInAppSupportSubmission } from '../src/lib/inAppSupport.js';
import {
  resolveInAppSupportReporter,
  verifyInAppSupportAttachments,
} from './_lib/inAppSupport.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!allowSupportRequest(req, res, 'contact', 8)) return;
  const auth = await verifyRequestAuth(req);
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
      resolveInAppSupportReporter(auth.userId, input.portal),
      verifyInAppSupportAttachments(auth.userId, input.requestId, input.attachments),
    ]);
    const db = getSupportServiceClient();
    const row = {
        request_id: input.requestId,
        reporter_user_id: auth.userId,
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
    if (existing && existing.reporter_user_id !== auth.userId) {
      return res.status(409).json({ error: 'This support request reference is already in use.' });
    }

    const query = existing
      ? db.from('in_app_support_requests').update(row).eq('id', existing.id)
      : db.from('in_app_support_requests').insert(row);
    const { data, error } = await query
      .select('id, status, created_at')
      .single();
    if (error || !data) throw error || new Error('Could not save support request.');

    return res.status(200).json({
      ok: true,
      id: data.id,
      reference: `SUP-${String(data.id).replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      status: data.status,
      createdAt: data.created_at,
    });
  } catch (error) {
    console.error('[in-app-support] Failed:', error);
    return res.status(500).json({ error: 'Could not save the support request.' });
  }
}
