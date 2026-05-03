const PWA_PERMANENT_DISMISS_PREFIX = 'tutlio_pwa_install_dismissed_';

/** Senas globalus raktas – valome pirmam mount, kad neblokuotų naujos per-user logikos. */
const LEGACY_SESSION_BANNER_GLOBAL = 'tutlio_pwa_install_session_closed';

export function pwaPermanentDismissStorageKey(userId: string): string {
  return PWA_PERMANENT_DISMISS_PREFIX + userId;
}

export function isPwaInstallPermanentlyHidden(userId: string | undefined | null): boolean {
  if (!userId || typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(pwaPermanentDismissStorageKey(userId)) === '1';
  } catch {
    return false;
  }
}

/** „Neberodyti“ — banerio ir nustatymų bloko neberodyti (visi įrenginiai). */
export function setPwaInstallPermanentlyHidden(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(pwaPermanentDismissStorageKey(userId), '1');
  } catch {
    /* ignore */
  }
}

/** Baneris paslėptas tik šiai naršyklės sesijai (uždaryta X ant banerio). */
export function bannerSessionDismissKey(userId: string): string {
  return `tutlio_pwa_banner_sess_${userId}`;
}

export function isBannerSessionDismissed(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(bannerSessionDismissKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function setBannerSessionDismissed(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(bannerSessionDismissKey(userId), '1');
  } catch {
    /* ignore */
  }
}

/** Vieną kartą perkelti nuo seno globalaus session rakto. */
export function clearLegacyPwaGlobalSessionKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(LEGACY_SESSION_BANNER_GLOBAL);
  } catch {
    /* ignore */
  }
}

/** „Nustatymai“ puslapyje: PWA gidas paslėptas iki kito full page load (arba naujos sesijos). */
export function guideSettingsSessionHideKey(userId: string): string {
  return `tutlio_pwa_guide_settings_sess_${userId}`;
}

export function isGuideSettingsSessionHidden(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(guideSettingsSessionHideKey(userId)) === '1';
  } catch {
    return false;
  }
}

export function setGuideSettingsSessionHidden(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(guideSettingsSessionHideKey(userId), '1');
  } catch {
    /* ignore */
  }
}
