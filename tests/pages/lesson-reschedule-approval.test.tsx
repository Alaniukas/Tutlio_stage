import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LessonRescheduleApproval from '@/pages/LessonRescheduleApproval';
import type { LessonRescheduleApprovalPreview } from '@/lib/lessonRescheduleApproval';

const preview: LessonRescheduleApprovalPreview = {
  status: 'pending', recipientApproved: false, scope: 'future', organizationName: 'Mokslo vaisiai',
  brandColor: '#124410', tutorName: 'Rasa', studentName: 'Ona', reason: 'Keičiamas darbo grafikas',
  oldStart: '2030-10-22T10:00:00Z', oldEnd: '2030-10-22T11:00:00Z',
  newStart: '2030-10-23T12:00:00Z', newEnd: '2030-10-23T13:00:00Z', locale: 'lt',
};
afterEach(() => vi.unstubAllGlobals());
function show(choice = 'approved') {
  return render(<MemoryRouter initialEntries={[`/lesson-reschedule-approval?request=request-id&recipient=recipient-id&t=signed-token&choice=${choice}`]}>
    <LessonRescheduleApproval />
  </MemoryRouter>);
}
describe('lesson reschedule approval page', () => {
  it('shows both options and does not submit a decision from the email URL', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => preview }));
    vi.stubGlobal('fetch', fetcher);
    show();
    await screen.findByRole('button', { name: 'Patvirtinti' });
    expect(screen.getByRole('button', { name: 'Nepatvirtinti' })).toBeTruthy();
    expect(screen.getByText('Mokslo vaisiai')).toBeTruthy();
    expect(screen.getByText('Ši ir visos būsimos pamokos')).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain('request=request-id');
  });
  it.each(['approved', 'rejected'] as const)('saves the explicit %s decision with its signed capability', async (decision) => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true, json: async () => init?.method === 'POST' ? { ...preview, status: decision } : preview,
    }));
    vi.stubGlobal('fetch', fetcher);
    show('rejected');
    fireEvent.click(await screen.findByRole('button', { name: decision === 'approved' ? 'Patvirtinti' : 'Nepatvirtinti' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Patvirtinti' })).toBeNull());
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      request: 'request-id', recipient: 'recipient-id', t: 'signed-token', decision,
    });
    expect(screen.getByRole('status').textContent).toContain(decision === 'approved' ? 'Perkėlimas patvirtintas' : 'Perkėlimas nepatvirtintas');
  });
  it('keeps the old schedule message when a group client is waiting for other approvals', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ...preview, recipientApproved: true }) })));
    show();
    await screen.findByText(/kai sutiks visi jos klientai/);
    expect(screen.queryByRole('button', { name: 'Patvirtinti' })).toBeNull();
  });
  it('does not claim success when approval finds a booking conflict', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: init?.method !== 'POST', json: async () => init?.method === 'POST' ? { code: 'reschedule_conflict' } : preview,
    })));
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Patvirtinti' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Siūlomas laikas jau užimtas');
    expect(screen.getByRole('button', { name: 'Patvirtinti' })).toBeTruthy();
  });
});
