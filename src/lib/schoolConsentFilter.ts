export type SchoolConsentFilter = 'all' | 'disagree' | 'agree' | 'missing' | 'recording_declined';

export function matchesSchoolConsent(
  filter: SchoolConsentFilter,
  contract: { media_publicity_consent?: string | null; recording_consent?: boolean | null },
) {
  if (filter === 'all') return true;
  if (filter === 'recording_declined') return contract.recording_consent === false;
  if (filter === 'missing') return !contract.media_publicity_consent?.trim();
  return contract.media_publicity_consent === filter;
}
