import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyContracts, { discountedAnnualFee } from '@/pages/company/CompanyContracts';

const testState = vi.hoisted(() => ({
  from: vi.fn(),
  cache: {
    orgId: 'org-1',
    orgName: 'Test school',
    orgEmail: 'school@example.test',
    orgFeatures: {},
    eSignEnabled: false,
    signingSettings: {
      email: 'school@example.test',
      reason: 'Ugdymo sutarties pasirašymas',
      location: 'Vilnius',
      contact: 'school@example.test',
    },
    templates: [],
    students: [],
    contracts: [],
  },
}));

vi.mock('@/lib/dataCache', () => ({
  getCached: vi.fn(() => testState.cache),
  setCache: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: testState.from,
  },
}));

describe('discountedAnnualFee', () => {
  it('applies 20% and rounds to cents', () => {
    expect(discountedAnnualFee('300')).toBe('240.00');
    expect(discountedAnnualFee('333')).toBe('266.40');
    expect(discountedAnnualFee('299.99')).toBe('239.99');
  });

  it('returns 0.00 for zero fee', () => {
    expect(discountedAnnualFee('0')).toBe('0.00');
  });

  it('returns empty string for missing or invalid amounts', () => {
    expect(discountedAnnualFee('')).toBe('');
    expect(discountedAnnualFee('-5')).toBe('');
    expect(discountedAnnualFee('abc')).toBe('');
  });
});

describe('CompanyContracts 20% discount checkbox', () => {
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

  const openModal = () => {
    render(
      <MemoryRouter initialEntries={['/school/contracts']}>
        <CompanyContracts />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Nauja sutartis'));
  };

  it('shows the discounted amount when checked (default 300 → 240.00)', () => {
    openModal();
    fireEvent.click(screen.getByLabelText('Taikyti 20% nuolaidą'));

    expect(
      screen.getByText('Su nuolaida: 240.00 EUR — ši suma bus įrašyta sutartyje ir mokėjimuose.'),
    ).toBeTruthy();
  });

  it('recomputes the discounted amount when the fee changes', () => {
    openModal();
    fireEvent.click(screen.getByLabelText('Taikyti 20% nuolaidą'));
    fireEvent.change(screen.getByPlaceholderText('300'), { target: { value: '333' } });

    expect(
      screen.getByText('Su nuolaida: 266.40 EUR — ši suma bus įrašyta sutartyje ir mokėjimuose.'),
    ).toBeTruthy();
  });

  it('hides the hint when unchecked', () => {
    openModal();
    const checkbox = screen.getByLabelText('Taikyti 20% nuolaidą');
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);

    expect(screen.queryByText(/Su nuolaida:/)).toBeNull();
  });
});
