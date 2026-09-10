import { describe, expect, it } from 'vitest';
import { provisionEmailsSent } from '@/lib/mvProvisionApi';

const account = {
  email: 'person@example.test',
  userId: 'user-1',
  emailSent: true,
  activationUrl: '',
};

describe('mvProvisionApi', () => {
  it('ignores a reused account when checking whether new login emails were sent', () => {
    expect(provisionEmailsSent({
      parent: { ...account, created: false, reused: true, emailSent: false },
      student: { ...account, userId: 'user-2', created: true },
    })).toBe(true);
  });

  it('does not claim an email was sent when no account was newly created', () => {
    expect(provisionEmailsSent({
      parent: { ...account, created: false, reused: true, emailSent: false },
    })).toBe(false);
  });
});
