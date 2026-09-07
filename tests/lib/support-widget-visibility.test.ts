import { describe, expect, it } from 'vitest';
import { isLandingPath, shouldHidePublicSupportWidget } from '../../src/lib/supportWidgetVisibility';

describe('shouldHidePublicSupportWidget', () => {
  it('hides until auth has resolved so a logged-in app user never sees a flash', () => {
    expect(shouldHidePublicSupportWidget({
      authReady: false,
      isSignedIn: false,
      pathname: '/',
    })).toBe(true);
  });

  it('hides for any signed-in user, including on the landing page', () => {
    expect(shouldHidePublicSupportWidget({
      authReady: true,
      isSignedIn: true,
      pathname: '/',
    })).toBe(true);
    expect(shouldHidePublicSupportWidget({
      authReady: true,
      isSignedIn: true,
      pathname: '/lt',
    })).toBe(true);
  });

  it('shows for anonymous visitors on the landing page in every locale', () => {
    for (const pathname of ['/', '/lt', '/en/', '/new-landing', '/lt/new-landing']) {
      expect(shouldHidePublicSupportWidget({
        authReady: true,
        isSignedIn: false,
        pathname,
      }), pathname).toBe(false);
    }
  });

  it('hides on every other marketing page', () => {
    for (const pathname of [
      '/pricing',
      '/lt/pricing',
      '/blog',
      '/lt/blog',
      '/blog/some-post',
      '/features',
      '/features/scheduling',
      '/about',
      '/apie-mus',
      '/kontaktai',
      '/quiz',
      '/quiz/parent/1',
      '/korepetitorius/jonas',
      '/tutor/jonas',
      '/privacy-policy',
      '/terms',
    ]) {
      expect(shouldHidePublicSupportWidget({ authReady: true, isSignedIn: false, pathname }), pathname).toBe(true);
    }
  });

  it('hides the sales nudge on sign-in, registration and invited-customer flows', () => {
    for (const pathname of [
      '/login',
      '/lt/login',
      '/register',
      '/parent-register',
      '/en/parent-register',
      '/school/login',
      '/company/login',
      '/reset-password',
      '/auth/callback',
      '/book/abc123',
      '/school-sign',
      '/school-sign/return',
      '/school-extra-lessons-accept',
      '/school-contract-complete',
      '/school-payment-success',
      '/unsubscribe',
    ]) {
      expect(shouldHidePublicSupportWidget({ authReady: true, isSignedIn: false, pathname }), pathname).toBe(true);
    }
  });

  it('still hides embed and local preview routes for guests', () => {
    expect(shouldHidePublicSupportWidget({
      authReady: true,
      isSignedIn: false,
      pathname: '/embed/org-login',
    })).toBe(true);
    expect(shouldHidePublicSupportWidget({
      authReady: true,
      isSignedIn: false,
      pathname: '/preview/assign-student-modal',
    })).toBe(true);
  });

  it('matches only the landing routes, not paths that merely start with them', () => {
    expect(isLandingPath('/')).toBe(true);
    expect(isLandingPath('/new-landing')).toBe(true);
    expect(isLandingPath('/new-landing-editor')).toBe(false);
    expect(isLandingPath('/landing-editor')).toBe(false);
    expect(isLandingPath('/dashboard')).toBe(false);
  });
});
