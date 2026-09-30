import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ParentInvoices from '../../src/pages/ParentInvoices';

const mocks = vi.hoisted(() => ({
  user: { id: 'parent-user' } as { id: string } | null,
  rpc: vi.fn(),
  from: vi.fn(),
  fetch: vi.fn(),
  authHeaders: vi.fn(),
  translate: (key: string, params?: Record<string, string | number>) =>
    key === 'parent.invoicesLoadError' ? `${key}: ${params?.message}` : key,
}));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: mocks.user }) }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: mocks.translate }) }));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (n: number) => `€${n}` }) }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: mocks.authHeaders }));
vi.mock('@/lib/invoiceLineItemsForSessions', () => ({ fetchInvoiceIdsForSessionIds: async () => [] }));
vi.mock('@/components/ParentLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));

const childA = '11111111-1111-4111-8111-111111111111';
const childB = '22222222-2222-4222-8222-222222222222';
const invoice = {
  id: 'invoice-1', invoice_number: 'INV-001', issue_date: '2026-09-30', total_amount: 40,
  status: 'paid', pdf_storage_path: null,
};
const packageA = {
  id: 'pooled-package', totalLessons: 4, totalPrice: 120, paymentMethod: 'stripe',
  studentName: 'Armandas', subjects: 'Matematika',
};

function setupQueries(linksError: { message: string } | null = null) {
  mocks.from.mockImplementation((table: string) => {
    const data = table === 'parent_students'
      ? [{ student_id: childA }, { student_id: childB }]
      : table === 'invoices' ? [invoice] : [];
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'not', 'order', 'limit']) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (resolve: (value: unknown) => void) => Promise.resolve({
      data, error: table === 'parent_students' ? linksError : null,
    }).then(resolve);
    return builder;
  });
}

function renderPage(path = '/parent/invoices') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Link to={`/parent/invoices?studentId=${childB}`}>Vaikas B</Link>
      <ParentInvoices />
    </MemoryRouter>,
  );
}

describe('ParentInvoices pending packages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: 'parent-user' };
    mocks.rpc.mockResolvedValue({ data: 'parent-profile', error: null });
    mocks.authHeaders.mockResolvedValue({ Authorization: 'Bearer parent-token' });
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ packages: [packageA] }) });
    vi.stubGlobal('fetch', mocks.fetch);
    setupQueries();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows a pooled package from the authenticated summary and keeps invoice history', async () => {
    renderPage();
    expect(await screen.findByText('Matematika')).toBeTruthy();
    expect(screen.getByText('INV-001')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'parentInv.payNow' }).getAttribute('href'))
      .toBe('/api/pay-package?package=pooled-package');
    expect(mocks.fetch).toHaveBeenCalledWith('/api/parent-pending-packages', expect.objectContaining({
      headers: { Authorization: 'Bearer parent-token' }, signal: expect.any(AbortSignal),
    }));
    expect(mocks.from.mock.calls.some(([table]) => table === 'lesson_packages')).toBe(false);
  });

  it('shows a manual-transfer package without a checkout link', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({
      packages: [{ ...packageA, paymentMethod: 'manual' }],
    }) });
    renderPage();
    expect(await screen.findByText('parentInv.manualTransfer')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'parentInv.payNow' })).toBeNull();
  });

  it('uses only the selected linked child and ignores a late response for the previous child', async () => {
    let resolveFirst!: (value: unknown) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ packages: [{
      ...packageA, id: 'other-package', subjects: 'Fizika', studentName: 'Vaikas B',
    }] }) });
    renderPage(`/parent/invoices?studentId=${childA}`);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    const firstSignal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    fireEvent.click(screen.getByRole('link', { name: 'Vaikas B' }));
    expect(await screen.findByText('Fizika')).toBeTruthy();
    expect(firstSignal.aborted).toBe(true);
    expect(mocks.fetch.mock.calls[1][0]).toBe(`/api/parent-pending-packages?studentId=${childB}`);
    resolveFirst({ ok: true, json: async () => ({ packages: [packageA] }) });
    await waitFor(() => expect(screen.queryByText('Matematika')).toBeNull());
    expect(screen.getByRole('link', { name: 'parentInv.payNow' }).getAttribute('href'))
      .toBe('/api/pay-package?package=other-package');
  });

  it('does not fall back to all children for an unlinked student filter', async () => {
    renderPage('/parent/invoices?studentId=33333333-3333-4333-8333-333333333333');
    expect(await screen.findByText('parent.noInvoices')).toBeTruthy();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.from.mock.calls.some(([table]) => table === 'invoices')).toBe(false);
  });

  it('reports a package API failure while preserving issued invoices', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 503 });
    renderPage();
    expect(await screen.findByText('parent.invoicesLoadError: common.error')).toBeTruthy();
    expect(screen.getByText('INV-001')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'parentInv.payNow' })).toBeNull();
  });

  it('clears the previous child package when the next request fails', async () => {
    // Start with a successful first response, then fail the selected-child refresh.
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ packages: [packageA] }) });
    mocks.fetch.mockRejectedValueOnce(new Error('Network unavailable'));
    renderPage();
    expect(await screen.findByText('Matematika')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Vaikas B' }));
    expect(await screen.findByText('parent.invoicesLoadError: common.error')).toBeTruthy();
    expect(screen.queryByText('Matematika')).toBeNull();
    expect(screen.queryByRole('link', { name: 'parentInv.payNow' })).toBeNull();
  });

  it('fails closed when family links cannot be loaded', async () => {
    setupQueries({ message: 'Database unavailable' });
    renderPage();
    expect(await screen.findByText('parent.invoicesLoadError: common.error')).toBeTruthy();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
