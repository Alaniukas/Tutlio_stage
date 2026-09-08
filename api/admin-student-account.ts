import type { VercelRequest, VercelResponse } from './types.js';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const access = await requireOrgAdminAccess(req, db, req.method === 'GET' ? 'students.view' : 'students.edit');
  if ('status' in access) return res.status(access.status).json({ error: access.error });
  const studentId = String(req.method === 'GET' ? req.query.student_id || '' : req.body?.student_id || '');
  const { data: student, error } = await db.from('students')
    .select('id, full_name, email, payer_email, payer_name, linked_user_id, organization_id')
    .eq('id', studentId).eq('organization_id', access.access.organizationId).maybeSingle();
  if (error) return res.status(500).json({ error: 'Nepavyko patikrinti mokinio.' });
  if (!student) return res.status(404).json({ error: 'Mokinys nerastas.' });
  const { data: parents, error: parentError } = await db.from('parent_students')
    .select('parent:parent_profiles(id, email, full_name)').eq('student_id', studentId);
  if (parentError) return res.status(500).json({ error: 'Nepavyko patikrinti tėvų paskyrų.' });
  if (req.method === 'GET') return res.status(200).json({ studentConnected: Boolean(student.linked_user_id), parents: (parents || []).flatMap(p => p.parent || []) });
  const role = req.body?.role;
  if (role !== 'student' && role !== 'parent') return res.status(400).json({ error: 'Neteisingas paskyros tipas.' });
  if (role === 'student' && student.linked_user_id) return res.status(409).json({ error: 'Mokinio paskyra jau prijungta.' });
  const email = String(role === 'student' ? student.email || '' : student.payer_email || '').trim().toLowerCase();
  const name = String(role === 'student' ? student.full_name || '' : student.payer_name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) return res.status(400).json({ error: 'Pirmiausia mokinio kortelėje įrašykite paskyros savininko vardą ir el. paštą.' });
  const password = randomBytes(18).toString('base64url') + 'aA1!';
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { role, full_name: name },
    app_metadata: { temporary_password: true, provisioned_by_organization: access.access.organizationId },
  });
  if (createError || !created.user) return res.status(409).json({ error: 'Šiuo el. paštu paskyros sukurti nepavyko. Jei ji jau yra, naudokite prisijungimą arba kvietimą susieti paskyrą. Esamas slaptažodis nekeičiamas.' });
  try {
    if (role === 'student') {
      const { error: profileError } = await db.from('profiles').upsert({
        // Organization membership lives on students. A profile organization_id
        // is interpreted as a teacher entitlement by the portal resolver.
        id: created.user.id, email, full_name: name, organization_id: null,
      }, { onConflict: 'id' });
      if (profileError) throw new Error(`Student profile failed (${profileError.code})`);
      const { data, error: linkError } = await db.from('students').update({ linked_user_id: created.user.id })
        .eq('id', studentId).eq('organization_id', access.access.organizationId).is('linked_user_id', null).select('id');
      if (linkError) throw new Error(`Student link failed (${linkError.code})`);
      if (!data?.length) {
        // PostgREST may return no representation after the null-link filter
        // stops matching. Verify the exact new account before rolling it back.
        const linked = await db.from('students').select('linked_user_id').eq('id', studentId).eq('organization_id', access.access.organizationId).maybeSingle();
        if (linked.error || linked.data?.linked_user_id !== created.user.id) throw new Error('Student link verification failed');
      }
    } else {
      const { data: profile, error: profileError } = await db.from('parent_profiles')
        .upsert({ user_id: created.user.id, email, full_name: name }, { onConflict: 'user_id' }).select('id').single();
      if (profileError || !profile) throw new Error('Parent profile failed');
      const { error: linkError } = await db.from('parent_students').upsert({ parent_id: profile.id, student_id: studentId }, { onConflict: 'parent_id,student_id' });
      if (linkError) throw new Error('Parent link failed');
    }
    return res.status(200).json({ email, temporaryPassword: password, role, userId: created.user.id });
  } catch (error) {
    console.error('[admin-student-account]', error instanceof Error ? error.message : 'Account link failed');
    // Only this request's newly created user can be rolled back. Never reset an existing account.
    await db.auth.admin.deleteUser(created.user.id);
    return res.status(500).json({ error: 'Paskyros susieti nepavyko. Bandykite dar kartą.' });
  }
}
