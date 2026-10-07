import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));

import {
  allowedInAppSupportSiteOrigin,
  buildInAppSupportStatusEmail,
  inAppSupportStatusOrigin,
  inAppSupportStatusSignature,
  notifyInAppSupportStatus,
} from '../../api/_lib/inAppSupportStatusEmail';

const ticket = {
  id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
  reporter_name: 'Jonas',
  reporter_email: 'jonas@example.com',
  category: 'bug' as const,
  title: 'Pamokos sukūrimo klaida',
  page: '/school/groups?private=123',
  locale: 'lt',
  status: 'registered' as const,
  target_date: null,
  status_updated_at: '2026-09-29T12:00:00Z',
  status_notified_signature: null,
};

function database(errors: Array<Error | null> = []) {
  const updates: Record<string, unknown>[] = [];
  const query = {
    update: vi.fn((patch: Record<string, unknown>) => { updates.push(patch); return query; }),
    eq: vi.fn(() => query),
    then: (resolve: (result: { error: Error | null }) => unknown) => (
      Promise.resolve({ error: errors.shift() || null }).then(resolve)
    ),
  };
  const from = vi.fn(() => query);
  return { client: { from } as unknown as SupabaseClient, from, query, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockReset();
  mocks.send.mockResolvedValue({ data: { id: 'status-email-1' }, error: null });
  vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
  vi.stubEnv('APP_URL', 'https://tutlio.lt');
});

afterEach(() => vi.unstubAllEnvs());

describe('support ticket status emails', () => {
  it('confirms registration with an authenticated tracking link', () => {
    const email = buildInAppSupportStatusEmail(ticket, 'https://tutlio.lt');
    expect(email.subject).toContain('SUP-17EE7859');
    expect(email.html).toContain('Jūsų klaida užregistruota');
    expect(email.trackingUrl).toBe('https://tutlio.lt/school/support/tickets?ticket=17ee7859-5c8a-4fba-9dbd-9259ccad28f4');
    expect(email.html).not.toContain('private=123');
  });

  it('includes the deadline only for an in-progress ticket and changes the notification signature', () => {
    const inProgress = { ...ticket, status: 'in_progress' as const, target_date: '2026-10-05T12:00:00Z' };
    const email = buildInAppSupportStatusEmail(inProgress, 'https://tutlio.lt');
    expect(email.html).toContain('Planuojamas terminas');
    expect(inAppSupportStatusSignature(inProgress)).not.toBe(inAppSupportStatusSignature(ticket));
  });

  it.each([
    ['lt-LT', 'Jūsų pasiūlymas užregistruotas.', 'Jūsų pasiūlymas vykdomas.', 'Jūsų pasiūlymas įgyvendintas ir jau prieinamas Tutlio.'],
    ['en-US', 'Your feature request has been received.', 'We are implementing your requested feature.', 'Your requested feature has been implemented and is now available in Tutlio.'],
    ['pl', 'Otrzymaliśmy Twoją propozycję funkcji.', 'Pracujemy nad wdrożeniem zaproponowanej przez Ciebie funkcji.', 'Zaproponowana przez Ciebie funkcja została wdrożona i jest już dostępna w Tutlio.'],
    ['nl', 'Je functieverzoek is ontvangen.', 'We werken aan de implementatie van de door jou voorgestelde functie.', 'De door jou voorgestelde functie is geïmplementeerd en nu beschikbaar in Tutlio.'],
  ])('uses feature copy throughout the lifecycle in %s', (locale, registered, inProgress, resolved) => {
    for (const [status, text] of [
      ['registered', registered], ['in_progress', inProgress], ['resolved', resolved],
    ] as const) {
      const email = buildInAppSupportStatusEmail({ ...ticket, category: 'feature', locale, status }, 'https://tutlio.lt');
      expect(email.subject).toContain(text);
      expect(email.html).toContain(text);
      expect(email.html).toContain('SUP-17EE7859');
      expect(email.html).toContain(email.trackingUrl);
    }
  });

  it('keeps bug copy and existing notification signatures unchanged', () => {
    const resolved = { ...ticket, locale: 'en', status: 'resolved' as const };
    expect(buildInAppSupportStatusEmail(resolved, 'https://tutlio.lt').subject).toContain('Your ticket has been resolved.');
    expect(inAppSupportStatusSignature({ ...ticket, category: 'feature' })).toBe(inAppSupportStatusSignature(ticket));
  });

  it('shows a feature implementation deadline only while work is in progress', () => {
    const feature = {
      ...ticket, category: 'feature' as const, locale: 'en',
      status: 'in_progress' as const, target_date: '2026-10-05T12:00:00Z',
    };
    expect(buildInAppSupportStatusEmail(feature, 'https://tutlio.com').html).toContain('Expected deadline');
    expect(buildInAppSupportStatusEmail({ ...feature, status: 'resolved' }, 'https://tutlio.com').html)
      .not.toContain('Expected deadline');
  });

  it('escapes reporter-controlled values in feature notifications', () => {
    const email = buildInAppSupportStatusEmail({
      ...ticket, category: 'feature', reporter_name: '<img src=x>', title: '<script>unsafe</script>',
    }, 'https://tutlio.lt');
    expect(email.html).toContain('&lt;img src=x&gt;');
    expect(email.html).toContain('&lt;script&gt;unsafe&lt;/script&gt;');
    expect(email.html).not.toContain('<script>');
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

describe('support ticket status notification delivery', () => {
  it('sends a feature confirmation to the stored reporter with the original site tracking link', async () => {
    const db = database();
    const feature = { ...ticket, category: 'feature' as const, locale: 'en', environment: { siteOrigin: 'https://tutlio.pl' } };

    await expect(notifyInAppSupportStatus(db.client, feature)).resolves.toBe(true);

    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: ticket.reporter_email,
      subject: expect.stringContaining('Your feature request has been received.'),
      html: expect.stringContaining(`https://tutlio.pl/school/support/tickets?ticket=${ticket.id}`),
      replyTo: expect.arrayContaining(['simas0423@gmail.com', 'alaniukasa@gmail.com']),
    }), { idempotencyKey: `in-app-support-status-${ticket.id}-${inAppSupportStatusSignature(feature).slice(0, 24)}` });
    expect(db.updates).toEqual([expect.objectContaining({
      status_notified_signature: inAppSupportStatusSignature(feature),
      status_notification_email_id: 'status-email-1',
      status_notification_error: null,
    })]);
    expect(db.updates[0]).not.toHaveProperty('completion_notified_at');
    expect(db.from).toHaveBeenCalledWith('in_app_support_requests');
    expect(db.query.eq).toHaveBeenCalledWith('id', ticket.id);
    expect(db.query.eq).toHaveBeenCalledWith('status_updated_at', ticket.status_updated_at);
  });

  it('rejects an untrusted stored origin when sending a feature update', async () => {
    const db = database();
    await notifyInAppSupportStatus(db.client, {
      ...ticket, category: 'feature', environment: { siteOrigin: 'https://tutlio.lt.attacker.example' },
    });
    const [payload] = mocks.send.mock.calls[0];
    expect(payload.html).toContain(`https://tutlio.lt/school/support/tickets?ticket=${ticket.id}`);
    expect(payload.html).not.toContain('attacker.example');
  });

  it('records a single implemented-feature email as both status and completion notification', async () => {
    const db = database();
    const feature = { ...ticket, category: 'feature' as const, locale: 'en', status: 'resolved' as const };

    await notifyInAppSupportStatus(db.client, feature);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].subject).toContain('has been implemented and is now available in Tutlio');
    expect(db.updates).toEqual([expect.objectContaining({
      status_notified_at: expect.any(String),
      status_notification_email_id: 'status-email-1',
      completion_notified_at: expect.any(String),
      completion_notification_email_id: 'status-email-1',
    })]);
  });

  it('retains bug wording in the real notification sender', async () => {
    const db = database();
    await notifyInAppSupportStatus(db.client, { ...ticket, locale: 'en' });
    expect(mocks.send.mock.calls[0][0].subject).toContain('Your ticket has been registered.');
  });

  it('skips a status already recorded as delivered', async () => {
    const db = database();
    const feature = { ...ticket, category: 'feature' as const };
    await expect(notifyInAppSupportStatus(db.client, {
      ...feature, status_notified_signature: inAppSupportStatusSignature(feature),
    })).resolves.toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(db.updates).toEqual([]);
  });

  it('retries a failed feature email with the same idempotency key and stops after recorded delivery', async () => {
    const db = database();
    const feature = { ...ticket, category: 'feature' as const };
    mocks.send.mockResolvedValueOnce({ data: null, error: { message: 'Temporarily unavailable' } });

    await expect(notifyInAppSupportStatus(db.client, feature)).rejects.toThrow('Temporarily unavailable');
    expect(db.updates[0]).toEqual({ status_notification_error: 'Temporarily unavailable' });
    await expect(notifyInAppSupportStatus(db.client, feature)).resolves.toBe(true);
    expect(mocks.send.mock.calls[0][1]).toEqual(mocks.send.mock.calls[1][1]);
    expect(db.updates[1]).toMatchObject({ status_notification_error: null });
    await expect(notifyInAppSupportStatus(db.client, {
      ...feature, status_notified_signature: inAppSupportStatusSignature(feature),
    })).resolves.toBe(false);
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it('reuses the delivery key if recording a resolved feature email fails', async () => {
    const db = database([new Error('Database temporarily unavailable'), null, null]);
    const feature = { ...ticket, category: 'feature' as const, status: 'resolved' as const };

    await expect(notifyInAppSupportStatus(db.client, feature)).rejects.toThrow('Database temporarily unavailable');
    expect(db.updates[1]).toEqual({ status_notification_error: 'Database temporarily unavailable' });
    await expect(notifyInAppSupportStatus(db.client, feature)).resolves.toBe(true);
    expect(mocks.send.mock.calls[0][1]).toEqual(mocks.send.mock.calls[1][1]);
    expect(db.updates[2]).toMatchObject({
      status_notification_email_id: 'status-email-1', completion_notification_email_id: 'status-email-1',
    });
  });
});
