type SchoolNotificationOrganization = {
  entityType?: string | null;
  features?: Record<string, unknown> | null;
};

/** Keep lesson reminders, lead with joining, and collect new materials in a daily digest. */
export function schoolJoinAndMaterialNotificationsEnabled(organization: SchoolNotificationOrganization | null): boolean {
  return organization?.entityType === 'school'
    && organization.features?.school_join_and_material_notifications === true;
}

export function schoolMaterialDigestsEnabled(features?: Record<string, unknown> | null): boolean {
  return features?.school_family_portal === true || features?.school_join_and_material_notifications === true;
}

/** One short join email to the child, or one parent fallback. */
export function schoolCompactNotificationsEnabled(organization: SchoolNotificationOrganization | null): boolean {
  return organization?.entityType === 'school'
    && (organization.features?.school_compact_notifications === true
      || organization.features?.school_family_portal === true);
}

export function schoolJoinContact(student: {
  email?: string | null;
  full_name?: string | null;
  payer_email?: string | null;
  payer_name?: string | null;
  parent_secondary_email?: string | null;
  parent_secondary_name?: string | null;
}): { email: string; name: string | null; kind: 'student' | 'payer' } | null {
  const contacts = [
    { email: student.email, name: student.full_name, kind: 'student' as const },
    { email: student.payer_email, name: student.payer_name, kind: 'payer' as const },
    { email: student.parent_secondary_email, name: student.parent_secondary_name, kind: 'payer' as const },
  ];
  for (const contact of contacts) {
    const email = String(contact.email || '').trim().toLowerCase();
    if (email.includes('@') && !email.endsWith('.invalid')) return { email, name: contact.name || null, kind: contact.kind };
  }
  return null;
}
