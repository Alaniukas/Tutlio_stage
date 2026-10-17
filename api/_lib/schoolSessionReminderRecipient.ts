import type { SupabaseClient } from '@supabase/supabase-js';
import { schoolFamilyEmailTransitionActive, schoolJoinContact } from '../../src/lib/schoolNotificationPolicy.js';
import { schoolMaterialRecipient } from './schoolMaterialPublications.js';

/** Accountless families keep configured-hours lesson emails during onboarding. */
export async function schoolFamilySessionReminderRecipient(
  db: SupabaseClient,
  student: Parameters<typeof schoolMaterialRecipient>[1],
  features: Record<string, unknown> | null | undefined,
  lessonStart: Date,
): Promise<{
  contact: Awaited<ReturnType<typeof schoolMaterialRecipient>>;
  legacyFamilyFallback: boolean;
}> {
  const contact = await schoolMaterialRecipient(db, student, features);
  const guardian = await db.from('school_family_guardians').select('guardian_user_id')
    .eq('organization_id', student.organization_id).eq('student_id', student.id).maybeSingle();
  if (guardian.error) throw new Error('school_family_contact_unavailable');
  // A registered parent's revoked/invalid access must never turn into a fallback.
  if (guardian.data?.guardian_user_id) return { contact, legacyFamilyFallback: false };
  if (!schoolFamilyEmailTransitionActive(features, lessonStart)) {
    return { contact, legacyFamilyFallback: false };
  }

  const fallback = schoolJoinContact(student);
  return {
    contact: contact || (fallback ? { ...fallback, name: fallback.name || '' } : null),
    legacyFamilyFallback: true,
  };
}
