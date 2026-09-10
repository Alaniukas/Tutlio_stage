import { describe, expect, it } from 'vitest';
import { resolveMvNotifyTargets } from '@/lib/mvProvisionOptions';

describe('resolveMvNotifyTargets', () => {
  it('defaults separate delivery to account emails', () => {
    expect(
      resolveMvNotifyTargets({
        emailDelivery: 'separate',
        parentAccountEmail: 'parent@example.com',
        studentAccountEmail: 'student@example.com',
      }),
    ).toEqual({
      parentTo: 'parent@example.com',
      studentTo: 'student@example.com',
    });
  });

  it('allows custom notify emails in separate mode', () => {
    expect(
      resolveMvNotifyTargets({
        emailDelivery: 'separate',
        parentAccountEmail: 'parent@example.com',
        studentAccountEmail: 'student@example.com',
        parentNotifyEmail: 'notify-parent@example.com',
        studentNotifyEmail: 'notify-student@example.com',
      }),
    ).toEqual({
      parentTo: 'notify-parent@example.com',
      studentTo: 'notify-student@example.com',
    });
  });

  it('sends both activation emails to parent inbox when parent_both', () => {
    expect(
      resolveMvNotifyTargets({
        emailDelivery: 'parent_both',
        parentAccountEmail: 'parent@example.com',
        studentAccountEmail: 'student@example.com',
        bothNotifyEmail: 'inbox@example.com',
      }),
    ).toEqual({
      parentTo: 'inbox@example.com',
      studentTo: 'inbox@example.com',
    });
  });
});
