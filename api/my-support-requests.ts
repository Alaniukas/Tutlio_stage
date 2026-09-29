import type { VercelRequest, VercelResponse } from './types.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getSupportServiceClient } from './_lib/supportPersistence.js';

const USER_VISIBLE_COLUMNS = 'id,title,category,status,created_at,status_updated_at,target_date';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyRequestAuth(req);
  if (!auth?.userId || auth.isInternal) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getSupportServiceClient();
    const { data, error } = await db
      .from('in_app_support_requests')
      .select(USER_VISIBLE_COLUMNS)
      .eq('reporter_user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    const requests = data || [];
    const ticket = typeof req.query?.ticket === 'string' ? req.query.ticket : '';
    if (!UUID.test(ticket) || requests.some((row) => row.id === ticket)) {
      return res.status(200).json({ requests });
    }

    // A direct link must still work after the ticket falls outside the recent page.
    const { data: older, error: olderError } = await db
      .from('in_app_support_requests')
      .select(USER_VISIBLE_COLUMNS)
      .eq('reporter_user_id', auth.userId)
      .eq('id', ticket)
      .maybeSingle();
    if (olderError) throw olderError;
    return res.status(200).json({ requests: older ? [older, ...requests] : requests });
  } catch (error) {
    console.error('[my-support-requests] Load failed:', error);
    return res.status(500).json({ error: 'Could not load support requests.' });
  }
}
