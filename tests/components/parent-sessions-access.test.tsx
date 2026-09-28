import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const state = vi.hoisted(() => ({ client: null as any }));
vi.mock('../../src/lib/supabase', () => ({ supabase: {
  rpc: (...args: any[]) => state.client.rpc(...args), from: (...args: any[]) => state.client.from(...args),
} }));
vi.mock('../../src/contexts/UserContext', () => ({ useUser: () => ({ user: { id: 'current-user' } }) }));
vi.mock('../../src/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, dateFnsLocale: undefined }) }));
vi.mock('../../src/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (amount: number) => `${amount} EUR` }) }));
vi.mock('../../src/lib/studentBookingPolicy', () => ({ isSelfBookingDisabledForStudent: async () => true }));
vi.mock('../../src/components/StatusBadge', () => ({ default: () => null }));
import ParentSessions from '../../src/pages/ParentSessions';

let allowed: boolean;
let unavailable: boolean;
let requests: URL[];
beforeEach(() => {
  allowed = false; unavailable = false; requests = [];
  state.client = createClient('https://parent-session-test.invalid', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)); requests.push(url);
      if (url.pathname.endsWith('/rpc/get_parent_child_ids')) {
        expect(JSON.parse(String(init?.body))).toEqual({ p_user_id: 'current-user' });
        expect(url.searchParams.get('student_id')).toBe('eq.child');
        return new Response(JSON.stringify(unavailable ? { message: 'missing RPC' } : allowed ? [{ student_id: 'child' }] : []),
          { status: unavailable ? 500 : 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.pathname.endsWith('/students')) return new Response(JSON.stringify({ full_name: 'Verified child' }), { headers: { 'Content-Type': 'application/json' } });
      if (url.pathname.endsWith('/sessions')) return new Response(JSON.stringify([{ id: 'lesson', student_id: 'child',
        start_time: '2026-09-28T12:00:00Z', end_time: '2026-09-28T12:45:00Z', status: 'completed', paid: true,
        price: 0, topic: 'Teacher activity', tutor_comment: 'Parent-only lesson note',
        show_comment_to_parent: true, show_comment_to_student: false }]), { headers: { 'Content-Type': 'application/json' } });
      throw new Error(`Unexpected parent session request ${url.pathname}`);
    } },
  });
});
afterEach(() => cleanup());
function open() {
  render(<MemoryRouter initialEntries={['/parent/sessions/child']}><Routes>
    <Route path="/parent/sessions/:studentId" element={<ParentSessions />} />
  </Routes></MemoryRouter>);
}
describe('direct parent session route', () => {
  it('denies a shared child or stale secondary link before querying or rendering parent-only session notes', async () => {
    open(); await screen.findByText('parent.noAccessChild');
    expect(screen.queryByText('Parent-only lesson note')).toBeNull();
    expect(requests.map((url) => url.pathname)).toEqual(['/rest/v1/rpc/get_parent_child_ids']);
  });
  it('shows the current primary guardian note and preserves the RPC-authorized legacy parent behavior', async () => {
    allowed = true; open();
    await screen.findByText('Parent-only lesson note');
    expect(screen.getByText('Verified child')).toBeTruthy();
    expect(requests.some((url) => url.pathname.endsWith('/parent_students'))).toBe(false);
  });
  it('fails closed when the strict parent scope cannot be resolved', async () => {
    unavailable = true; open(); await screen.findByText('parent.noAccessChild');
    expect(requests).toHaveLength(1); expect(screen.queryByText('Parent-only lesson note')).toBeNull();
  });
});
