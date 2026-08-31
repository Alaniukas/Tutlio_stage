import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import ProfileLocaleSync from '@/components/ProfileLocaleSync';

const state = vi.hoisted(() => ({
  profile: null as null | { id: string; preferred_locale: string },
  locale: 'he', setLocale: vi.fn(),
}));
vi.mock('@/contexts/UserContext', () => ({ useUser: () => ({ profile: state.profile }) }));
vi.mock('@/lib/i18n', async (importOriginal) => ({
  ...await importOriginal<object>(),
  useTranslation: () => ({ locale: state.locale, setLocale: state.setLocale }),
}));
afterEach(() => { cleanup(); state.profile = null; state.setLocale.mockClear(); window.history.replaceState({}, '', '/'); });

describe('profile language sync', () => {
  it('keeps the URL choice when the previous UI language is still visible during a download', () => {
    window.history.replaceState({}, '', '/ja/dashboard?lang=ar');
    state.profile = { id: 'first', preferred_locale: 'he' };
    render(<ProfileLocaleSync />);
    expect(state.setLocale).toHaveBeenCalledWith('ja');
  });
  it('saves a pre-login URL choice when the account becomes available, only once per account', () => {
    window.history.replaceState({}, '', '/dashboard?lang=he');
    const view = render(<ProfileLocaleSync />);
    expect(state.setLocale).not.toHaveBeenCalled();
    state.profile = { id: 'first', preferred_locale: 'en' };
    view.rerender(<ProfileLocaleSync />);
    expect(state.setLocale).toHaveBeenCalledWith('he');
    state.profile = { ...state.profile };
    view.rerender(<ProfileLocaleSync />);
    expect(state.setLocale).toHaveBeenCalledTimes(1);
    state.profile = { id: 'second', preferred_locale: 'en' };
    view.rerender(<ProfileLocaleSync />);
    expect(state.setLocale).toHaveBeenCalledTimes(2);
  });
  it('restores an account preference if there is no valid explicit URL choice', () => {
    window.history.replaceState({}, '', '/dashboard?lang=unknown');
    state.profile = { id: 'first', preferred_locale: 'ar' };
    render(<ProfileLocaleSync />);
    expect(state.setLocale).toHaveBeenCalledWith('ar');
  });
});
