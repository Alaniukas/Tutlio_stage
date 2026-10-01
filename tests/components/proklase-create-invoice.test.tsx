import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';

const state = vi.hoisted(() => ({
  fetch: vi.fn(), userId: 'tutor', organizationError: false,
  generateError: '' as string,
}));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (table: string) => query(table),
  auth: { getUser: async () => ({ data: { user: { id: state.userId } } }) },
} }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({}) }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useOrgFeatures', () => ({ useOrgFeatures: () => ({
  hasFeature: () => false, entityType: 'company', organizationId: PRO_KLASE_ORG_ID, loading: false, error: false,
}) }));
vi.mock('@/lib/fetchOrgTutorInvoicesDeduped', () => ({
  fetchOrgTutorInvoicesDeduped: async () => ({ ok: true, data: { periodInvoices: [], invoices: [] } }),
}));
vi.mock('@/components/ui/date-input', () => ({ DateInput: (props: any) => <input type="date" {...props} /> }));
import CreateInvoiceModal from '../../src/components/CreateInvoiceModal';

function query(table: string) {
  let selected = '', id = '';
  const data = () => table === 'profiles'
    ? id === 'admin' ? null : { organization_id: PRO_KLASE_ORG_ID, full_name: 'Tutor', company_commission_percent: 0 }
    : table === 'organizations'
      ? selected.includes('contact_email') || state.organizationError ? null
        : { name: 'Pro Klasė', email: 'info@example.test' }
      : table === 'sessions' ? ['Test', 'Ruste', 'Tomas'].map((name, i) => ({
        id: `lesson-${i}`, tutor_id: 'tutor', status: 'no_show', price: 10,
        start_time: '2026-09-19T08:00:00Z', end_time: '2026-09-19T08:45:00Z',
        status_confirmed_at: '2026-09-21T13:00:00Z', students: { full_name: name, email: 'student@example.test' },
        subjects: { name: 'Bandomoji pamoka', is_trial: true },
      })) : [];
  const q: any = {
    select: (v: string) => { selected = v; return q; },
    eq: (column: string, v: string) => { if (column === 'id') id = v; return q; },
    gte: () => q, lte: () => q, in: () => q,
    maybeSingle: async () => ({ data: data(), error: null }),
    then: (resolve: any, reject: any) => Promise.resolve({ data: data(), error: null }).then(resolve, reject),
  };
  return q;
}

beforeEach(() => {
  state.userId = 'tutor'; state.organizationError = false; state.generateError = '';
  state.fetch.mockReset();
  state.fetch.mockImplementation(async (url: string, init: any) => {
    const isGeneration = url === '/api/generate-invoice' && !JSON.parse(init.body).precheckOnly;
    return {
      ok: !(isGeneration && state.generateError),
      json: async () => url.startsWith('/api/invoice-settings') ? { data: {
        entity_type: 'individual', activity_number: '123', contact_email: 'tutor@example.test',
      } } : isGeneration ? state.generateError ? { error: state.generateError }
        : { count: 1, invoiceIds: ['new-invoice'] } : { canGenerate: true, candidateCount: 3 },
    };
  });
  vi.stubGlobal('fetch', state.fetch);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function preview(props: any = {}) {
  const onClose = vi.fn(), onSuccess = vi.fn();
  render(<CreateInvoiceModal isOpen isOrgTutor onClose={onClose} onSuccess={onSuccess} {...props} />);
  const button = screen.getByRole('button', { name: 'invoiceCreate.preview' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  fireEvent.click(button);
  await screen.findByRole('button', { name: 'invoiceCreate.generate' });
  return { onClose, onSuccess };
}

describe('Pro Klasė invoice preview', () => {
  it('shows the organization as buyer and issues all three €6 no-shows', async () => {
    const { onClose, onSuccess } = await preview();
    expect(screen.getByText('Pro Klasė')).toBeTruthy();
    expect(screen.getByText('info@example.test')).toBeTruthy();
    expect(screen.getAllByText('Test')).toHaveLength(1);
    expect(screen.getByText(/€18.00/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'invoiceCreate.generate' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
    const body = JSON.parse(state.fetch.mock.calls.find(([url, init]) => url === '/api/generate-invoice' && !JSON.parse(init.body).precheckOnly)![1].body);
    expect(body).toMatchObject({ isOrgTutor: true, tutorId: 'tutor', sessionIds: ['lesson-0', 'lesson-1', 'lesson-2'] });
  });
  it('loads the billed tutor organization when an administrator opens the modal', async () => {
    state.userId = 'admin';
    await preview({ billingTutorId: 'tutor' });
    expect(screen.getByText('Pro Klasė')).toBeTruthy();
    expect(screen.getAllByText('Test')).toHaveLength(1);
  });
  it('never substitutes a student as buyer if organization information is unavailable', async () => {
    state.organizationError = true;
    await preview();
    expect(screen.queryByText('invoiceCreate.buyer')).toBeNull();
    expect(screen.getAllByText('Test')).toHaveLength(1);
  });
  it('keeps the preview open and displays the actual generation error', async () => {
    state.generateError = 'Sąskaitos numeris jau naudojamas.';
    const { onClose, onSuccess } = await preview();
    fireEvent.click(screen.getByRole('button', { name: 'invoiceCreate.generate' }));
    expect(await screen.findByText(state.generateError)).toBeTruthy();
    expect(screen.queryByText('invoiceCreate.noSessions')).toBeNull();
    expect(onClose).not.toHaveBeenCalled(); expect(onSuccess).not.toHaveBeenCalled();
  });
});
