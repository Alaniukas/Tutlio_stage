import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'tutor' } as { id: string } | null,
  rows: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: mocks.user }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({}) }));
vi.mock('@/lib/preload', () => ({ orgAdminRowByUserDeduped: async () => null }));

import { useMessageableStudents } from '@/hooks/useChat';

let run = 0;
beforeEach(() => {
  mocks.user = { id: `tutor-${++run}` };
  mocks.rows = [
    { id: 'unregistered', tutor_id: mocks.user.id, linked_user_id: null, full_name: 'Armandas', email: 'unregistered@example.test', detached_at: null },
    // A matching name is insufficient evidence to borrow another student's account.
    { id: 'other-record', tutor_id: 'other-tutor', linked_user_id: 'other-account', full_name: 'Armandas', email: 'different@example.test', detached_at: null },
    { id: 'registered', tutor_id: mocks.user.id, linked_user_id: 'student-account', full_name: 'Registered student', email: 'student@example.test', detached_at: null },
    { id: 'archived', tutor_id: mocks.user.id, linked_user_id: null, full_name: 'Archived student', email: null, detached_at: '2026-09-01' },
  ];
  mocks.rpc.mockReset();
  mocks.rpc.mockImplementation(async (name) => ({ data: name === 'get_my_parent_profile_id' ? null : [], error: null }));
  mocks.from.mockReset();
  mocks.from.mockImplementation((table: string) => {
    const filters: Array<[string, unknown]> = [];
    let limit = Infinity;
    const result = () => ({ data: table === 'students'
      ? mocks.rows.filter((row) => filters.every(([column, value]) => row[column] === value)).slice(0, limit)
      : null, error: null });
    const query: any = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      is: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      limit: (value: number) => { limit = value; return query; },
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  });
});
afterEach(cleanup);

describe('chat contact account status', () => {
  it('reports an assigned unregistered student separately without guessing another account from their name', async () => {
    const { result } = renderHook(() => useMessageableStudents());
    await act(async () => { await result.current.fetch(true); });
    expect(result.current.students).toEqual([
      { student_id: 'registered', linked_user_id: 'student-account', full_name: 'Registered student', email: 'student@example.test', role: 'student' },
    ]);
    expect(result.current.unregisteredStudents).toEqual([
      { student_id: 'unregistered', full_name: 'Armandas', email: 'unregistered@example.test' },
    ]);
    expect(result.current.loading).toBe(false);
  });

  it('moves a student to available contacts after their explicit account link is saved', async () => {
    const { result } = renderHook(() => useMessageableStudents());
    await act(async () => { await result.current.fetch(true); });
    mocks.rows[0].linked_user_id = 'confirmed-account';
    await act(async () => { await result.current.fetch(true); });
    expect(result.current.unregisteredStudents).toEqual([]);
    expect(result.current.students.find((row) => row.student_id === 'unregistered')?.linked_user_id).toBe('confirmed-account');
  });

  it('keeps cached contacts scoped to the signed-in account', async () => {
    const first = renderHook(() => useMessageableStudents());
    await act(async () => { await first.result.current.fetch(true); });
    first.unmount();
    mocks.user = { id: 'different-tutor' };
    const second = renderHook(() => useMessageableStudents());
    expect(second.result.current.students).toEqual([]);
    expect(second.result.current.unregisteredStudents).toEqual([]);
    await act(async () => { await second.result.current.fetch(); });
    expect(second.result.current.students).toEqual([]);
    expect(second.result.current.unregisteredStudents).toEqual([]);
  });
});
