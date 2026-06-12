// Installed-PWA portal memory: remembers which portal the device last used
// (regular app vs org admin /company | /school), so that when the installed
// app opens logged out it shows the matching login page instead of the
// marketing landing / wrong login.

export type LastPortal = 'regular' | 'company' | 'school';

const LAST_PORTAL_KEY = 'tutlio_last_portal';

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

export function setLastPortal(portal: LastPortal): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_PORTAL_KEY, portal);
  } catch {
    /* ignore */
  }
}

export function getLastPortal(): LastPortal {
  if (typeof window === 'undefined') return 'regular';
  try {
    const v = localStorage.getItem(LAST_PORTAL_KEY);
    return v === 'company' || v === 'school' ? v : 'regular';
  } catch {
    return 'regular';
  }
}

/** Login route matching the portal this device last used. */
export function loginPathForLastPortal(): string {
  const portal = getLastPortal();
  if (portal === 'school') return '/school/login';
  if (portal === 'company') return '/company/login';
  return '/login';
}
