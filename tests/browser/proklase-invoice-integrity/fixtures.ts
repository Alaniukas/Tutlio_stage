import { rowQuery } from '../../fixtures/rowQuery';

const org = 'b0a00000-7e57-4000-8000-000000000001';
const tutor = 'b0a00000-7e57-4000-8000-000000000003', other = 'b0a00000-7e57-4000-8000-000000000004';
const invoiceId = 'b0a00000-7e57-4000-8000-000000000020';
const params = new URLSearchParams(location.search);
const requests: Array<{ url: string; body: any }> = [];
const payInvoice = (id: string, tutorId: string, amount: number) => ({ id, invoice_number: 'SF-001', organization_id: org,
  issued_by_user_id: 'admin', seller_snapshot: { name: tutorId === tutor ? 'Dominykas Smaliukas' : 'Pijus Semėnas' },
  buyer_snapshot: { name: 'Organization QA' }, total_amount: amount, issue_date: '2026-10-02',
  created_at: '2026-10-02T12:00:00Z', period_start: '2026-09-01', period_end: '2026-10-02',
  status: 'issued', origin: 'generated', pdf_meta: { invoiceKind: 'tutor_pay', tutorId }, _sessionIds: tutorId === tutor ? ['lesson-0'] : [] });
const stored = localStorage.getItem('invoiceIntegrityFixture');
const tables: Record<string, any[]> = {
  organization_admins: [{ user_id: 'admin', organization_id: org }],
  profiles: [{ id: tutor, full_name: 'Dominykas Smaliukas', organization_id: org, company_commission_percent: 14 },
    { id: other, full_name: 'Pijus Semėnas', organization_id: org, company_commission_percent: 18 }],
  organizations: [{ id: org, name: 'Organization QA', entity_type: 'company', features: {}, invoice_issuer_mode: 'both' }],
  invoice_profiles: [{ organization_id: org, entity_type: 'mb', business_name: 'Organization QA', company_code: 'QA123',
    address: 'Vilnius', contact_email: 'org@example.test' }],
  invoices: stored ? JSON.parse(stored) : [payInvoice(invoiceId, tutor, 14), payInvoice('b0a00000-7e57-4000-8000-000000000021', other, 18)],
  sessions: [0, 1, 2].map(i => ({ id: `lesson-${i}`, tutor_id: tutor, student_id: `student-${i}`, status: 'completed',
    start_time: `2026-09-${15 + i}T10:00:00Z`, end_time: `2026-09-${15 + i}T11:00:00Z`, paid: false,
    price: 40, status_confirmed_at: '2026-09-20T12:00:00Z', students: { full_name: `Testinis mokinys ${i}`, organization_id: org },
    subjects: { name: 'Matematika', is_trial: false } })),
  tutor_adjustments: [{ id: 'correction', tutor_id: tutor, organization_id: org, amount_eur: 10, created_at: '2026-09-20T12:00:00Z' }],
};
export const supabase = { from: (table: string) => rowQuery(table, table => tables[table] || []),
  auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) } };
export async function authHeaders() { return { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-fixture' }; }
export async function getOrgVisibleTutors() { return tables.profiles; }
export function useOptionalOrgAdminAccess() { return { can: () => params.get('readonly') !== 'yes' }; }
export function useOrgFeatures() { return { organizationId: org, entityType: 'company', loading: false, error: false, hasFeature: () => false }; }
const save = () => localStorage.setItem('invoiceIntegrityFixture', JSON.stringify(tables.invoices));
export function installFixtureFetch() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith('/api/')) return nativeFetch(input, init);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ url, body });
    let data: any, status = 200;
    if (url === '/api/company-invoice-update') {
      if (params.get('failure') === 'yes') { status = 409; data = { error: 'Synthetic save conflict' }; }
      else {
        const invoice = tables.invoices.find(row => row.id === body.invoiceId)!;
        if (body.action === 'mark_paid') invoice.status = 'paid';
        else invoice.invoice_number = body.invoiceNumber.toUpperCase();
        save(); data = { invoice: { ...invoice } };
      }
    } else if (url === '/api/generate-invoice') {
      const covered = new Set(tables.invoices.filter(row => row.status !== 'cancelled' && row.pdf_meta?.tutorId === body.tutorId).flatMap(row => row._sessionIds));
      const sessions = tables.sessions.filter(row => row.tutor_id === body.tutorId && !covered.has(row.id));
      data = { canGenerate: sessions.length > 0, candidateCount: sessions.length, eligibleSessionIds: sessions.map(row => row.id),
        adjustmentsEur: body.tutorId === tutor ? 10 : 0, candidateTotal: sessions.length * 14 + (body.tutorId === tutor ? 10 : 0) };
      if (!body.precheckOnly) {
        const invoice = { ...payInvoice('b0a00000-7e57-4000-8000-000000000022', body.tutorId, data.candidateTotal),
          invoice_number: 'DOMSMA-002', _sessionIds: sessions.map(row => row.id), period_end: body.periodEnd };
        tables.invoices.push(invoice); save(); data = { count: 1, invoiceIds: [invoice.id] };
      }
    } else if (url.startsWith('/api/invoice-settings')) data = { data: { entity_type: 'individuali_veikla', activity_number: 'QA123', contact_email: 'tutor@example.test' } };
    else if (url.startsWith('/api/invoice-pdf')) return new Response('%PDF-1.4\n% Synthetic fixture\n%%EOF', { headers: { 'Content-Type': 'application/pdf' } });
    else throw new Error(`Unexpected fixture endpoint: ${url}`);
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  };
  Object.assign(window, { invoiceIntegrityQA: { tables, requests } });
}
