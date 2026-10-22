import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadOrgAdminData } from '@/lib/preload';
import { getCached, invalidateCache, setCache } from '@/lib/dataCache';
import { rowQuery } from '../fixtures/rowQuery';

const state = vi.hoisted(() => ({ pendingInviteCount: null as Promise<void> | null }));
vi.mock('@/lib/authSession', () => ({ resolveAuthUser: async () => ({ id: 'admin' }) }));
vi.mock('@/lib/orgVisibleTutors', () => ({ getOrgVisibleTutorsDeduped: async () => [{ id: 'tutor', full_name: 'QA Tutor' }] }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (table: string) => {
    const query = rowQuery(table, () => {
      if (table === 'organization_admins') return [{ user_id: 'admin', organization_id: 'org' }];
      if (table === 'organizations') return [{ id: 'org', name: 'QA', entity_type: 'company' }];
      return [];
    });
    let head = false;
    const select = query.select;
    query.select = (columns: string, options: any) => { head = options?.head === true; return select(columns, options); };
    const then = query.then;
    query.then = async (resolve: any, reject: any) => {
      if (table === 'tutor_invites' && head) await state.pendingInviteCount;
      return then(resolve, reject);
    };
    return query;
  },
} }));
beforeEach(() => { invalidateCache(); state.pendingInviteCount = null; setCache('company_stats:org', {}); });
afterEach(() => { invalidateCache(); });

describe('dashboard background preload', () => {
  it('marks an incomplete preload and never invents total earnings or empty activity', async () => {
    await preloadOrgAdminData();
    await waitFor(() => expect(getCached('company_dashboard')).not.toBeNull());
    const cached = getCached<any>('company_dashboard');
    expect(cached.complete).toBe(false);
    for (const key of ['earningsTotal', 'upcomingList', 'attentionList', 'recentPayments']) expect(cached).not.toHaveProperty(key);
  });

  it('cannot overwrite a complete dashboard that finishes during the preload', async () => {
    let finish!: () => void;
    state.pendingInviteCount = new Promise(resolve => { finish = resolve; });
    await preloadOrgAdminData();
    const complete = { organizationId: 'org', complete: true, earningsTotal: 553, attentionList: [{ id: 'attention' }] };
    setCache('company_dashboard', complete);
    finish();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(getCached('company_dashboard')).toBe(complete);
  });
});
