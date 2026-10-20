import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CompanyFinanceHub from '@/pages/company/CompanyFinanceHub';
import CompanyContractArchive from '@/pages/company/CompanyContractArchive';

const state = vi.hoisted(() => ({
  entity: 'school',
  fetch: vi.fn(),
  zip: vi.fn(),
  rows: [] as any[],
}));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer accountant' }) }));
vi.mock('@/lib/schoolContractsZipExport', () => ({ downloadSchoolContractsZip: (...args: any[]) => state.zip(...args) }));
vi.mock('@/contexts/OrgEntityContext', () => ({ useOrgEntityType: () => state.entity }));
vi.mock('@/contexts/OrgAdminAccessContext', () => ({ useOptionalOrgAdminAccess: () => ({
  membership: { organizationId: 'org', role: 'accountant' }, can: (permission: string) => permission === 'finance.view',
}) }));
vi.mock('@/pages/company/CompanyInvoices', () => ({ default: () => <p>Invoice page</p> }));
vi.mock('@/pages/company/CompanyFinance', () => ({ default: () => <p>Finance page</p> }));
vi.mock('@/pages/company/CompanyPayments', () => ({ default: () => null }));
vi.mock('@/pages/company/CompanyPlatformInvoices', () => ({ default: () => null }));
vi.mock('@/pages/company/CompanySchoolFinanceReport', () => ({ default: () => null }));

beforeEach(() => {
  state.entity = 'school';
  state.rows = Array.from({ length: 22 }, (_, index) => ({
    id: `contract-${index}`, contractNumber: `SUT-${index}`, archivedAt: '2026-10-01T08:00:00Z',
    studentName: index === 21 ? 'Šipaila Jonas' : `Student ${index}`,
    payerName: 'Parent', payerEmail: 'parent@example.test', hasFile: true,
  }));
  state.fetch.mockReset().mockImplementation(async (_url, init) => ({
    ok: true,
    json: async () => init?.method === 'POST' ? { signedUrl: 'https://storage.example.test/original' } : { contracts: state.rows },
  }));
  state.zip.mockReset().mockResolvedValue({ downloaded: 22, failedIds: [] });
  vi.stubGlobal('fetch', state.fetch);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('accountant contract archive', () => {
  it('opens from the school Finance tab with finance access alone', async () => {
    render(<MemoryRouter initialEntries={['/school/finance?tab=contract-archive']}><CompanyFinanceHub /></MemoryRouter>);
    await screen.findByText('SUT-0');
    expect(screen.getByRole('button', { name: 'school.archive.title' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /edit|restore|newContract/i })).toBeNull();
  });

  it('paginates and searches all archived contracts, including names without Lithuanian diacritics', async () => {
    render(<CompanyContractArchive />);
    await screen.findByText('SUT-0');
    expect(screen.queryByText('SUT-21')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'companyPaymentReport.next' }));
    expect(screen.getByText('SUT-21')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sipaila' } });
    expect(screen.getByText('SUT-21')).toBeTruthy();
    expect(screen.queryByText('SUT-20')).toBeNull();
    expect(screen.getByRole('button', { name: 'companyPaymentReport.previous' }).hasAttribute('disabled')).toBe(true);
  });

  it('downloads the authenticated original and exports every search match across pages', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<CompanyContractArchive />);
    await screen.findByText('SUT-0');
    fireEvent.click(screen.getAllByRole('button', { name: 'common.download' })[0]);
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(state.fetch.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ contractId: 'contract-0' }) });
    await waitFor(() => expect(screen.getByRole('button', { name: 'school.exportContractsZip' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'school.exportContractsZip' }));
    await waitFor(() => expect(state.zip).toHaveBeenCalledOnce());
    expect(state.zip.mock.calls[0][0]).toEqual({ studentContractIds: state.rows.map(row => row.id), archivedOnly: true });
  });

  it('shows a recoverable error when the archive cannot load', async () => {
    state.fetch.mockRejectedValueOnce(new Error('Unavailable'));
    render(<CompanyContractArchive />);
    await screen.findByRole('alert');
    expect(screen.queryByText('school.archive.empty')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'companyPaymentReport.retry' }));
    await screen.findByText('SUT-0');
  });

  it('does not show the school archive tab in a company finance hub', () => {
    state.entity = 'company';
    render(<MemoryRouter initialEntries={['/company/finance']}><CompanyFinanceHub /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'school.archive.title' })).toBeNull();
  });
});
