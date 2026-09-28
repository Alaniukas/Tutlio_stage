import type { VercelRequest, VercelResponse } from './types';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { findAuthUserByEmail } from './_lib/findAuthUserByEmail.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import {
  normalizeRecordingViewerEmail,
  recordingAccessDenialsSetupMissing,
  recordingViewerEmailPattern,
  SCHOOL_RECORDING_ACCESS_DENIALS_TABLE,
} from './_lib/schoolRecordingAccessDenials.js';

function bodyObject(raw: unknown): Record<string, unknown> {
  let value = Buffer.isBuffer(raw) ? raw.toString('utf8') : raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId || auth.isInternal) return res.status(401).json({ error: 'Unauthorized' });
  const supabase = serviceSupabase();
  try {
    const admin = await getOrgAdminAccessByUserId(supabase, auth.userId);
    if (!admin
      || !hasOrgAdminPermission(admin.role, admin.permissions, 'recordings.view')
      || !hasOrgAdminPermission(admin.role, admin.permissions, 'sessions.edit')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const organizationId = admin.organizationId;
    const { data: org, error: orgError } = await supabase.from('organizations')
      .select('id, entity_type, features').eq('id', organizationId).maybeSingle();
    if (orgError) throw orgError;
    if (org?.entity_type !== 'school' || org.features?.school_lesson_recordings !== true) {
      return res.status(404).json({ error: 'recordings_disabled' });
    }

    if (req.method === 'GET') {
      const { data, error } = await supabase.from(SCHOOL_RECORDING_ACCESS_DENIALS_TABLE)
        .select('id, email, created_at').eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ ok: true, denials: data || [] });
    }

    const body = bodyObject(req.body);
    if (body.organizationId && body.organizationId !== organizationId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (body.action === 'restore') {
      const denialId = String(body.denialId || '').trim();
      if (!denialId) return res.status(400).json({ error: 'recording_access_invalid_request' });
      const { data, error } = await supabase.from(SCHOOL_RECORDING_ACCESS_DENIALS_TABLE)
        .delete().eq('organization_id', organizationId).eq('id', denialId).select('id');
      if (error) throw error;
      if (!data?.length) return res.status(404).json({ error: 'recording_access_not_found' });
      return res.status(200).json({ ok: true });
    }
    if (body.action !== 'revoke') return res.status(400).json({ error: 'recording_access_invalid_request' });
    const email = normalizeRecordingViewerEmail(body.email);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'recording_access_invalid_email' });
    }

    // An administrator can deny only a person already related to a child in
    // their school. Exact comparison avoids treating '%'/'_' as email wildcards.
    const pattern = recordingViewerEmailPattern(email);
    const [contactMatches, { data: parentProfiles, error: parentsError }, authUser] = await Promise.all([
      Promise.all(['email', 'payer_email', 'parent_secondary_email'].map((column) =>
        supabase.from('students').select('id').eq('organization_id', organizationId)
          .ilike(column, pattern).limit(1))),
      supabase.from('parent_profiles').select('id, user_id, email').ilike('email', pattern),
      findAuthUserByEmail(supabase, email),
    ]);
    const contactError = contactMatches.find((result) => result.error)?.error;
    if (contactError || parentsError) throw contactError || parentsError;
    const parents = (parentProfiles || []).filter((row) => normalizeRecordingViewerEmail(row.email) === email);
    const userIds = new Set([authUser?.id, ...parents.map((row) => row.user_id)].filter(Boolean));
    let hasChild = contactMatches.some((result) => Boolean(result.data?.length));
    if (!hasChild) {
      const relationshipMatches = await Promise.all([
        ...(['parent_user_id', 'linked_user_id'] as const).map((column) => userIds.size
          ? supabase.from('students').select('id').eq('organization_id', organizationId)
            .in(column, [...userIds]).limit(1)
          : Promise.resolve({ data: [], error: null })),
        parents.length
          ? supabase.from('parent_students').select('student:students!inner(id)')
            .in('parent_id', parents.map((row) => row.id))
            .eq('student.organization_id', organizationId).limit(1)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const relationshipError = relationshipMatches.find((result) => result.error)?.error;
      if (relationshipError) throw relationshipError;
      hasChild = relationshipMatches.some((result) => Boolean(result.data?.length));
    }
    if (!hasChild) return res.status(404).json({ error: 'recording_access_person_not_in_school' });
    const userId = authUser?.id || (userIds.size === 1 ? [...userIds][0] : null);
    const { data, error } = await supabase.from(SCHOOL_RECORDING_ACCESS_DENIALS_TABLE)
      .upsert({ organization_id: organizationId, email, user_id: userId || null,
        revoked_by: auth.userId, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,email' })
      .select('id, email, created_at').single();
    if (error) throw error;
    return res.status(200).json({ ok: true, denial: data });
  } catch (error) {
    if (recordingAccessDenialsSetupMissing(error as { code?: string; message?: string })) {
      return res.status(503).json({ error: 'recording_access_setup_required', setupRequired: true });
    }
    console.error('[school-recording-access] failed', (error as Error)?.message);
    return res.status(500).json({ error: 'recording_access_failed' });
  }
}
