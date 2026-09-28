import type { SupabaseClient } from '@supabase/supabase-js';

export const SCHOOL_RECORDING_ACCESS_DENIALS_TABLE = 'school_recording_access_denials';

export function normalizeRecordingViewerEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/** Email characters such as '_' and '%' are literals, never SQL LIKE wildcards. */
export function recordingViewerEmailPattern(email: string): string {
  return email.replace(/[\\%_]/g, '\\$&');
}

export function recordingAccessDenialsSetupMissing(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

/** This lookup must stay live: existing playback tickets are checked on every Range request. */
export async function deniedRecordingOrganizations(
  supabase: SupabaseClient,
  organizationIds: string[],
  userId: string,
  emails: string[],
): Promise<Set<string>> {
  if (!organizationIds.length) return new Set();
  const normalizedEmails = [...new Set(emails.map(normalizeRecordingViewerEmail).filter(Boolean))];
  // Filter identity before PostgREST's row limit, so a school with many revoked
  // viewers cannot push this person's denial out of the first result page.
  const results = await Promise.all([
    supabase.from(SCHOOL_RECORDING_ACCESS_DENIALS_TABLE).select('organization_id')
      .in('organization_id', organizationIds).eq('user_id', userId),
    ...(normalizedEmails.length ? [
      supabase.from(SCHOOL_RECORDING_ACCESS_DENIALS_TABLE).select('organization_id')
        .in('organization_id', organizationIds).in('email', normalizedEmails),
    ] : []),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw error;
  return new Set(results.flatMap((result) => (result.data || []).map((row) => String(row.organization_id))));
}
