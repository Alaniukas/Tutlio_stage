const params = new URLSearchParams(window.location.search);
const organizations = {
  pro: { id: 'b0a00000-7e57-4000-8000-000000000001', name: 'Pro Klasė QA', entityType: 'company' },
  company: { id: 'd1000000-0000-4000-8000-000000000001', name: 'Korepetitorių organizacija QA', entityType: 'company' },
  school: { id: 'd2000000-0000-4000-8000-000000000001', name: 'Mokykla QA', entityType: 'school' },
};
export const organization = organizations[params.get('org') as keyof typeof organizations] || organizations.pro;
export const userId = 'd3000000-0000-4000-8000-000000000001';
const scenario = params.get('scenario') || 'mixed';
export const requests: Array<{ url: string; body?: unknown }> = [];
const profile = { id: userId, full_name: 'Testinis korepetitorius', organization_id: organization.id,
  company_commission_percent: 20, company_individual_commission_percent: 20 };
const hasFeature = () => false; // Privacy must work without any feature flags.
export function useUser() { return { profile }; }
export function useOrgFeatures() { return { entityType: organization.entityType, organizationId: organization.id,
  hasFeature, loading: false, error: false }; }
export function useOrgTutorPolicy() { return { isOrgTutor: true, payPerLessonEur: 20,
  invoiceIssuerMode: 'tutor', loading: false }; }
export async function authHeaders() { return { Authorization: 'Bearer synthetic-qa-session', 'Content-Type': 'application/json' }; }
export async function dedupeAuthGetUser() { return { id: userId }; }

const lessons = [0, 1, 2].map(i => ({
  id: `lesson-${i}`, tutor_id: userId, student_id: `student-${i}`, class_group_id: null,
  start_time: `2026-09-${15 + i}T10:00:00Z`, end_time: `2026-09-${15 + i}T11:00:00Z`,
  status: 'completed', status_confirmed_at: '2026-09-19T13:00:00Z', price: 40, tutor_pay_eur_snapshot: 20,
  students: { full_name: `Testinis mokinys ${i + 1}`, email: 'student@example.test', organization_id: organization.id },
  subjects: { name: 'Matematika', is_trial: false, is_group: false },
}));
function query(table: string) {
  let rangeFrom = 0;
  const filters: Array<(row: any) => boolean> = [];
  const value = () => table === 'profiles' ? profile
    : table === 'organizations' ? { name: organization.name, email: 'org@example.test', default_company_commission_percent: 20 }
    : table === 'sessions' ? rangeFrom ? [] : lessons.filter(row => filters.every(filter => filter(row))) : [];
  const q: any = {
    select: () => q, eq: () => q, in: () => q, order: () => q,
    gte: (column: string, v: string) => { filters.push(row => row[column] >= v); return q; },
    lte: (column: string, v: string) => { filters.push(row => row[column] <= v); return q; },
    range: (from: number) => { rangeFrom = from; return q; },
    maybeSingle: () => q,
    then: (resolve: any, reject: any) => Promise.resolve({ data: value(), error: null }).then(resolve, reject),
  };
  return q;
}
export const supabase = { from: query, auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) } };
const invoice = (id: string, number: string, buyer: string, amount: number, meta: unknown) => ({
  id, invoice_number: number, buyer_snapshot: { name: buyer }, total_amount: amount, pdf_meta: meta,
  organization_id: organization.id, issued_by_user_id: userId, status: 'paid', issue_date: '2026-08-26',
  period_start: '2026-08-01', period_end: '2026-08-31', created_at: '2026-08-26T10:00:00Z',
  pdf_storage_path: `${id}.pdf`, grouping_type: 'single',
});
const customer = invoice('customer', 'CLIENT-SF-001', 'Privatus klientas QA', 10.40, null);
const own = invoice('own-pay', 'TUTOR-SF-001', organization.name, 60, { invoiceKind: 'tutor_pay', tutorId: userId });
const other = invoice('other-pay', 'OTHER-TUTOR-SF-002', 'Kito korepetitoriaus atlygis QA', 999, { invoiceKind: 'tutor_pay', tutorId: 'another-tutor' });
const ownDuplicate = { ...own, period_start: '2026-09-01', period_end: '2026-09-30' };
// Deliberately return a polluted legacy response. Production API and SQL have
// separate tests; this checks the real UI's additional confidentiality guard.
export function installFixtureFetch() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith('/api/')) return nativeFetch(input, init);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url, body });
    let data: unknown;
    if (url.startsWith('/api/org-tutor-invoices')) data = {
      invoices: scenario === 'empty' ? [customer, other] : [customer, own, other],
      periodInvoices: scenario === 'duplicate' ? [customer, other, ownDuplicate] : [customer, other],
    };
    else if (url.startsWith('/api/invoice-settings')) data = { data: {
      entity_type: 'individuali_veikla', activity_number: 'QA123', contact_email: 'tutor@example.test',
    } };
    else if (url.startsWith('/api/school-tutor-attendance-pay')) data = { ok: true, rows: [] };
    else if (url === '/api/generate-invoice') data = body?.precheckOnly
      ? scenario === 'duplicate' || scenario === 'regenerate'
        ? { canGenerate: false, reason: 'duplicate', invoiceNumbers: ['TUTOR-SF-001'], totalAmount: 40,
          error: 'Sąskaita TUTOR-SF-001 jau suformuota.',
          ...(scenario === 'regenerate' ? { regeneration: { invoiceIds: ['old-unpaid'], invoiceNumbers: ['TUTOR-SF-001'], token: 'synthetic-confirmation' } } : {}),
        }
        : { canGenerate: true, candidateCount: 3 }
      : { count: 1, invoiceIds: ['own-pay'] };
    else if (url.startsWith('/api/invoice-pdf')) {
      if (!url.includes('id=own-pay')) throw new Error('A private client or other tutor PDF was requested');
      return new Response('%PDF-1.4\n% Synthetic download QA\n%%EOF', { headers: { 'Content-Type': 'application/pdf' } });
    } else throw new Error(`Unexpected fixture API: ${url}`);
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  };
  Object.assign(window, { invoicePrivacyQA: { organization, requests } });
}
