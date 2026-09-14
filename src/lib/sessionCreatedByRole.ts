/** Who created a session row — stored in `sessions.created_by_role`. */
export type SessionCreatedByRole =
  | 'tutor'
  | 'org_admin'
  | 'student'
  | 'parent'
  | 'system';

export const SESSION_CREATED_BY_ROLE = {
  tutor: 'tutor',
  orgAdmin: 'org_admin',
  student: 'student',
  parent: 'parent',
  system: 'system',
} as const satisfies Record<string, SessionCreatedByRole>;

export function normalizeSessionCreatedByRole(
  value: string | null | undefined,
): SessionCreatedByRole | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === 'tutor' || v === 'org_admin' || v === 'student' || v === 'parent' || v === 'system') {
    return v;
  }
  return null;
}

/** i18n key for UI label; null when no badge needed (default tutor / unknown). */
export function sessionCreatedByRoleLabelKey(
  role: string | null | undefined,
): string | null {
  const normalized = normalizeSessionCreatedByRole(role);
  switch (normalized) {
    case 'student':
      return 'session.createdBy.student';
    case 'parent':
      return 'session.createdBy.parent';
    case 'org_admin':
      return 'session.createdBy.orgAdmin';
    case 'system':
      return 'session.createdBy.system';
    default:
      return null;
  }
}

export function isSelfBookedSession(role: string | null | undefined): boolean {
  const normalized = normalizeSessionCreatedByRole(role);
  return normalized === 'student' || normalized === 'parent';
}
