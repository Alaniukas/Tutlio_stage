import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const state = vi.hoisted(() => ({
  user: { id: 'student-user', email: 'student@example.test' },
  parentAllowed: false,
  parentError: null as { message: string } | null,
  session: {
    id: 'lesson', tutor_id: 'tutor-user', student_id: 'student', topic: 'Mathematics',
    start_time: '2030-10-15T10:00:00Z', end_time: '2030-10-15T11:00:00Z', status: 'active',
  } as Record<string, unknown> | null,
  sync: vi.fn(), rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: {
  from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
    data: table === 'sessions' ? state.session
      : table === 'students' ? { full_name: 'Student', linked_user_id: 'student-user' }
      : table === 'profiles' ? { full_name: 'Tutor', organization_id: null } : null,
    error: null,
  }) }) }) }),
  rpc: (...args: unknown[]) => {
    state.rpc(...args);
    return Promise.resolve({ data: state.parentAllowed, error: state.parentError });
  },
} }));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ user: state.user, loading: false }) }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useWhiteboardSync', () => ({ useWhiteboardSync: (...args: unknown[]) => {
  state.sync(...args);
  return { participants: [], saving: false, saved: true, loaded: true, onChange: vi.fn(), saveScene: vi.fn() };
} }));
vi.mock('@excalidraw/excalidraw', () => ({
  Excalidraw: () => <div role="application" aria-label="Lesson whiteboard" />,
  exportToBlob: vi.fn(),
}));

import WhiteboardPage from '@/pages/Whiteboard';

beforeEach(() => {
  state.user = { id: 'student-user', email: 'student@example.test' };
  state.parentAllowed = false;
  state.parentError = null;
  state.session = {
    id: 'lesson', tutor_id: 'tutor-user', student_id: 'student', topic: 'Mathematics',
    start_time: '2030-10-15T10:00:00Z', end_time: '2030-10-15T11:00:00Z', status: 'active',
  };
  state.rpc.mockClear();
  state.sync.mockClear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ libraryItems: [] }) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function openWhiteboard() {
  return render(<MemoryRouter initialEntries={['/whiteboard/room']}>
    <Routes><Route path="/whiteboard/:roomId" element={<WhiteboardPage />} /></Routes>
  </MemoryRouter>);
}

describe('lesson whiteboard access', () => {
  it.each(['student-user', 'tutor-user'])('keeps access for the assigned %s', async (userId) => {
    state.user = { id: userId, email: `${userId}@example.test` };
    openWhiteboard();
    expect(await screen.findByRole('application', { name: 'Lesson whiteboard' })).toBeTruthy();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('opens a child lesson for a linked parent without granting Storage writes', async () => {
    state.user = { id: 'parent-user', email: 'parent@example.test' };
    state.parentAllowed = true;
    openWhiteboard();
    expect(await screen.findByRole('application', { name: 'Lesson whiteboard' })).toBeTruthy();
    expect(state.rpc).toHaveBeenCalledWith('parent_can_access_student', { p_student_id: 'student' });
    await waitFor(() => expect(state.sync).toHaveBeenCalledWith(
      'lesson', null, expect.objectContaining({ id: 'parent-user', name: 'parent@example.test' }), false,
    ));
  });

  it.each([false, true])('rejects an unrelated caller when the parent lookup fails: %s', async (lookupFails) => {
    state.user = { id: 'unrelated-user', email: 'unrelated@example.test' };
    state.parentAllowed = lookupFails;
    state.parentError = lookupFails ? { message: 'Lookup unavailable' } : null;
    openWhiteboard();
    expect(await screen.findByText('whiteboard.unauthorized')).toBeTruthy();
    expect(screen.queryByRole('application')).toBeNull();
  });

  it('keeps the completed-lesson expiry for linked parents', async () => {
    state.user = { id: 'parent-user', email: 'parent@example.test' };
    state.parentAllowed = true;
    state.session = { ...state.session, status: 'completed', end_time: '2020-10-15T11:00:00Z' };
    openWhiteboard();
    expect(await screen.findByText('whiteboard.closedAfterLesson')).toBeTruthy();
    expect(screen.queryByRole('application')).toBeNull();
  });
});
