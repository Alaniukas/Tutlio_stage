import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/lib/inAppSupportAvailability', () => ({
  IN_APP_SUPPORT_ENABLED: true,
}));

import InAppSupportProvider from '@/components/support/InAppSupportProvider';

afterEach(() => {
  cleanup();
});

describe('in-app support launcher', () => {
  it('opens the support panel when the bottom-right beaver is clicked', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <InAppSupportProvider>
          <div>Dashboard</div>
        </InAppSupportProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText('Tutlio pagalbos agentas')).toBeNull();
    fireEvent.click(screen.getByTestId('in-app-support-launcher'));
    expect(screen.getByLabelText('Tutlio pagalbos agentas')).toBeTruthy();
    expect(screen.queryByTestId('in-app-support-launcher')).toBeNull();
  });
});
