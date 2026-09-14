import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }));

vi.mock('@/contexts/UserContext', () => ({
  useUser: () => ({
    user: { id: 'parent-1', email: 'parent@example.com', user_metadata: { full_name: 'Test Parent' } },
    loading: false,
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { updateUser: vi.fn(), signOut: vi.fn() },
    rpc: (_name: string, args: { p_opt_out?: unknown }) => {
      updateMock(args.p_opt_out);
      return Promise.resolve({ data: args.p_opt_out, error: null });
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { disable_lesson_reminders: false, email_notification_opt_out: [] },
            error: null,
          }),
        }),
      }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

vi.mock('@/lib/preload', () => ({
  parentFullNameForUserDeduped: vi.fn().mockResolvedValue('Test Parent'),
}));

vi.mock('@/lib/apiHelpers', () => ({
  authHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer test' }),
}));

vi.mock('@/components/ParentLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

vi.mock('@/components/PwaInstallGuide', () => ({ default: () => null }));

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ isMoksloVaisiai: false, children: [] }),
}) as unknown as typeof fetch;

import ParentSettings from '@/pages/ParentSettings';

describe('ParentSettings', () => {
  it('renders settings title', async () => {
    render(
      <MemoryRouter>
        <ParentSettings />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/Nustatymai|Settings/i)).toBeTruthy();
  });

  it('lets a parent choose notification categories with checkboxes', async () => {
    updateMock.mockClear();
    render(
      <MemoryRouter>
        <ParentSettings />
      </MemoryRouter>,
    );

    const lessonUpdates = await screen.findByRole('checkbox', {
      name: /Pamokų pakeitimai|Lesson updates/i,
    });
    expect((lessonUpdates as HTMLInputElement).checked).toBe(true);

    fireEvent.click(lessonUpdates);

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(['lesson_updates']));
    await waitFor(() => expect((lessonUpdates as HTMLInputElement).checked).toBe(false));
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
  });
});
