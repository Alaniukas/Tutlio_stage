import { acquireSupportDiagnostics, clearSupportDiagnostics, getSupportDiagnostics } from './supportDiagnostics.js';
import {
  TELEMETRY_INTERVAL_MS, TELEMETRY_IDLE_MS, telemetryModule, safeTelemetryBreadcrumbs, safeTelemetryCode,
  safeTelemetryEndpoint, safeTelemetryFrames, type TelemetryAction, type TelemetryBatch, type TelemetryError, type TelemetryModule,
} from './orgAdminTelemetryShared.js';

let authUserId: string | null = null;
let accessToken: string | null = null;
let supabaseOrigin = '';
let scope: Scope | null = null;
interface Scope {
  userId: string; organizationId: string; clientId: string; sequence: number; release: string;
  module: TelemetryModule | null; lastInputAt: number; lastSentAt: number; pendingActiveAt: number;
  modules: Record<string, number>; actions: Record<string, number>; errors: Map<string, TelemetryError>; lastAction: TelemetryAction | null;
  sending: boolean; retryAt: number; pendingBatch: TelemetryBatch | null; attempts: number; disposed: boolean;
  lastExportAt: number;
  cursorKey: string;
  remove: () => void; originalFetch: typeof fetch;
}

/** Reuses the existing auth subscription; collecting telemetry never takes an auth lock. */
export function setOrgAdminTelemetryAuth(userId: string | null, token: string | null): void {
  if (authUserId && authUserId !== userId) clearSupportDiagnostics();
  const refreshed = token !== accessToken;
  authUserId = userId;
  accessToken = token;
  if (scope && scope.userId !== userId) scope.remove();
  else if (scope && refreshed) scope.retryAt = 0;
}
export function configureSupabaseTelemetry(url: string): void {
  try { supabaseOrigin = new URL(url).origin; } catch { supabaseOrigin = ''; }
}
function visible(): boolean { return typeof document !== 'undefined' && document.visibilityState === 'visible'; }
function increment(counters: Record<string, number>, key: string): void { counters[key] = Math.min(100, (counters[key] || 0) + 1); }
function isCurrent(current: Scope): boolean { return scope === current && !current.disposed && authUserId === current.userId; }

export function recordOrgAdminNavigation(pathname: string): void {
  const current = scope;
  const next = telemetryModule(pathname);
  if (!current || !isCurrent(current) || !next) return;
  if (current.module !== next && visible()) {
    increment(current.modules, next);
    current.pendingActiveAt = Date.now();
  }
  current.module = next;
}
export function recordOrgAdminAction(action: TelemetryAction, success = true): void {
  const current = scope;
  if (!current || !isCurrent(current) || !current.module) return;
  if (action === 'export' && success) {
    if (Date.now() - current.lastExportAt < 500) return;
    current.lastExportAt = Date.now();
  }
  increment(current.actions, `${action}.${success ? 'success' : 'failure'}`);
  if (success) current.lastAction = action;
  current.pendingActiveAt = Date.now();
}
export async function withOrgAdminTelemetryOperation<T>(action: TelemetryAction, run: () => Promise<T>): Promise<T> {
  try { const result = await run(); recordOrgAdminAction(action); return result; }
  catch (error) {
    recordOrgAdminAction(action, false);
    if (scope?.module) enqueueError(scope, { kind: 'operation', module: scope.module, code: 'operation_failed', endpoint: '', status: 0, operation: action });
    throw error;
  }
}
function enqueueError(current: Scope, error: Omit<TelemetryError, 'count' | 'breadcrumbs'>): void {
  if (!isCurrent(current)) return;
  const key = JSON.stringify([error.kind, error.module, error.endpoint, error.code, error.operation, error.frames?.[0]]);
  const existing = current.errors.get(key);
  if (existing) existing.count = Math.min(100, existing.count + 1);
  else if (current.errors.size < 10) current.errors.set(key, {
    ...error, count: 1, breadcrumbs: safeTelemetryBreadcrumbs(getSupportDiagnostics()),
  });
  // Error storms produce one immediate batch and at most one batch per minute thereafter.
  if (Date.now() - current.lastSentAt >= 60_000 && !current.sending) void flushOrgAdminTelemetry();
}
export function recordOrgAdminRuntimeError(error: unknown): void {
  const current = scope;
  if (!current || !current.module) return;
  const known = error instanceof Error ? error : null;
  const codes: Record<string, string> = { TypeError: 'type_error', ReferenceError: 'reference_error', SyntaxError: 'syntax_error', RangeError: 'range_error', Error: 'runtime_error' };
  // Only asset file/line/column frames survive. Error messages may contain form values.
  const frames = (known?.stack || '').split('\n').flatMap(line => {
    const match = line.match(/(\/assets\/[a-zA-Z0-9_.-]+\.js:\d+:\d+)/);
    return match ? [match[1]] : [];
  });
  enqueueError(current, { kind: 'javascript', module: current.module, code: codes[known?.name || ''] || 'unhandled_rejection', endpoint: '', status: 0, frames: safeTelemetryFrames(frames) });
  void flushOrgAdminTelemetry(true);
}

const restActions: Record<string, Partial<Record<string, TelemetryAction>>> = {
  students: { POST: 'student.create', PATCH: 'student.update', DELETE: 'student.delete' },
  sessions: { POST: 'session.create', PATCH: 'session.update', DELETE: 'session.delete' },
  school_contracts: { POST: 'contract.create' }, invoices: { POST: 'invoice.create' },
  school_class_groups: { POST: 'group.create', PATCH: 'group.update', DELETE: 'group.delete' },
  organizations: { PATCH: 'settings.update' },
};
const rpcActions: Record<string, TelemetryAction> = {
  delete_sessions_with_recurrence: 'session.delete', student_reschedule_session: 'session.reschedule',
  save_student_notes: 'student.update', set_student_pricing_frequency: 'student.update',
};
const apiActions: Record<string, TelemetryAction> = {
  'invite-tutor': 'tutor.invite', 'cancel-session': 'session.cancel', 'delete-session': 'session.delete',
  'lesson-reschedule-approval': 'session.reschedule', 'extra-lessons-contract-offer': 'contract.send',
  'school-contract-sign-init': 'contract.send', 'generate-invoice': 'invoice.create',
  'create-monthly-invoice': 'invoice.create', 'resend-monthly-invoice': 'invoice.send',
  'admin-update-student-email': 'student.update',
};
function staticOperation(endpoint: string, method: string, init?: RequestInit): TelemetryAction | undefined {
  const name = endpoint.split('/').at(-1) || '';
  let body: Record<string, unknown> = {};
  try { if (typeof init?.body === 'string' && init.body.length < 20_000) body = JSON.parse(init.body) || {}; } catch { /* Only fixed command labels and field names are inspected. */ }
  if (endpoint.startsWith('/rest/v1/rpc/')) return rpcActions[name];
  if (endpoint.startsWith('/rest/v1/')) {
    if (name === 'sessions' && method === 'PATCH') {
      if ('start_time' in body || 'end_time' in body) return 'session.reschedule';
      if (body.status === 'cancelled') return 'session.cancel';
    }
    return restActions[name]?.[method];
  }
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return undefined;
  if (body.preview === true || body.previewOnly === true || body.dryRun === true || ['preview','options','review','batch-preview'].includes(String(body.action))) return undefined;
  if (name === 'school-monthly-invoice-admin') return ['send', 'send-batch'].includes(String(body.action)) ? 'invoice.send' : undefined;
  if (name === 'school-class-groups') return method === 'POST' ? 'group.create' : method === 'DELETE' ? 'group.delete' : 'group.update';
  if (name === 'send-email' && body.invite_target === 'provision') return 'student.create';
  return apiActions[name];
}
interface RequestContext { current: Scope; endpoint: string; method: string; kind: 'api' | 'supabase'; module: TelemetryModule; operation?: TelemetryAction; }
function requestContext(input: RequestInfo | URL, init?: RequestInit): RequestContext | null {
  const current = scope;
  if (!current || !isCurrent(current) || !current.module) return null;
  try {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(raw, window.location.href);
    const sameOrigin = url.origin === window.location.origin;
    const kind = sameOrigin && url.pathname.startsWith('/api/') ? 'api' : url.origin === supabaseOrigin && url.pathname.startsWith('/rest/v1/') ? 'supabase' : null;
    if (!kind || /\/api\/(?:org-admin-telemetry|cleanup-admin-telemetry|admin-usage|vercel-support-log-drain|support-|in-app-support)/.test(url.pathname)) return null;
    const endpoint = safeTelemetryEndpoint(url.pathname);
    if (!endpoint || ['analytics_events', 'org_admin_usage_state', 'org_admin_usage_daily', 'org_admin_error_daily'].includes(endpoint.split('/').at(-1) || '')) return null;
    const method = String(init?.method || (typeof input === 'string' || input instanceof URL ? 'GET' : input.method) || 'GET').toUpperCase();
    return { current, endpoint, method, kind, module: current.module,
      operation: visible() && Date.now() - current.lastInputAt < TELEMETRY_IDLE_MS ? staticOperation(endpoint, method, init) : undefined,
    };
  } catch { return null; }
}
/** Read at most 8 KiB from a clone; never consume or alter the application's response. */
async function smallResponseObject(response: Response): Promise<Record<string, unknown> | null> {
  if (!response.headers.get('content-type')?.includes('json')) return null;
  const reader = response.clone().body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192) { void reader.cancel().catch(() => {}); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const result: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : null;
  } catch { return null; }
}
async function observeResponse(context: RequestContext, response: Response): Promise<void> {
  if (!isCurrent(context.current)) return;
  const inspectBody = !response.ok || Boolean(context.operation);
  const body = inspectBody ? await smallResponseObject(response) : null;
  if (!isCurrent(context.current)) return;
  const failed = !response.ok || Boolean(body?.error) || body?.ok === false || body?.success === false;
  if (context.operation) recordOrgAdminAction(context.operation, !failed);
  if (failed) {
    const code = context.kind === 'supabase' && typeof body?.code === 'string' ? safeTelemetryCode(`db_${body.code}`) : response.ok ? 'operation_failed' : safeTelemetryCode(`http_${response.status}`);
    const id = response.headers.get('x-vercel-id');
    enqueueError(context.current, { kind: context.kind, module: context.module, endpoint: context.endpoint, code, status: response.status,
      ...(context.operation ? { operation: context.operation } : {}),
      ...(id && /^[a-zA-Z0-9:_-]{1,100}$/.test(id) ? { vercelId: id } : {}),
    });
  }
}
/** Used both by the Supabase client and by the scoped same-origin fetch listener. */
export function orgAdminTelemetryFetch(fetcher: typeof fetch, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const context = requestContext(input, init);
  if (!context) return fetcher(input, init);
  return fetcher(input, init).then(response => {
    void observeResponse(context, response).catch(() => {});
    return response;
  }, (error: unknown) => {
    if (!(error instanceof Error && error.name === 'AbortError') && isCurrent(context.current)) {
      if (context.operation) recordOrgAdminAction(context.operation, false);
      enqueueError(context.current, { kind: context.kind, module: context.module, code: 'network_error', endpoint: context.endpoint, status: 0, ...(context.operation ? { operation: context.operation } : {}) });
    }
    throw error;
  });
}

function claimHeartbeat(current: Scope): boolean {
  try {
    const key = `tutlio_admin_activity:${current.organizationId}:${current.userId}`;
    const previous = Number(localStorage.getItem(key));
    if (previous && Date.now() - previous < TELEMETRY_INTERVAL_MS) return false;
    localStorage.setItem(key, String(Date.now()));
  } catch { /* Server throttling and daily uniqueness still bound collection. */ }
  return true;
}
export async function flushOrgAdminTelemetry(keepalive = false): Promise<void> {
  const current = scope;
  if (!current || !isCurrent(current) || !accessToken || current.sending || Date.now() < current.retryAt) return;
  if (!current.pendingBatch) {
    if (!current.pendingActiveAt && !Object.keys(current.modules).length && !Object.keys(current.actions).length && !current.errors.size) return;
    const activeAt = current.pendingActiveAt && (Object.keys(current.actions).length > 0 || claimHeartbeat(current)) ? new Date(current.pendingActiveAt).toISOString() : null;
    if (!activeAt && !Object.keys(current.modules).length && !Object.keys(current.actions).length && !current.errors.size) { current.pendingActiveAt = 0; return; }
    const errors = [...current.errors.values()];
    while (JSON.stringify(errors).length > 12_000) errors.pop();
    try { sessionStorage.setItem(current.cursorKey, JSON.stringify({ id: current.clientId, sequence: current.sequence + 1 })); } catch { /* In-memory sequencing is sufficient for this tab lifetime. */ }
    current.pendingBatch = { clientId: current.clientId, sequence: ++current.sequence, activeAt, lastModule: current.module, lastAction: current.lastAction,
      modules: current.modules, actions: current.actions, errors, release: current.release };
    current.modules = {}; current.actions = {}; current.errors = new Map(); current.pendingActiveAt = 0; current.lastAction = null;
  }
  current.sending = true;
  current.lastSentAt = Date.now();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await current.originalFetch('/api/org-admin-telemetry', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(current.pendingBatch), signal: controller.signal, keepalive,
    });
    if (!isCurrent(current)) return;
    if (response.status === 403) { current.remove(); return; }
    if (response.status === 401) {
      if (++current.attempts >= 3) { current.pendingBatch = null; current.attempts = 0; }
      current.retryAt = Date.now() + 60_000; return;
    }
    const result = response.ok ? await response.json() : null;
    if (result?.accepted === true) { current.pendingBatch = null; current.attempts = 0; current.retryAt = 0; }
    else {
      current.attempts += 1;
      current.retryAt = Date.now() + (response.ok ? Math.max(15, Math.min(300, Number(result?.retry_after) || 15)) * 1000 : 15 * 60_000);
      if (current.attempts >= 3) { current.pendingBatch = null; current.attempts = 0; }
    }
  } catch {
    current.attempts += 1; current.retryAt = Date.now() + 60_000;
    if (current.attempts >= 3) { current.pendingBatch = null; current.attempts = 0; }
  } finally { clearTimeout(deadline); current.sending = false; }
}
interface TelemetryStartOptions { userId: string; organizationId: string; release?: string; enabled?: boolean; }
export function startOrgAdminTelemetry(options: TelemetryStartOptions): () => void {
  try { return installOrgAdminTelemetry(options); }
  catch { try { scope?.remove(); } catch { /* Browser instrumentation is optional. */ } scope = null; return () => {}; }
}
function installOrgAdminTelemetry(options: TelemetryStartOptions): () => void {
  if (typeof window === 'undefined' || !options.enabled) return () => {};
  if (typeof crypto?.randomUUID !== 'function' || typeof window.fetch !== 'function') return () => {};
  if (authUserId && authUserId !== options.userId) return () => {};
  if (scope && !scope.disposed && scope.userId === options.userId && scope.organizationId === options.organizationId) return scope.remove;
  scope?.remove();
  const releaseDiagnostics = acquireSupportDiagnostics();
  const previousFetch = window.fetch;
  const originalFetch = previousFetch.bind(window);
  const cursorKey = `tutlio_admin_telemetry_v1:${options.organizationId}:${options.userId}`;
  let clientId = crypto.randomUUID(); let sequence = 0;
  try {
    const stored = JSON.parse(sessionStorage.getItem(cursorKey) || 'null');
    if (stored && /^[a-f0-9-]{36}$/.test(stored.id) && Number.isInteger(stored.sequence) && stored.sequence > 0 && stored.sequence < 2_147_483_646) { clientId = stored.id; sequence = stored.sequence; }
  } catch { /* Storage is optional and never contains credentials or form values. */ }
  const current: Scope = { ...options, release: options.release || 'unknown',
    clientId, sequence, cursorKey, module: null, lastInputAt: 0, lastSentAt: 0, pendingActiveAt: 0,
    modules: {}, actions: {}, errors: new Map(), lastAction: null, sending: false, pendingBatch: null,
    retryAt: 0, attempts: 0, lastExportAt: 0, disposed: false, remove: () => {}, originalFetch,
  };
  scope = current;
  recordOrgAdminNavigation(window.location.pathname);
  const input = () => {
    if (!visible() || !current.module || !isCurrent(current)) return;
    current.lastInputAt = Date.now(); current.pendingActiveAt = Date.now();
  };
  const visibility = () => {
    if (!visible()) void flushOrgAdminTelemetry(true);
    else if (current.module) { current.lastInputAt = Date.now(); current.pendingActiveAt = Date.now(); }
  };
  const onError = (event: ErrorEvent) => { if (event.error) recordOrgAdminRuntimeError(event.error); };
  const onRejection = (event: PromiseRejectionEvent) => recordOrgAdminRuntimeError(event.reason);
  const download = (event: MouseEvent) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[download]') : null;
    if (anchor && visible() && Date.now() - current.lastInputAt < TELEMETRY_IDLE_MS && /^(blob:|data:)/.test(anchor.getAttribute('href') || '')) recordOrgAdminAction('export');
  };
  const wrappedFetch: typeof fetch = (request, init) => {
    // Supabase requests have their own hook; this avoids recording them twice.
    try {
      const raw = typeof request === 'string' || request instanceof URL ? String(request) : request.url;
      if (new URL(raw, window.location.href).origin !== window.location.origin) return originalFetch(request, init);
    } catch { return originalFetch(request, init); }
    return orgAdminTelemetryFetch(originalFetch, request, init);
  };
  window.fetch = wrappedFetch;
  document.addEventListener('pointerdown', input, { passive: true });
  document.addEventListener('keydown', input);
  document.addEventListener('click', download, true);
  document.addEventListener('scroll', input, { passive: true, capture: true });
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  const initial = setTimeout(() => { void flushOrgAdminTelemetry(); }, 1000);
  const timer = setInterval(() => {
    if (current.pendingBatch || (visible() && Date.now() - current.lastSentAt >= TELEMETRY_INTERVAL_MS)) void flushOrgAdminTelemetry();
  }, 15_000);
  current.remove = () => {
    current.disposed = true;
    clearTimeout(initial); clearInterval(timer);
    document.removeEventListener('pointerdown', input); document.removeEventListener('keydown', input);
    document.removeEventListener('click', download, true);
    document.removeEventListener('scroll', input, true); document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection);
    if (window.fetch === wrappedFetch) window.fetch = previousFetch;
    releaseDiagnostics();
    if (scope === current) scope = null;
  };
  return current.remove;
}
