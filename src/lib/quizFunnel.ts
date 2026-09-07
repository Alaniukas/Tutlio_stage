export type QuizAudience = 'solo' | 'company' | 'school';

export type QuizStepId =
  | 'welcome'
  | 'volume'
  | 'challenge'
  | 'insight'
  | 'admin-time'
  | 'story'
  | 'business-card'
  | 'tools'
  | 'assurance'
  | 'custom-fit'
  | 'goal'
  | 'analysis'
  | 'transformation'
  | 'email'
  | 'offer';

const SOLO_STEP_SEQUENCE: QuizStepId[] = [
  'welcome',
  'volume',
  'challenge',
  'insight',
  'admin-time',
  'story',
  'business-card',
  'tools',
  'assurance',
  'goal',
  'analysis',
  'transformation',
  'email',
  'offer',
];

const ORG_STEP_SEQUENCE = SOLO_STEP_SEQUENCE.filter((step) => step !== 'business-card');

export const QUIZ_STEP_SEQUENCE: QuizStepId[] = [
  ...ORG_STEP_SEQUENCE.slice(0, ORG_STEP_SEQUENCE.indexOf('goal')),
  'custom-fit',
  ...ORG_STEP_SEQUENCE.slice(ORG_STEP_SEQUENCE.indexOf('goal')),
];

const ALL_QUIZ_STEPS = Array.from(new Set([...SOLO_STEP_SEQUENCE, ...QUIZ_STEP_SEQUENCE]));

export const QUIZ_BUSINESS_CARD_IMAGE_BY_LOCALE = {
  lt: '/social/business-card-facebook/lt-digital-business-card-facebook.webp',
  en: '/social/business-card-facebook/en-digital-business-card-facebook.webp',
  pl: '/social/business-card-facebook/pl-digital-business-card-facebook.webp',
  lv: '/social/business-card-facebook/lv-digital-business-card-facebook.webp',
  ee: '/social/business-card-facebook/ee-digital-business-card-facebook.webp',
  fr: '/social/business-card-facebook/fr-digital-business-card-facebook.webp',
  es: '/social/business-card-facebook/es-digital-business-card-facebook.webp',
  de: '/social/business-card-facebook/de-digital-business-card-facebook.webp',
  se: '/social/business-card-facebook/se-digital-business-card-facebook.webp',
  dk: '/social/business-card-facebook/dk-digital-business-card-facebook.webp',
  fi: '/social/business-card-facebook/fi-digital-business-card-facebook.webp',
  no: '/social/business-card-facebook/no-digital-business-card-facebook.webp',
  nl: '/social/business-card-facebook/nl-digital-business-card-facebook.webp',
} as const;

export function getQuizBusinessCardImage(locale?: string): string {
  return QUIZ_BUSINESS_CARD_IMAGE_BY_LOCALE[
    locale as keyof typeof QUIZ_BUSINESS_CARD_IMAGE_BY_LOCALE
  ] ?? QUIZ_BUSINESS_CARD_IMAGE_BY_LOCALE.en;
}

export const QUIZ_IMAGE_ASSETS = {
  logo: '/quiz/tutlio-logo.webp',
  privacy: '/quiz/privacy-gdpr.webp',
  audience: {
    solo: '/quiz/audience-solo.webp',
    company: '/quiz/audience-company.webp',
    school: '/quiz/audience-school.webp',
  },
  welcome: {
    solo: '/quiz/welcome-solo.webp',
    company: '/quiz/welcome-company.webp',
    school: '/quiz/welcome-school.webp',
  },
  story: {
    solo: ['/quiz/solo-tutor-rasa.webp', '/quiz/solo-tutor-mantas.webp'],
    company: ['/quiz/proklase.webp'],
    school: ['/quiz/laisvi-vaikai-logo.webp'],
  },
  offerTestimonials: {
    solo: [
      '/quiz/solo-tutor-rasa.webp',
      '/quiz/solo-tutor-mantas.webp',
      '/quiz/solo-tutor-ieva.webp',
      '/quiz/solo-tutor-lukas.webp',
    ],
    company: [
      '/quiz/proklase.webp',
      '/quiz/testimonial-logos/company-independent-centre.png',
      '/quiz/testimonial-logos/company-language-studio.png',
      '/quiz/testimonial-logos/company-exam-academy.png',
    ],
    school: [
      '/quiz/laisvi-vaikai-logo.webp',
      '/quiz/testimonial-logos/school-community.png',
      '/quiz/testimonial-logos/school-after-school-centre.png',
      '/quiz/testimonial-logos/school-arts-education.png',
    ],
  },
  transformation: [
    '/quiz/transformation-before-v3.webp',
    '/quiz/transformation-after.webp',
  ],
  offerWorkload: '/quiz/offer-workload.webp',
  moneyBackGuarantee: '/quiz/money-back-guarantee.webp',
} as const;

/** Images needed by one screen. The caller can warm exactly the next screen without fetching the whole funnel. */
export function getQuizStepImageAssets(
  audience: QuizAudience,
  step: QuizStepId,
  locale?: string,
): string[] {
  switch (step) {
    case 'welcome':
      return [QUIZ_IMAGE_ASSETS.welcome[audience]];
    case 'story':
      return [...QUIZ_IMAGE_ASSETS.story[audience]];
    case 'business-card':
      return audience === 'solo' ? [getQuizBusinessCardImage(locale)] : [];
    case 'transformation':
      return [...QUIZ_IMAGE_ASSETS.transformation];
    case 'offer': {
      const offerAssets: string[] = [
        QUIZ_IMAGE_ASSETS.offerWorkload,
        ...QUIZ_IMAGE_ASSETS.offerTestimonials[audience],
      ];
      if (audience !== 'school') offerAssets.push(QUIZ_IMAGE_ASSETS.moneyBackGuarantee);
      return Array.from(new Set(offerAssets));
    }
    default:
      return [];
  }
}

export function getNextQuizStepImageAssets(
  audience: QuizAudience,
  step: QuizStepId,
  locale?: string,
): string[] {
  const nextStep = getNextQuizStep(audience, step);
  return nextStep ? getQuizStepImageAssets(audience, nextStep, locale) : [];
}

const QUIZ_AUDIENCES: QuizAudience[] = ['solo', 'company', 'school'];

const QUESTION_ID_BY_STEP: Partial<Record<QuizStepId, QuizQuestion['id']>> = {
  volume: 'volume',
  challenge: 'friction',
  'admin-time': 'adminTime',
  tools: 'tools',
  goal: 'priority',
};

export interface QuizOption {
  value: string;
  emoji: string;
  labelKey: string;
  descriptionKey?: string;
}

export interface QuizQuestion {
  id: 'volume' | 'friction' | 'adminTime' | 'tools' | 'priority';
  titleKey: string;
  subtitleKey?: string;
  multiple?: boolean;
  options: QuizOption[];
}

export interface QuizFeature {
  titleKey: string;
  descriptionKey: string;
}

const ADMIN_TIME_QUESTION: QuizQuestion = {
  id: 'adminTime',
  titleKey: 'quiz.question.adminTime.title',
  subtitleKey: 'quiz.question.adminTime.subtitle',
  options: [
    { value: 'under1', emoji: '🌿', labelKey: 'quiz.option.adminTime.under1' },
    { value: '1to3', emoji: '⏱️', labelKey: 'quiz.option.adminTime.1to3' },
    { value: '3to5', emoji: '📚', labelKey: 'quiz.option.adminTime.3to5' },
    { value: '5plus', emoji: '🔥', labelKey: 'quiz.option.adminTime.5plus' },
  ],
};

const TOOLS_QUESTION: QuizQuestion = {
  id: 'tools',
  titleKey: 'quiz.question.tools.title',
  subtitleKey: 'quiz.question.tools.subtitle',
  options: [
    { value: 'spreadsheets', emoji: '📊', labelKey: 'quiz.option.tools.spreadsheets', descriptionKey: 'quiz.option.tools.spreadsheets.desc' },
    { value: 'calendarBank', emoji: '🗓️', labelKey: 'quiz.option.tools.calendarBank', descriptionKey: 'quiz.option.tools.calendarBank.desc' },
    { value: 'manyApps', emoji: '🧩', labelKey: 'quiz.option.tools.manyApps', descriptionKey: 'quiz.option.tools.manyApps.desc' },
    { value: 'platform', emoji: '⚙️', labelKey: 'quiz.option.tools.platform', descriptionKey: 'quiz.option.tools.platform.desc' },
  ],
};

const AUDIENCE_QUESTIONS: Record<QuizAudience, QuizQuestion[]> = {
  solo: [
    {
      id: 'volume',
      titleKey: 'quiz.question.solo.volume.title',
      subtitleKey: 'quiz.question.solo.volume.subtitle',
      options: [
        { value: 'starting', emoji: '🌱', labelKey: 'quiz.option.solo.volume.starting' },
        { value: '6to15', emoji: '🎓', labelKey: 'quiz.option.solo.volume.6to15' },
        { value: '16to30', emoji: '📚', labelKey: 'quiz.option.solo.volume.16to30' },
        { value: '30plus', emoji: '🚀', labelKey: 'quiz.option.solo.volume.30plus' },
      ],
    },
    {
      id: 'friction',
      titleKey: 'quiz.question.solo.friction.title',
      multiple: true,
      options: [
        { value: 'schedule', emoji: '🗓️', labelKey: 'quiz.option.solo.friction.schedule', descriptionKey: 'quiz.option.solo.friction.schedule.desc' },
        { value: 'payments', emoji: '💳', labelKey: 'quiz.option.solo.friction.payments', descriptionKey: 'quiz.option.solo.friction.payments.desc' },
        { value: 'admin', emoji: '📋', labelKey: 'quiz.option.solo.friction.admin', descriptionKey: 'quiz.option.solo.friction.admin.desc' },
        { value: 'growth', emoji: '📈', labelKey: 'quiz.option.solo.friction.growth', descriptionKey: 'quiz.option.solo.friction.growth.desc' },
        { value: 'communication', emoji: '💬', labelKey: 'quiz.option.solo.friction.communication', descriptionKey: 'quiz.option.solo.friction.communication.desc' },
      ],
    },
    ADMIN_TIME_QUESTION,
    TOOLS_QUESTION,
    {
      id: 'priority',
      titleKey: 'quiz.question.solo.priority.title',
      options: [
        { value: 'saveTime', emoji: '✨', labelKey: 'quiz.option.solo.priority.saveTime' },
        { value: 'income', emoji: '💶', labelKey: 'quiz.option.solo.priority.income' },
        { value: 'professional', emoji: '⭐', labelKey: 'quiz.option.solo.priority.professional' },
        { value: 'grow', emoji: '🌱', labelKey: 'quiz.option.solo.priority.grow' },
      ],
    },
  ],
  company: [
    {
      id: 'volume',
      titleKey: 'quiz.question.company.volume.title',
      subtitleKey: 'quiz.question.company.volume.subtitle',
      options: [
        { value: '2to5', emoji: '👥', labelKey: 'quiz.option.company.volume.2to5' },
        { value: '6to15', emoji: '🏢', labelKey: 'quiz.option.company.volume.6to15' },
        { value: '16to40', emoji: '📈', labelKey: 'quiz.option.company.volume.16to40' },
        { value: '40plus', emoji: '🚀', labelKey: 'quiz.option.company.volume.40plus' },
      ],
    },
    {
      id: 'friction',
      titleKey: 'quiz.question.company.friction.title',
      multiple: true,
      options: [
        { value: 'teamSchedule', emoji: '🗓️', labelKey: 'quiz.option.company.friction.teamSchedule', descriptionKey: 'quiz.option.company.friction.teamSchedule.desc' },
        { value: 'visibility', emoji: '🔎', labelKey: 'quiz.option.company.friction.visibility', descriptionKey: 'quiz.option.company.friction.visibility.desc' },
        { value: 'tutorPay', emoji: '💶', labelKey: 'quiz.option.company.friction.tutorPay', descriptionKey: 'quiz.option.company.friction.tutorPay.desc' },
        { value: 'billing', emoji: '🧾', labelKey: 'quiz.option.company.friction.billing', descriptionKey: 'quiz.option.company.friction.billing.desc' },
        { value: 'companyGrowth', emoji: '📊', labelKey: 'quiz.option.company.friction.companyGrowth', descriptionKey: 'quiz.option.company.friction.companyGrowth.desc' },
      ],
    },
    ADMIN_TIME_QUESTION,
    TOOLS_QUESTION,
    {
      id: 'priority',
      titleKey: 'quiz.question.company.priority.title',
      options: [
        { value: 'operations', emoji: '⚙️', labelKey: 'quiz.option.company.priority.operations' },
        { value: 'team', emoji: '👥', labelKey: 'quiz.option.company.priority.team' },
        { value: 'cashflow', emoji: '💳', labelKey: 'quiz.option.company.priority.cashflow' },
        { value: 'scale', emoji: '🚀', labelKey: 'quiz.option.company.priority.scale' },
      ],
    },
  ],
  school: [
    {
      id: 'volume',
      titleKey: 'quiz.question.school.volume.title',
      subtitleKey: 'quiz.question.school.volume.subtitle',
      options: [
        { value: 'under50', emoji: '🏫', labelKey: 'quiz.option.school.volume.under50' },
        { value: '50to150', emoji: '🎒', labelKey: 'quiz.option.school.volume.50to150' },
        { value: '151to400', emoji: '📚', labelKey: 'quiz.option.school.volume.151to400' },
        { value: '400plus', emoji: '🚀', labelKey: 'quiz.option.school.volume.400plus' },
      ],
    },
    {
      id: 'friction',
      titleKey: 'quiz.question.school.friction.title',
      multiple: true,
      options: [
        { value: 'contracts', emoji: '✍️', labelKey: 'quiz.option.school.friction.contracts', descriptionKey: 'quiz.option.school.friction.contracts.desc' },
        { value: 'installments', emoji: '💳', labelKey: 'quiz.option.school.friction.installments', descriptionKey: 'quiz.option.school.friction.installments.desc' },
        { value: 'schoolSchedule', emoji: '🗓️', labelKey: 'quiz.option.school.friction.schoolSchedule', descriptionKey: 'quiz.option.school.friction.schoolSchedule.desc' },
        { value: 'parentData', emoji: '👨‍👩‍👧', labelKey: 'quiz.option.school.friction.parentData', descriptionKey: 'quiz.option.school.friction.parentData.desc' },
        { value: 'accounting', emoji: '📊', labelKey: 'quiz.option.school.friction.accounting', descriptionKey: 'quiz.option.school.friction.accounting.desc' },
      ],
    },
    ADMIN_TIME_QUESTION,
    TOOLS_QUESTION,
    {
      id: 'priority',
      titleKey: 'quiz.question.school.priority.title',
      options: [
        { value: 'paperless', emoji: '✍️', labelKey: 'quiz.option.school.priority.paperless' },
        { value: 'collections', emoji: '💳', labelKey: 'quiz.option.school.priority.collections' },
        { value: 'oneSystem', emoji: '🧩', labelKey: 'quiz.option.school.priority.oneSystem' },
        { value: 'schoolScale', emoji: '🚀', labelKey: 'quiz.option.school.priority.scale' },
      ],
    },
  ],
};

const FRICTION_FEATURES: Record<string, QuizFeature> = {
  schedule: { titleKey: 'quiz.feature.schedule.title', descriptionKey: 'quiz.feature.schedule.desc' },
  payments: { titleKey: 'quiz.feature.payments.title', descriptionKey: 'quiz.feature.payments.desc' },
  admin: { titleKey: 'quiz.feature.admin.title', descriptionKey: 'quiz.feature.admin.desc' },
  growth: { titleKey: 'quiz.feature.growth.title', descriptionKey: 'quiz.feature.growth.desc' },
  communication: { titleKey: 'quiz.feature.communication.title', descriptionKey: 'quiz.feature.communication.desc' },
  teamSchedule: { titleKey: 'quiz.feature.teamSchedule.title', descriptionKey: 'quiz.feature.teamSchedule.desc' },
  visibility: { titleKey: 'quiz.feature.visibility.title', descriptionKey: 'quiz.feature.visibility.desc' },
  tutorPay: { titleKey: 'quiz.feature.tutorPay.title', descriptionKey: 'quiz.feature.tutorPay.desc' },
  billing: { titleKey: 'quiz.feature.billing.title', descriptionKey: 'quiz.feature.billing.desc' },
  companyGrowth: { titleKey: 'quiz.feature.companyGrowth.title', descriptionKey: 'quiz.feature.companyGrowth.desc' },
  contracts: { titleKey: 'quiz.feature.contracts.title', descriptionKey: 'quiz.feature.contracts.desc' },
  installments: { titleKey: 'quiz.feature.installments.title', descriptionKey: 'quiz.feature.installments.desc' },
  schoolSchedule: { titleKey: 'quiz.feature.schoolSchedule.title', descriptionKey: 'quiz.feature.schoolSchedule.desc' },
  parentData: { titleKey: 'quiz.feature.parentData.title', descriptionKey: 'quiz.feature.parentData.desc' },
  accounting: { titleKey: 'quiz.feature.accounting.title', descriptionKey: 'quiz.feature.accounting.desc' },
};

const AUDIENCE_BASE_FEATURES: Record<QuizAudience, QuizFeature[]> = {
  solo: [
    { titleKey: 'quiz.feature.soloWorkspace.title', descriptionKey: 'quiz.feature.soloWorkspace.desc' },
    { titleKey: 'quiz.feature.studentExperience.title', descriptionKey: 'quiz.feature.studentExperience.desc' },
    { titleKey: 'quiz.feature.soloAutomation.title', descriptionKey: 'quiz.feature.soloAutomation.desc' },
    { titleKey: 'quiz.feature.soloBusinessCard.title', descriptionKey: 'quiz.feature.soloBusinessCard.desc' },
  ],
  company: [
    { titleKey: 'quiz.feature.teamControl.title', descriptionKey: 'quiz.feature.teamControl.desc' },
    { titleKey: 'quiz.feature.businessVisibility.title', descriptionKey: 'quiz.feature.businessVisibility.desc' },
    { titleKey: 'quiz.feature.connectedPortals.title', descriptionKey: 'quiz.feature.connectedPortals.desc' },
    { titleKey: 'quiz.feature.companyFinance.title', descriptionKey: 'quiz.feature.companyFinance.desc' },
  ],
  school: [
    { titleKey: 'quiz.feature.schoolRecords.title', descriptionKey: 'quiz.feature.schoolRecords.desc' },
    { titleKey: 'quiz.feature.parentFlow.title', descriptionKey: 'quiz.feature.parentFlow.desc' },
    { titleKey: 'quiz.feature.schoolOversight.title', descriptionKey: 'quiz.feature.schoolOversight.desc' },
    { titleKey: 'quiz.feature.schoolFinance.title', descriptionKey: 'quiz.feature.schoolFinance.desc' },
  ],
};

export function getQuizQuestions(audience: QuizAudience): QuizQuestion[] {
  return AUDIENCE_QUESTIONS[audience];
}

export function isQuizAudience(value?: string): value is QuizAudience {
  return QUIZ_AUDIENCES.includes(value as QuizAudience);
}

export function isQuizStep(value?: string): value is QuizStepId {
  return ALL_QUIZ_STEPS.includes(value as QuizStepId);
}

export function getQuizStepSequence(audience: QuizAudience): QuizStepId[] {
  return audience === 'solo' ? SOLO_STEP_SEQUENCE : QUIZ_STEP_SEQUENCE;
}

export function isQuizStepForAudience(audience: QuizAudience, step: QuizStepId): boolean {
  return getQuizStepSequence(audience).includes(step);
}

export function getQuizQuestionForStep(
  audience: QuizAudience,
  step: QuizStepId,
): QuizQuestion | undefined {
  const questionId = QUESTION_ID_BY_STEP[step];
  return questionId
    ? getQuizQuestions(audience).find((question) => question.id === questionId)
    : undefined;
}

export function getNextQuizStep(
  audience: QuizAudience,
  step: QuizStepId,
): QuizStepId | undefined {
  const sequence = getQuizStepSequence(audience);
  return sequence[sequence.indexOf(step) + 1];
}

export function getPreviousQuizStep(
  audience: QuizAudience,
  step: QuizStepId,
): QuizStepId | undefined {
  const sequence = getQuizStepSequence(audience);
  return sequence[sequence.indexOf(step) - 1];
}

export function getQuizResultFeatures(
  audience: QuizAudience,
  friction?: string | string[],
): QuizFeature[] {
  const frictionValues = Array.isArray(friction) ? friction : friction ? [friction] : [];
  const focusFeatures = frictionValues
    .map((value) => FRICTION_FEATURES[value])
    .filter((feature): feature is QuizFeature => Boolean(feature));
  const uniqueFeatures = [...focusFeatures, ...AUDIENCE_BASE_FEATURES[audience]]
    .filter((feature, index, features) => (
      features.findIndex((candidate) => candidate.titleKey === feature.titleKey) === index
    ));
  return uniqueFeatures.slice(0, 4);
}

export function getQuizOption(
  question: QuizQuestion,
  value?: string | string[],
): QuizOption | undefined {
  const primaryValue = Array.isArray(value) ? value[0] : value;
  return question.options.find((option) => option.value === primaryValue);
}
