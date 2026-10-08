import { rowQuery } from '../../fixtures/rowQuery';
import { qaAdjustments, qaClock, qaInvoiceProfiles, qaInvoices, qaOrganizations, qaProfiles, qaSessions, qaStudents, qaSubjects, qaUsers } from '../../fixtures/tutor-environment-finance';

// This entry has no Supabase URL/key and cannot reach a live database.
const NativeDate = Date;
globalThis.Date = new Proxy(NativeDate, {
  construct(target, args) { return Reflect.construct(target, args.length ? args : [qaClock]); },
  get(target, key) { return key === 'now' ? () => NativeDate.parse(qaClock) : Reflect.get(target, key); },
});
localStorage.setItem('tutlio_locale', 'lt');
const AUTH_KEY = 'synthetic-tutor-environment';
const listeners = new Set<(event: string, session: any) => void>();
const active = () => qaProfiles.findIndex(profile => profile.id === localStorage.getItem(AUTH_KEY));
if (active() < 0) localStorage.setItem(AUTH_KEY, qaProfiles[0].id);
const sessionFor = (index = active()) => ({ access_token: `qa-${qaProfiles[index].id}`, refresh_token: `refresh-${qaProfiles[index].id}`,
  token_type: 'bearer', expires_in: 3600, user: qaUsers[index] });
const tables: Record<string, any[]> = { profiles: qaProfiles, organizations: qaOrganizations, students: qaStudents,
  subjects: qaSubjects, sessions: qaSessions, tutor_adjustments: qaAdjustments, invoice_profiles: qaInvoiceProfiles, invoices: qaInvoices };
function ownRows(table: string) {
  const profile = qaProfiles[active()];
  return (tables[table] || []).filter(row => {
    if (table === 'profiles') return row.id === profile.id;
    if (table === 'organizations') return row.id === profile.organization_id;
    if (table === 'invoices') return row.pdf_meta?.tutorId === profile.id;
    if (row.tutor_id) return row.tutor_id === profile.id;
    if (row.user_id) return row.user_id === profile.id;
    if (row.organization_id) return row.organization_id === profile.organization_id;
    return true;
  });
}
export const supabase: any = {
  from: (table: string) => rowQuery(table, ownRows),
  rpc: (name: string) => rowQuery(name, () => []),
  auth: {
    getSession: async () => ({ data: { session: sessionFor() }, error: null }),
    getUser: async () => ({ data: { user: qaUsers[active()] }, error: null }),
    onAuthStateChange: (listener: any) => { listeners.add(listener); return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } }; },
    setSession: async (tokens: any) => {
      const index = qaProfiles.findIndex(profile => tokens.access_token === `qa-${profile.id}`);
      if (index < 0) return { data: {}, error: new Error('Unknown QA identity') };
      localStorage.setItem(AUTH_KEY, qaProfiles[index].id);
      for (const listener of listeners) listener('SIGNED_IN', sessionFor(index));
      return { data: { session: sessionFor(index), user: qaUsers[index] }, error: null };
    },
    signOut: async () => ({ error: null }),
  },
  channel: () => { const channel: any = { on: () => channel, subscribe: () => channel, unsubscribe: async () => {}, send: async () => {} }; return channel; },
  removeChannel: async () => {},
  storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
};
addEventListener('storage', event => {
  if (event.key === AUTH_KEY) for (const listener of listeners) listener('SIGNED_IN', sessionFor());
});
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
  if (url.origin !== location.origin) throw new Error(`QA blocked external network: ${url.origin}`);
  if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
  const method = init?.method || 'GET';
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const headers = new Headers(init?.headers);
  const current = active();
  const respond = (value: any, status = 200) => Promise.resolve(new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }));
  if (url.pathname === '/api/org-branding') {
    const org = qaOrganizations.find(org => org.id === url.searchParams.get('id'));
    return respond(org ? { ...org, enabled: true } : {}, org ? 200 : 404);
  }
  if (headers.get('Authorization') !== `Bearer ${sessionFor().access_token}`) return respond({ error: 'Unauthorized synthetic request' }, 401);
  if (url.pathname === '/api/tutor-environments') {
    if (method === 'GET') return respond({ environments: qaProfiles.map((profile, index) => ({ tutorId: profile.id, organizationId: profile.organization_id,
      organizationName: qaOrganizations[index].name, entityType: 'company', email: profile.email, isCurrent: current === index })) });
    const target = qaProfiles.findIndex(profile => profile.id === body.tutorId);
    if (method === 'POST' && body.action === 'switch' && target >= 0) return respond({ tutorId: qaProfiles[target].id, session: sessionFor(target) });
    return respond({ error: 'notLinked' }, 400);
  }
  if (url.pathname === '/api/org-tutor-invoices') {
    const invoices = qaInvoices.filter(invoice => invoice.pdf_meta.tutorId === qaProfiles[current].id
      && (!url.searchParams.get('periodStart') || invoice.period_start === url.searchParams.get('periodStart'))
      && (!url.searchParams.get('periodEnd') || invoice.period_end === url.searchParams.get('periodEnd')));
    return respond({ invoices, periodInvoices: invoices });
  }
  if (url.pathname === '/api/invoice-settings') return respond({ data: qaInvoiceProfiles[current] });
  if (url.pathname === '/api/generate-invoice' && body.precheckOnly && body.tutorId === qaProfiles[current].id) return respond({ canGenerate: true });
  if (url.pathname === '/api/notification-preferences') return respond({ choices: [] });
  throw new Error(`Unhandled synthetic API ${method} ${url.pathname}`);
};
