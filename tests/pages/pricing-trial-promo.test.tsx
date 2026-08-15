import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Pricing from '../../src/pages/Pricing';

const fetchMock = vi.fn();

const copy: Record<string, string> = {
  'pricing.freeTrial': '7-day free trial',
  'pricing.start7DayTrial': 'Start 7-day trial',
  'pricing.faq.trialQ': 'How does the 7-day free trial work?',
  'pricing.faq.trialA': 'You will not be charged for 7 days.',
  'subscribe.extendedTrialCodeApplied': 'Code applied: your free trial will last 14 days',
};

vi.mock('@/lib/i18n', () => ({
  buildLocalizedPath: (path: string) => path,
  useTranslation: () => ({
    locale: 'fr',
    t: (key: string) => copy[key] || key,
  }),
}));

vi.mock('@/contexts/PlatformContext', () => ({
  usePlatform: () => ({ platform: 'tutors' }),
}));

vi.mock('@/components/LandingNavbar', () => ({ default: () => null }));
vi.mock('@/components/LandingFooter', () => ({ default: () => null }));
vi.mock('@/components/EnterpriseContactModal', () => ({ default: () => null }));
vi.mock('@/components/pricing/EnterprisePlanCard', () => ({ default: () => null }));
vi.mock('@/lib/documentMeta', () => ({ applyPageDocumentMeta: vi.fn() }));
vi.mock('@/lib/seoMeta', () => ({
  getSeoMeta: () => ({ title: 'Pricing', description: 'Pricing' }),
}));
vi.mock('@/lib/pricingDisplay', () => ({
  showPerMonthSuffix: () => true,
  tutorPlanPriceLabels: {
    monthly: () => '€19.99',
    yearlyPerMonth: () => '€14.99',
    subscriptionOnly: () => '€9.99',
  },
}));

function renderPricing(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Pricing />
    </MemoryRouter>,
  );
}

async function startMonthlyCheckout() {
  fireEvent.click(screen.getAllByRole('button', { name: 'pricing.startNow' })[0]);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  return JSON.parse(fetchMock.mock.calls[0][1].body as string);
}

describe('localized pricing trial promotion', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('passes TRIAL14D from a localized campaign URL and displays 14-day copy', async () => {
    renderPricing('/fr/pricing?promo=trial14d');

    expect(screen.getByText('Code applied: your free trial will last 14 days')).toBeTruthy();
    expect(screen.getByText('14-day free trial')).toBeTruthy();
    expect(screen.getByText('Start 14-day trial')).toBeTruthy();
    expect(screen.getByText('How does the 14-day free trial work?')).toBeTruthy();

    const body = await startMonthlyCheckout();
    expect(body).toMatchObject({ plan: 'monthly', locale: 'fr', couponCode: 'TRIAL14D' });
  });

  it('keeps the ordinary pricing URL on the default 7-day checkout', async () => {
    renderPricing('/pricing');

    expect(screen.getByText('7-day free trial')).toBeTruthy();
    expect(screen.getByText('Start 7-day trial')).toBeTruthy();
    expect(screen.queryByText('Code applied: your free trial will last 14 days')).toBeNull();

    const body = await startMonthlyCheckout();
    expect(body).toMatchObject({ plan: 'monthly', locale: 'fr' });
    expect(body).not.toHaveProperty('couponCode');
  });
});
