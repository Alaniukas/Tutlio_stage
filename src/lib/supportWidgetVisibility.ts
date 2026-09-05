/**
 * Landing routes, with or without a locale prefix ("/", "/lt", "/new-landing",
 * "/lt/new-landing", "/for-tutors"). Everything else on the marketing site - pricing, blog,
 * features, tutor pages, the quiz — is out of scope.
 */
const LANDING_PATHS = ['/', '/new-landing', '/for-tutors'];

/** Strip an optional leading locale segment ("/lt/new-landing" → "/new-landing"). */
function withoutLocalePrefix(pathname: string): string {
  const m = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(\/.*)?$/i);
  if (!m) return pathname;
  return m[2] || '/';
}

/** Drop a trailing slash so "/new-landing/" compares equal to "/new-landing". */
function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function isLandingPath(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return (
    LANDING_PATHS.includes(normalized) ||
    LANDING_PATHS.includes(normalizePath(withoutLocalePrefix(normalized)))
  );
}

/**
 * The public AI support widget is a sales nudge ("Not sure Tutlio fits you?"),
 * so it belongs on the landing page and nowhere else: not on the rest of the
 * marketing site, not in sign-in / registration / invited-customer flows, and
 * never for a signed-in tutor, student, parent or org admin.
 */
export function shouldHidePublicSupportWidget(options: {
  authReady: boolean;
  isSignedIn: boolean;
  pathname: string;
}): boolean {
  if (!options.authReady) return true;
  if (options.isSignedIn) return true;
  return !isLandingPath(options.pathname);
}
