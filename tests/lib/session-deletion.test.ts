import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canFamilyDeleteSession, deleteSessionViaApi, deletionConfirmationKey, isRecurringSession } from '@/lib/sessionDeletion';

vi.mock('@/lib/apiHelpers', () => ({ authHeaders: vi.fn(async () => ({ Authorization: 'Bearer user-token', 'Content-Type': 'application/json' })) }));

describe('shared lesson deletion', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('recognizes both recurring individuals and school class groups', () => {
    expect(isRecurringSession({ recurring_session_id: 'individual' })).toBe(true);
    expect(isRecurringSession({ class_group_id: 'school-group' })).toBe(true);
    expect(isRecurringSession({})).toBe(false);
    expect(isRecurringSession(null)).toBe(false);
  });

  it('keeps family cleanup separate from cancellation and unsettled penalties', () => {
    expect(canFamilyDeleteSession({ status: 'cancelled' })).toBe(true);
    expect(canFamilyDeleteSession({ status: 'active' })).toBe(false);
    expect(canFamilyDeleteSession({ status: 'completed' })).toBe(false);
    expect(canFamilyDeleteSession({ status: 'cancelled', cancellation_penalty_amount: 10, penalty_resolution: 'pending' })).toBe(false);
    expect(canFamilyDeleteSession({ status: 'cancelled', cancellation_penalty_amount: 10, penalty_resolution: 'invoiced' })).toBe(false);
    expect(canFamilyDeleteSession({ status: 'cancelled', cancellation_penalty_amount: 0, penalty_resolution: 'pending' })).toBe(false);
    expect(canFamilyDeleteSession({ status: 'cancelled', cancellation_penalty_amount: 10, penalty_resolution: 'paid' })).toBe(true);
    expect(canFamilyDeleteSession(null)).toBe(false);
  });

  it('confirms the selected recurring scope explicitly', () => {
    expect(deletionConfirmationKey('single')).toBe('cal.deleteConfirmSingle');
    expect(deletionConfirmationKey('future')).toBe('cal.deleteConfirmFuture');
    expect(deletionConfirmationKey('all')).toBe('cal.deleteConfirmAll');
  });

  it('sends an authenticated scope and returns all deleted ids for calendar refresh', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, deletedCount: 2, deletedSessionIds: ['a', 'b'] }) }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await deleteSessionViaApi('a', 'all');
    expect(fetchMock).toHaveBeenCalledWith('/api/delete-session', {
      method: 'POST', headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: 'a', deleteScope: 'all' }),
    });
    expect(result.deletedSessionIds).toEqual(['a', 'b']);
  });

  it('does not treat an API failure as successful deletion', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Forbidden' }) })));
    await expect(deleteSessionViaApi('other-lesson', 'single')).rejects.toThrow('Forbidden');
  });
});
