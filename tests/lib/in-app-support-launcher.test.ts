import { describe, expect, it } from 'vitest';
import { inAppSupportLauncherInsets } from '@/lib/inAppSupportLauncher';

describe('in-app support launcher layout', () => {
  it('keeps the tutor launcher above the safe area', () => {
    const insets = inAppSupportLauncherInsets('/dashboard');
    expect(insets.hasBottomNav).toBe(false);
    expect(insets.fabBottom).toContain('16px');
    expect(insets.panelBottom).toContain('92px');
  });

  it('lifts the launcher above student and parent bottom tab bars', () => {
    const student = inAppSupportLauncherInsets('/student/sessions');
    const parent = inAppSupportLauncherInsets('/parent/calendar');
    expect(student.hasBottomNav).toBe(true);
    expect(parent.hasBottomNav).toBe(true);
    expect(student.fabBottom).toContain('76px');
    expect(student.panelBottom).toContain('152px');
  });
});
