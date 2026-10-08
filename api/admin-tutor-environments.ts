import type { VercelRequest, VercelResponse } from './types';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { getPlatformAdminSecret } from './_lib/adminSecret.js';
import { linkedTutorAccounts, listTutorEnvironments, loadTutorEnvironment, requirePasswordOnlyAccount } from './_lib/tutorEnvironments.js';
import { TutorEnvironmentError } from '../src/lib/tutorEnvironments.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';

const isId = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const expected = Buffer.from(getPlatformAdminSecret());
  const supplied = Buffer.from(typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '');
  if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!['GET', 'POST', 'DELETE'].includes(req.method || '')) return res.status(405).json({ error: 'failed' });
  const tutorId = req.method === 'GET' ? req.query.tutorId : req.body?.tutorId;
  if (!isId(tutorId)) return res.status(400).json({ error: 'notTutor' });
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return res.status(500).json({ error: 'failed' });
  const sb = createClient(url, serviceKey, supabaseServiceRoleClientOptions());
  try {
    const current = await loadTutorEnvironment(sb, tutorId);
    if (!current) throw new TutorEnvironmentError('notTutor');
    if (req.method === 'GET') return res.status(200).json({ environments: await listTutorEnvironments(sb, current) });
    const otherTutorId = req.body?.otherTutorId;
    if (!isId(otherTutorId) || otherTutorId === tutorId) throw new TutorEnvironmentError('sameAccount');
    let rpcName: string;
    if (req.method === 'POST') {
      const other = await loadTutorEnvironment(sb, otherTutorId);
      if (!other) throw new TutorEnvironmentError('notTutor');
      if (other.organizationId === current.organizationId) throw new TutorEnvironmentError('sameCompany');
      // Refuse assignments that cannot safely use the session handoff.
      const accounts = await Promise.all([tutorId, otherTutorId].map(id => sb.auth.admin.getUserById(id)));
      for (const account of accounts) {
        if (account.error || !account.data.user) throw new TutorEnvironmentError('notTutor');
        requirePasswordOnlyAccount(account.data.user);
      }
      rpcName = 'link_tutor_environment_accounts';
    } else {
      const linked = await linkedTutorAccounts(sb, current);
      if (!linked.some(row => row.tutor_id === otherTutorId)) throw new TutorEnvironmentError('notLinked');
      rpcName = 'unlink_tutor_environment_account';
    }
    // Both operations audit atomically in PostgreSQL. This endpoint never
    // changes business ownership, rates, invoices, passwords or live sessions.
    const { error } = await sb.rpc(rpcName, { p_tutor_id: tutorId, p_other_tutor_id: otherTutorId });
    if (error) throw new TutorEnvironmentError(error.code === 'PGRST202' ? 'setupRequired' : 'failed');
    return res.status(200).json({ environments: await listTutorEnvironments(sb, current) });
  } catch (error) {
    const code = error instanceof TutorEnvironmentError ? error.code : 'failed';
    return res.status(code === 'setupRequired' ? 503 : code === 'failed' ? 500 : 400).json({ error: code });
  }
}
