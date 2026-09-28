import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ExtraLessonsOfferDialog from '@/components/company/ExtraLessonsOfferDialog';

vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer test' }) }));
const groups = [{ id: 'g1', name: 'STEAM', slots: [{ weekday: 1, start_time: '18:00', end_time: '18:45' }, { weekday: 4, start_time: '18:00', end_time: '18:45' }] }];
function openGroup(enabled: boolean) {
  render(<ExtraLessonsOfferDialog open onOpenChange={() => {}} organizationId="qa-school" students={[]} groups={groups} recordingPlanEnabled={enabled} onCreated={() => {}} />);
  const selectOption = (value: string) => {
    const select = screen.getAllByRole('combobox').find((element) => Array.from((element as HTMLSelectElement).options || []).some((option) => option.value === value));
    fireEvent.change(select!, { target: { value } });
  };
  selectOption('group'); selectOption('g1');
}
describe('one weekly activity without recordings offer', () => {
  it('shows clear access choices and one actual group slot without changing the agreed price or base count', () => {
    openGroup(true);
    const price = screen.getByPlaceholderText('12.00');
    const count = screen.getByPlaceholderText('8');
    fireEvent.change(price, { target: { value: '9.50' } });
    fireEvent.change(count, { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Prieiga prie įrašų'), { target: { value: 'none' } });
    const slot = screen.getByLabelText('Vienas grupės užsiėmimas per savaitę') as HTMLSelectElement;
    expect([...slot.options].map((option) => option.value)).toEqual(['', '1:18:00', '4:18:00']);
    fireEvent.change(slot, { target: { value: '4:18:00' } });
    expect(slot.value).toBe('4:18:00');
    expect((price as HTMLInputElement).value).toBe('9.50');
    expect((count as HTMLInputElement).value).toBe('4');
    expect(screen.getByRole('option', { name: 'Su visos grupės įrašais' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Be įrašų' })).toBeTruthy();
  });

  it('keeps the new recording-plan control hidden when the school has not opted in', () => {
    openGroup(false);
    expect(screen.queryByLabelText('Prieiga prie įrašų')).toBeNull();
    expect(screen.queryByLabelText('Vienas grupės užsiėmimas per savaitę')).toBeNull();
  });
});
