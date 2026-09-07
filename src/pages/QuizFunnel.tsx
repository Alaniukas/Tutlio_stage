import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Building2,
  Check,
  CircleCheckBig,
  GraduationCap,
  School,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  WandSparkles,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getStoredUtm } from '@/lib/analytics';
import {
  buildLocalizedPath,
  loadLocaleDict,
  useTranslation,
} from '@/lib/i18n';
import EnterpriseContactModal from '@/components/EnterpriseContactModal';
import LocaleLoadStatus from '@/components/LocaleLoadStatus';
import EnterprisePlanCard from '@/components/pricing/EnterprisePlanCard';
import TutorPlanCards from '@/components/pricing/TutorPlanCards';
import HeroAnimation from '@/components/landing/v2/HeroAnimation';
import TabletFrame from '@/components/landing/v2/TabletFrame';
import { storeMarketingAudience } from '@/lib/marketingAudience';
import { preloadImages } from '@/lib/imagePreload';
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
  type QuizAudience,
  type QuizStepId,
  QUIZ_IMAGE_ASSETS,
} from '@/lib/quizFunnel';
import styles from './QuizFunnel.module.css';

type QuizAnswer = string | string[];
type QuizAnswers = Record<string, QuizAnswer>;

interface QuizDraft {
  answers: QuizAnswers;
  email?: string;
  leadCaptured?: boolean;
  leadPending?: boolean;
}

const DRAFT_VERSION = 'v2';
const QUESTION_STEPS: QuizStepId[] = ['volume', 'challenge', 'admin-time', 'tools', 'goal'];
const INFO_STEPS: QuizStepId[] = ['insight', 'story', 'assurance', 'custom-fit'];
const BUSINESS_CARD_BENEFIT_VISUALS = ['share-link', 'offer-page', 'instant-booking'] as const;
const ANALYSIS_DURATION_MS = 4600;
const TRANSFORMATION_BAR_WIDTHS: Record<QuizAudience, { before: number[]; after: number[] }> = {
  solo: { before: [86, 78, 91], after: [20, 17, 24] },
  company: { before: [92, 88, 84], after: [21, 18, 23] },
  school: { before: [90, 86, 89], after: [17, 22, 19] },
};
const SOLO_TUTOR_STORIES = [
  { id: 1, image: QUIZ_IMAGE_ASSETS.story.solo[0] },
  { id: 2, image: QUIZ_IMAGE_ASSETS.story.solo[1] },
] as const;

const OFFER_TESTIMONIALS: Record<QuizAudience, Array<{
  image?: string;
  nameKey: string;
  roleKey: string;
  copyKey: string;
  brandAltKey?: string;
}>> = {
  solo: [
    ...SOLO_TUTOR_STORIES.map(({ id, image }) => ({
      image,
      nameKey: `quiz.info.story.solo.name${id}`,
      roleKey: `quiz.info.story.solo.role${id}`,
      copyKey: `quiz.info.story.solo.story${id}`,
    })),
    {
      image: QUIZ_IMAGE_ASSETS.offerTestimonials.solo[2],
      nameKey: 'quiz.offer.testimonial.solo.name3',
      roleKey: 'quiz.offer.testimonial.solo.role3',
      copyKey: 'quiz.offer.testimonial.solo.copy3',
    },
    {
      image: QUIZ_IMAGE_ASSETS.offerTestimonials.solo[3],
      nameKey: 'quiz.offer.testimonial.solo.name4',
      roleKey: 'quiz.offer.testimonial.solo.role4',
      copyKey: 'quiz.offer.testimonial.solo.copy4',
    },
  ],
  company: [
    {
      image: QUIZ_IMAGE_ASSETS.story.company[0],
      nameKey: 'quiz.offer.testimonial.company.name1',
      roleKey: 'quiz.offer.testimonial.company.role1',
      copyKey: 'quiz.offer.testimonial.company.copy1',
      brandAltKey: 'quiz.info.story.company.brandAlt',
    },
    {
      image: QUIZ_IMAGE_ASSETS.offerTestimonials.company[1],
      nameKey: 'quiz.offer.testimonial.company.name2',
      roleKey: 'quiz.offer.testimonial.company.role2',
      copyKey: 'quiz.offer.testimonial.company.copy2',
    },
    {
      image: QUIZ_IMAGE_ASSETS.offerTestimonials.company[2],
      nameKey: 'quiz.offer.testimonial.company.name3',
      roleKey: 'quiz.offer.testimonial.company.role3',
      copyKey: 'quiz.offer.testimonial.company.copy3',
    },
    {
      image: QUIZ_IMAGE_ASSETS.offerTestimonials.company[3],
      nameKey: 'quiz.offer.testimonial.company.name4',
      roleKey: 'quiz.offer.testimonial.company.role4',
      copyKey: 'quiz.offer.testimonial.company.copy4',
    },
  ],
  school: [
    {
      image: QUIZ_IMAGE_ASSETS.story.school[0],
      nameKey: 'quiz.offer.testimonial.school.name1',
      roleKey: 'quiz.offer.testimonial.school.role1',
      copyKey: 'quiz.offer.testimonial.school.copy1',
      brandAltKey: 'quiz.info.story.school.brandAlt',
    },
    {
      image: QUIZ_IMAGE_ASSETS.offerTestimonials.school[1],
      nameKey: 'quiz.offer.testimonial.school.name2',
      roleKey: 'quiz.offer.testimonial.school.role2',
      copyKey: 'quiz.offer.testimonial.school.copy2',
    },
    {
      image: QUIZ_IMAGE_ASSETS.offerTestimonials.school[2],
      nameKey: 'quiz.offer.testimonial.school.name3',
      roleKey: 'quiz.offer.testimonial.school.role3',
      copyKey: 'quiz.offer.testimonial.school.copy3',
    },
    {
      image: QUIZ_IMAGE_ASSETS.offerTestimonials.school[3],
      nameKey: 'quiz.offer.testimonial.school.name4',
      roleKey: 'quiz.offer.testimonial.school.role4',
      copyKey: 'quiz.offer.testimonial.school.copy4',
    },
  ],
};

const AUDIENCES: Array<{
  id: QuizAudience;
  image: string;
  titleKey: string;
  descriptionKey: string;
}> = [
  {
    id: 'solo',
    image: QUIZ_IMAGE_ASSETS.audience.solo,
    titleKey: 'quiz.audience.solo.title',
    descriptionKey: 'quiz.audience.solo.desc',
  },
  {
    id: 'company',
    image: QUIZ_IMAGE_ASSETS.audience.company,
    titleKey: 'quiz.audience.company.title',
    descriptionKey: 'quiz.audience.company.desc',
  },
  {
    id: 'school',
    image: QUIZ_IMAGE_ASSETS.audience.school,
    titleKey: 'quiz.audience.school.title',
    descriptionKey: 'quiz.audience.school.desc',
  },
];

function draftKey(audience: QuizAudience) {
  return `tutlio_quiz_${DRAFT_VERSION}_${audience}`;
}

function readDraft(audience: QuizAudience): QuizDraft {
  try {
    const raw = window.sessionStorage.getItem(draftKey(audience));
    if (!raw) return { answers: {} };
    const value = JSON.parse(raw) as Partial<QuizDraft>;
    return {
      answers: value.answers && typeof value.answers === 'object' ? value.answers : {},
      email: typeof value.email === 'string' ? value.email : undefined,
      leadCaptured: value.leadCaptured === true,
      leadPending: value.leadPending === true,
    };
  } catch {
    return { answers: {} };
  }
}

function writeDraft(audience: QuizAudience, draft: QuizDraft) {
  try {
    window.sessionStorage.setItem(draftKey(audience), JSON.stringify(draft));
  } catch {
    // A private browser session may disallow storage; the URL flow still works.
  }
}

async function sendQuizLead(
  audience: QuizAudience,
  locale: string,
  answers: QuizAnswers,
  email: string,
): Promise<boolean> {
  try {
    const response = await fetch('/api/landing-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        source: `quiz_${audience}`,
        audience,
        locale,
        quiz_answers: answers,
        consent: true,
        ...getStoredUtm(),
      }),
    });
    return response.ok && response.status !== 202;
  } catch {
    return false;
  }
}

function TutlioLogo() {
  return (
    <div className={styles.logo}>
      <img src={QUIZ_IMAGE_ASSETS.logo} alt="" width="128" height="102" decoding="async" />
      <span>Tutlio</span>
    </div>
  );
}

function AudienceIcon({ audience }: { audience: QuizAudience }) {
  if (audience === 'solo') return <GraduationCap aria-hidden="true" />;
  if (audience === 'company') return <Building2 aria-hidden="true" />;
  return <School aria-hidden="true" />;
}

function BusinessCardBenefitIcon({
  visual,
}: {
  visual: (typeof BUSINESS_CARD_BENEFIT_VISUALS)[number];
}) {
  return (
    <span className={`${styles.businessCardBenefitIcon} ${styles[`businessCardBenefitIcon_${visual}`]}`}>
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" data-quiz-benefit-icon={visual}>
        {visual === 'share-link' && (
          <>
            <path d="M15.2 13.2h-2.1a6.3 6.3 0 0 0 0 12.6h5.2a6.3 6.3 0 0 0 5.9-4.1" />
            <path d="M24.8 26.8h2.1a6.3 6.3 0 0 0 0-12.6h-5.2a6.3 6.3 0 0 0-5.9 4.1" />
            <path d="M14.7 20h10.6" />
            <path className={styles.businessCardIconAccent} d="m30.7 7.4.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8.8-2.1Z" />
          </>
        )}
        {visual === 'offer-page' && (
          <>
            <rect x="7.5" y="8" width="25" height="24" rx="4" />
            <path d="M8 14.3h24" />
            <circle cx="11.5" cy="11.2" r=".8" fill="currentColor" stroke="none" />
            <circle cx="14.3" cy="11.2" r=".8" fill="currentColor" stroke="none" />
            <rect x="11" y="18" width="7.2" height="7.2" rx="2" />
            <path d="M21.2 18.8h7.2M21.2 22.1h7.2M11 28.4h17.4" />
            <path className={styles.businessCardIconAccent} d="m28.2 26.2 1 1.9 2.1.3-1.5 1.5.4 2.1-2-1-1.9 1-1.5-1.5.3 1.5-1.6Z" />
          </>
        )}
        {visual === 'instant-booking' && (
          <>
            <rect x="7.5" y="10.5" width="25" height="22" rx="4" />
            <path d="M13 7.5v6M27 7.5v6M8 16.5h24" />
            <path d="m14 24 3.2 3.1L27 19.8" />
            <path className={styles.businessCardIconAccent} d="M29.8 24.7v5.1M27.3 27.3h5" />
          </>
        )}
      </svg>
    </span>
  );
}

function FloatingProceedButton({
  label,
  onClick,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <button
      className={`${styles.primaryButton} ${styles.floatingProceed}`}
      data-testid="floating-proceed"
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      {label}<ArrowRight aria-hidden="true" />
    </button>,
    document.body,
  );
}

function TrustpilotStars({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();

  return (
    <span
      className={`${styles.trustpilotStars} ${compact ? styles.trustpilotStarsCompact : ''}`}
      data-testid="trustpilot-stars"
      aria-label={t('quiz.info.story.solo.ratingLabel')}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star}><Star aria-hidden="true" /></span>
      ))}
    </span>
  );
}

function RecommendationAnalysisVisual({ audience }: { audience: QuizAudience }) {
  return (
    <div className={styles.analysisVisual} data-testid="recommendation-analysis-visual" aria-hidden="true">
      <svg viewBox="0 0 240 132" fill="none">
        <rect x="4" y="4" width="232" height="124" rx="34" className={styles.analysisVisualBackdrop} />
        <path className={styles.analysisVisualFlow} d="M58 66h34M148 66h34" />
        <g className={styles.analysisVisualInput}>
          <rect x="24" y="40" width="42" height="52" rx="14" />
          <circle cx="45" cy="56" r="7" />
          <path d="M34 77c2.8-6 7-9 11-9s8.2 3 11 9" />
        </g>
        <g className={styles.analysisVisualRecommendation}>
          <rect x="88" y="25" width="64" height="82" rx="18" />
          <rect x="100" y="38" width="28" height="7" rx="3.5" />
          <path d="M100 57h40M100 66h31M100 75h36" />
          <path className={styles.analysisVisualCheck} d="m105 90 6 6 13-15" />
          <path className={styles.analysisVisualSpark} d="m137 84 2.3 5.7 5.7 2.3-5.7 2.3-2.3 5.7-2.3-5.7-5.7-2.3 5.7-2.3 2.3-5.7Z" />
        </g>
        <g className={styles.analysisVisualResult}>
          <rect x="177" y="42" width="40" height="48" rx="14" />
          <path d="m188 65 7 7 12-15" />
        </g>
      </svg>
      <span className={styles.analysisAudienceBadge}><AudienceIcon audience={audience} /></span>
    </div>
  );
}

function RecommendationEmailVisual() {
  return (
    <div className={styles.recommendationEmailVisual} data-testid="recommendation-email-visual" aria-hidden="true">
      <svg viewBox="0 0 240 148" fill="none">
        <rect x="4" y="4" width="232" height="140" rx="36" className={styles.emailVisualBackdrop} />
        <g className={styles.emailVisualCard}>
          <rect x="77" y="17" width="86" height="82" rx="16" />
          <path d="M92 37h38M92 49h56M92 61h45" />
          <circle cx="142" cy="78" r="11" />
          <path d="m136.5 78 4 4 7-8" />
        </g>
        <g className={styles.emailVisualEnvelope}>
          <path d="M45 72.5A12.5 12.5 0 0 1 57.5 60h125A12.5 12.5 0 0 1 195 72.5v53H45v-53Z" />
          <path d="m48 69 64 44a14 14 0 0 0 16 0l64-44" />
          <path d="m48 122 47-36M192 122l-47-36" />
        </g>
        <path className={styles.emailVisualSpark} d="m188 23 2.2 5.8 5.8 2.2-5.8 2.2-2.2 5.8-2.2-5.8-5.8-2.2 5.8-2.2 2.2-5.8ZM54 30l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5 1.5-4Z" />
      </svg>
    </div>
  );
}

export default function QuizFunnel() {
  const { locale, t } = useTranslation();
  const params = useParams<{ locale?: string; audience?: string; step?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const routeLocale = params.locale || locale;
  const audience = isQuizAudience(params.audience) ? params.audience : null;
  const parsedStep = isQuizStep(params.step) ? params.step : null;
  const step = audience && parsedStep && isQuizStepForAudience(audience, parsedStep)
    ? parsedStep
    : null;
  const isRoot = !params.audience && !params.step;
  const [fallbackReady, setFallbackReady] = useState(locale === 'lt' || locale === 'en' || locale === 'nl');
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const [fallbackAttempt, setFallbackAttempt] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingValue, setPendingValue] = useState<string | null>(null);
  const advanceTimerRef = useRef<number | null>(null);

  const question = useMemo(
    () => (audience && step ? getQuizQuestionForStep(audience, step) : undefined),
    [audience, step],
  );

  const stepPath = (targetAudience: QuizAudience, targetStep: QuizStepId) =>
    `/${routeLocale}/quiz/${targetAudience}/${targetStep}`;

  useEffect(() => {
    setFallbackFailed(false);
    // Dutch now covers the complete quiz; it does not need the English chunk.
    if (locale === 'lt' || locale === 'en' || locale === 'nl') {
      setFallbackReady(true);
      return;
    }
    setFallbackReady(false);
    let cancelled = false;
    void loadLocaleDict('en').then(() => {
      if (!cancelled) setFallbackReady(true);
    }).catch(() => {
      if (!cancelled) setFallbackFailed(true);
    });
    return () => { cancelled = true; };
  }, [locale, fallbackAttempt]);

  useEffect(() => {
    if (!fallbackReady) return;
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    document.title = t('quiz.meta.title');
    if (description) description.content = t('quiz.meta.description');
    return () => {
      document.title = previousTitle;
      if (description && previousDescription !== undefined) description.content = previousDescription;
    };
  }, [fallbackReady, t]);

  useEffect(() => {
    const malformedRoute = !isRoot && (!audience || !step);
    if (malformedRoute) navigate(`/${routeLocale}/quiz`, { replace: true });
  }, [audience, isRoot, navigate, routeLocale, step]);

  useEffect(() => {
    if (!audience) return;
    const draft = readDraft(audience);
    setAnswers(draft.answers);
    setEmail(draft.email ?? '');
    setConsent(draft.leadCaptured === true || draft.leadPending === true);
    setEmailError('');
  }, [audience]);

  useEffect(() => {
    if (!audience || !step) return;
    preloadImages(getNextQuizStepImageAssets(audience, step, routeLocale));
  }, [audience, routeLocale, step]);

  useEffect(() => {
    if (!audience || step !== 'offer') return;
    const draft = readDraft(audience);
    if (!draft.leadPending || !draft.email) return;

    let cancelled = false;
    let inFlight = false;
    const retryPendingLead = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      const saved = await sendQuizLead(audience, routeLocale, draft.answers, draft.email);
      inFlight = false;
      if (!cancelled && saved) {
        writeDraft(audience, {
          ...draft,
          leadCaptured: true,
          leadPending: false,
        });
      }
    };

    const timer = window.setTimeout(() => void retryPendingLead(), 1200);
    window.addEventListener('online', retryPendingLead);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('online', retryPendingLead);
    };
  }, [audience, routeLocale, step]);

  useEffect(() => () => {
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
  }, []);

  useEffect(() => {
    if (!audience || step !== 'analysis') return;
    const timer = window.setTimeout(() => {
      navigate(stepPath(audience, 'transformation'));
      window.scrollTo({ top: 0, behavior: 'auto' });
    }, ANALYSIS_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [audience, navigate, routeLocale, step]);

  function startQuiz(targetAudience: QuizAudience) {
    storeMarketingAudience(targetAudience === 'solo' ? 'solo' : 'agency');
    preloadImages(getQuizStepImageAssets(targetAudience, 'welcome', routeLocale));
    navigate(stepPath(targetAudience, 'welcome'));
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function goToNext() {
    if (!audience || !step) return;
    const next = getNextQuizStep(audience, step);
    if (next) navigate(stepPath(audience, next));
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function chooseAnswer(value: string) {
    if (!audience || !step || !question || advanceTimerRef.current !== null) return;
    if (question.multiple) {
      const currentAnswer = answers[question.id];
      const currentValues = Array.isArray(currentAnswer)
        ? currentAnswer
        : currentAnswer
          ? [currentAnswer]
          : [];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];
      const nextAnswers = { ...answers, [question.id]: nextValues };
      setAnswers(nextAnswers);
      writeDraft(audience, { ...readDraft(audience), answers: nextAnswers });
      return;
    }

    setPendingValue(value);
    const nextAnswers = { ...answers, [question.id]: value };
    setAnswers(nextAnswers);
    writeDraft(audience, { ...readDraft(audience), answers: nextAnswers });
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      setPendingValue(null);
      const next = getNextQuizStep(audience, step);
      if (next) navigate(stepPath(audience, next));
      window.scrollTo({ top: 0, behavior: 'auto' });
    }, 380);
  }

  function continueMultipleChoice() {
    if (!audience || !step || !question?.multiple) return;
    const answer = answers[question.id];
    if (!Array.isArray(answer) || answer.length === 0) return;
    const next = getNextQuizStep(audience, step);
    if (next) navigate(stepPath(audience, next));
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function goBack() {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
      setPendingValue(null);
    }
    if (!audience || !step || step === 'welcome') {
      navigate(`/${routeLocale}/quiz`);
    } else {
      const previous = getPreviousQuizStep(audience, step);
      navigate(previous ? stepPath(audience, previous) : `/${routeLocale}/quiz`);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!audience) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError(t('quiz.email.invalid'));
      return;
    }
    if (!consent) {
      setEmailError(t('quiz.email.consentRequired'));
      return;
    }

    setSubmitting(true);
    setEmailError('');
    const saved = await sendQuizLead(audience, routeLocale, answers, normalizedEmail);
    writeDraft(audience, {
      answers,
      email: normalizedEmail,
      leadCaptured: saved,
      leadPending: !saved,
    });
    setSubmitting(false);
    navigate(stepPath(audience, 'offer'));
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  if (fallbackFailed) {
    return <LocaleLoadStatus locale={locale} failed retry={() => {
      setFallbackFailed(false);
      setFallbackAttempt((value) => value + 1);
    }} />;
  }

  if (!fallbackReady || (!isRoot && (!audience || !step))) {
    return (
      <div className={styles.page}>
        <main className={`${styles.phone} ${styles.loading}`} role="status" aria-label="Loading" />
      </div>
    );
  }

  const stepSequence = audience ? getQuizStepSequence(audience) : [];
  const progress = step
    ? Math.round(((stepSequence.indexOf(step) + 1) / stepSequence.length) * 100)
    : 0;
  const showHeader = Boolean(step && step !== 'offer');
  const isOfferStep = step === 'offer';
  const currentQuizPath = `${location.pathname}${location.search}${location.hash}`;

  return (
    <div className={`${styles.page} ${isOfferStep ? styles.offerPage : ''}`}>
      <main className={`${styles.phone} ${isOfferStep ? styles.offerPhone : ''}`}>
        {showHeader && (
          <header className={styles.header}>
            <button type="button" className={styles.backButton} onClick={goBack} aria-label={t('quiz.header.back')}>
              <ArrowLeft aria-hidden="true" />
            </button>
            <TutlioLogo />
            <span className={styles.headerSpacer} aria-hidden="true" />
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label={t('quiz.header.progress', { progress })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
          </header>
        )}

        {isRoot && (
          <AudienceScreen onSelect={startQuiz} />
        )}
        {audience && step === 'welcome' && <WelcomeScreen audience={audience} onContinue={goToNext} />}
        {audience && step && question && (
          <QuestionScreen
            audience={audience}
            step={step}
            answers={answers}
            pendingValue={pendingValue}
            onAnswer={chooseAnswer}
            onContinue={continueMultipleChoice}
          />
        )}
        {audience && step && INFO_STEPS.includes(step) && (
          <InfoScreen audience={audience} step={step} onContinue={goToNext} />
        )}
        {audience === 'solo' && step === 'business-card' && (
          <BusinessCardScreen locale={routeLocale} onContinue={goToNext} />
        )}
        {audience && step === 'analysis' && <AnalysisScreen audience={audience} />}
        {audience && step === 'transformation' && (
          <TransformationScreen audience={audience} onContinue={goToNext} />
        )}
        {audience && step === 'email' && (
          <EmailScreen
            audience={audience}
            returnTo={currentQuizPath}
            email={email}
            consent={consent}
            error={emailError}
            submitting={submitting}
            onEmailChange={setEmail}
            onConsentChange={setConsent}
            onSubmit={submitEmail}
          />
        )}
        {audience && step === 'offer' && (
          <OfferScreen
            audience={audience}
            answers={answers}
            hostedCancelPath={currentQuizPath}
          />
        )}
      </main>
    </div>
  );
}

function AudienceScreen({
  onSelect,
}: {
  onSelect: (audience: QuizAudience) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className={`${styles.hero} ${styles.screenEnter}`}>
      <TutlioLogo />
      <div className={styles.proofRow}>
        <div>
          <TrustpilotStars />
          <strong>{t('quiz.proof.builtTitle')}</strong>
          <small>{t('quiz.proof.builtSubtitle')}</small>
        </div>
        <div className={styles.award}>
          <img
            src={QUIZ_IMAGE_ASSETS.privacy}
            alt=""
            width="256"
            height="256"
            loading="lazy"
            decoding="async"
          />
          <strong>{t('quiz.proof.secureTitle')}</strong>
          <small>{t('quiz.proof.secureSubtitle')}</small>
        </div>
      </div>
      <p className={styles.eyebrow}>{t('quiz.hero.badge')}</p>
      <h1>{t('quiz.hero.title')}</h1>
      <p className={styles.subtitle}>{t('quiz.hero.subtitle')}</p>
      <fieldset className={styles.audienceFieldset}>
        <legend>{t('quiz.hero.question')}</legend>
        <div className={styles.audienceList}>
          {AUDIENCES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={styles.audienceCard}
                onClick={() => onSelect(option.id)}
                onMouseEnter={() => preloadImages(getQuizStepImageAssets(option.id, 'welcome'))}
                onFocus={() => preloadImages(getQuizStepImageAssets(option.id, 'welcome'))}
              >
                <span className={styles.audienceIcon}>
                  <img src={option.image} alt="" width="256" height="256" loading="lazy" decoding="async" />
                </span>
                <span className={styles.audienceCopy}>
                  <strong>{t(option.titleKey)}</strong>
                  <small>{t(option.descriptionKey)}</small>
                </span>
                <ArrowRight className={styles.audienceArrow} aria-hidden="true" />
              </button>
          ))}
        </div>
      </fieldset>
      <p className={styles.privacy}><ShieldCheck aria-hidden="true" /> {t('quiz.hero.privacy')}</p>
    </section>
  );
}

function WelcomeScreen({ audience, onContinue }: { audience: QuizAudience; onContinue: () => void }) {
  const { t } = useTranslation();
  return (
    <section className={`${styles.contentScreen} ${styles.introScreen} ${styles.withFloatingProceed} ${styles.screenEnter}`}>
      <p className={styles.eyebrow}>{t(`quiz.intro.${audience}.eyebrow`)}</p>
      <h1>{t(`quiz.intro.${audience}.title`)}</h1>
      <p className={styles.introBody}>{t(`quiz.intro.${audience}.body`)}</p>
      <div className={styles.introIllustration}>
        <img
          src={QUIZ_IMAGE_ASSETS.welcome[audience]}
          alt={t(`quiz.intro.${audience}.visualAlt`)}
          width="900"
          height="600"
          loading="lazy"
          decoding="async"
        />
      </div>
      <FloatingProceedButton label={t('quiz.common.continue')} onClick={onContinue} />
    </section>
  );
}

function QuestionScreen({
  audience,
  step,
  answers,
  pendingValue,
  onAnswer,
  onContinue,
}: {
  audience: QuizAudience;
  step: QuizStepId;
  answers: QuizAnswers;
  pendingValue: string | null;
  onAnswer: (value: string) => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const question = getQuizQuestionForStep(audience, step);
  if (!question) return null;
  const questionIndex = QUESTION_STEPS.indexOf(step);
  const currentAnswer = answers[question.id];
  const selectedValues = Array.isArray(currentAnswer)
    ? currentAnswer
    : currentAnswer
      ? [currentAnswer]
      : [];
  const isMultiple = question.multiple === true;
  return (
    <section className={`${styles.contentScreen} ${styles.questionScreen} ${isMultiple ? styles.withFloatingProceed : ''} ${styles.screenEnter}`}>
      <p className={styles.stepLabel}>
        {t('quiz.question.step', { current: questionIndex + 1, total: QUESTION_STEPS.length })}
      </p>
      <h1>{t(question.titleKey)}</h1>
      {question.subtitleKey && <p className={styles.questionSubtitle}>{t(question.subtitleKey)}</p>}
      <div className={styles.optionList} role={isMultiple ? 'group' : 'radiogroup'} aria-label={t(question.titleKey)}>
        {question.options.map((option) => {
          const selected = isMultiple
            ? selectedValues.includes(option.value)
            : pendingValue === option.value || (!pendingValue && currentAnswer === option.value);
          return (
            <button
              key={option.value}
              type="button"
              role={isMultiple ? 'checkbox' : 'radio'}
              aria-checked={selected}
              className={`${styles.optionButton} ${selected ? styles.optionSelected : ''}`}
              onClick={() => onAnswer(option.value)}
            >
              <span className={styles.optionEmoji} aria-hidden="true">{option.emoji}</span>
              <span className={styles.optionCopy}>
                <strong>{t(option.labelKey)}</strong>
                {option.descriptionKey && <small>{t(option.descriptionKey)}</small>}
              </span>
              <span className={`${styles.radio} ${isMultiple ? styles.checkbox : ''}`} aria-hidden="true">
                {selected ? <Check /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className={styles.selectionHint}>
        {t(isMultiple ? 'quiz.question.selectMultipleHint' : 'quiz.question.selectHint')}
      </p>
      {isMultiple && (
        <FloatingProceedButton
          label={t('quiz.common.continue')}
          onClick={onContinue}
          disabled={selectedValues.length === 0}
        />
      )}
    </section>
  );
}

function InfoScreen({
  audience,
  step,
  onContinue,
}: {
  audience: QuizAudience;
  step: QuizStepId;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const prefix = `quiz.info.${step}.${audience}`;

  return (
    <section className={`${styles.contentScreen} ${styles.infoScreen} ${styles.withFloatingProceed} ${styles.screenEnter}`}>
      {step === 'custom-fit' ? <InfoStepVisual audience={audience} /> : null}
      <p className={styles.eyebrow}>{t(`${prefix}.eyebrow`)}</p>
      <h1>{t(`${prefix}.title`)}</h1>
      <p className={styles.infoBody}>{t(`${prefix}.body`)}</p>
      {step === 'insight' ? <LandingProductDemo audience={audience} /> : null}
      {step === 'story' ? (
        <StoryProof audience={audience} />
      ) : (
        <div className={styles.infoPoints} role="list" aria-label={t('quiz.info.keyPoints')}>
          {[1, 2, 3].map((item) => (
            <div key={item} role="listitem">
              <CircleCheckBig aria-hidden="true" />
              <span>{t(`${prefix}.point${item}`)}</span>
            </div>
          ))}
        </div>
      )}
      {step === 'assurance' && (
        <p className={styles.assuranceNote}>
          <ShieldCheck aria-hidden="true" />{t('quiz.info.assurance.note')}
        </p>
      )}
      <FloatingProceedButton label={t('quiz.common.continue')} onClick={onContinue} />
    </section>
  );
}

function LandingProductDemo({ audience }: { audience: QuizAudience }) {
  const landingAudience = audience === 'solo' ? 'solo' : 'biz';

  return (
    <div className={styles.landingProductDemo} aria-hidden="true">
      <div className={styles.landingProductDemoFrame}>
        <TabletFrame>
          <HeroAnimation audience={landingAudience} />
        </TabletFrame>
      </div>
    </div>
  );
}

function InfoStepVisual({ audience }: { audience: QuizAudience }) {
  return (
    <div className={`${styles.infoVisual} ${styles.infoVisualCustom}`} aria-hidden="true">
      <span className={styles.customVisualCore}><Blocks /></span>
      <span className={`${styles.customVisualChip} ${styles.customVisualChipTop}`}><WandSparkles /></span>
      <span className={`${styles.customVisualChip} ${styles.customVisualChipLeft}`}><SlidersHorizontal /></span>
      <span className={`${styles.customVisualChip} ${styles.customVisualChipRight}`}><AudienceIcon audience={audience} /></span>
    </div>
  );
}

function StoryProof({ audience }: { audience: QuizAudience }) {
  const { t } = useTranslation();
  const prefix = `quiz.info.story.${audience}`;

  if (audience === 'solo') {
    return (
      <div className={styles.soloStoryStack}>
        {SOLO_TUTOR_STORIES.map(({ id, image }) => (
          <article className={styles.soloStoryCard} key={id}>
            <header>
              <img src={image} alt="" width="400" height="400" loading="lazy" decoding="async" />
              <div>
                <strong>{t(`${prefix}.name${id}`)}</strong>
                <small>{t(`${prefix}.role${id}`)}</small>
              </div>
              <TrustpilotStars compact />
            </header>
            <blockquote>{t(`${prefix}.story${id}`)}</blockquote>
          </article>
        ))}
      </div>
    );
  }

  const brand = audience === 'company'
    ? { image: QUIZ_IMAGE_ASSETS.story.company[0], imageClass: styles.customerLogoProKlase }
    : { image: QUIZ_IMAGE_ASSETS.story.school[0], imageClass: styles.customerLogoLaisvi };

  return (
    <article className={`${styles.customerStoryCard} ${styles[`customerStoryCard_${audience}`]}`}>
      <div className={styles.customerBrandRow}>
        <span className={styles.customerLogoFrame}>
          <img
            className={brand.imageClass}
            src={brand.image}
            alt={t(`${prefix}.brandAlt`)}
            width="256"
            height="256"
            loading="lazy"
            decoding="async"
          />
        </span>
        <div>
          <strong>{t(`${prefix}.customerName`)}</strong>
          <small>{t(`${prefix}.customerType`)}</small>
          <TrustpilotStars compact />
        </div>
      </div>
      <p className={styles.customerStoryCopy}>{t(`${prefix}.story`)}</p>
      <div className={styles.customerProofList}>
        {[1, 2, 3].map((item) => (
          <span key={item}><CircleCheckBig aria-hidden="true" />{t(`${prefix}.proof${item}`)}</span>
        ))}
      </div>
      <p className={styles.customerStoryDetail}>{t(`${prefix}.detail`)}</p>
    </article>
  );
}

function BusinessCardScreen({
  locale,
  onContinue,
}: {
  locale: string;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const previewImage = getQuizBusinessCardImage(locale);

  return (
    <section className={`${styles.contentScreen} ${styles.businessCardScreen} ${styles.withFloatingProceed} ${styles.screenEnter}`}>
      <p className={styles.eyebrow}>{t('quiz.businessCard.eyebrow')}</p>
      <h1>{t('quiz.businessCard.title')}</h1>
      <p className={styles.businessCardIntro}>{t('quiz.businessCard.body')}</p>

      <figure className={styles.businessCardPreview}>
        <div className={styles.businessCardImageShell}>
          <span className={styles.businessCardGlow} aria-hidden="true" />
          <img
            src={previewImage}
            alt={t('quiz.businessCard.previewAlt')}
            width="1122"
            height="1402"
            loading="lazy"
            decoding="async"
          />
        </div>
      </figure>

      <div className={styles.businessCardBenefits} role="list" aria-label={t('quiz.businessCard.benefitsLabel')}>
        {BUSINESS_CARD_BENEFIT_VISUALS.map((visual, index) => (
          <div key={index} role="listitem">
            <BusinessCardBenefitIcon visual={visual} />
            <p>
              <strong>{t(`quiz.businessCard.benefit${index + 1}.title`)}</strong>
              <small>{t(`quiz.businessCard.benefit${index + 1}.body`)}</small>
            </p>
          </div>
        ))}
      </div>

      <FloatingProceedButton label={t('quiz.businessCard.cta')} onClick={onContinue} />
    </section>
  );
}

function AnalysisScreen({ audience }: { audience: QuizAudience }) {
  const { t } = useTranslation();
  return (
    <section className={`${styles.contentScreen} ${styles.analysisScreen} ${styles.screenEnter}`}>
      <RecommendationAnalysisVisual audience={audience} />
      <p className={styles.eyebrow}>{t('quiz.analysis.eyebrow')}</p>
      <h1>{t('quiz.analysis.title')}</h1>
      <p>{t('quiz.analysis.subtitle')}</p>
      <div className={styles.analysisProgress} aria-hidden="true"><span /></div>
      <div className={styles.analysisSteps}>
        {['needs', 'workflow', 'fit'].map((item, index) => (
          <div key={item} style={{ animationDelay: `${650 + index * 1000}ms` }}>
            <CircleCheckBig aria-hidden="true" />
            <span>{t(`quiz.analysis.${item}`)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TransformationScreen({
  audience,
  onContinue,
}: {
  audience: QuizAudience;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const prefix = `quiz.transformation.${audience}`;
  const widths = TRANSFORMATION_BAR_WIDTHS[audience];
  const panels = [
    {
      id: 'before',
      eyebrow: t('quiz.transformation.beforeEyebrow'),
      title: t('quiz.transformation.beforeTitle'),
      level: t('quiz.transformation.beforeLevel'),
      widths: widths.before,
    },
    {
      id: 'after',
      eyebrow: t('quiz.transformation.afterEyebrow'),
      title: t('quiz.transformation.afterTitle'),
      level: t('quiz.transformation.afterLevel'),
      widths: widths.after,
    },
  ] as const;

  return (
    <section className={`${styles.contentScreen} ${styles.transformationScreen} ${styles.withFloatingProceed} ${styles.screenEnter}`}>
      <p className={styles.eyebrow}>{t('quiz.transformation.eyebrow')}</p>
      <h1>{t(`${prefix}.title`)}</h1>
      <p className={styles.transformationIntro}>{t(`${prefix}.subtitle`)}</p>
      <div className={styles.transformationComparison}>
        <div className={styles.transformationBarColumns}>
          {panels.map((panel, panelIndex) => (
            <section
              className={`${styles.transformationBarPanel} ${styles[`transformationBarPanel_${panel.id}`]}`}
              aria-labelledby={`quiz-${panel.id}-title`}
              key={panel.id}
            >
              <div className={styles.transformationBarHeading}>
                <small>{panel.eyebrow}</small>
                <strong id={`quiz-${panel.id}-title`}>{panel.title}</strong>
              </div>
              <div className={styles.transformationIllustration}>
                <img
                  src={panel.id === 'before'
                    ? QUIZ_IMAGE_ASSETS.transformation[0]
                    : QUIZ_IMAGE_ASSETS.transformation[1]}
                  alt={t(`quiz.transformation.${panel.id}IllustrationAlt`)}
                  width="512"
                  height="768"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className={styles.transformationMetrics}>
                {[1, 2, 3].map((item, index) => (
                  <div className={styles.transformationMetric} key={item}>
                    <span>{t(`${prefix}.${panel.id === 'before' ? `before${item}` : `after${item}Title`}`)}</span>
                    <strong>{panel.level}</strong>
                    <div className={styles.transformationBarTrack} aria-hidden="true">
                      <span
                        style={{
                          width: `${panel.widths[index]}%`,
                          animationDelay: `${240 + panelIndex * 220 + index * 130}ms`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <FloatingProceedButton label={t('quiz.transformation.cta')} onClick={onContinue} />
    </section>
  );
}

function EmailScreen({
  audience,
  returnTo,
  email,
  consent,
  error,
  submitting,
  onEmailChange,
  onConsentChange,
  onSubmit,
}: {
  audience: QuizAudience;
  returnTo: string;
  email: string;
  consent: boolean;
  error: string;
  submitting: boolean;
  onEmailChange: (value: string) => void;
  onConsentChange: (value: boolean) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const { locale, t } = useTranslation();
  return (
    <section className={`${styles.contentScreen} ${styles.emailScreen} ${styles.screenEnter}`}>
      <RecommendationEmailVisual />
      <p className={styles.eyebrow}>{t('quiz.email.eyebrow')}</p>
      <h1>{t(`quiz.email.${audience}.title`)}</h1>
      <p className={styles.emailBody}>{t(`quiz.email.${audience}.body`)}</p>
      <form className={styles.emailForm} onSubmit={onSubmit} noValidate>
        <label htmlFor="quiz-email">{t('quiz.email.label')}</label>
        <input
          id="quiz-email"
          type="email"
          autoComplete="email"
          placeholder={t('quiz.email.placeholder')}
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'quiz-email-error' : undefined}
        />
        <label className={styles.consentRow}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => onConsentChange(event.target.checked)}
          />
          <span>{t('quiz.email.consent')}</span>
        </label>
        {error && <p id="quiz-email-error" className={styles.formError} role="alert">{error}</p>}
        <button className={styles.primaryButton} type="submit" disabled={submitting}>
          {submitting ? t('quiz.email.submitting') : t('quiz.email.cta')}
          {!submitting && <ArrowRight aria-hidden="true" />}
        </button>
      </form>
      <p className={styles.emailPrivacy}>
        <ShieldCheck aria-hidden="true" />
        <span>
          {t('quiz.email.privacy')}{' '}
          <Link
            to={buildLocalizedPath('/privacy-policy', locale)}
            state={{ returnTo }}
          >
            {t('quiz.email.privacyLink')}
          </Link>
        </span>
      </p>
    </section>
  );
}

function OfferScreen({
  audience,
  answers,
  hostedCancelPath,
}: {
  audience: QuizAudience;
  answers: QuizAnswers;
  hostedCancelPath: string;
}) {
  const { t } = useTranslation();
  const [contactOpen, setContactOpen] = useState(false);
  const questions = getQuizQuestions(audience);
  const adminQuestion = questions.find((item) => item.id === 'adminTime');
  const adminOption = adminQuestion ? getQuizOption(adminQuestion, answers.adminTime) : undefined;
  const features = getQuizResultFeatures(audience, answers.friction);

  function scrollToOfferAction() {
    document.getElementById('quiz-offer-action')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className={styles.resultScreen}>
      <div className={styles.resultStickyCta} data-testid="offer-sticky-cta">
        <TutlioLogo />
        <button type="button" onClick={scrollToOfferAction}>
          {t('quiz.offer.getTutlio')}<ArrowRight aria-hidden="true" />
        </button>
      </div>
      <div className={`${styles.resultBody} ${styles.screenEnter}`}>
        <div className={styles.resultHero}>
          <h1>{t(`quiz.result.${audience}.title`)}</h1>
          <p>{t(`quiz.result.${audience}.subtitle`)}</p>
        </div>
        <div className={styles.offerStrip}>
          <strong>{t(`quiz.offer.${audience}.name`)}</strong>
          <p>{t(`quiz.offer.${audience}.promise`)}</p>
          <div>
            {[1, 2, 3].map((item) => (
              <span key={item}><Check aria-hidden="true" />{t(`quiz.offer.${audience}.benefit${item}`)}</span>
            ))}
          </div>
        </div>
        <div className={styles.loadCard}>
          <img
            src={QUIZ_IMAGE_ASSETS.offerWorkload}
            alt=""
            width="384"
            height="384"
            loading="lazy"
            decoding="async"
            aria-hidden="true"
          />
          <div>
            <span>{t('quiz.result.adminLoad')}</span>
            <strong>{adminOption ? t(adminOption.labelKey) : t('quiz.result.adminLoadUnknown')}</strong>
          </div>
          <span className={styles.fitPill}>{t('quiz.result.fit')}</span>
        </div>
        <button className={styles.offerJumpCta} type="button" onClick={scrollToOfferAction}>
          {t('quiz.offer.getTutlio')}<ArrowRight aria-hidden="true" />
        </button>
        <TimeSavingsSection audience={audience} />
        <div className={styles.resultFeatures}>
          <div className={styles.resultFeaturesHeading}>
            <h2>{t(`quiz.result.included.${audience}`)}</h2>
            <p>{t(`quiz.result.includedBody.${audience}`)}</p>
          </div>
          {features.map((feature, index) => (
            <article
              className={index === 0 && answers.friction ? styles.resultFeatureMatched : undefined}
              key={`${feature.titleKey}-${index}`}
            >
              <span><Check aria-hidden="true" /></span>
              <div>
                <h3>{t(feature.titleKey)}</h3>
                <p>{t(feature.descriptionKey)}</p>
              </div>
            </article>
          ))}
        </div>
        {audience === 'solo' && (
          <section className={styles.pricingOfferSection} id="quiz-offer-action">
            <h2>{t('quiz.offer.solo.choosePlan')}</h2>
            <p>{t('quiz.offer.solo.choosePlanBody')}</p>
            <TutorPlanCards
              checkoutAudience="tutor"
              checkoutMode="embedded"
              hostedCancelPath={hostedCancelPath}
              ctaLabel={t('quiz.offer.startFreeNow')}
            />
            <MoneyBackGuarantee />
            <OfferTestimonials audience={audience} />
          </section>
        )}

        {audience === 'company' && (
          <section className={styles.pricingOfferSection} id="quiz-offer-action">
            <h2>{t('quiz.offer.company.choosePlan')}</h2>
            <p>{t('quiz.offer.company.choosePlanBody')}</p>
            <EnterprisePlanCard
              audience="tutor"
              onBookDemo={() => setContactOpen(true)}
              contactLabel={t('quiz.offer.bookCall')}
              compact
            />
            <MoneyBackGuarantee />
            <OfferTestimonials audience={audience} />
          </section>
        )}

        {audience === 'school' && (
          <div className={styles.resultCtaCard} id="quiz-offer-action">
            <h2>{t('quiz.result.school.ctaTitle')}</h2>
            <p>{t('quiz.result.school.ctaBody')}</p>
            <button className={styles.resultPrimaryCta} type="button" onClick={() => setContactOpen(true)}>
              {t('quiz.offer.bookCall')}<ArrowRight aria-hidden="true" />
            </button>
            <small><ShieldCheck aria-hidden="true" />{t('quiz.offer.school.next')}</small>
          </div>
        )}
        {audience === 'school' && <OfferTestimonials audience={audience} />}
        <OfferFooter returnTo={hostedCancelPath} />
      </div>
      {audience !== 'solo' && (
        <EnterpriseContactModal open={contactOpen} onOpenChange={setContactOpen} />
      )}
    </section>
  );
}

function OfferTestimonials({ audience }: { audience: QuizAudience }) {
  const { t } = useTranslation();
  const testimonials = OFFER_TESTIMONIALS[audience];
  const [activeIndex, setActiveIndex] = useState(0);
  const testimonial = testimonials[activeIndex];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % testimonials.length);
    }, 5200);
    return () => window.clearInterval(interval);
  }, [testimonials.length]);

  return (
    <section className={styles.offerTestimonials} aria-labelledby={`quiz-offer-testimonials-${audience}`}>
      <div className={styles.offerTestimonialsHeading}>
        <div>
          <h3 id={`quiz-offer-testimonials-${audience}`}>{t(`quiz.offer.testimonials.title.${audience}`)}</h3>
        </div>
      </div>
      <article className={styles.offerTestimonialCard} key={`${audience}-${activeIndex}`}>
        <header>
          <span
            className={`${styles.offerTestimonialImage} ${styles[`offerTestimonialImage_${audience}`]} ${
              !testimonial.image ? styles[`offerTestimonialMonogram_${(activeIndex % 3) + 1}`] : ''
            }`}
            aria-hidden={!testimonial.image}
          >
            {testimonial.image ? (
              <img
                src={testimonial.image}
                alt={testimonial.brandAltKey ? t(testimonial.brandAltKey) : ''}
                width="400"
                height="400"
                loading="lazy"
                decoding="async"
              />
            ) : (
              t(testimonial.nameKey)
                .split(/\s+/)
                .map((word) => word[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()
            )}
          </span>
          <div>
            <strong>{t(testimonial.nameKey)}</strong>
            <small>{t(testimonial.roleKey)}</small>
          </div>
          <TrustpilotStars compact />
        </header>
        <p>{t(testimonial.copyKey)}</p>
      </article>
      <div className={styles.offerTestimonialDots} aria-label={t('quiz.offer.testimonials.navigation')}>
        {testimonials.map((_, index) => (
          <button
            type="button"
            className={index === activeIndex ? styles.offerTestimonialDotActive : undefined}
            onClick={() => setActiveIndex(index)}
            aria-label={t('quiz.offer.testimonials.goTo', { number: index + 1 })}
            aria-current={index === activeIndex ? 'true' : undefined}
            key={index}
          />
        ))}
      </div>
    </section>
  );
}

function MoneyBackGuarantee() {
  const { t } = useTranslation();

  return (
    <aside className={styles.moneyBackGuarantee} aria-labelledby="quiz-money-back-title">
      <img
        src={QUIZ_IMAGE_ASSETS.moneyBackGuarantee}
        alt=""
        width="384"
        height="256"
        loading="lazy"
        decoding="async"
        aria-hidden="true"
      />
      <div>
        <h3 id="quiz-money-back-title">{t('quiz.offer.guarantee.title')}</h3>
        <p>{t('quiz.offer.guarantee.body')}</p>
      </div>
    </aside>
  );
}

function TimeSavingsSection({ audience }: { audience: QuizAudience }) {
  const { t } = useTranslation();
  const titleId = `quiz-time-savings-${audience}`;

  return (
    <section className={styles.timeSavingsSection} aria-labelledby={titleId}>
      <h2 id={titleId}>{t(`quiz.offer.savings.title.${audience}`)}</h2>
      <p>{t('quiz.offer.savings.subtitle')}</p>
      <div className={styles.timeSavingsTotal}>
        <strong>{t(`quiz.offer.savings.total.${audience}`)}</strong>
        <span>{t('quiz.offer.savings.totalLabel')}</span>
      </div>
      <div className={styles.timeSavingsList} role="list" aria-label={t('quiz.offer.savings.listLabel')}>
        {[1, 2, 3].map((item) => (
          <div role="listitem" key={item}>
            <strong>{t(`quiz.offer.savings.${audience}.item${item}.value`)}</strong>
            <span>
              <b>{t(`quiz.offer.savings.${audience}.item${item}.title`)}</b>
              <small>{t(`quiz.offer.savings.${audience}.item${item}.body`)}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function OfferFooter({ returnTo }: { returnTo: string }) {
  const { t, locale } = useTranslation();
  const policyState = { returnTo };

  return (
    <footer className={styles.offerFooter}>
      <nav aria-label={t('quiz.offer.footer.policies')}>
        <Link to={buildLocalizedPath('/terms', locale)} state={policyState}>{t('legal.termsOfService')}</Link>
        <Link to={buildLocalizedPath('/privacy-policy', locale)} state={policyState}>{t('legal.privacyPolicy')}</Link>
        <Link to={buildLocalizedPath('/dpa', locale)} state={policyState}>{t('legal.dpa')}</Link>
      </nav>
      <p>{t('quiz.offer.footer.madeWithLove')}</p>
    </footer>
  );
}
