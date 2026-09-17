import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));

import {
  buildInAppSupportCompletionEmail,
  sendInAppSupportCompletionEmail,
} from '../../api/_lib/inAppSupportCompletionEmail';

const baseInput = {
  id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
  reference: 'SUP-17EE7859',
  reporterName: 'Marta',
  reporterEmail: 'marta@example.com',
  category: 'bug' as const,
  title: 'Support popup loses the draft',
  locale: 'en',
  appUrl: 'https://tutlio.lt',
};

describe('in-app support completion email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
    vi.stubEnv('APP_URL', 'https://tutlio.lt');
    mocks.send.mockResolvedValue({ data: { id: 'completion-email-1' }, error: null });
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['en', 'Your reported issue is fixed!'],
    ['lt-LT', 'Jūsų pranešta klaida ištaisyta!'],
    ['nl', 'Het gemelde probleem is opgelost!'],
    ['pl', 'Zgłoszony problem został naprawiony!'],
  ])('provides friendly branded bug copy in %s', (locale, heading) => {
    const email = buildInAppSupportCompletionEmail({ ...baseInput, locale });

    expect(email.html).toContain(heading);
    expect(email.html).toContain('https://tutlio.lt/quiz/tutlio-logo.webp');
    expect(email.html).toContain('MB Tutlio');
    expect(email.html).toContain('Best regards,');
    expect(email.html).toContain('<strong>Simonas and Alanas</strong>');
    expect(email.html).toContain('Tutlio Team');
    expect(email.html).toContain('SUP-17EE7859');
  });

  it('uses feature-specific copy and escapes reporter-controlled values', () => {
    const email = buildInAppSupportCompletionEmail({
      ...baseInput,
      reporterName: '<img src=x onerror=alert(1)>',
      title: '<script>alert(1)</script>',
      category: 'feature',
      locale: 'nl-NL',
    });

    expect(email.subject).toContain('je Tutlio-idee is nu beschikbaar');
    expect(email.html).toContain('Je idee is nu beschikbaar!');
    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('sends only to the stored reporter with a request-scoped idempotency key', async () => {
    await expect(sendInAppSupportCompletionEmail({
      id: baseInput.id,
      reference: baseInput.reference,
      reporterName: baseInput.reporterName,
      reporterEmail: baseInput.reporterEmail,
      category: baseInput.category,
      title: baseInput.title,
      locale: baseInput.locale,
    })).resolves.toBe('completion-email-1');

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'marta@example.com',
        replyTo: expect.arrayContaining(['simas0423@gmail.com', 'alaniukasa@gmail.com']),
        subject: expect.stringContaining('issue you reported is fixed'),
      }),
      { idempotencyKey: `in-app-support-completed-${baseInput.id}` },
    );
  });
});
