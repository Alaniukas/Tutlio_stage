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
  'finance.edit',
  'contracts.view',
  'contracts.edit',
  'settings.view',
  'settings.edit',
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

const FULL_ADMIN_PERMISSIONS: OrgAdminPermissionMap = Object.fromEntries(
  ORG_ADMIN_PERMISSION_KEYS.map((permission) => [permission, true]),
) as OrgAdminPermissionMap;

const ACCOUNTANT_PERMISSIONS: OrgAdminPermissionMap = {
  'finance.view': true,
  'finance.edit': true,
};

export function permissionsForRole(
  role: Exclude<OrgAdminRole, 'owner'>,
  custom: OrgAdminPermissionMap = {},
): OrgAdminPermissionMap {
  if (role === 'admin') return { ...FULL_ADMIN_PERMISSIONS };
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

export function hasOrgAdminPermission(
  role: OrgAdminRole | null | undefined,
  permissions: unknown,
  permission: OrgAdminPermission,
): boolean {
  if (role === 'owner') return true;
  if (!role) return false;
  return normalizeOrgAdminPermissions(permissions)[permission] === true;
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
  team: null,
};

export function roleLabelKey(role: OrgAdminRole): string {
  return `orgTeam.role.${role}`;
}
