import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuizFunnel from '../../src/pages/QuizFunnel';

vi.mock('@/lib/analytics', () => ({ getStoredUtm: () => ({ utm_source: 'test' }) }));
vi.mock('@/components/pricing/TutorPlanCards', () => ({
  default: ({ checkoutMode, hostedCancelPath, ctaLabel }: {
    checkoutMode?: string;
    hostedCancelPath?: string;
    ctaLabel?: string;
  }) => (
    <div
      data-testid="tutor-plan-cards"
      data-checkout-mode={checkoutMode}
      data-hosted-cancel-path={hostedCancelPath}
    >
      {ctaLabel}
    </div>
  ),
}));
vi.mock('@/components/pricing/EnterprisePlanCard', () => ({
  default: ({ contactLabel, onBookDemo }: { contactLabel?: string; onBookDemo: () => void }) => (
    <div data-testid="enterprise-plan-card">
      enterprise-plan-card
      <button type="button" onClick={onBookDemo}>{contactLabel}</button>
    </div>
  ),
}));
vi.mock('@/components/EnterpriseContactModal', () => ({
  default: () => null,
}));
vi.mock('@/components/landing/v2/HeroAnimation', () => ({
  default: ({ audience }: { audience: string }) => (
    <div data-testid={`landing-product-demo-${audience}`}>{audience}</div>
  ),
}));
vi.mock('@/components/landing/v2/TabletFrame', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="landing-tablet-frame">{children}</div>
  ),
}));

vi.mock('@/lib/i18n', () => ({
  buildLocalizedPath: (path: string) => path,
  loadLocaleDict: () => Promise.resolve(),
  localizedPagePath: (page: string) => page === 'contacts' ? '/contacts' : '/about',
  useTranslation: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      let value = key;
      for (const [name, replacement] of Object.entries(params ?? {})) {
        value = value.replace(`{${name}}`, String(replacement));
      }
      return value;
    },
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function NavigationStateProbe() {
  const location = useLocation();
  return <output data-testid="navigation-state">{JSON.stringify(location.state)}</output>;
}

function renderQuiz(initialPath = '/en/quiz') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/quiz" element={<QuizFunnel />} />
        <Route path="/quiz/:audience/:step" element={<QuizFunnel />} />
        <Route path="/:locale/quiz" element={<QuizFunnel />} />
        <Route path="/:locale/quiz/:audience/:step" element={<QuizFunnel />} />
        <Route path="/privacy-policy" element={<div>privacy-policy</div>} />
        <Route path="/terms" element={<div>terms</div>} />
        <Route path="/dpa" element={<div>dpa</div>} />
      </Routes>
      <LocationProbe />
      <NavigationStateProbe />
    </MemoryRouter>,
  );
}

function expectPath(path: string) {
  expect(screen.getByTestId('location').textContent).toBe(path);
}

function chooseFirstAnswer() {
  const radios = screen.queryAllByRole('radio');
  if (radios.length > 0) {
    fireEvent.click(radios[0]);
    act(() => vi.advanceTimersByTime(400));
    return;
  }

  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getByTestId('floating-proceed'));
}

describe('QuizFunnel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('renders the canonical default-locale route without a locale prefix', () => {
    renderQuiz('/quiz');
    expectPath('/quiz');
    expect(screen.getByRole('button', { name: /quiz\.audience\.solo\.title/ })).toBeTruthy();
    expect(screen.getByTestId('trustpilot-stars').children).toHaveLength(5);
  });

  it('lets users select multiple workflow bottlenecks before continuing', () => {
    renderQuiz('/en/quiz/company/challenge');
    const options = screen.getAllByRole('checkbox');
    const continueButton = screen.getByTestId('floating-proceed') as HTMLButtonElement;

    expect(options).toHaveLength(5);
    expect(continueButton.disabled).toBe(true);

    fireEvent.click(options[0]);
    fireEvent.click(options[2]);
    act(() => vi.advanceTimersByTime(500));

    expect(options[0].getAttribute('aria-checked')).toBe('true');
    expect(options[2].getAttribute('aria-checked')).toBe('true');
    expectPath('/en/quiz/company/challenge');
    expect(continueButton.disabled).toBe(false);

    fireEvent.click(continueButton);
    expectPath('/en/quiz/company/insight');
  });

  it('does not block the offer when lead storage asks the client to retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202 }));
    renderQuiz('/en/quiz/company/email');

    fireEvent.change(screen.getByLabelText('quiz.email.label'), {
      target: { value: 'buyer@example.com' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /quiz.email.cta/ }));
      await Promise.resolve();
    });

    expectPath('/en/quiz/company/offer');
    expect(screen.queryByText('quiz.email.error')).toBeNull();
    expect(JSON.parse(window.sessionStorage.getItem('tutlio_quiz_v2_company') || '{}'))
      .toMatchObject({ leadCaptured: false, leadPending: true });

    await act(async () => {
      vi.advanceTimersByTime(1300);
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the quiz logo non-interactive and preserves the exact email step for legal navigation', () => {
    renderQuiz('/en/quiz/company/email?source=campaign#email-form');

    expect(screen.getByText('Tutlio').closest('a')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'quiz.email.privacyLink' }));

    expectPath('/privacy-policy');
    expect(screen.getByTestId('navigation-state').textContent).toBe(
      JSON.stringify({ returnTo: '/en/quiz/company/email?source=campaign#email-form' }),
    );
  });

  it.each([
    ['legal.termsOfService', '/terms'],
    ['legal.privacyPolicy', '/privacy-policy'],
    ['legal.dpa', '/dpa'],
  ])('preserves the exact offer step when opening %s', (linkName, destination) => {
    renderQuiz('/en/quiz/solo/offer?source=campaign#plans');

    expect(screen.getByText('Tutlio').closest('a')).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: linkName }));

    expectPath(destination);
    expect(screen.getByTestId('navigation-state').textContent).toBe(
      JSON.stringify({ returnTo: '/en/quiz/solo/offer?source=campaign#plans' }),
    );
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([
    ['solo', 'quiz.audience.solo.title', 'quiz.offer.solo.name'],
    ['company', 'quiz.audience.company.title', 'quiz.offer.company.name'],
    ['school', 'quiz.audience.school.title', 'quiz.offer.school.name'],
  ])('completes the URL-driven %s branch and shows its dedicated offer', async (audience, audienceLabel, offerName) => {
    renderQuiz();

    expect(screen.queryByRole('button', { name: /quiz.hero.cta/ })).toBeNull();
    expect(document.querySelector('img[src="/quiz/privacy-gdpr.webp"]')).toBeTruthy();
    expect(document.querySelector(`img[src="/quiz/audience-${audience}.webp"]`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(audienceLabel) }));
    expectPath(`/en/quiz/${audience}/welcome`);
    expect(screen.getByAltText(`quiz.intro.${audience}.visualAlt`).getAttribute('src')).toBe(
      `/quiz/welcome-${audience}.webp`,
    );
    expect(screen.getByAltText(`quiz.intro.${audience}.visualAlt`).getAttribute('loading')).toBe('lazy');
    expect(screen.queryByText('quiz.intro.insightLabel')).toBeNull();
    expect(screen.getByTestId('floating-proceed')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /quiz.common.continue/ }));
    expectPath(`/en/quiz/${audience}/volume`);
    chooseFirstAnswer();
    expectPath(`/en/quiz/${audience}/challenge`);
    chooseFirstAnswer();
    expectPath(`/en/quiz/${audience}/insight`);
    expect(screen.getByTestId('landing-tablet-frame')).toBeTruthy();
    const insightTitle = screen.getByText(`quiz.info.insight.${audience}.title`);
    const productDemo = screen.getByTestId(`landing-product-demo-${audience === 'solo' ? 'solo' : 'biz'}`);
    expect(productDemo).toBeTruthy();
    expect(Boolean(insightTitle.compareDocumentPosition(productDemo) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.queryByText('quiz.visual.demoTitle')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /quiz.common.continue/ }));
    expectPath(`/en/quiz/${audience}/admin-time`);
    chooseFirstAnswer();
    expectPath(`/en/quiz/${audience}/story`);

    expect(screen.queryByText(`quiz.info.story.${audience}.disclosure`)).toBeNull();
    if (audience === 'solo') {
      expect(screen.getByText('quiz.info.story.solo.name1')).toBeTruthy();
      expect(screen.getByText('quiz.info.story.solo.name2')).toBeTruthy();
      expect(document.querySelector('img[src="/quiz/solo-tutor-rasa.webp"]')).toBeTruthy();
      expect(document.querySelector('img[src="/quiz/solo-tutor-mantas.webp"]')).toBeTruthy();
    } else {
      expect(screen.getByAltText(`quiz.info.story.${audience}.brandAlt`)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole('button', { name: /quiz.common.continue/ }));
    if (audience === 'solo') {
      expectPath('/en/quiz/solo/business-card');
      expect(screen.getByAltText('quiz.businessCard.previewAlt').getAttribute('src')).toBe(
        '/social/business-card-facebook/en-digital-business-card-facebook.webp',
      );
      expect(screen.queryByText('quiz.businessCard.previewLabel')).toBeNull();
      expect(screen.getByText('quiz.businessCard.benefit1.title')).toBeTruthy();
      expect(screen.getByRole('list', { name: 'quiz.businessCard.benefitsLabel' })).toBeTruthy();
      expect(document.querySelectorAll('[data-quiz-benefit-icon]')).toHaveLength(3);
      expect(
        Array.from(document.querySelectorAll('[data-quiz-benefit-icon]'))
          .map((icon) => icon.getAttribute('data-quiz-benefit-icon')),
      ).toEqual(['share-link', 'offer-page', 'instant-booking']);
      expect(screen.getByTestId('floating-proceed')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /quiz.businessCard.cta/ }));
    }
    expectPath(`/en/quiz/${audience}/tools`);
    chooseFirstAnswer();
    expectPath(`/en/quiz/${audience}/assurance`);
    expect(screen.getByRole('list', { name: 'quiz.info.keyPoints' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /quiz.common.continue/ }));
    if (audience === 'solo') {
      expectPath(`/en/quiz/${audience}/goal`);
    } else {
      expectPath(`/en/quiz/${audience}/custom-fit`);
      expect(screen.getByText(`quiz.info.custom-fit.${audience}.title`)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /quiz.common.continue/ }));
      expectPath(`/en/quiz/${audience}/goal`);
    }
    chooseFirstAnswer();
    expectPath(`/en/quiz/${audience}/analysis`);
    expect(screen.getByTestId('recommendation-analysis-visual')).toBeTruthy();

    act(() => vi.advanceTimersByTime(2000));
    expectPath(`/en/quiz/${audience}/analysis`);
    act(() => vi.advanceTimersByTime(2700));
    expectPath(`/en/quiz/${audience}/transformation`);
    expect(screen.getByText(`quiz.transformation.${audience}.title`)).toBeTruthy();
    expect(screen.getByText(`quiz.transformation.${audience}.after1Title`)).toBeTruthy();
    expect(screen.getAllByText('quiz.transformation.beforeLevel')).toHaveLength(3);
    expect(screen.getAllByText('quiz.transformation.afterLevel')).toHaveLength(3);
    expect(screen.getByAltText('quiz.transformation.beforeIllustrationAlt').getAttribute('src')).toBe(
      '/quiz/transformation-before-v3.webp',
    );
    expect(screen.getByAltText('quiz.transformation.afterIllustrationAlt').getAttribute('src')).toBe(
      '/quiz/transformation-after.webp',
    );
    expect(screen.getByTestId('floating-proceed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /quiz.transformation.cta/ }));
    expectPath(`/en/quiz/${audience}/email`);
    expect(screen.queryByText('quiz.email.previewTitle')).toBeNull();
    expect(screen.getByTestId('recommendation-email-visual')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('quiz.email.label'), { target: { value: 'buyer@example.com' } });
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /quiz.email.cta/ }));
      await Promise.resolve();
    });

    expectPath(`/en/quiz/${audience}/offer`);
    expect(screen.getByText(offerName)).toBeTruthy();
    expect(screen.getByTestId('offer-sticky-cta')).toBeTruthy();
    expect(document.querySelector('img[src="/quiz/offer-workload.webp"]')).toBeTruthy();
    expect(screen.getByText(`quiz.offer.savings.total.${audience}`)).toBeTruthy();
    expect(screen.queryByText('quiz.offer.savings.disclaimer')).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/landing-lead', expect.objectContaining({ method: 'POST' }));
  });

  it.each(['solo', 'company', 'school'])('supports a direct link to the %s offer', (audience) => {
    renderQuiz(`/en/quiz/${audience}/offer`);
    expectPath(`/en/quiz/${audience}/offer`);
    expect(screen.getByText(`quiz.offer.${audience}.name`)).toBeTruthy();
    expect(screen.queryByText(`quiz.offer.${audience}.label`)).toBeNull();
    expect(screen.getByTestId('offer-sticky-cta')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /quiz.offer.getTutlio/ })).toHaveLength(2);
    expect(document.querySelector('img[src="/quiz/offer-workload.webp"]')).toBeTruthy();
    expect(screen.getByText(`quiz.offer.savings.total.${audience}`)).toBeTruthy();
    expect(screen.getByText(`quiz.offer.savings.${audience}.item1.value`)).toBeTruthy();
    expect(document.getElementById('quiz-offer-action')).toBeTruthy();
    expect(screen.queryByText('quiz.result.focusLabel')).toBeNull();
    expect(screen.queryByText('quiz.result.matchedToAnswer')).toBeNull();
    expect(screen.getByText(`quiz.offer.testimonials.title.${audience}`)).toBeTruthy();
    const testimonialDots = screen.getAllByRole('button', { name: /quiz.offer.testimonials.goTo/ });
    expect(testimonialDots).toHaveLength(4);
    expect(screen.queryByText(`quiz.offer.${audience}.eyebrow`)).toBeNull();
    expect(screen.queryByText('quiz.offer.testimonials.eyebrow')).toBeNull();
    expect(screen.queryByText('quiz.result.bestFitLabel')).toBeNull();
    expect(screen.queryByText('quiz.offer.savings.eyebrow')).toBeNull();
    expect(screen.queryByText('quiz.result.restart')).toBeNull();
    expect(screen.getByRole('link', { name: 'legal.termsOfService' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'legal.privacyPolicy' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'legal.dpa' })).toBeTruthy();
    expect(screen.getByText('quiz.offer.footer.madeWithLove')).toBeTruthy();
    if (audience === 'solo') {
      expect(screen.getByTestId('tutor-plan-cards').getAttribute('data-checkout-mode')).toBe('embedded');
      expect(screen.getByTestId('tutor-plan-cards').getAttribute('data-hosted-cancel-path'))
        .toBe('/en/quiz/solo/offer');
      expect(screen.getByTestId('tutor-plan-cards').textContent).toBe('quiz.offer.startFreeNow');
      expect(screen.queryByTestId('enterprise-plan-card')).toBeNull();
      expect(screen.getByText('quiz.offer.guarantee.title')).toBeTruthy();
      expect(screen.queryByText('quiz.offer.guarantee.eyebrow')).toBeNull();
      expect(document.querySelector('img[src="/quiz/money-back-guarantee.webp"]')).toBeTruthy();
      expect(document.querySelector('img[src="/quiz/solo-tutor-rasa.webp"]')).toBeTruthy();
      fireEvent.click(testimonialDots[2]);
      expect(document.querySelector('img[src="/quiz/solo-tutor-ieva.webp"]')).toBeTruthy();
    } else if (audience === 'company') {
      expect(screen.getByTestId('enterprise-plan-card')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'quiz.offer.bookCall' })).toBeTruthy();
      expect(screen.getByText('quiz.offer.guarantee.title')).toBeTruthy();
      expect(screen.queryByText('quiz.offer.guarantee.eyebrow')).toBeNull();
      expect(document.querySelector('img[src="/quiz/proklase.webp"]')).toBeTruthy();
    } else {
      expect(screen.queryByTestId('enterprise-plan-card')).toBeNull();
      expect(screen.getByRole('button', { name: /quiz.offer.bookCall/ })).toBeTruthy();
      expect(screen.queryByText('quiz.offer.guarantee.title')).toBeNull();
      expect(document.querySelector('img[src="/quiz/laisvi-vaikai-logo.webp"]')).toBeTruthy();
    }
  });

  it('preserves the exact quiz offer query and hash for hosted Stripe cancellation', () => {
    renderQuiz('/en/quiz/solo/offer?source=quiz#plans');

    expect(screen.getByTestId('tutor-plan-cards').getAttribute('data-hosted-cancel-path'))
      .toBe('/en/quiz/solo/offer?source=quiz#plans');
  });

  it('rotates solo testimonials automatically without a pause control', () => {
    renderQuiz('/en/quiz/solo/offer');
    expect(screen.getByText('quiz.info.story.solo.name1')).toBeTruthy();

    act(() => vi.advanceTimersByTime(5300));

    expect(screen.getByText('quiz.info.story.solo.name2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'quiz.offer.testimonials.pause' })).toBeNull();
  });

  it('scrolls the inline offer CTA to the pricing section', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    renderQuiz('/en/quiz/solo/offer');

    fireEvent.click(screen.getAllByRole('button', { name: /quiz.offer.getTutlio/ })[1]);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it.each(['solo', 'company', 'school'])('supports a direct link to the %s transformation', (audience) => {
    renderQuiz(`/en/quiz/${audience}/transformation`);
    expectPath(`/en/quiz/${audience}/transformation`);
    expect(screen.getByText(`quiz.transformation.${audience}.title`)).toBeTruthy();
    expect(screen.getAllByText('quiz.transformation.beforeLevel')).toHaveLength(3);
    expect(screen.getAllByText('quiz.transformation.afterLevel')).toHaveLength(3);
    expect(screen.getByAltText('quiz.transformation.beforeIllustrationAlt')).toBeTruthy();
    expect(screen.getByAltText('quiz.transformation.afterIllustrationAlt')).toBeTruthy();
    expect(screen.getByTestId('floating-proceed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /quiz.transformation.cta/ }));
    expectPath(`/en/quiz/${audience}/email`);
  });

  it.each([
    ['/en/quiz/solo/story', 2],
    ['/en/quiz/company/story', 1],
    ['/en/quiz/school/story', 1],
    ['/en/quiz/solo/offer', 1],
    ['/en/quiz/company/offer', 1],
    ['/en/quiz/school/offer', 1],
  ])('uses five Trustpilot-style stars for every testimonial on %s', (path, expectedGroups) => {
    renderQuiz(path);
    const ratings = screen.getAllByTestId('trustpilot-stars');
    expect(ratings).toHaveLength(expectedGroups);
    ratings.forEach((rating) => expect(rating.children).toHaveLength(5));
  });

  it('shows four distinct tutoring organisations in the company offer testimonials', () => {
    renderQuiz('/en/quiz/company/offer');
    const dots = screen.getAllByRole('button', { name: /quiz.offer.testimonials.goTo/ });
    const expectedNames = [1, 2, 3, 4].map((number) => `quiz.offer.testimonial.company.name${number}`);
    const expectedImages = [
      '/quiz/proklase.webp',
      '/quiz/testimonial-logos/company-independent-centre.png',
      '/quiz/testimonial-logos/company-language-studio.png',
      '/quiz/testimonial-logos/company-exam-academy.png',
    ];

    expectedNames.forEach((name, index) => {
      fireEvent.click(dots[index]);
      expect(screen.getByText(name)).toBeTruthy();
      expect(screen.getByTestId('trustpilot-stars').children).toHaveLength(5);
      expect(document.querySelector(`img[src="${expectedImages[index]}"]`)).toBeTruthy();
    });

    expect(new Set(expectedNames).size).toBe(4);
  });

  it('shows four distinct school organisations in the school offer testimonials', () => {
    renderQuiz('/en/quiz/school/offer');
    const dots = screen.getAllByRole('button', { name: /quiz.offer.testimonials.goTo/ });
    const expectedNames = [1, 2, 3, 4].map((number) => `quiz.offer.testimonial.school.name${number}`);
    const expectedImages = [
      '/quiz/laisvi-vaikai-logo.webp',
      '/quiz/testimonial-logos/school-community.png',
      '/quiz/testimonial-logos/school-after-school-centre.png',
      '/quiz/testimonial-logos/school-arts-education.png',
    ];

    expectedNames.forEach((name, index) => {
      fireEvent.click(dots[index]);
      expect(screen.getByText(name)).toBeTruthy();
      expect(screen.getByTestId('trustpilot-stars').children).toHaveLength(5);
      expect(document.querySelector(`img[src="${expectedImages[index]}"]`)).toBeTruthy();
    });

    expect(new Set(expectedNames).size).toBe(4);
  });

  it.each([
    ['/en/quiz/solo/welcome', 'quiz.common.continue'],
    ['/en/quiz/solo/insight', 'quiz.common.continue'],
    ['/en/quiz/solo/story', 'quiz.common.continue'],
    ['/en/quiz/solo/business-card', 'quiz.businessCard.cta'],
    ['/en/quiz/company/custom-fit', 'quiz.common.continue'],
    ['/en/quiz/school/assurance', 'quiz.common.continue'],
  ])('keeps the proceed action visible on content-heavy step %s', (path, label) => {
    renderQuiz(path);

    const floatingProceed = screen.getByTestId('floating-proceed');
    expect(floatingProceed).toBeTruthy();
    expect(floatingProceed.tagName).toBe('BUTTON');
    expect(floatingProceed.textContent).toContain(label);
  });

  it.each(['lt', 'pl', 'ee', 'nl'])(
    'uses the route locale for the %s business-card preview',
    (locale) => {
      renderQuiz(`/${locale}/quiz/solo/business-card`);
      expectPath(`/${locale}/quiz/solo/business-card`);
      expect(screen.getByAltText('quiz.businessCard.previewAlt').getAttribute('src')).toBe(
        `/social/business-card-facebook/${locale}-digital-business-card-facebook.webp`,
      );
    },
  );

  it('does not expose the solo business-card step inside an organisation branch', () => {
    renderQuiz('/en/quiz/company/business-card');
    expectPath('/en/quiz');
  });
});
