import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentNotesCard from '@/components/company/StudentNotesCard';

const state = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/studentNotes', () => ({ loadStudentAdminNotes: state.load, saveStudentNotes: state.save }));
// Exercise date editing through the same controlled value contract, without
// coupling these save-flow tests to the calendar library's month navigation.
vi.mock('@/components/ui/date-input', () => ({
  DateInput: ({ id, value, onChange, disabled }: any) => <input id={id} type="date" value={value} onChange={onChange} disabled={disabled} />,
}));

const props = {
  studentId: 'child-a', studentIds: ['child-a', 'child-a-tutor-2'],
  tutorComment: 'Needs help with geometry', canEdit: true, onSaved: vi.fn(),
};

describe('Administration and tutor notes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.load.mockResolvedValue({ student_id: 'child-a', admin_comment: 'Parent called', last_contacted_at: '2026-09-25' });
    state.save.mockResolvedValue(undefined);
  });

  it('edits private note, contact date and tutor comment independently and survives reopening', async () => {
    const view = render(<StudentNotesCard {...props} />);
    expect(await screen.findByText('Parent called')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Redaguoti' }));
    const privateInput = screen.getByLabelText('Administracijos komentarai');
    const tutorInput = screen.getByLabelText('Komentaras korepetitoriui');
    expect((privateInput as HTMLTextAreaElement).value).toBe('Parent called');
    expect((tutorInput as HTMLTextAreaElement).value).toBe('Needs help with geometry');
    expect(screen.queryByRole('checkbox')).toBeNull();

    fireEvent.change(privateInput, { target: { value: '  Follow up about invoice  ' } });
    fireEvent.change(tutorInput, { target: { value: '  Review triangles  ' } });
    fireEvent.change(screen.getByLabelText('Paskutinį kartą kontaktuota'), { target: { value: '2026-09-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith({
      admin_comment: 'Follow up about invoice', last_contacted_at: '2026-09-30', tutor_comment: 'Review triangles',
    }));
    expect(state.save).toHaveBeenCalledWith(['child-a', 'child-a-tutor-2'], {
      admin_comment: '  Follow up about invoice  ', last_contacted_at: '2026-09-30', tutor_comment: '  Review triangles  ',
    });
    view.unmount();
    state.load.mockResolvedValue({ student_id: 'child-a', admin_comment: 'Follow up about invoice', last_contacted_at: '2026-09-30' });
    render(<StudentNotesCard {...props} tutorComment="Review triangles" />);
    expect(await screen.findByText('Follow up about invoice')).toBeTruthy();
    expect(screen.getByText('2026-09-30')).toBeTruthy();
    expect(screen.getByText('Review triangles')).toBeTruthy();
  });

  it('clears date and both comments explicitly', async () => {
    render(<StudentNotesCard {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Redaguoti' }));
    fireEvent.click(screen.getByRole('button', { name: 'Išvalyti' }));
    fireEvent.change(screen.getByLabelText('Administracijos komentarai'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Komentaras korepetitoriui'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledWith(props.studentIds, {
      admin_comment: '', last_contacted_at: '', tutor_comment: '',
    }));
  });

  it('keeps the draft on failed save and permits retry without false success', async () => {
    state.save.mockRejectedValueOnce(new Error('temporarily unavailable'));
    render(<StudentNotesCard {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Redaguoti' }));
    fireEvent.change(screen.getByLabelText('Administracijos komentarai'), { target: { value: 'Preserve this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(props.onSaved).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Administracijos komentarai') as HTMLTextAreaElement).value).toBe('Preserve this draft');
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti' }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
  });

  it('does not offer editing for a read-only administrator', async () => {
    render(<StudentNotesCard {...props} canEdit={false} />);
    expect(await screen.findByText('Parent called')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Redaguoti' })).toBeNull();
  });

  it('blocks editing when private notes cannot be loaded, then retries loading', async () => {
    state.load.mockRejectedValueOnce(new Error('table unavailable'));
    render(<StudentNotesCard {...props} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Redaguoti' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bandyti dar kartą' }));
    expect(await screen.findByText('Parent called')).toBeTruthy();
    expect(state.load).toHaveBeenCalledTimes(2);
  });
});
