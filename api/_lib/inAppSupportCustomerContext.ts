import type { SupabaseClient } from '@supabase/supabase-js';
import { FEATURE_REGISTRY } from '../../src/lib/featureRegistry.js';
import {
  ORG_ADMIN_PERMISSION_KEYS,
  resolveOrgAdminPermissions,
  type OrgAdminPermission,
  type OrgAdminRole,
} from '../../src/lib/orgAdminPermissions.js';
import { supportPortalForPath, type InAppSupportPortal } from '../../src/lib/inAppSupport.js';

type OrganizationRow = {
  id: string;
  entity_type: string | null;
  features: Record<string, unknown> | null;
  perlas_finance_enabled: boolean | null;
};

type AdminSeatRow = {
  organization_id: string;
  role: OrgAdminRole;
  permissions: Record<string, unknown> | null;
};

type ProfileRow = {
  organization_id: string | null;
  enable_manual_student_payments?: boolean | null;
  perlas_finance_enabled?: boolean | null;
};

export interface InAppSupportCustomerContext {
  portal: InAppSupportPortal;
  role: 'organization_admin' | 'tutor' | 'student' | 'parent';
  organizationId: string | null;
  entityType: 'company' | 'school' | null;
  enabledFeatureIds: string[];
  allowedPermissions: OrgAdminPermission[];
  functionContext: string;
}

const FEATURE_PORTALS: Readonly<Record<string, readonly InAppSupportPortal[]>> = {
  school_contract_esign: ['organization', 'parent'],
  per_student_payment_override: ['organization', 'tutor'],
  org_payer_fee_split: ['organization', 'student', 'parent'],
  custom_branding: ['organization', 'tutor', 'student', 'parent'],
  manual_payments: ['organization', 'tutor', 'student', 'parent'],
  perlas_finance: ['organization', 'tutor', 'student', 'parent'],
  trial_reservation_flow: ['organization', 'tutor', 'student', 'parent'],
  package_reservation_flow: ['organization', 'tutor', 'student', 'parent'],
  monthly_packages: ['organization', 'tutor', 'student', 'parent'],
  flexible_invitations: ['organization', 'student', 'parent'],
  disable_student_reschedule_cancel: ['organization', 'tutor', 'student', 'parent'],
  disable_student_reschedule: ['organization', 'tutor', 'student', 'parent'],
  tutor_lesson_status_confirmation: ['organization', 'tutor', 'student', 'parent'],
  disable_student_booking: ['organization', 'student', 'parent'],
  org_tutor_availability_only: ['organization', 'tutor'],
  disable_waitlist: ['organization', 'tutor', 'student', 'parent'],
  auto_trial_first_lesson: ['organization', 'tutor', 'student', 'parent'],
  trial_creation_payment_email: ['organization', 'tutor', 'student', 'parent'],
  extra_lessons_billing: ['organization', 'tutor', 'student', 'parent'],
  student_payments_page: ['organization', 'student', 'parent'],
  school_extra_lessons_contract: ['organization', 'student', 'parent'],
  school_class_groups: ['organization', 'tutor', 'student', 'parent'],
  school_join_no_show: ['organization', 'tutor', 'student', 'parent'],
  school_teacher_labels: ['organization', 'tutor', 'student', 'parent'],
  school_activity_labels: ['organization', 'tutor', 'student', 'parent'],
  school_lesson_recordings: ['organization', 'tutor', 'student', 'parent'],
  pvm_education_invoice: ['organization', 'parent'],
};

const FEATURE_PERMISSION: Readonly<Record<string, OrgAdminPermission>> = {
  org_admin_calendar_view: 'sessions.view',
  org_admin_calendar_full_control: 'sessions.edit',
  school_contract_esign: 'contracts.view',
  per_student_payment_override: 'students.edit',
  org_payer_fee_split: 'finance.view',
  manual_payments: 'finance.view',
  perlas_finance: 'finance.view',
  tutor_frequency_search: 'students.view',
  trial_reservation_flow: 'students.edit',
  trial_followup_alert: 'students.view',
  package_reservation_flow: 'students.edit',
  student_card_booking: 'students.edit',
  monthly_packages: 'finance.view',
  flexible_invitations: 'students.edit',
  disable_student_reschedule_cancel: 'sessions.view',
  disable_student_reschedule: 'sessions.view',
  tutor_lesson_status_confirmation: 'sessions.view',
  disable_student_booking: 'sessions.view',
  org_tutor_availability_only: 'sessions.view',
  disable_waitlist: 'students.view',
  auto_trial_first_lesson: 'sessions.view',
  student_availability_profile: 'students.view',
  student_schedule_overview: 'students.view',
  hide_admin_lesson_prices: 'sessions.view',
  hide_trial_offer_button: 'students.view',
  full_student_edit: 'students.edit',
  trial_creation_payment_email: 'students.edit',
  post_trial_auto_package: 'students.edit',
  extra_lessons_billing: 'finance.view',
  student_payments_page: 'finance.view',
  invoice_detailed_line_items: 'finance.view',
  school_extra_lessons_contract: 'contracts.view',
  school_class_groups: 'sessions.view',
  school_join_no_show: 'sessions.view',
  school_lesson_recordings: 'sessions.view',
  pvm_education_invoice: 'finance.view',
};

export function inAppSupportFeaturePortals(featureId: string): readonly InAppSupportPortal[] {
  return FEATURE_PORTALS[featureId] || ['organization'];
}

export function inAppSupportFeaturePermission(featureId: string): OrgAdminPermission | null {
  return FEATURE_PERMISSION[featureId] || null;
}

const PERMISSION_DESCRIPTIONS: Readonly<Partial<Record<OrgAdminPermission, string>>> = {
  'dashboard.view': 'view the organization dashboard',
  'tutors.view': 'view tutors',
  'tutors.edit': 'add and manage tutors',
  'students.view': 'view students',
  'students.edit': 'add and manage students',
  'sessions.view': 'view schedules and lessons',
  'sessions.edit': 'create and manage lessons',
  'messages.view': 'view messages',
  'messages.edit': 'send and manage messages',
  'stats.view': 'view organization statistics',
  'finance.view': 'view finance information',
  'finance.totals': 'view organization revenue totals',
  'finance.edit': 'manage finance records and payments',
  'contracts.view': 'view contracts',
  'contracts.edit': 'create and manage contracts',
  'settings.view': 'view organization settings',
  'settings.edit': 'change organization settings',
  'team.view': 'view the administration team',
  'team.edit': 'manage administration team access',
};

function enabledFeaturesForOrganization(row: OrganizationRow): Set<string> {
  const raw = row.features && typeof row.features === 'object' ? row.features : {};
  const enabled = new Set<string>();
  for (const [featureId, definition] of Object.entries(FEATURE_REGISTRY)) {
    if (featureId.startsWith('school_') && row.entity_type !== 'school') continue;
    let value = raw[featureId];
    if (featureId === 'manual_payments' && value === undefined) {
      value = raw.enable_manual_student_payments;
    }
    if (featureId === 'perlas_finance' && value === undefined) {
      value = row.perlas_finance_enabled;
    }
    if (featureId === 'school_teacher_labels' && row.entity_type === 'school') {
      value = true;
    }
    if ((value === undefined ? definition.defaultValue : value) === true) enabled.add(featureId);
  }
  return enabled;
}

function intersection<T>(sets: Set<T>[]): Set<T> {
  if (sets.length === 0) return new Set<T>();
  return new Set([...sets[0]].filter((value) => sets.slice(1).every((set) => set.has(value))));
}

function visibleFeatureIds(
  portal: InAppSupportPortal,
  enabledFeatureIds: Iterable<string>,
  permissions: Set<OrgAdminPermission>,
): string[] {
  return [...enabledFeatureIds]
    .filter((featureId) => {
      if (portal !== 'organization') return inAppSupportFeaturePortals(featureId).includes(portal);
      const requiredPermission = inAppSupportFeaturePermission(featureId);
      return !requiredPermission || permissions.has(requiredPermission);
    })
    .sort();
}

function basePortalContext(
  portal: InAppSupportPortal,
  permissions: readonly OrgAdminPermission[],
): string[] {
  if (portal === 'organization') {
    const capabilities = permissions
      .map((permission) => PERMISSION_DESCRIPTIONS[permission])
      .filter((value): value is string => Boolean(value));
    return capabilities.length > 0
      ? capabilities.map((value) => `- The signed-in administrator may ${value}.`)
      : ['- The signed-in administrator has no verified operational permissions in this context.'];
  }
  if (portal === 'student') {
    return [
      '- The signed-in student may view their own lessons, learning materials, payment information, and messages when those records are available to them.',
      '- Do not assume the student may book, cancel, or reschedule until the enabled account rules below confirm it.',
    ];
  }
  if (portal === 'parent') {
    return [
      '- The signed-in parent may view information connected to their linked children, including lessons, invoices or payments, and messages when available.',
      '- Do not assume the parent may book, cancel, or reschedule until the enabled account rules below confirm it.',
    ];
  }
  return [
    '- The signed-in tutor may use their own calendar, students, lessons, learning materials, messages, and finance tools according to their account and organization rules.',
    '- Organization rules listed below override generic tutor behavior.',
  ];
}

export function buildInAppSupportCustomerContext(input: {
  page: string;
  organizations: OrganizationRow[];
  adminSeats?: AdminSeatRow[];
  soloProfile?: ProfileRow | null;
}): InAppSupportCustomerContext {
  const portal = supportPortalForPath(input.page);
  const role: InAppSupportCustomerContext['role'] = portal === 'organization'
    ? 'organization_admin'
    : portal;
  const organizationIds = [...new Set(input.organizations.map((row) => row.id))];
  const organizationId = organizationIds.length === 1 ? organizationIds[0] : null;
  const entityTypes = [...new Set(input.organizations
    .map((row) => row.entity_type)
    .filter((value): value is 'company' | 'school' => value === 'company' || value === 'school'))];
  const entityType = entityTypes.length === 1 ? entityTypes[0] : null;

  const permissionSets = (input.adminSeats || []).map((seat) => new Set(
    Object.entries(resolveOrgAdminPermissions(seat.role, seat.permissions))
      .filter(([, allowed]) => allowed === true)
      .map(([permission]) => permission as OrgAdminPermission),
  ));
  const allowedPermissionSet = portal === 'organization'
    ? intersection(permissionSets)
    : new Set<OrgAdminPermission>();
  const allowedPermissions = ORG_ADMIN_PERMISSION_KEYS.filter((permission) => allowedPermissionSet.has(permission));

  const organizationFeatureSets = input.organizations.map(enabledFeaturesForOrganization);
  let enabledFeatureSet = intersection(organizationFeatureSets);
  if (input.organizations.length === 0 && input.soloProfile) {
    enabledFeatureSet = new Set<string>();
    if (input.soloProfile.enable_manual_student_payments) enabledFeatureSet.add('manual_payments');
    if (input.soloProfile.perlas_finance_enabled) enabledFeatureSet.add('perlas_finance');
  }
  const enabledFeatureIds = visibleFeatureIds(portal, enabledFeatureSet, allowedPermissionSet);
  const lines = [
    '# Verified customer function scope',
    `- Signed-in portal: ${portal}.`,
    `- Account role: ${role}.`,
    `- Organization type: ${entityType || 'not verified or not applicable'}.`,
    '- The capabilities below are the only verified functions for this user in this support context.',
    ...basePortalContext(portal, allowedPermissions),
  ];

  if (enabledFeatureIds.length > 0) {
    lines.push('## Enabled account-specific functions');
    for (const featureId of enabledFeatureIds) {
      const definition = FEATURE_REGISTRY[featureId];
      if (!definition) continue;
      lines.push(`- ${definition.nameEn} (${featureId}): ${definition.descriptionEn}`);
    }
  } else {
    lines.push('## Enabled account-specific functions', '- No optional account-specific function was verified for this portal.');
  }
  lines.push(
    '## Isolation rule',
    '- Never describe an optional function that is not listed above as available to this user.',
    '- If the user asks about an unlisted optional function, say it is not verified as enabled for this account. Do not use behavior from another customer.',
  );

  return {
    portal,
    role,
    organizationId,
    entityType,
    enabledFeatureIds,
    allowedPermissions,
    functionContext: lines.join('\n'),
  };
}

async function organizationRows(
  supabase: SupabaseClient,
  organizationIds: string[],
): Promise<OrganizationRow[]> {
  if (organizationIds.length === 0) return [];
  const { data, error } = await supabase
    .from('organizations')
    .select('id, entity_type, features, perlas_finance_enabled')
    .in('id', organizationIds);
  if (error) throw error;
  return (data || []) as OrganizationRow[];
}

export async function resolveInAppSupportCustomerContext(
  supabase: SupabaseClient,
  userId: string,
  page: string,
): Promise<InAppSupportCustomerContext> {
  const portal = supportPortalForPath(page);
  let organizationIds: string[] = [];
  let adminSeats: AdminSeatRow[] = [];
  let soloProfile: ProfileRow | null = null;
  let tutorIds: string[] = [];

  if (portal === 'organization') {
    const { data, error } = await supabase
      .from('organization_admins')
      .select('organization_id, role, permissions')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (error) throw error;
    adminSeats = (data || []) as AdminSeatRow[];
    organizationIds = adminSeats.map((row) => row.organization_id);
  } else if (portal === 'tutor') {
    const { data, error } = await supabase
      .from('profiles')
      .select('organization_id, enable_manual_student_payments, perlas_finance_enabled')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    soloProfile = data as ProfileRow | null;
    if (soloProfile?.organization_id) organizationIds = [soloProfile.organization_id];
  } else if (portal === 'student') {
    const { data, error } = await supabase
      .from('students')
      .select('organization_id, tutor_id')
      .eq('linked_user_id', userId)
      .limit(20);
    if (error) throw error;
    const rows = (data || []) as { organization_id: string | null; tutor_id: string | null }[];
    organizationIds = rows.map((row) => row.organization_id).filter((value): value is string => Boolean(value));
    tutorIds = rows.map((row) => row.tutor_id).filter((value): value is string => Boolean(value));
  } else {
    const { data: parent, error: parentError } = await supabase
      .from('parent_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (parent?.id) {
      const { data: links, error: linksError } = await supabase
        .from('parent_students')
        .select('student_id')
        .eq('parent_id', parent.id);
      if (linksError) throw linksError;
      const studentIds = (links || []).map((row) => String(row.student_id));
      if (studentIds.length > 0) {
        const { data: students, error: studentsError } = await supabase
          .from('students')
          .select('organization_id, tutor_id')
          .in('id', studentIds);
        if (studentsError) throw studentsError;
        const rows = (students || []) as { organization_id: string | null; tutor_id: string | null }[];
        organizationIds = rows.map((row) => row.organization_id).filter((value): value is string => Boolean(value));
        tutorIds = rows.map((row) => row.tutor_id).filter((value): value is string => Boolean(value));
      }
    }
  }

  organizationIds = [...new Set(organizationIds)];
  const organizations = await organizationRows(supabase, organizationIds);
  if (organizations.length === 0 && tutorIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('organization_id, enable_manual_student_payments, perlas_finance_enabled')
      .in('id', [...new Set(tutorIds)])
      .limit(20);
    const profiles = (data || []) as ProfileRow[];
    const commonManual = profiles.length > 0 && profiles.every((row) => row.enable_manual_student_payments === true);
    const commonPerlas = profiles.length > 0 && profiles.every((row) => row.perlas_finance_enabled === true);
    soloProfile = {
      organization_id: null,
      enable_manual_student_payments: commonManual,
      perlas_finance_enabled: commonPerlas,
    };
  }

  return buildInAppSupportCustomerContext({ page, organizations, adminSeats, soloProfile });
}
