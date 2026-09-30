import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SchoolContractAttendanceAlerts from '../../src/components/company/SchoolContractAttendanceAlerts';

vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer admin-token' }) }));
vi.mock('@/lib/i18n', async () => {
  const { en } = await import('../../src/lib/i18n/en');
  return { useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => Object.entries(params || {})
      .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), en[key] || key),
    dateFnsLocale: undefined,
  }) };
});

const fetchMock = vi.fn();
const alert = {
  id: 'attestation-1', studentId: 'student-1', studentName: 'Ada Child',
  tutorName: 'Teacher A', groupId: 'group-1', groupName: 'IT Juniors',
  startTime: '2026-09-30T06:00:00.000Z', endTime: '2026-09-30T07:00:00.000Z',
  statusConfirmedAt: '2026-09-30T07:05:00.000Z',
};
const response = (alerts = [alert]) => ({ ok: true, json: async () => ({ ok: true, alerts, total: alerts.length }) });
const card = (organizationId = 'school-a', canReviewContracts = true) => (
  <MemoryRouter><SchoolContractAttendanceAlerts organizationId={organizationId} canReviewContracts={canReviewContracts} /></MemoryRouter>
);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('school Overview contract attendance notifications', () => {
  it('shows a historical attendance notification with child, group, teacher, date and contract action', async () => {
    fetchMock.mockResolvedValue(response());
    render(card());
    await screen.findByText('Ada Child');
    expect(screen.getByRole('heading', { name: 'Attended while contract was unconfirmed' })).toBeTruthy();
    expect(screen.getByText(/The student attended a lesson before/)).toBeTruthy();
    expect(screen.getByText(/IT Juniors.*Teacher A/)).toBeTruthy();
    expect(screen.getByText(/30 Sep 2026/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open contracts' }).getAttribute('href')).toBe('/school/contracts');
    expect(fetchMock).toHaveBeenCalledWith('/api/school-group-attendance?action=alerts', expect.objectContaining({ headers: { Authorization: 'Bearer admin-token' } }));
  });

  it('does not silently treat a failed lookup as no notifications and supports retry', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'unavailable' }) }).mockResolvedValue(response());
    render(card());
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load attendance notifications');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Ada Child');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hides an empty notification section', async () => {
    fetchMock.mockResolvedValue(response([]));
    render(card());
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('persists dismissal for the organization and lets the administrator restore entries', async () => {
    fetchMock.mockResolvedValue(response());
    render(card());
    await screen.findByText('Ada Child');
    fireEvent.click(screen.getByRole('button', { name: 'Hide this entry' }));
    expect(screen.queryByText('Ada Child')).toBeNull();
    expect(localStorage.getItem('tutlio:v1:school_dash_contract_attendance:school-a')).toBe('["attestation-1"]');
    fireEvent.click(screen.getByRole('button', { name: 'Show hidden entries' }));
    expect(screen.getByText('Ada Child')).toBeTruthy();
  });

  it('never renders a stale response from the previously selected organization', async () => {
    let resolveFirst!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValue(response([{ ...alert, id: 'other-attestation', studentName: 'Child B' }]));
    const view = render(card('school-a'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    view.rerender(card('school-b'));
    await screen.findByText('Child B');
    resolveFirst(response());
    await waitFor(() => expect(screen.queryByText('Ada Child')).toBeNull());
    expect(screen.getByText('Child B')).toBeTruthy();
  });

  it('does not offer contract navigation without contract viewing permission', async () => {
    fetchMock.mockResolvedValue(response());
    render(card('school-a', false));
    await screen.findByText('Ada Child');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
