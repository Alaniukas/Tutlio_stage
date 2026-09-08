import type { VercelRequest, VercelResponse } from './types.js';
import { createClient } from '@supabase/supabase-js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { getResendApiKey } from './_lib/resendConfig.js';
import { checkRecipientSuppression, type RecipientSuppression } from './_lib/recipientSuppression.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const access = await requireOrgAdminAccess(req, db, 'students.view');
  if ('status' in access) return res.status(access.status).json({ error: access.error });
  const { data: student, error } = await db.from('students').select('email, payer_email, parent_secondary_email')
    .eq('id', String(req.query.student_id || '')).eq('organization_id', access.access.organizationId).maybeSingle();
  if (error) return res.status(500).json({ error: 'Nepavyko patikrinti mokinio.' });
  if (!student) return res.status(404).json({ error: 'Mokinys nerastas.' });
  const key = getResendApiKey();
  if (!key) return res.status(503).json({ error: 'El. pašto patikra šiuo metu nepasiekiama.' });
  // Contacts are derived exclusively from this organization's student, never an arbitrary query email.
  const emails = [...new Set([student.email, student.payer_email, student.parent_secondary_email]
    .map(value => String(value || '').trim().toLowerCase()).filter(Boolean))];
  const recipients: RecipientSuppression[] = [];
  for (const email of emails) {
    if (recipients.length) await new Promise(resolve => setTimeout(resolve, 600));
    recipients.push(await checkRecipientSuppression(email, key));
  }
  return res.status(200).json({ recipients, checkedAt: new Date().toISOString() });
}
