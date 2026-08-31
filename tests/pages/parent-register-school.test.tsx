import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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
      token: 'school-parent-invite',
      used: false,
      parent_email: 'mc.cool.ltu@gmail.com',
      parent_name: 'Ieva Mockutė',
      student_full_name: 'Austėja Mockutė',
      parent_phone: '+37061234567',
      organization_id: 'c3a00000-7e57-4000-8000-000000000001',
      student_grade: '5 klasė',
      student_birth_date: '2014-03-02',
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

describe('ParentRegister school invite', () => {
  it('requires Tutlio legal checkboxes and prefills child grade and birth date', async () => {
    render(
      <MemoryRouter initialEntries={['/parent-register?token=school-parent-invite']}>
        <ParentRegister />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('auth.privacyPolicy')).toBeTruthy();
    });
    expect(screen.getByText('auth.termsOfService')).toBeTruthy();
    expect(screen.queryByText('auth.proklasePrivacyPolicy')).toBeNull();
  });
});
