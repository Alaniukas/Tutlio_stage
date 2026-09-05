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
    });
    expect((screen.getByPlaceholderText('45') as HTMLInputElement).value).toBe('45');
    expect(screen.getByText('Papildomų užsiėmimų sutartis')).toBeTruthy();
  });

  it('prefills group slots and keeps 6 EUR when a group is selected', async () => {
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

    const groupSelect = screen.getAllByRole('combobox')[2];
    fireEvent.change(groupSelect, { target: { value: 'g1' } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('6.00')).toBeTruthy();
      expect(screen.getByDisplayValue('Google Meet')).toBeTruthy();
    });
    const nameInput = screen.getByPlaceholderText('nebūtina, jei pasirinkta grupė');
    expect((nameInput as HTMLInputElement).value).toBe('lietuvių kalba');
  });
});
