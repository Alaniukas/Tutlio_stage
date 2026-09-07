import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyContracts from '@/pages/company/CompanyContracts';

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  order: vi.fn(),
  setCache: vi.fn(),
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
        student: {
          full_name: 'Spinner test student',
          email: 'student@example.test',
          payer_name: 'Parent',
          payer_email: 'parent@example.test',
        },
      },
    ],
  },
}));

vi.mock('@/lib/dataCache', () => ({
  getCached: vi.fn(() => testState.cache),
  setCache: testState.setCache,
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: testState.from,
  },
}));

describe('CompanyContracts background refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    testState.from.mockImplementation((table: string) => {
      if (table !== 'school_contracts') throw new Error(`Unexpected table: ${table}`);
      const query: any = {
        select: () => query,
        eq: () => query,
        is: () => query,
        order: testState.order,
      };
      return query;
    });
    // Keep the scheduled refresh in flight. A page-level loading state would
    // therefore leave the spinner visible and hide the contract card.
    testState.order.mockReturnValue(new Promise(() => undefined));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the page visible and never shows the loader during status polling', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/school/contracts']}>
        <CompanyContracts />
      </MemoryRouter>,
    );

    expect(screen.getByText('El. pasirašymo nustatymai')).toBeTruthy();
    expect(screen.getByText('Spinner test student')).toBeTruthy();
    expect(container.querySelector('.animate-spin')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(testState.from).toHaveBeenCalledWith('school_contracts');
    expect(screen.getByText('El. pasirašymo nustatymai')).toBeTruthy();
    expect(screen.getByText('Spinner test student')).toBeTruthy();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
});
