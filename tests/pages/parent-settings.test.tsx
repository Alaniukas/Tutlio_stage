import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/contexts/UserContext', () => ({
  useUser: () => ({
    user: { id: 'parent-1', email: 'parent@example.com', user_metadata: { full_name: 'Test Parent' } },
    loading: false,
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { updateUser: vi.fn(), signOut: vi.fn() },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { disable_lesson_reminders: false }, error: null }),
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
});
