import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ParentRegister from '../../src/pages/ParentRegister';

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: 'lt',
  }),
}));

vi.mock('@/lib/parentInvitePreview', () => ({
  fetchParentInvitePreviewByToken: async () => ({
    data: {
      token: 'pkqa-parent-alaniukas-token',
      used: false,
      parent_email: 'alaniukasa@gmail.com',
      parent_name: 'QA Tėvas',
      student_full_name: 'QA Armandas',
      parent_phone: null,
      organization_id: 'b0a00000-7e57-4000-8000-000000000001',
    },
    error: null,
  }),
  fetchParentInvitePreviewByCode: async () => ({ data: null, error: null }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: async () => ({ error: null }),
    },
  },
}));

describe('ParentRegister Pro Klasė legal UI', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('shows all four Pro Klasė legal checkboxes for a QA org invite', async () => {
    render(
      <MemoryRouter initialEntries={['/parent-register?token=pkqa-parent-alaniukas-token']}>
        <ParentRegister />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('auth.proklasePrivacyPolicy')).toBeTruthy();
    });
    expect(screen.getByText('auth.privacyPolicy')).toBeTruthy();
    expect(screen.getByText('auth.termsOfService')).toBeTruthy();
    expect(screen.getByText('auth.proklaseTermsOfService')).toBeTruthy();
    expect(screen.getByText('parent.registerFor', { exact: false })).toBeTruthy();
  });
});
