export type Platform = 'tutors' | 'schools' | 'teachers';

export const SUPPORTED_PLATFORMS: readonly Platform[] = ['tutors', 'schools', 'teachers'] as const;
export const DEFAULT_PLATFORM: Platform = 'tutors';

const PLATFORM_PREFIXES = new Set<string>(['schools', 'teachers', 'school']);

export function isPlatformPrefix(value: string): boolean {
  return PLATFORM_PREFIXES.has(value);
}

export function detectPlatformFromPathname(pathname: string): Platform {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  if (!firstSegment) return DEFAULT_PLATFORM;
  if (firstSegment === 'school') return 'schools';
  if (isPlatformPrefix(firstSegment)) return firstSegment as Platform;
  return DEFAULT_PLATFORM;
}

export function getPlatformBasename(platform: Platform): string {
  if (platform === DEFAULT_PLATFORM) return '';
  // Keep legacy "/school/*" alias working for school deployments.
  // In this mode routes are defined with explicit "/school/*" paths, so basename must stay empty.
  if (platform === 'schools' && typeof window !== 'undefined' &&
      (window.location.pathname === '/school' || window.location.pathname.startsWith('/school/'))) {
    return '';
  }
  return `/${platform}`;
}

export function stripPlatformPrefix(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && isPlatformPrefix(segments[0])) {
    const rest = segments.slice(1).join('/');
    return rest ? `/${rest}` : '/';
  }
  return pathname || '/';
}

export function buildPlatformPath(path: string): string {
  if (typeof window === 'undefined') return path;
  const platform = detectPlatformFromPathname(window.location.pathname);
  const prefix = getPlatformBasename(platform);
  return prefix ? `${prefix}${path}` : path;
}
