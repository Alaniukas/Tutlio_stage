import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentRegistrationAlert from '@/components/StudentRegistrationAlert';
import { useStudentRegistrationStatus } from '@/hooks/useStudentRegistrationStatus';
import { PRO_KLASE_ORG_ID } from '@/lib/marketMoney';
import type { StudentRegistrationState } from '@/lib/studentRegistration';

vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer test' }) }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ locale: 'lt', t: (key: string) => key }) }));
const fetchMock = vi.fn();
const pending: StudentRegistrationState = { student_id: 's1', full_name: 'Demo klientas', registration_pending: true,
  pending_since: new Date(Date.now() - 25 * 3600_000).toISOString(), next_session_at: null };
const response = (states: StudentRegistrationState[]) => ({ ok: true, json: async () => ({ enabled: true, states }) });
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('registration alerts and automatic refresh', () => {
  it('shows overdue clients and clears the warning after activation', () => {
    const view = render(<MemoryRouter><StudentRegistrationAlert states={[pending]} showLink /></MemoryRouter>);
    expect(screen.getByRole('alert').textContent).toContain('Registracija nebaigta per 24 val.');
    expect(screen.getByRole('alert').textContent).toContain('Demo klientas');
    expect(screen.getByRole('link').getAttribute('href')).toContain('registration=pending');
    view.rerender(<MemoryRouter><StudentRegistrationAlert states={[{ ...pending, registration_pending: false }]} /></MemoryRouter>);
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('refreshes registration when the user returns to an already-open page', async () => {
    fetchMock.mockResolvedValueOnce(response([pending]));
    const { result } = renderHook(() => useStudentRegistrationStatus(PRO_KLASE_ORG_ID));
    await waitFor(() => expect(result.current.byStudentId.get('s1')?.registration_pending).toBe(true));
    fetchMock.mockResolvedValueOnce(response([{ ...pending, registration_pending: false }]));
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(result.current.byStudentId.get('s1')?.registration_pending).toBe(false));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer test' }, cache: 'no-store' });
  });
  it('shows a lookup failure instead of silently clearing a previous warning', async () => {
    fetchMock.mockResolvedValueOnce(response([pending]));
    const { result } = renderHook(() => useStudentRegistrationStatus(PRO_KLASE_ORG_ID));
    await waitFor(() => expect(result.current.states).toHaveLength(1));
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ enabled: true, error: 'Unavailable' }) });
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.byStudentId.get('s1')?.registration_pending).toBe(true);
  });
  it('does not retain another organization’s client states on a context change', async () => {
    fetchMock.mockResolvedValueOnce(response([pending]));
    const { result, rerender } = renderHook(({ org }) => useStudentRegistrationStatus(org), { initialProps: { org: PRO_KLASE_ORG_ID } });
    await waitFor(() => expect(result.current.states).toHaveLength(1));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ enabled: false, states: [] }) });
    rerender({ org: 'different-org' });
    expect(result.current.states).toEqual([]);
    await waitFor(() => expect(result.current.enabled).toBe(false));
  });
});
