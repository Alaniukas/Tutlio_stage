import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStudentAdminNotes, saveStudentNotes } from '@/lib/studentNotes';

const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: state.rpc, from: state.from } }));

describe('Student note storage contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rpc.mockResolvedValue({ error: null });
  });
  it('sends private note, date and shared comment in one atomic write for unique pairing IDs', async () => {
    await saveStudentNotes(['child-1', 'child-2', 'child-1'], {
      admin_comment: '  Internal  ', last_contacted_at: '2026-09-30', tutor_comment: '  Shared  ',
    });
    expect(state.rpc).toHaveBeenCalledWith('save_student_notes', {
      p_student_ids: ['child-1', 'child-2'], p_admin_comment: 'Internal',
      p_last_contacted_at: '2026-09-30', p_tutor_comment: 'Shared',
    });
    expect(state.from).not.toHaveBeenCalled();
  });
  it('uses null to clear fields and propagates permission failures', async () => {
    const error = { code: '42501', message: 'Insufficient student administration permission' };
    state.rpc.mockResolvedValue({ error });
    await expect(saveStudentNotes(['child'], { admin_comment: ' ', last_contacted_at: '', tutor_comment: '' })).rejects.toEqual(error);
    expect(state.rpc).toHaveBeenCalledWith('save_student_notes', {
      p_student_ids: ['child'], p_admin_comment: null, p_last_contacted_at: null, p_tutor_comment: null,
    });
  });
  it('reads the private table and does not suppress storage errors', async () => {
    const query: any = { select: vi.fn(() => query), in: vi.fn(() => state.maybeSingle()) };
    state.from.mockReturnValue(query);
    state.maybeSingle.mockResolvedValue({ data: null, error: { code: '42P01' } });
    await expect(loadStudentAdminNotes('child')).rejects.toEqual({ code: '42P01' });
    expect(state.from).toHaveBeenCalledWith('student_admin_notes');
    expect(query.in).toHaveBeenCalledWith('student_id', ['child']);
  });
  it('preserves distinct historical notes across tutor pairings and shows the latest contact date', async () => {
    const query: any = { select: vi.fn(() => query), in: vi.fn(() => state.maybeSingle()) };
    state.from.mockReturnValue(query);
    state.maybeSingle.mockResolvedValue({ error: null, data: [
      { student_id: 'child-1', admin_comment: null, last_contacted_at: null },
      { student_id: 'child-2', admin_comment: 'Parent called', last_contacted_at: '2026-09-29' },
      { student_id: 'child-3', admin_comment: 'Billing follow-up', last_contacted_at: '2026-09-30' },
      { student_id: 'child-4', admin_comment: 'Parent called', last_contacted_at: '2026-09-28' },
    ] });
    expect(await loadStudentAdminNotes('child-1', ['child-1', 'child-2', 'child-3', 'child-4'])).toEqual({
      student_id: 'child-1', admin_comment: 'Parent called\n\nBilling follow-up', last_contacted_at: '2026-09-30',
    });
  });
});
