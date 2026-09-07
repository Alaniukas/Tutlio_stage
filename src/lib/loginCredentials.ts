const REMEMBER_ME_KEY = 'tutlio_remember_me';
const EMAIL_KEY = 'tutlio_login_email';
const PASSWORD_KEY = 'tutlio_login_password';

export function readRememberMePreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function loadSavedLoginForm(): { email: string; password: string; rememberMe: boolean } {
  const rememberMe = readRememberMePreference();
  if (!rememberMe) {
    return { email: '', password: '', rememberMe: false };
  }
  try {
    return {
      email: localStorage.getItem(EMAIL_KEY) || '',
      password: localStorage.getItem(PASSWORD_KEY) || '',
      rememberMe: true,
    };
  } catch {
    return { email: '', password: '', rememberMe };
  }
}

/** Persist email/password locally when “remember me” is on (testing / convenience). */
export function persistLoginForm(email: string, password: string, rememberMe: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (rememberMe && email.trim()) {
      localStorage.setItem(EMAIL_KEY, email.trim());
      localStorage.setItem(PASSWORD_KEY, password);
    } else {
      localStorage.removeItem(EMAIL_KEY);
      localStorage.removeItem(PASSWORD_KEY);
    }
  } catch {
    // ignore
  }
}
