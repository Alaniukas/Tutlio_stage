import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { TutorEnvironmentError } from '../src/lib/tutorEnvironments.js';
import { canUseTutorEnvironmentAuth, linkedTutorAccounts, listTutorEnvironments, loadTutorEnvironment, requirePasswordOnlyAccount } from './_lib/tutorEnvironments.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ error: 'failed' });
  // Tutors only select access assigned by Tutlio. Linking/unlinking is an
  // audited platform-admin operation, never a tutor password form.
  if (req.method === 'POST' && req.body?.action !== 'switch') return res.status(400).json({ error: 'failed' });
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) return res.status(500).json({ error: 'failed' });
  const authOptions = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
  const sb = createClient(url, serviceKey, authOptions);

  try {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) throw new TutorEnvironmentError('unauthorized');
    const { data: auth, error: authError } = await sb.auth.getUser(header.slice(7));
    if (authError || !canUseTutorEnvironmentAuth(auth.user)) throw new TutorEnvironmentError('unauthorized');
    const user = auth.user!;
    const current = await loadTutorEnvironment(sb, user.id, user);
    if (!current) throw new TutorEnvironmentError('notTutor');

    if (req.method === 'GET') return res.status(200).json({ environments: await listTutorEnvironments(sb, current) });

    const targetId = typeof req.body?.tutorId === 'string' ? req.body.tutorId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId) || targetId === user.id) {
      throw new TutorEnvironmentError('notLinked');
    }
    const accounts = await linkedTutorAccounts(sb, current);
    const linked = accounts.find((row) => row.tutor_id === targetId);
    if (!linked) throw new TutorEnvironmentError('notLinked');

    requirePasswordOnlyAccount(user);
    const target = await loadTutorEnvironment(sb, targetId);
    if (!target || target.organizationId !== linked.organization_id) throw new TutorEnvironmentError('notLinked');
    const { data: targetAuth, error: targetAuthError } = await sb.auth.admin.getUserById(targetId);
    if (targetAuthError || !canUseTutorEnvironmentAuth(targetAuth.user)) throw new TutorEnvironmentError('notLinked');
    requirePasswordOnlyAccount(targetAuth.user!);

    // Generate and consume a one-use token on the server; no email is sent.
    // The returned session has the selected tutor's real auth.uid(), preserving
    // existing RLS and every API's tenant checks without impersonation headers.
    const { data: link, error: linkError } = await sb.auth.admin.generateLink({ type: 'magiclink', email: targetAuth.user!.email! });
    if (linkError || link.user?.id !== targetId || !link.properties?.hashed_token) throw new TutorEnvironmentError('failed');
    const client = createClient(url, anonKey, authOptions);
    const { data: handoff, error: handoffError } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
    if (handoffError || handoff.user?.id !== targetId || !handoff.session) throw new TutorEnvironmentError('failed');
    return res.status(200).json({
      tutorId: targetId,
      session: { access_token: handoff.session.access_token, refresh_token: handoff.session.refresh_token },
    });
  } catch (error) {
    const code = error instanceof TutorEnvironmentError ? error.code : 'failed';
    const status = code === 'unauthorized' ? 401 : code === 'setupRequired' ? 503 : code === 'failed' ? 500 : 403;
    return res.status(status).json({ error: code });
  }
}
