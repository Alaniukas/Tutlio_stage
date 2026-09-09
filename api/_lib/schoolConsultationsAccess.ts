import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '../types.js';
import { verifyRequestAuth } from './auth.js';
import { getOrgAdminAccessByUserId } from './orgAdminAccess.js';
import { schoolConsultationsEnabled } from '../../src/lib/schoolConsultationsOrg.js';

export function serviceSupabase(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server misconfigured');
  return createClient(url, key);
}

export async function requireConsultationsAuth(req: VercelRequest) {
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId && !auth?.isInternal) return null;
  return auth;
}

export async function assertOrgConsultationsEnabled(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: org } = await supabase
    .from('organizations')
    .select('id, slug, features')
    .eq('id', organizationId)
    .maybeSingle();
  if (!org) return { ok: false, status: 404, error: 'Organizacija nerasta.' };
  const features = (org.features || {}) as Record<string, unknown>;
  if (!schoolConsultationsEnabled(org.id, features) && !schoolConsultationsEnabled(org.slug, features)) {
    return { ok: false, status: 404, error: 'Funkcija nepasiekiama.' };
  }
  return { ok: true };
}

export async function linkedStudentIdsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data: parentProfile } = await supabase
    .from('parent_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  const { data: parentLinks } = parentProfile?.id
    ? await supabase.from('parent_students').select('student_id').eq('parent_id', parentProfile.id)
    : { data: [] as { student_id: string }[] };
  const linkIds = (parentLinks || []).map((l) => l.student_id).filter(Boolean);
  const [{ data: byAuth }, { data: byParentUser }, byIdsRes] = await Promise.all([
    supabase.from('students').select('id').eq('linked_user_id', userId),
    supabase.from('students').select('id').eq('parent_user_id', userId),
    linkIds.length
      ? supabase.from('students').select('id').in('id', linkIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);
  const ids = new Set<string>();
  for (const row of [...(byAuth || []), ...(byParentUser || []), ...((byIdsRes as any).data || [])]) {
    if (row?.id) ids.add(row.id);
  }
  return [...ids];
}

export async function isOrgAdminForOrg(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const access = await getOrgAdminAccessByUserId(supabase, userId);
  return access.some((a) => a.organization_id === organizationId);
}

export async function studentHasSignedAnnualContract(
  supabase: SupabaseClient,
  studentId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('school_contracts')
    .select('id')
    .eq('student_id', studentId)
    .eq('kind', 'annual')
    .eq('signing_status', 'signed')
    .is('archived_at', null)
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}
