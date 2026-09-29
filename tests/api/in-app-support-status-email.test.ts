import { describe, expect, it } from 'vitest';
import {
  allowedInAppSupportSiteOrigin,
  buildInAppSupportStatusEmail,
  inAppSupportStatusOrigin,
  inAppSupportStatusSignature,
} from '../../api/_lib/inAppSupportStatusEmail';

const ticket = {
  id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
  reporter_name: 'Jonas',
  reporter_email: 'jonas@example.com',
  title: 'Pamokos sukūrimo klaida',
  page: '/school/groups?private=123',
  locale: 'lt',
  status: 'registered' as const,
  target_date: null,
  status_updated_at: '2026-09-29T12:00:00Z',
  status_notified_signature: null,
};

describe('support ticket status emails', () => {
  it('confirms registration with an authenticated tracking link', () => {
    const email = buildInAppSupportStatusEmail(ticket, 'https://tutlio.lt');
    expect(email.subject).toContain('SUP-17EE7859');
    expect(email.html).toContain('Jūsų ticketas užregistruotas');
    expect(email.trackingUrl).toBe('https://tutlio.lt/school/support/tickets?ticket=17ee7859-5c8a-4fba-9dbd-9259ccad28f4');
    expect(email.html).not.toContain('private=123');
  });

  it('includes the deadline only for an in-progress ticket and changes the notification signature', () => {
    const inProgress = { ...ticket, status: 'in_progress' as const, target_date: '2026-10-05T12:00:00Z' };
    const email = buildInAppSupportStatusEmail(inProgress, 'https://tutlio.lt');
    expect(email.html).toContain('Planuojamas terminas');
    expect(inAppSupportStatusSignature(inProgress)).not.toBe(inAppSupportStatusSignature(ticket));
  });

  it('uses only the original allowlisted site origin for reporter status links', () => {
    expect(allowedInAppSupportSiteOrigin('https://tutlio.pl')).toBe('https://tutlio.pl');
    expect(allowedInAppSupportSiteOrigin('https://tutlio.com')).toBe('https://tutlio.com');
    expect(allowedInAppSupportSiteOrigin('https://tutlio.lt.attacker.example')).toBeNull();
    expect(allowedInAppSupportSiteOrigin('https://tutlio.lt/redirect')).toBeNull();
    const origin = inAppSupportStatusOrigin({ ...ticket, environment: { siteOrigin: 'https://tutlio.pl' } }, 'https://tutlio.lt');
    expect(buildInAppSupportStatusEmail(ticket, origin).trackingUrl).toBe(
      'https://tutlio.pl/school/support/tickets?ticket=17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
    );
    expect(inAppSupportStatusOrigin({ ...ticket, environment: { siteOrigin: 'https://evil.example' } }, 'https://tutlio.lt'))
      .toBe('https://tutlio.lt');
  });
});
