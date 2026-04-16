export type Platform = 'tutors' | 'lecturers' | 'teachers';

export const SUPPORTED_PLATFORMS: readonly Platform[] = ['tutors', 'lecturers', 'teachers'] as const;
export const DEFAULT_PLATFORM: Platform = 'tutors';

// Note: 'lectureres' is an occasional typo we want to be backward-compatible with.
const PLATFORM_PREFIXES = new Set<string>(['lecturers', 'teachers', 'lectureres']);

export function isPlatformPrefix(value: string): boolean {
  return PLATFORM_PREFIXES.has(value);
}

export function detectPlatformFromPathname(pathname: string): Platform {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  if (!firstSegment) return DEFAULT_PLATFORM;
  if (firstSegment === 'lectureres') return 'lecturers';
  if (isPlatformPrefix(firstSegment)) return firstSegment as Platform;
  return DEFAULT_PLATFORM;
}

export function getPlatformBasename(platform: Platform): string {
  return platform === DEFAULT_PLATFORM ? '' : `/${platform}`;
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
