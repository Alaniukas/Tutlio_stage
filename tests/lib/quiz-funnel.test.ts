import { describe, expect, it } from 'vitest';
import {
  getNextQuizStepImageAssets,
  getNextQuizStep,
  getPreviousQuizStep,
  getQuizBusinessCardImage,
  getQuizOption,
  getQuizQuestionForStep,
  getQuizQuestions,
  getQuizResultFeatures,
  getQuizStepImageAssets,
  getQuizStepSequence,
  isQuizAudience,
  isQuizStep,
  isQuizStepForAudience,
  QUIZ_BUSINESS_CARD_IMAGE_BY_LOCALE,
  QUIZ_STEP_SEQUENCE,
  type QuizAudience,
} from '../../src/lib/quizFunnel';

describe('quiz funnel branching', () => {
  it.each<QuizAudience>(['solo', 'company', 'school'])(
    'builds a complete %s path with shared workflow questions',
    (audience) => {
      const questions = getQuizQuestions(audience);

      expect(questions.map((question) => question.id)).toEqual([
        'volume',
        'friction',
        'adminTime',
        'tools',
        'priority',
      ]);
      expect(questions.every((question) => question.options.length >= 4)).toBe(true);
    },
  );

  it('keeps audience-specific volume and bottleneck options separate', () => {
    const solo = getQuizQuestions('solo');
    const company = getQuizQuestions('company');
    const school = getQuizQuestions('school');

    expect(getQuizOption(solo[0], 'starting')?.labelKey).toBe('quiz.option.solo.volume.starting');
    expect(getQuizOption(company[1], 'tutorPay')?.labelKey).toBe('quiz.option.company.friction.tutorPay');
    expect(getQuizOption(school[1], 'contracts')?.labelKey).toBe('quiz.option.school.friction.contracts');
    expect(getQuizOption(solo[1], 'contracts')).toBeUndefined();
    expect(solo[1].multiple).toBe(true);
    expect(company[1].multiple).toBe(true);
    expect(school[1].multiple).toBe(true);
  });

  it('places the selected bottleneck first in the recommendation', () => {
    expect(getQuizResultFeatures('solo', 'payments')[0].titleKey).toBe('quiz.feature.payments.title');
    expect(getQuizResultFeatures('company', 'tutorPay')[0].titleKey).toBe('quiz.feature.tutorPay.title');
    expect(getQuizResultFeatures('school', 'contracts')[0].titleKey).toBe('quiz.feature.contracts.title');
  });

  it('does not repeat a base feature when an offer is opened directly', () => {
    const features = getQuizResultFeatures('school', '');
    expect(features.map((feature) => feature.titleKey)).toEqual([
      'quiz.feature.schoolRecords.title',
      'quiz.feature.parentFlow.title',
      'quiz.feature.schoolOversight.title',
      'quiz.feature.schoolFinance.title',
    ]);
  });

  it('returns four marketed features when a bottleneck is selected', () => {
    const features = getQuizResultFeatures('solo', 'payments');
    expect(features).toHaveLength(4);
    expect(features[0].titleKey).toBe('quiz.feature.payments.title');
    expect(features[3].titleKey).toBe('quiz.feature.soloAutomation.title');
  });

  it('keeps multiple selected bottlenecks at the front of the recommendation', () => {
    const features = getQuizResultFeatures('company', ['billing', 'teamSchedule']);
    expect(features.map((feature) => feature.titleKey).slice(0, 2)).toEqual([
      'quiz.feature.billing.title',
      'quiz.feature.teamSchedule.title',
    ]);
    expect(features).toHaveLength(4);
  });

  it('keeps every funnel screen addressable in a stable order', () => {
    expect(QUIZ_STEP_SEQUENCE).toEqual([
      'welcome',
      'volume',
      'challenge',
      'insight',
      'admin-time',
      'story',
      'tools',
      'assurance',
      'custom-fit',
      'goal',
      'analysis',
      'transformation',
      'email',
      'offer',
    ]);
    expect(getNextQuizStep('company', 'challenge')).toBe('insight');
    expect(getNextQuizStep('school', 'analysis')).toBe('transformation');
    expect(getPreviousQuizStep('school', 'email')).toBe('transformation');
    expect(getNextQuizStep('solo', 'offer')).toBeUndefined();
  });

  it('adds the custom-function info step only for companies and schools', () => {
    expect(getQuizStepSequence('solo')).not.toContain('custom-fit');
    expect(getQuizStepSequence('company')).toContain('custom-fit');
    expect(getQuizStepSequence('school')).toContain('custom-fit');
    expect(getNextQuizStep('solo', 'assurance')).toBe('goal');
    expect(getNextQuizStep('company', 'assurance')).toBe('custom-fit');
    expect(isQuizStepForAudience('solo', 'custom-fit')).toBe(false);
    expect(isQuizStepForAudience('school', 'custom-fit')).toBe(true);
  });

  it('adds the digital business-card feature step only for solo tutors', () => {
    expect(getQuizStepSequence('solo')).toContain('business-card');
    expect(getQuizStepSequence('company')).not.toContain('business-card');
    expect(getQuizStepSequence('school')).not.toContain('business-card');
    expect(getNextQuizStep('solo', 'story')).toBe('business-card');
    expect(getPreviousQuizStep('solo', 'tools')).toBe('business-card');
    expect(getNextQuizStep('company', 'story')).toBe('tools');
    expect(isQuizStep('business-card')).toBe(true);
    expect(isQuizStepForAudience('solo', 'business-card')).toBe(true);
    expect(isQuizStepForAudience('company', 'business-card')).toBe(false);
  });

  it.each(Object.entries(QUIZ_BUSINESS_CARD_IMAGE_BY_LOCALE))(
    'uses the %s-localised business-card image',
    (locale, imagePath) => {
      expect(getQuizBusinessCardImage(locale)).toBe(imagePath);
      expect(imagePath).toBe(
        `/social/business-card-facebook/${locale}-digital-business-card-facebook.webp`,
      );
    },
  );

  it('falls back to the English business-card image for an unknown locale', () => {
    expect(getQuizBusinessCardImage('unknown')).toBe(
      '/social/business-card-facebook/en-digital-business-card-facebook.webp',
    );
  });

  it('warms only the image assets required by the next funnel step', () => {
    expect(getNextQuizStepImageAssets('solo', 'analysis', 'en')).toEqual([
      '/quiz/transformation-before-v3.webp',
      '/quiz/transformation-after.webp',
    ]);
    expect(getNextQuizStepImageAssets('solo', 'story', 'pl')).toEqual([
      '/social/business-card-facebook/pl-digital-business-card-facebook.webp',
    ]);
    expect(getNextQuizStepImageAssets('company', 'story', 'en')).toEqual([]);
  });

  it('deduplicates the optimized image set used by each offer', () => {
    expect(getQuizStepImageAssets('solo', 'offer', 'en')).toEqual([
      '/quiz/offer-workload.webp',
      '/quiz/solo-tutor-rasa.webp',
      '/quiz/solo-tutor-mantas.webp',
      '/quiz/solo-tutor-ieva.webp',
      '/quiz/solo-tutor-lukas.webp',
      '/quiz/money-back-guarantee.webp',
    ]);
    expect(getQuizStepImageAssets('school', 'offer', 'en')).not.toContain(
      '/quiz/money-back-guarantee.webp',
    );
  });

  it('maps URL step names to the right audience question', () => {
    expect(getQuizQuestionForStep('solo', 'challenge')?.id).toBe('friction');
    expect(getQuizQuestionForStep('company', 'admin-time')?.id).toBe('adminTime');
    expect(getQuizQuestionForStep('school', 'goal')?.id).toBe('priority');
    expect(getQuizQuestionForStep('school', 'story')).toBeUndefined();
  });

  it('rejects malformed audience and step route parameters', () => {
    expect(isQuizAudience('school')).toBe(true);
    expect(isQuizAudience('student')).toBe(false);
    expect(isQuizStep('assurance')).toBe(true);
    expect(isQuizStep('business-card')).toBe(true);
    expect(isQuizStep('transformation')).toBe(true);
    expect(isQuizStep('results')).toBe(false);
  });
});
