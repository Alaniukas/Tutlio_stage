import { hasOrgAdminPermission, type OrgAdminPermission, type OrgAdminPermissionMap, type OrgAdminRole } from './orgAdminPermissions.js';
import { isInstructionsHiddenForOrg, isProKlaseOrg, isStaffDocumentsOrg } from './marketMoney.js';

export const TELEMETRY_INTERVAL_MS = 5 * 60_000;
export const TELEMETRY_IDLE_MS = 2 * 60_000;
export const TELEMETRY_MODULES = ['dashboard', 'students', 'tutors', 'schedule', 'sessions', 'finance', 'payments', 'contracts', 'groups', 'messages', 'stats', 'settings', 'team', 'recordings', 'support', 'instructions', 'consultations', 'staff-documents', 'dynamic-pricing'] as const;
export type TelemetryModule = typeof TELEMETRY_MODULES[number];
export const TELEMETRY_ACTIONS = ['student.create', 'student.update', 'student.delete', 'tutor.invite', 'session.create', 'session.update', 'session.reschedule', 'session.cancel', 'session.delete', 'contract.create', 'contract.send', 'invoice.create', 'invoice.send', 'group.create', 'group.update', 'group.delete', 'settings.update', 'export'] as const;
export type TelemetryAction = typeof TELEMETRY_ACTIONS[number];
export type TelemetryCounters = Record<string, number>;
export interface TelemetryError {
  kind: 'javascript' | 'api' | 'supabase' | 'operation';
  module: TelemetryModule;
  code: string;
  endpoint: string;
  status: number;
  count: number;
  operation?: TelemetryAction;
  vercelId?: string;
  frames?: string[];
  breadcrumbs?: TelemetryBreadcrumb[];
}
export interface TelemetryBreadcrumb { type: 'navigation' | 'click' | 'api_failure'; path: string; action?: string; endpoint?: string; status?: number; }
export interface TelemetryBatch {
  clientId: string;
  sequence: number;
  activeAt: string | null;
  lastModule: TelemetryModule | null;
  lastAction: TelemetryAction | null;
  modules: TelemetryCounters;
  actions: TelemetryCounters;
  errors: TelemetryError[];
  release: string;
}
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const moduleSet = new Set<string>(TELEMETRY_MODULES);
const actionSet = new Set<string>(TELEMETRY_ACTIONS);
const breadcrumbActions = new Set(['save', 'create', 'add', 'pay', 'delete', 'cancel', 'submit', 'send', 'confirm', 'edit', 'retry', 'next', 'back', 'open', 'close', 'book']);
export function telemetryModule(pathname: string): TelemetryModule | null {
  pathname = pathname.replace(/^\/(?:schools|teachers)(?=\/)/, '');
  const match = pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:company|school)(?:\/([^/?#]+))?\/?(?:$|[?#/])/i);
  if (!match) return null;
  const segment = match[1] || 'dashboard';
  return moduleSet.has(segment) ? segment as TelemetryModule : null;
}
export function safeTelemetryPath(value: unknown): string {
  const normalized = typeof value === 'string' ? value.match(/^\/admin-app\/([a-z-]+)$/) : null;
  if (normalized && moduleSet.has(normalized[1])) return `/admin-app/${normalized[1]}`;
  const module = typeof value === 'string' ? telemetryModule(value) : null;
  return module ? `/admin-app/${module}` : '/admin-app';
}
export function safeTelemetryEndpoint(value: unknown): string {
  if (typeof value !== 'string') return '';
  const path = value.split(/[?#]/, 1)[0];
  const match = path.match(/^\/(api|rest\/v1(?:\/rpc)?)\/([a-z][a-z0-9_-]{0,63})(?:\/|$)/);
  return match ? `/${match[1]}/${match[2]}` : '';
}
export function safeTelemetryCode(value: unknown): string {
  if (typeof value !== 'string') return 'runtime_error';
  return /^(?:type_error|reference_error|syntax_error|range_error|runtime_error|unhandled_rejection|network_error|operation_failed|http_[45]\d\d|db_(?:[0-9A-Z]{5}|PGRST\d{3}))$/.test(value) ? value : 'runtime_error';
}
export function safeTelemetryFrames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((frame): frame is string => typeof frame === 'string' && /^\/assets\/[a-zA-Z0-9_.-]{1,120}\.js:\d{1,8}:\d{1,8}$/.test(frame)).slice(0, 5);
}
export function safeTelemetryBreadcrumbs(value: unknown): TelemetryBreadcrumb[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-10).flatMap((item): TelemetryBreadcrumb[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const path = safeTelemetryPath(row.path);
    if (row.type === 'navigation') return [{ type: 'navigation', path }];
    if (row.type === 'click') {
      const action = typeof row.action === 'string' && breadcrumbActions.has(row.action) ? row.action : undefined;
      return [{ type: 'click', path, ...(action ? { action } : {}) }];
    }
    if (row.type === 'api_failure') {
      const endpoint = safeTelemetryEndpoint(row.endpoint);
      const status = Number(row.status);
      if (endpoint && Number.isInteger(status) && status >= 0 && status <= 599) return [{ type: 'api_failure', path, endpoint, status }];
    }
    return [];
  });
}
export function parseTelemetryBatch(value: unknown, now = Date.now()): TelemetryBatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(key => !['clientId', 'sequence', 'activeAt', 'lastModule', 'lastAction', 'modules', 'actions', 'errors', 'release'].includes(key))) return null;
  if (typeof raw.clientId !== 'string' || !UUID_PATTERN.test(raw.clientId) || !Number.isSafeInteger(raw.sequence) || Number(raw.sequence) < 1 || Number(raw.sequence) > 2_147_483_647) return null;
  const counters = (input: unknown, allowed: (key: string) => boolean): TelemetryCounters => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    return Object.fromEntries(Object.entries(input).filter(([key, count]) => allowed(key) && Number.isInteger(count) && Number(count) > 0 && Number(count) <= 100));
  };
  const activeTime = typeof raw.activeAt === 'string' ? Date.parse(raw.activeAt) : NaN;
  const activeAt = Number.isFinite(activeTime) && activeTime >= now - TELEMETRY_INTERVAL_MS - 60_000 && activeTime <= now + 60_000
    ? new Date(Math.min(activeTime, now)).toISOString() : null;
  const errors: TelemetryError[] = Array.isArray(raw.errors) ? raw.errors.slice(0, 10).flatMap((item): TelemetryError[] => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (!['javascript', 'api', 'supabase', 'operation'].includes(String(row.kind)) || !moduleSet.has(String(row.module))) return [];
    const status = Number(row.status);
    if (!Number.isInteger(status) || status < 0 || status > 599) return [];
    return [{ kind: row.kind as TelemetryError['kind'], module: row.module as TelemetryModule,
      code: safeTelemetryCode(row.code), endpoint: safeTelemetryEndpoint(row.endpoint), status,
      count: Math.max(1, Math.min(100, Number.isInteger(row.count) ? Number(row.count) : 1)),
      ...(actionSet.has(String(row.operation)) ? { operation: row.operation as TelemetryAction } : {}),
      ...(typeof row.vercelId === 'string' && /^[a-zA-Z0-9:_-]{1,100}$/.test(row.vercelId) ? { vercelId: row.vercelId } : {}),
      frames: safeTelemetryFrames(row.frames), breadcrumbs: safeTelemetryBreadcrumbs(row.breadcrumbs),
    }];
  }) : [];
  while (JSON.stringify(errors).length > 12_000) errors.pop();
  return { clientId: raw.clientId, sequence: Number(raw.sequence), activeAt,
    lastModule: moduleSet.has(String(raw.lastModule)) ? raw.lastModule as TelemetryModule : null,
    lastAction: actionSet.has(String(raw.lastAction)) ? raw.lastAction as TelemetryAction : null,
    modules: counters(raw.modules, key => moduleSet.has(key)),
    actions: counters(raw.actions, key => /\.(?:success|failure)$/.test(key) && actionSet.has(key.replace(/\.(?:success|failure)$/, ''))),
    errors, release: typeof raw.release === 'string' && /^[a-zA-Z0-9_.:-]{1,80}$/.test(raw.release) ? raw.release : 'unknown',
  };
}

const modulePermissions: Partial<Record<TelemetryModule, OrgAdminPermission>> = {
  dashboard: 'dashboard.view', students: 'students.view', tutors: 'tutors.view', schedule: 'sessions.view', sessions: 'sessions.view',
  groups: 'sessions.view', finance: 'finance.view', payments: 'finance.view', contracts: 'contracts.view',
  messages: 'messages.view', stats: 'stats.view', settings: 'settings.view', team: 'team.view', recordings: 'recordings.view',
  consultations: 'sessions.view', 'staff-documents': 'contracts.view', 'dynamic-pricing': 'settings.view',
};
export function availableTelemetryModules(entityType: string, features: Record<string, unknown>, role: OrgAdminRole, permissions: OrgAdminPermissionMap, organizationId?: string): TelemetryModule[] {
  return TELEMETRY_MODULES.filter(module => {
    if (modulePermissions[module] && !hasOrgAdminPermission(role, permissions, modulePermissions[module]!)) return false;
    if (module === 'groups' && features.school_class_groups !== true) return false;
    if (module === 'recordings' && (entityType !== 'school' || features.school_lesson_recordings !== true)) return false;
    if (module === 'contracts' && entityType !== 'school') return false;
    if (module === 'staff-documents' && (entityType !== 'school' || features.school_staff_documents !== true || !isStaffDocumentsOrg(organizationId))) return false;
    if (module === 'consultations' && (entityType !== 'school' || features.school_family_portal !== true)) return false;
    if (module === 'payments' && entityType === 'school') return false;
    if (module === 'dynamic-pricing' && (entityType === 'school' || !isProKlaseOrg(organizationId))) return false;
    if (module === 'instructions' && isInstructionsHiddenForOrg(organizationId)) return false;
    return true;
  });
}
export function availableTelemetryMilestones(entityType: string, features: Record<string, unknown>, role: OrgAdminRole, permissions: OrgAdminPermissionMap): TelemetryAction[] {
  const expected: [TelemetryAction, OrgAdminPermission][] = [['student.create', 'students.edit'], ['tutor.invite', 'tutors.edit'], ['session.create', 'sessions.edit'], ['invoice.create', 'finance.edit']];
  if (entityType === 'school') expected.push(['contract.send', 'contracts.edit']);
  if (features.school_class_groups === true) expected.push(['group.create', 'sessions.edit']);
  return expected.filter(([, permission]) => hasOrgAdminPermission(role, permissions, permission)).map(([action]) => action);
}
export interface TelemetryAdminReport {
  user_id: string; full_name: string | null; email: string | null; role: OrgAdminRole; status: string; permissions: OrgAdminPermissionMap;
  first_observed_at: string | null; last_active_at: string | null; last_action_at: string | null; last_action: string | null;
  last_module: string | null; last_login_at: string | null; first_actions: Record<string, string>; module_last_used: Record<string, string>;
  active_days_7: number; active_days_30: number; actions_7: number; actions_30: number;
}
export interface TelemetryOrgReport {
  id: string; name: string; entity_type: string; status: string; created_at: string; features: Record<string, unknown>; is_demo: boolean;
  admins: TelemetryAdminReport[]; active_days_7: number; active_days_30: number; current_week_actions: number; previous_week_actions: number;
  modules_30: TelemetryCounters; actions_30: TelemetryCounters; errors_7: number; errors_today: number; repeated_errors_today: number;
  reasons?: string[]; last_active_at?: string | null; last_action_at?: string | null; coverage_since?: string | null;
  usage_change_percent?: number | null; missing_milestones?: TelemetryAction[]; expected_modules?: TelemetryModule[];
}
export interface TelemetryErrorGroup {
  fingerprint: string; module: string; kind: string; code: string; endpoint: string; operation: string | null;
  occurrences: number; affected_admins: number; first_seen_at: string; last_seen_at: string; sample: (TelemetryError & { release: string }) | null;
}
export interface TelemetryReport {
  started_at: string; last_cleanup_at: string | null; last_ingested_at: string | null; total: number; organizations: TelemetryOrgReport[];
  errors: TelemetryErrorGroup[]; daily: { day: string; active_admins: number; actions: number; errors: number }[];
  server_errors: { path: string | null; status_code: number | null; occurrences: number; last_seen_at: string; message: string | null; vercel_id: string }[];
  correlated_logs?: { path: string | null; level: string; status_code: number | null; occurred_at: string; message: string | null; vercel_id: string }[];
}
export function enrichTelemetryReport(report: TelemetryReport, now = Date.now()): TelemetryReport {
  return { ...report, organizations: report.organizations.map(org => {
    const admins = org.admins.filter(admin => admin.status === 'active');
    const timestamps = (key: 'last_active_at' | 'last_action_at' | 'first_observed_at') => admins.map(admin => admin[key]).filter((value): value is string => Boolean(value)).sort();
    const lastActive = timestamps('last_active_at').at(-1) || null;
    const firstObserved = timestamps('first_observed_at')[0] || null;
    const expected = [...new Set(admins.flatMap(admin => availableTelemetryMilestones(org.entity_type, org.features, admin.role, admin.permissions)))];
    const missing = expected.filter(action => !admins.some(admin => admin.first_actions?.[action]
      || (action === 'invoice.create' && admin.first_actions?.['invoice.send'])
      || (action === 'session.create' && admin.first_actions?.['group.create'])));
    const reasons: string[] = [];
    const enoughTrend = firstObserved && Date.parse(firstObserved) <= now - 14 * 86_400_000 && Date.parse(report.started_at) <= now - 14 * 86_400_000;
    const change = enoughTrend && org.previous_week_actions >= 5 ? Math.round((org.current_week_actions / org.previous_week_actions - 1) * 100) : null;
    if (org.status === 'active' && !org.is_demo) {
      if (lastActive && now - Date.parse(lastActive) >= 5 * 86_400_000) reasons.push('inactive');
      if (org.repeated_errors_today >= 3) reasons.push('repeated_errors');
      if (change !== null && change <= -50) reasons.push('usage_drop');
      if (firstObserved && now - Date.parse(firstObserved) >= 3 * 86_400_000 && now - Date.parse(org.created_at) <= 30 * 86_400_000 && missing.length > 0) reasons.push('onboarding');
    }
    return { ...org, reasons, last_active_at: lastActive, last_action_at: timestamps('last_action_at').at(-1) || null,
      coverage_since: firstObserved, usage_change_percent: change, missing_milestones: missing,
      expected_modules: [...new Set(admins.flatMap(admin => availableTelemetryModules(org.entity_type, org.features, admin.role, admin.permissions, org.id)))],
    };
  }) };
}
