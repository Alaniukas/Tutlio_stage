import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyDynamicPricing from '@/pages/company/CompanyDynamicPricing';

const pricingRows = [
  [1, 8, 3, 22],
  [9, 10, 3, 24],
  [11, 12, 3, 26],
  [1, 8, 2, 25],
  [9, 10, 2, 27],
  [11, 12, 2, 29],
  [1, 8, 1, 27],
  [9, 10, 1, 29],
  [11, 12, 1, 31],
].map(([grade_min, grade_max, lessons_per_week, price], index) => ({
  id: `rule-${index}`,
  organization_id: 'pro-klase-org',
  grade_min,
  grade_max,
  lessons_per_week,
  price,
}));

const supabaseMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  pricingResult: {
    data: [] as typeof pricingRows,
    error: null as null | { code: string; message: string },
  },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: supabaseMock.getUser },
    from: supabaseMock.from,
  },
}));

function pricingQuery() {
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    upsert: supabaseMock.upsert,
    then: (resolve: (value: typeof supabaseMock.pricingResult) => void) =>
      Promise.resolve(supabaseMock.pricingResult).then(resolve),
  };
  return query;
}

describe('CompanyDynamicPricing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.pricingResult = { data: pricingRows, error: null };
    supabaseMock.upsert.mockResolvedValue({ error: null });
    supabaseMock.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'organization_admins') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { organization_id: 'pro-klase-org' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'organization_dynamic_pricing') return pricingQuery();
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it('renders the Pro Klasė matrix and explains that extra lessons keep frequency', async () => {
    render(<CompanyDynamicPricing />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Dinaminė kainodara' })).toBeTruthy();
    });

    expect(screen.getByText(/Papildomos vienkartinės pamokos nekeičia sutartinio dažnio/)).toBeTruthy();
    expect(screen.getAllByRole('spinbutton')).toHaveLength(36);

    fireEvent.click(screen.getByRole('button', { name: 'Pridėti kainą' }));
    expect(screen.getAllByRole('spinbutton')).toHaveLength(40);
  });

  it('shows the empty state without an error toast when the pricing schema is not deployed yet', async () => {
    supabaseMock.pricingResult = {
      data: [],
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.organization_dynamic_pricing' in the schema cache",
      },
    };

    render(<CompanyDynamicPricing />);

    expect(await screen.findByText('Kainodaros taisyklių dar nėra')).toBeTruthy();
    expect(screen.queryByText('Nepavyko įkelti organizacijos kainodaros.')).toBeNull();
  });

  it('saves a newly added organization pricing rule', async () => {
    supabaseMock.pricingResult = { data: [], error: null };
    render(<CompanyDynamicPricing />);

    fireEvent.click(await screen.findByRole('button', { name: 'Pridėti kainą' }));
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));

    await waitFor(() => {
      expect(supabaseMock.upsert).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            organization_id: 'pro-klase-org',
            grade_min: 1,
            grade_max: 8,
            lessons_per_week: 1,
            price: 0,
          }),
        ],
        { onConflict: 'id' },
      );
    });
    expect(await screen.findByText('Kainodara išsaugota.')).toBeTruthy();
  });
});
