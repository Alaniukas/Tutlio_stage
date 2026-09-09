import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExtraLessonsOfferDialog from '@/components/company/ExtraLessonsOfferDialog';
import { LAISVI_VAIKIAI_ORG_ID, DEMO_MOKYKLA_ORG_ID } from '@/lib/laisviVaikaiExtraLessonsDefaults';

vi.mock('@/lib/apiHelpers', () => ({
  authHeaders: async () => ({ Authorization: 'Bearer test' }),
}));

describe('ExtraLessonsOfferDialog Laisvi vaikai prefill', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('prefills platform, duration and group price when dialog opens (Demo Mokykla QA)', async () => {
    render(
      <ExtraLessonsOfferDialog
        open
        onOpenChange={() => {}}
        organizationId={DEMO_MOKYKLA_ORG_ID}
        students={[{ id: 's1', full_name: 'Austėja Mockutė', payer_email: 'a@test.lt' }]}
        groups={[]}
        onCreated={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Google Meet')).toBeTruthy();
      expect(screen.getByDisplayValue('6.00')).toBeTruthy();
      expect(screen.getByText('2027-06-11')).toBeTruthy();
    });
    expect((screen.getByPlaceholderText('45') as HTMLInputElement).value).toBe('45');
  });

  it('prefills platform, duration and group price when dialog opens (Laisvi vaikai)', async () => {
    render(
      <ExtraLessonsOfferDialog
        open
        onOpenChange={() => {}}
        organizationId={LAISVI_VAIKIAI_ORG_ID}
        students={[{ id: 's1', full_name: 'Emilija Bar', payer_email: 'a@test.lt' }]}
        groups={[]}
        onCreated={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Google Meet')).toBeTruthy();
      expect(screen.getByDisplayValue('6.00')).toBeTruthy();
      expect(screen.getByText('2027-06-11')).toBeTruthy();
    });
    expect((screen.getByPlaceholderText('45') as HTMLInputElement).value).toBe('45');
    expect(screen.getByText('Papildomų užsiėmimų sutartis')).toBeTruthy();
  });

  it('does not show class group picker for Laisvi vaikai', async () => {
    render(
      <ExtraLessonsOfferDialog
        open
        onOpenChange={() => {}}
        organizationId={LAISVI_VAIKIAI_ORG_ID}
        students={[{ id: 's1', full_name: 'Emilija Bar', payer_email: 'a@test.lt' }]}
        groups={[{
          id: 'g1',
          name: 'lietuvių kalba',
          platform: 'Google Meet',
          duration_minutes: 45,
          school_year_end: '2027-06-15',
          slots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
        }]}
        onCreated={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Google Meet')).toBeTruthy();
    });
    expect(screen.queryByText('Grupė')).toBeNull();
    expect(screen.queryByText('Dėstomas dalykas')).toBeNull();
  });

  it('prefills group slots and keeps 6 EUR when a group is selected (Demo Mokykla)', async () => {
    render(
      <ExtraLessonsOfferDialog
        open
        onOpenChange={() => {}}
        organizationId={DEMO_MOKYKLA_ORG_ID}
        students={[{ id: 's1', full_name: 'Emilija Bar', payer_email: 'a@test.lt' }]}
        groups={[{
          id: 'g1',
          name: 'lietuvių kalba',
          platform: 'Google Meet',
          duration_minutes: 45,
          school_year_end: '2027-06-15',
          slots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
        }]}
        onCreated={() => {}}
      />,
    );

    const typeSelect = screen.getAllByRole('combobox').find((el) => {
      const options = Array.from((el as HTMLSelectElement).options || []);
      return options.some((o) => o.textContent === 'Grupinė');
    }) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'group' } });

    const groupSelect = screen.getAllByRole('combobox').find((el) => {
      const options = Array.from((el as HTMLSelectElement).options || []);
      return options.some((o) => o.value === 'g1');
    }) as HTMLSelectElement;
    fireEvent.change(groupSelect, { target: { value: 'g1' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('6.00')).toBeTruthy();
      expect(screen.getByDisplayValue('Google Meet')).toBeTruthy();
    });
    const nameInput = screen.getByPlaceholderText('nebūtina, jei pasirinkta grupė');
    expect((nameInput as HTMLInputElement).value).toBe('lietuvių kalba');
  });

  it('filters students by search query', async () => {
    render(
      <ExtraLessonsOfferDialog
        open
        onOpenChange={() => {}}
        organizationId={LAISVI_VAIKIAI_ORG_ID}
        students={[
          { id: 's1', full_name: 'Emilija Bar', payer_email: 'a@test.lt' },
          { id: 's2', full_name: 'Adomaitis Kajus', payer_email: 'b@test.lt' },
        ]}
        groups={[]}
        onCreated={() => {}}
      />,
    );

    fireEvent.click(screen.getAllByRole('combobox')[0]);
    const search = screen.getByPlaceholderText('Ieškoti mokinio…');
    fireEvent.change(search, { target: { value: 'Emilija' } });
    expect(screen.getByText('Emilija Bar')).toBeTruthy();
    expect(screen.queryByText('Adomaitis Kajus')).toBeNull();
  });
});
