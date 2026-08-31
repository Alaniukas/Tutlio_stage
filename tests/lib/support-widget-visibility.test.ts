import { describe, expect, it } from 'vitest';
import { shouldHidePublicSupportWidget } from '../../src/lib/supportWidgetVisibility';

describe('shouldHidePublicSupportWidget', () => {
  it('hides until auth has resolved so a logged-in app user never sees a flash', () => {
    expect(shouldHidePublicSupportWidget({
      authReady: false,
      isSignedIn: false,
      pathname: '/',
    })).toBe(true);
  });

  it('hides for any signed-in user, including on marketing pages', () => {
    expect(shouldHidePublicSupportWidget({
      authReady: true,
      isSignedIn: true,
      pathname: '/',
    })).toBe(true);
    expect(shouldHidePublicSupportWidget({
      authReady: true,
      isSignedIn: true,
      pathname: '/pricing',
    })).toBe(true);
  });

  it('shows for anonymous visitors on public pages', () => {
    expect(shouldHidePublicSupportWidget({
      authReady: true,
      isSignedIn: false,
      pathname: '/',
    })).toBe(false);
    expect(shouldHidePublicSupportWidget({
      authReady: true,
      isSignedIn: false,
      pathname: '/lt/blog',
    })).toBe(false);
    expect(shouldHidePublicSupportWidget({
      authReady: true,
      isSignedIn: false,
      pathname: '/login',
    })).toBe(false);
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
});
