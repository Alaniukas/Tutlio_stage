import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStudentTrialHistory } from '@/lib/studentTrialHistory';
import { PRO_KLASE_ORG_ID } from '@/lib/marketMoney';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: mocks }));

describe('tutor trial history lookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses scoped organization history for Pro Klasė', async () => {
    const rows = [{ id: 'trial-1', student_id: 'student-1', start_time: '2026-09-01', status: 'completed' }];
    mocks.rpc.mockResolvedValue({ data: rows, error: null });

    expect(await fetchStudentTrialHistory(['student-1', 'student-1'], 'tutor-1', PRO_KLASE_ORG_ID)).toEqual(rows);
    expect(mocks.rpc).toHaveBeenCalledWith('proklase_tutor_trial_history', { p_student_ids: ['student-1'] });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('keeps other organizations scoped to the current tutor', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const secondEq = vi.fn(() => ({ order }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const inQuery = vi.fn(() => ({ eq: firstEq }));
    mocks.from.mockReturnValue({ select: () => ({ in: inQuery }) });

    expect(await fetchStudentTrialHistory(['student-1'], 'tutor-1', 'other-org')).toEqual([]);
    expect(firstEq).toHaveBeenCalledWith('tutor_id', 'tutor-1');
    expect(secondEq).toHaveBeenCalledWith('subjects.is_trial', true);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
