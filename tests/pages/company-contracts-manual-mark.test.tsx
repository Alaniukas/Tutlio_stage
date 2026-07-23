import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyContracts from '@/pages/company/CompanyContracts';

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  cache: {
    orgId: 'org-1',
    orgName: 'Test school',
    orgEmail: 'school@example.test',
    orgFeatures: { school_contract_esign: true },
    eSignEnabled: true,
    signingSettings: {
      email: 'school@example.test',
      reason: 'Ugdymo sutarties pasirašymas',
      location: 'Vilnius',
      contact: 'school@example.test',
    },
    templates: [],
    students: [],
    contracts: [
      {
        id: 'contract-1',
        organization_id: 'org-1',
        template_id: null,
        student_id: 'student-1',
        filled_body: '',
        annual_fee: 300,
        signing_status: 'signed_by_school',
        signed_at: null,
        sent_at: '2026-07-10T10:00:00.000Z',
        created_at: '2026-07-10T10:00:00.000Z',
        signatures: [
          { role: 'school', status: 'signed', signed_at: '2026-07-23T08:00:00.000Z', gosign_transaction_id: 'tx-1' },
          { role: 'parent_primary', status: 'pending', signed_at: null, gosign_transaction_id: null },
        ],
        student: {
          full_name: 'Manual mark student',
          email: 'student@example.test',
          payer_name: 'Brigita Testienė',
          payer_email: 'parent@example.test',
        },
      },
    ],
  },
}));

vi.mock('@/lib/dataCache', () => ({
  getCached: vi.fn(() => testState.cache),
  setCache: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from: testState.from,
  },
}));

vi.mock('@/lib/apiHelpers', () => ({
  authHeaders: vi.fn(async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer test' })),
}));

describe('CompanyContracts manual e-sign mark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.from.mockImplementation(() => {
      const query: any = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: () => new Promise(() => undefined),
      };
      return query;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the manual-mark button for signed_by_school and gates the no-file path behind a confirmation', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, role: 'parent_primary', done: true, withFile: false }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/school/contracts']}>
        <CompanyContracts />
      </MemoryRouter>,
    );

    expect(screen.getByText('Laukiama tėvų parašo…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Pažymėti pasirašyta/ }));

    // Dialog with both options; pending signer's name shown.
    expect(screen.getByText('Pažymėti tėvų parašą ranka')).toBeTruthy();
    expect(screen.getAllByText(/Brigita Testienė/).length).toBeGreaterThan(0);
    expect(screen.getByText('Įkelti pasirašytą PDF')).toBeTruthy();

    // No-file button stays disabled until the confirmation checkbox is ticked.
    const noFileButton = screen.getByRole('button', { name: 'Pažymėti pasirašyta be failo' }) as HTMLButtonElement;
    expect(noFileButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(noFileButton.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(noFileButton);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/school-contract-esign-mark-signed',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ contractId: 'contract-1', action: 'finalize', confirmNoFile: true }),
      }),
    );
  });
});
