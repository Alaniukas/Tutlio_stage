import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TutorPlanCards from '../../src/components/pricing/TutorPlanCards';

vi.mock('@/contexts/PlatformContext', () => ({
  usePlatform: () => ({ platform: 'tutor' }),
}));

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    locale: 'lt',
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/pricing/EmbeddedSubscriptionCheckoutDialog', () => ({
  default: ({ open, clientSecret, completionUrl }: {
    open: boolean;
    clientSecret: string | null;
    completionUrl: string | null;
  }) => (
    open ? <div data-testid="embedded-checkout-dialog">{clientSecret}|{completionUrl}</div> : null
  ),
}));

describe('TutorPlanCards embedded checkout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the embedded checkout dialog and keeps the visitor on the offer page', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        clientSecret: 'cs_test_embedded',
        publishableKey: 'pk_test_123',
        completionUrl: 'https://tutlio.lt/register?subscription_success=true&session_id=csess_test_123',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TutorPlanCards
        checkoutAudience="tutor"
        checkoutMode="embedded"
        hostedCancelPath="/quiz/solo/offer?source=quiz#plans"
        ctaLabel="Pradėti nemokamai dabar"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Pradėti nemokamai dabar' }));

    expect((await screen.findByTestId('embedded-checkout-dialog')).textContent).toBe(
      'cs_test_embedded|https://tutlio.lt/register?subscription_success=true&session_id=csess_test_123',
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      plan: 'monthly',
      locale: 'lt',
      audience: 'tutor',
      uiMode: 'embedded',
      cancelPath: '/quiz/solo/offer?source=quiz#plans',
    });
  });

  it('switches to the no-commission card and applies yearly billing to it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        clientSecret: 'cs_test_no_commission_yearly',
        publishableKey: 'pk_test_123',
        completionUrl: 'https://tutlio.lt/register?subscription_success=true&session_id=csess_test_456',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TutorPlanCards
        checkoutAudience="tutor"
        checkoutMode="embedded"
        isYearly
        showBillingToggle={false}
        ctaLabel="Pradėti nemokamai dabar"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'pricing.switchToNoCommission' }));
    expect(screen.getByText('pricing.subscriptionOnly')).toBeTruthy();
    expect(screen.getByText('pricing.saveTwentyFivePercent')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Pradėti nemokamai dabar' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      plan: 'subscription_only_yearly',
      locale: 'lt',
      audience: 'tutor',
      uiMode: 'embedded',
    });
  });
});
