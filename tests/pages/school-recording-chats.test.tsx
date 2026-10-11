import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SchoolLessonRecordings from '../../src/pages/SchoolLessonRecordings';

const state = vi.hoisted(() => ({ canManage: false }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer test-only' }) }));
vi.mock('@/contexts/StudentPolicyContext', () => ({ useStudentPolicy: () => ({ activeStudentId: null }) }));
vi.mock('@/components/Layout', () => ({ default: ({ children }: any) => children }));
vi.mock('@/components/StudentLayout', () => ({ default: ({ children }: any) => children }));
vi.mock('@/components/ParentLayout', () => ({ default: ({ children }: any) => children }));
vi.mock('@/components/school/RecordingAccessPanel', () => ({ default: () => null }));
vi.mock('@/components/school/SchoolMaterialBaselinePanel', () => ({ default: () => null }));

const fetchMock = vi.fn();
describe('school recording chat recovery', () => {
  beforeEach(() => {
    state.canManage = false;
    fetchMock.mockReset().mockImplementation(async (input: string) => {
      const url = new URL(input, 'https://test.invalid');
      if (url.pathname === '/api/school-lesson-recording-stream') return new Response('Teacher: x² = 4');
      const pending = !url.searchParams.has('groupId');
      const restored = url.searchParams.get('refresh') === '1';
      return Response.json({ enabled: true, canManage: state.canManage, retentionDays: 30, groups: [{
        id: 'qa-group', kind: 'class_group', name: 'QA Matematika', configured: true,
        canManage: state.canManage, recordingsPending: pending,
        recordings: pending ? [] : [{
          id: 'qa-video', name: 'QA Pamoka.mp4', recordedAt: '2026-10-07T10:00:00Z',
          durationMillis: 60_000, size: 1000, streamUrl: '/api/school-lesson-recording-stream?t=video',
          chatStatus: restored ? 'available' : 'restricted',
          chatFiles: restored ? [{ id: 'qa-chat', name: 'QA Pamoka.sbv', streamUrl: '/api/school-lesson-recording-stream?t=chat' }] : [],
        }],
      }] });
    });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it.each(['/school/recordings', '/recordings', '/student/recordings', '/parent/recordings'])
    ('shows the transcript after Drive access is restored and %s is refreshed', async (path) => {
      state.canManage = path === '/school/recordings';
      const { container } = render(<MemoryRouter initialEntries={[path]}><SchoolLessonRecordings /></MemoryRouter>);
      expect(await screen.findByText(/Google Drive neleidžia perskaityti/)).toBeTruthy();
      expect(Boolean(screen.queryByText(/bendrinimo nustatymuose/))).toBe(state.canManage);
      fireEvent.click(screen.getByRole('button', { name: 'Atnaujinti' }));
      expect(await screen.findByText('QA Pamoka.sbv')).toBeTruthy();
      expect(screen.queryByText(/Google Drive neleidžia perskaityti/)).toBeNull();
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('groupId=qa-group&refresh=1'))).toBe(true);
      const details = container.querySelector('details')!;
      details.open = true;
      fireEvent(details, new Event('toggle'));
      await waitFor(() => expect(container.querySelector('pre')?.textContent).toBe('Teacher: x² = 4'));
      expect(container.querySelector('video')).toBeTruthy();
      const chatRequest = fetchMock.mock.calls.find(([url]) => String(url).endsWith('t=chat'));
      expect(chatRequest?.[1]).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
    });
});
