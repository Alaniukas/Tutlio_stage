/** Small, privacy-limited browser history for diagnosing in-app support reports. */
export type SupportDiagnostic =
  | { type: 'navigation'; at: string; path: string }
  | { type: 'click'; at: string; path: string; control: 'button' | 'link'; action?: string; targetPath?: string }
  | { type: 'api_failure'; at: string; path: string; endpoint: string; method: string; status: number; vercelId?: string };

const MAX_BREADCRUMBS = 40;
const SAFE_ROUTE_SEGMENTS = new Set([
  'account', 'admin', 'availability', 'billing', 'calendar', 'company', 'contracts',
  'dashboard', 'finance', 'groups', 'homework', 'invoices', 'lessons', 'login',
  'messages', 'parent', 'payments', 'profile', 'recordings', 'schedule', 'school',
  'sessions', 'settings', 'student', 'students', 'support', 'tutors',
]);
const SAFE_ACTION = /^[a-z]+(?:[.:-][a-z]+)*$/;
const SAFE_ACTION_PARTS = new Set([
  'account', 'add', 'admin', 'back', 'book', 'calendar', 'cancel', 'close', 'company',
  'confirm', 'contract', 'contracts', 'create', 'delete', 'download', 'edit', 'finance',
  'group', 'groups', 'invoice', 'invoices', 'lesson', 'lessons', 'mark', 'message',
  'messages', 'next', 'open', 'parent', 'pay', 'payment', 'payments', 'remove', 'retry',
  'save', 'school', 'select', 'send', 'session', 'sessions', 'student', 'students',
  'submit', 'support', 'tutor', 'tutors', 'update', 'upload',
]);
const SAFE_VERCEL_ID = /^[a-zA-Z0-9:_-]{1,100}$/;
const SAFE_HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
// Only exact, fixed labels may become action IDs. Never store arbitrary button text.
const SAFE_CLICK_LABEL_ACTIONS: Record<string, string> = {
  'išsaugoti': 'save', 'saugoti': 'save', 'išsaugoti pakeitimus': 'save',
  'save': 'save', 'save changes': 'save', 'zapisz': 'save', 'zapisz zmiany': 'save',
  'sukurti': 'create', 'create': 'create', 'utwórz': 'create',
  'pridėti': 'add', 'add': 'add', 'dodaj': 'add',
  'apmokėti': 'pay', 'mokėti': 'pay', 'pay': 'pay', 'pay now': 'pay', 'zapłać': 'pay', 'opłać': 'pay',
  'ištrinti': 'delete', 'pašalinti': 'delete', 'delete': 'delete', 'remove': 'delete', 'usuń': 'delete',
  'atšaukti': 'cancel', 'cancel': 'cancel', 'anuluj': 'cancel',
  'pateikti': 'submit', 'submit': 'submit', 'prześlij': 'submit', 'zgłoś': 'submit',
  'siųsti': 'send', 'send': 'send', 'wyślij': 'send',
  'patvirtinti': 'confirm', 'confirm': 'confirm', 'potwierdź': 'confirm',
  'redaguoti': 'edit', 'edit': 'edit', 'edytuj': 'edit',
  'bandyti dar kartą': 'retry', 'retry': 'retry', 'spróbuj ponownie': 'retry',
  'toliau': 'next', 'next': 'next', 'dalej': 'next',
  'atgal': 'back', 'back': 'back', 'wstecz': 'back',
  'atidaryti': 'open', 'open': 'open', 'otwórz': 'open',
  'uždaryti': 'close', 'close': 'close', 'zamknij': 'close',
  'rezervuoti': 'book', 'book': 'book', 'zarezerwuj': 'book',
};

const breadcrumbs: SupportDiagnostic[] = [];
let lastNavigationPath: string | null = null;
let uninstallCurrent: (() => void) | null = null;

function safePath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  return `/${segments.map((segment, index) => (
    index < 2 && SAFE_ROUTE_SEGMENTS.has(segment.toLowerCase()) ? segment.toLowerCase() : ':detail'
  )).join('/')}`;
}

function currentPath(): string {
  return safePath(window.location.pathname);
}

function isSupportPath(path: string): boolean {
  return path === '/support' || /^\/(?:company|school|student|parent)\/support$/.test(path);
}

function pathFromHref(href: string): string | null {
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin ? safePath(url.pathname) : null;
  } catch {
    return null;
  }
}

function safeApiPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const route = segments[1] || '';
  return /^[a-z0-9-]{1,64}$/.test(route) ? `/api/${route}` : '/api/:detail';
}

function append(breadcrumb: SupportDiagnostic): void {
  breadcrumbs.push(breadcrumb);
  if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
}

function responseTimestamp(response: Response): string {
  const serverDate = response.headers?.get('date');
  const parsed = serverDate ? Date.parse(serverDate) : NaN;
  return new Date(Number.isFinite(parsed) ? parsed : Date.now()).toISOString();
}

function safeClickAction(control: Element): string | undefined {
  const explicitAction = control.getAttribute('data-support-action') || '';
  if (explicitAction.length <= 64 && SAFE_ACTION.test(explicitAction)
    && explicitAction.split(/[.:-]/).every((part) => SAFE_ACTION_PARTS.has(part))) return explicitAction;
  for (const label of [control.getAttribute('aria-label'), control.textContent]) {
    const normalized = label?.trim().replace(/\s+/g, ' ').toLowerCase();
    if (normalized && SAFE_CLICK_LABEL_ACTIONS[normalized]) return SAFE_CLICK_LABEL_ACTIONS[normalized];
  }
  return undefined;
}

/** Record a route transition. URL search parameters and dynamic path segments are omitted. */
export function recordSupportNavigation(pathname?: string): void {
  if (typeof window === 'undefined') return;
  const path = safePath(pathname ?? window.location.pathname);
  if (isSupportPath(path)) return;
  if (path === lastNavigationPath) return;
  lastNavigationPath = path;
  append({ type: 'navigation', at: new Date().toISOString(), path });
}

/** Returns a detached snapshot that can be included in one support submission. */
export function getSupportDiagnostics(): SupportDiagnostic[] {
  return breadcrumbs.map((breadcrumb) => ({ ...breadcrumb }));
}

export function clearSupportDiagnostics(): void {
  breadcrumbs.length = 0;
  lastNavigationPath = null;
}

function recordClick(event: MouseEvent): void {
  if (!(event.target instanceof Element)) return;
  const control = event.target.closest('button,a,[role="button"]');
  if (!control || control.closest('[data-support-diagnostics-ignore]')) return;
  const isLink = control.tagName.toLowerCase() === 'a';
  const action = safeClickAction(control);
  const targetPath = isLink ? pathFromHref(control.getAttribute('href') || '') : null;
  append({
    type: 'click',
    at: new Date().toISOString(),
    path: currentPath(),
    control: isLink ? 'link' : 'button',
    ...(action ? { action } : {}),
    ...(targetPath ? { targetPath } : {}),
  });
}

function apiRequestDetails(input: RequestInfo | URL, init?: RequestInit): { endpoint: string; method: string } | null {
  try {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(rawUrl, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')
      || url.pathname.startsWith('/api/in-app-support') || url.pathname.startsWith('/api/support-')) return null;
    const rawMethod = String(init?.method || (typeof input === 'string' || input instanceof URL ? 'GET' : input.method) || 'GET')
      .toUpperCase();
    const method = SAFE_HTTP_METHODS.has(rawMethod) ? rawMethod : 'OTHER';
    return { endpoint: safeApiPath(url.pathname), method };
  } catch {
    return null;
  }
}

/** Installs passive listeners once. The returned function restores the original browser APIs. */
export function installSupportDiagnostics(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  if (uninstallCurrent) return uninstallCurrent;

  recordSupportNavigation();
  document.addEventListener('click', recordClick, true);
  window.addEventListener('popstate', onHistoryNavigation);

  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  const wrappedPushState: History['pushState'] = (...args) => {
    originalPushState.apply(window.history, args);
    recordSupportNavigation();
  };
  const wrappedReplaceState: History['replaceState'] = (...args) => {
    originalReplaceState.apply(window.history, args);
    recordSupportNavigation();
  };
  window.history.pushState = wrappedPushState;
  window.history.replaceState = wrappedReplaceState;

  const originalFetch = window.fetch;
  let wrappedFetch: typeof fetch | null = null;
  if (typeof originalFetch === 'function') {
    wrappedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const details = apiRequestDetails(input, init);
      if (!details) return originalFetch(input, init);
      return originalFetch(input, init).then((response) => {
        try {
          if (response.status >= 400) {
            const header = response.headers?.get('x-vercel-id') || '';
            const vercelId = SAFE_VERCEL_ID.test(header) ? header : undefined;
            append({
              type: 'api_failure', at: responseTimestamp(response), path: currentPath(),
              ...details, status: response.status,
              ...(vercelId ? { vercelId } : {}),
            });
          }
        } catch { /* diagnostics must never affect the request */ }
        return response;
      }, (error: unknown) => {
        append({ type: 'api_failure', at: new Date().toISOString(), path: currentPath(), ...details, status: 0 });
        throw error;
      });
    };
    window.fetch = wrappedFetch;
  }

  const uninstall = () => {
    document.removeEventListener('click', recordClick, true);
    window.removeEventListener('popstate', onHistoryNavigation);
    if (window.history.pushState === wrappedPushState) window.history.pushState = originalPushState;
    if (window.history.replaceState === wrappedReplaceState) window.history.replaceState = originalReplaceState;
    if (wrappedFetch && window.fetch === wrappedFetch) window.fetch = originalFetch;
    uninstallCurrent = null;
  };
  uninstallCurrent = uninstall;
  return uninstall;
}

function onHistoryNavigation(): void {
  recordSupportNavigation();
}
