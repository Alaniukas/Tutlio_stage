import type { SupabaseClient, User } from '@supabase/supabase-js';
import { TutorEnvironmentError, type TutorEnvironment } from '../../src/lib/tutorEnvironments.js';

export async function loadTutorEnvironment(sb: SupabaseClient, tutorId: string, knownUser?: User): Promise<TutorEnvironment | null> {
  const [profileResult, adminResult, authResult] = await Promise.all([
    sb.from('profiles').select('id, organization_id, email').eq('id', tutorId).maybeSingle(),
    sb.from('organization_admins').select('user_id').eq('user_id', tutorId).limit(1),
    knownUser ? Promise.resolve({ data: { user: knownUser }, error: null }) : sb.auth.admin.getUserById(tutorId),
  ]);
  if (profileResult.error || adminResult.error) throw new TutorEnvironmentError('failed');
  const profile = profileResult.data;
  if (!profile?.organization_id || adminResult.data?.length || authResult.error || !canUseTutorEnvironmentAuth(authResult.data.user)) return null;
  const { data: org, error } = await sb.from('organizations').select('id, name').eq('id', profile.organization_id).maybeSingle();
  if (error) throw new TutorEnvironmentError('failed');
  if (!org) return null;
  return { tutorId, organizationId: org.id, organizationName: org.name, email: authResult.data.user!.email! };
}

export async function linkedTutorAccounts(sb: SupabaseClient, current: TutorEnvironment) {
  const { data: membership, error } = await sb.from('tutor_environment_accounts')
    .select('identity_id, organization_id').eq('tutor_id', current.tutorId).maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') throw new TutorEnvironmentError('setupRequired');
    throw new TutorEnvironmentError('failed');
  }
  // An archived/reassigned profile must verify its new company again.
  if (!membership || membership.organization_id !== current.organizationId) return [];
  const { data, error: readError } = await sb.from('tutor_environment_accounts')
    .select('tutor_id, organization_id, identity_id').eq('identity_id', membership.identity_id);
  if (readError) throw new TutorEnvironmentError('failed');
  return data || [];
}

export async function listTutorEnvironments(sb: SupabaseClient, current: TutorEnvironment): Promise<TutorEnvironment[]> {
  const accounts = await linkedTutorAccounts(sb, current);
  const environments = await Promise.all(accounts.filter((row) => row.tutor_id !== current.tutorId).map(async (row) => {
    const environment = await loadTutorEnvironment(sb, row.tutor_id);
    return environment?.organizationId === row.organization_id ? environment : null;
  }));
  return [current, ...environments.filter((row): row is TutorEnvironment => row !== null)]
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName) || a.email.localeCompare(b.email));
}

export function canUseTutorEnvironmentAuth(user: User | null | undefined): boolean {
  const bannedUntil = (user as (User & { banned_until?: string }) | null)?.banned_until;
  return Boolean(user?.email && user.email_confirmed_at && (!bannedUntil || Date.parse(bannedUntil) <= Date.now()));
}

export function requirePasswordOnlyAccount(user: User) {
  // A server-issued session must never downgrade a linked account's MFA.
  if (user.factors?.some((factor) => factor.status === 'verified')) throw new TutorEnvironmentError('mfaRequired');
}
