/**
 * Public AI support is for anonymous visitors (landing, blog, pricing, …).
 * Logged-in tutors, students, parents, and org admins should not see it —
 * including if they open a marketing page in the same browser session.
 */
export function shouldHidePublicSupportWidget(options: {
  authReady: boolean;
  isSignedIn: boolean;
  pathname: string;
}): boolean {
  if (!options.authReady) return true;
  if (options.isSignedIn) return true;
  if (options.pathname.includes('/embed/')) return true;
  if (options.pathname.startsWith('/preview/')) return true;
  return false;
}
