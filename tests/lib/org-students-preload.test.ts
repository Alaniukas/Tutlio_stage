import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadOrgAdminData } from '@/lib/preload';
import { getCached, invalidateCache, setCache } from '@/lib/dataCache';
import { rowQuery } from '../fixtures/rowQuery';

const state = vi.hoisted(() => ({ visibleTutors: vi.fn(), studentError: false }));
vi.mock('@/lib/authSession', () => ({ resolveAuthUser: async () => ({ id: 'admin' }) }));
vi.mock('@/lib/orgVisibleTutors', () => ({ getOrgVisibleTutorsDeduped: (...args: any[]) => state.visibleTutors(...args) }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (table: string) => {
    const query = rowQuery(table, () => {
      if (table === 'organization_admins') return [{ user_id: 'admin', organization_id: 'org' }];
      if (table === 'organizations') return [{ id: 'org', name: 'Test Org', entity_type: 'company' }];
      if (table === 'profiles') return [{ id: 'tutor', full_name: 'Test Tutor' }];
      if (table === 'students') return [
        { id: 'assigned', organization_id: null, tutor_id: 'tutor', created_at: '2026-10-01' },
        { id: 'unassigned', organization_id: 'org', tutor_id: null, created_at: '2026-10-02' },
      ];
      return [];
    });
    const then = query.then;
    query.then = (resolve: any, reject: any) => table === 'students' && state.studentError
      ? Promise.resolve({ data: null, error: { message: 'HTTP 522' } }).then(resolve, reject)
      : then(resolve, reject);
    return query;
  },
} }));

beforeEach(() => {
  invalidateCache(); state.studentError = false;
  state.visibleTutors.mockResolvedValue([{ id: 'tutor', full_name: 'Test Tutor' }]);
  setCache('company_sessions', {}); setCache('company_dashboard', {}); setCache('company_stats:org', {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { invalidateCache(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('organization students preload', () => {
  it('never publishes an empty roster after a failed tutor read', async () => {
    state.visibleTutors.mockRejectedValue(new Error('HTTP 522'));
    await expect(preloadOrgAdminData()).resolves.toBeUndefined();
    expect(state.visibleTutors.mock.calls[0][3]).toEqual({ strict: true });
    expect(getCached('company_students')).toBeNull();
  });

  it('does not cache a partial student result when either roster read fails', async () => {
    state.studentError = true;
    await preloadOrgAdminData();
    expect(getCached('company_students')).toBeNull();
  });

  it('includes legacy assignments and unassigned students with tutor names from the authorized list', async () => {
    await preloadOrgAdminData();
    expect(getCached<any>('company_students')?.students).toMatchObject([
      { id: 'unassigned', tutor: null },
      { id: 'assigned', tutor: { full_name: 'Test Tutor' } },
    ]);
  });
});
