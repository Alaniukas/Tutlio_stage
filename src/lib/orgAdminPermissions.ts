export const ORG_ADMIN_PERMISSION_KEYS = [
  'dashboard.view',
  'tutors.view',
  'tutors.edit',
  'students.view',
  'students.edit',
  'sessions.view',
  'sessions.edit',
  'messages.view',
  'messages.edit',
  'stats.view',
  'finance.view',
  'finance.totals',
  'finance.edit',
  'contracts.view',
  'contracts.edit',
  'settings.view',
  'settings.edit',
  'team.view',
  'team.edit',
] as const;

export type OrgAdminPermission = (typeof ORG_ADMIN_PERMISSION_KEYS)[number];
export type OrgAdminRole = 'owner' | 'admin' | 'accountant' | 'custom';
export type OrgAdminStatus = 'active' | 'suspended';
export type OrgAdminPermissionMap = Partial<Record<OrgAdminPermission, boolean>>;

export interface OrgAdminPermissionGroup {
  id: string;
  labelKey: string;
  view: OrgAdminPermission;
  edit?: OrgAdminPermission;
}

export const ORG_ADMIN_PERMISSION_GROUPS: readonly OrgAdminPermissionGroup[] = [
  { id: 'dashboard', labelKey: 'orgTeam.permissionDashboard', view: 'dashboard.view' },
  { id: 'tutors', labelKey: 'orgTeam.permissionTutors', view: 'tutors.view', edit: 'tutors.edit' },
  { id: 'students', labelKey: 'orgTeam.permissionStudents', view: 'students.view', edit: 'students.edit' },
  { id: 'sessions', labelKey: 'orgTeam.permissionSessions', view: 'sessions.view', edit: 'sessions.edit' },
  { id: 'messages', labelKey: 'orgTeam.permissionMessages', view: 'messages.view', edit: 'messages.edit' },
  { id: 'stats', labelKey: 'orgTeam.permissionStats', view: 'stats.view' },
  { id: 'finance', labelKey: 'orgTeam.permissionFinance', view: 'finance.view', edit: 'finance.edit' },
  { id: 'contracts', labelKey: 'orgTeam.permissionContracts', view: 'contracts.view', edit: 'contracts.edit' },
  { id: 'settings', labelKey: 'orgTeam.permissionSettings', view: 'settings.view', edit: 'settings.edit' },
] as const;

/** Full operator access except revenue totals (finance.totals) and owner-only team grant rules. */
const ADMIN_PERMISSIONS: OrgAdminPermissionMap = Object.fromEntries(
  ORG_ADMIN_PERMISSION_KEYS
    .filter((permission) => permission !== 'finance.totals' && permission !== 'team.view' && permission !== 'team.edit')
    .map((permission) => [permission, true]),
) as OrgAdminPermissionMap;

const ACCOUNTANT_PERMISSIONS: OrgAdminPermissionMap = {
  'finance.view': true,
  'finance.totals': true,
  'finance.edit': true,
};

export function permissionsForRole(
  role: Exclude<OrgAdminRole, 'owner'>,
  custom: OrgAdminPermissionMap = {},
): OrgAdminPermissionMap {
  if (role === 'admin') return { ...ADMIN_PERMISSIONS };
  if (role === 'accountant') return { ...ACCOUNTANT_PERMISSIONS };
  return normalizeOrgAdminPermissions(custom);
}

export function normalizeOrgAdminPermissions(value: unknown): OrgAdminPermissionMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const normalized: OrgAdminPermissionMap = {};
  for (const key of ORG_ADMIN_PERMISSION_KEYS) {
    if (input[key] === true) normalized[key] = true;
  }
  for (const group of ORG_ADMIN_PERMISSION_GROUPS) {
    if (group.edit && normalized[group.edit]) normalized[group.view] = true;
  }
  return normalized;
}

/** Owner JSON may store `finance.totals: false` to hide revenue totals while keeping super-admin access. */
export function ownerHidesFinanceTotals(permissions: unknown): boolean {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return false;
  return (permissions as Record<string, unknown>)['finance.totals'] === false;
}

/** Stored JSON merged with role preset (admin / accountant). Owner is full access unless totals are explicitly hidden. */
export function resolveOrgAdminPermissions(
  role: OrgAdminRole | null | undefined,
  permissions: unknown,
): OrgAdminPermissionMap {
  if (role === 'owner') {
    const full = Object.fromEntries(
      ORG_ADMIN_PERMISSION_KEYS.map((key) => [key, true]),
    ) as OrgAdminPermissionMap;
    if (ownerHidesFinanceTotals(permissions)) delete full['finance.totals'];
    return full;
  }
  const stored = normalizeOrgAdminPermissions(permissions);
  if (role === 'admin') return { ...permissionsForRole('admin'), ...stored };
  if (role === 'accountant') return { ...permissionsForRole('accountant'), ...stored };
  return stored;
}

/** Directors (owners who see revenue) can see other owner seats. Operators cannot. */
export function canSeePeerOrgOwners(
  role: OrgAdminRole | null | undefined,
  permissions: unknown,
): boolean {
  return role === 'owner' && hasOrgAdminPermission(role, permissions, 'finance.totals');
}

export function hasOrgAdminPermission(
  role: OrgAdminRole | null | undefined,
  permissions: unknown,
  permission: OrgAdminPermission,
): boolean {
  if (!role) return false;
  return resolveOrgAdminPermissions(role, permissions)[permission] === true;
}

export function hasAnyOrgAdminPermission(
  role: OrgAdminRole | null | undefined,
  permissions: unknown,
  requested: readonly OrgAdminPermission[],
): boolean {
  return requested.some((permission) => hasOrgAdminPermission(role, permissions, permission));
}

export const ORG_ADMIN_ROUTE_PERMISSION: Readonly<Record<string, OrgAdminPermission | null>> = {
  dashboard: 'dashboard.view',
  tutors: 'tutors.view',
  students: 'students.view',
  waitlist: 'students.view',
  sessions: 'sessions.view',
  schedule: 'sessions.view',
  messages: 'messages.view',
  stats: 'stats.view',
  finance: 'finance.view',
  contracts: 'contracts.view',
  'dynamic-pricing': 'settings.view',
  settings: 'settings.view',
  instructions: null,
  team: 'team.view',
};

/** Permissions a non-owner team manager must not grant to others. */
const DELEGATION_RESTRICTED: readonly OrgAdminPermission[] = [
  'stats.view',
  'finance.totals',
  'team.view',
  'team.edit',
];

export function permissionGroupsForTeamManager(isOwner: boolean): readonly OrgAdminPermissionGroup[] {
  if (isOwner) return ORG_ADMIN_PERMISSION_GROUPS;
  return ORG_ADMIN_PERMISSION_GROUPS.filter((group) => group.id !== 'stats');
}

export function sanitizeDelegatedPermissions(
  grantorRole: OrgAdminRole,
  grantorPermissions: unknown,
  granted: OrgAdminPermissionMap,
): OrgAdminPermissionMap {
  let normalized = normalizeOrgAdminPermissions(granted);
  if (grantorRole === 'owner') {
    if (ownerHidesFinanceTotals(grantorPermissions)) delete normalized['finance.totals'];
    return normalizeOrgAdminPermissions(normalized);
  }

  normalized = { ...normalized };
  for (const key of DELEGATION_RESTRICTED) {
    delete normalized[key];
  }
  if (grantorRole === 'custom') {
    const grantorMap = normalizeOrgAdminPermissions(grantorPermissions);
    for (const key of ORG_ADMIN_PERMISSION_KEYS) {
      if (normalized[key] && !grantorMap[key]) delete normalized[key];
    }
  }
  return normalizeOrgAdminPermissions(normalized);
}

export function roleLabelKey(role: OrgAdminRole): string {
  return `orgTeam.role.${role}`;
}
