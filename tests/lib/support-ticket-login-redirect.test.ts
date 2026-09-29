import { describe, expect, it } from 'vitest';
import { supportTicketTrackingNextPath } from '@/lib/auth-redirects';

describe('support ticket login redirect', () => {
  it('keeps ticket deep links independent of the user’s current portal role', () => {
    const ticket = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';
    for (const path of [
      '/support/tickets',
      '/student/support/tickets',
      '/parent/support/tickets',
      '/company/support/tickets',
      '/school/support/tickets',
    ]) {
      expect(supportTicketTrackingNextPath(`${path}?ticket=${ticket}`)).toBe(`${path}?ticket=${ticket}`);
    }
  });

  it('does not make other destinations bypass portal-specific login checks', () => {
    expect(supportTicketTrackingNextPath('/student/sessions')).toBeNull();
    expect(supportTicketTrackingNextPath('/student/support')).toBeNull();
    expect(supportTicketTrackingNextPath('//attacker.example/support/tickets')).toBeNull();
    expect(supportTicketTrackingNextPath('https://attacker.example/support/tickets')).toBeNull();
  });
});
