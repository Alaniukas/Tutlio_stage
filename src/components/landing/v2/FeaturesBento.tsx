import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Star } from 'lucide-react';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import Reveal from '../Reveal';
import type { LandingAudience } from './audience';
import { MiniAvatar } from './demoAvatars';
import FinanceMockup from './FinanceMockup';
import PhoneFrame from './PhoneFrame';
import StudentPaymentsScreen from './StudentPaymentsScreen';
import StudentProfileMockup from './StudentProfileMockup';
import { getLandingDemoPersonas } from './demoPersonas';

function CardHeading({ title, sub, dark }: { title: string; sub: string; dark?: boolean }) {
  return (
    <div className="flex flex-col gap-2 sm:gap-3">
      <h3 className={`font-display text-lg font-semibold leading-[1.35] sm:text-xl lg:text-2xl ${dark ? 'text-white' : 'text-zinc-900'}`}>
        {title}
      </h3>
      <p className={`text-[15px] font-normal leading-[1.6] sm:text-base ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
        {sub}
      </p>
    </div>
  );
}

/** Solo: richer mock of the real public tutor page (link-in-bio). */
function PublicCardMock() {
  const { locale, t } = useTranslation();
  const personas = getLandingDemoPersonas(locale);
  const weekdays = t('landing.v2.demo.weekdays').split('|');
  const slots = [`${weekdays[4]} 16:00`, `${weekdays[1]} 17:30`, `${weekdays[3]} 18:00`];

  return (
    <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-3 py-2 text-[10px] text-zinc-400">
        <span>{personas.publicProfileUrl}</span>
        <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700">Live</span>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <MiniAvatar seed="rasa-public" alt={personas.publicTutor} size="lg" ring className="!h-12 !w-12" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[14px] font-semibold text-zinc-900">{personas.publicTutor}</p>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
                {t('landing.v2.demo.verified')}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{t('landing.v2.demo.mathTutorTagline')}</p>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-600">
              <span className="inline-flex items-center gap-0.5 font-semibold text-amber-600">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                4.9
              </span>
              <span className="text-zinc-400">·</span>
              <span>{t('landing.v2.demo.reviewsCount', { count: 24 })}</span>
              <span className="text-zinc-400">·</span>
              <span>{personas.city}</span>
            </div>
          </div>
        </div>

        <p className="rounded-lg bg-violet-50/80 px-2.5 py-1.5 text-[11px] italic leading-snug text-violet-900/80">
          {t('landing.v2.demo.mathQuote')}
        </p>

        <div className="grid grid-cols-4 gap-1.5">
          {[
            { key: 'book', label: t('landing.v2.demo.book'), on: true },
            { key: 'about', label: t('landing.v2.demo.about'), on: false },
            { key: 'prices', label: t('landing.v2.demo.prices'), on: false },
            { key: 'reviews', label: t('landing.v2.demo.reviews'), on: false },
          ].map((tab) => (
            <span
              key={tab.key}
              className={`rounded-lg px-1 py-1.5 text-center text-[9px] font-semibold ${
                tab.on ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'
              }`}
            >
              {tab.label}
            </span>
          ))}
        </div>

        <div className="space-y-2 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-white px-2.5 py-2">
            <div>
              <p className="text-[12px] font-semibold text-zinc-900">{t('landing.v2.demo.individualLessons')}</p>
              <p className="text-[10px] text-zinc-500">{t('landing.v2.demo.grades9to12')}</p>
            </div>
            <span className="text-[13px] font-bold text-zinc-900">€30</span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 opacity-80">
            <div>
              <p className="text-[12px] font-semibold text-zinc-900">{t('landing.v2.demo.trialCall')}</p>
              <p className="text-[10px] text-zinc-500">{t('landing.v2.demo.introduction')}</p>
            </div>
            <span className="text-[12px] font-bold text-emerald-700">{t('landing.v2.demo.free')}</span>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{t('landing.v2.animSoloCardSlots')}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {slots.map((s, i) => (
                <span
                  key={s}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                    i === 1 ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-zinc-200 bg-white text-zinc-600'
                  }`}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="flex gap-1.5">
            {[t('landing.v2.demo.online'), personas.city].map((f, i) => (
              <span
                key={f}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                  i === 0 ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-500 ring-1 ring-zinc-200'
                }`}
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-zinc-900 py-2.5 text-center text-[12px] font-semibold text-white">
          {t('landing.v2.demo.continueRequest', { amount: '€30' })}
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-zinc-50 px-2.5 py-2">
          <MiniAvatar seed="monika-k" alt={personas.publicReviewer} size="xs" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-zinc-700">{personas.publicReviewer} · {t('landing.v2.demo.subjectMath')}</p>
            <p className="truncate text-[10px] text-zinc-500">{t('landing.v2.demo.reviewQuote')}</p>
          </div>
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600">
            <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
            5
          </span>
        </div>
      </div>
    </div>
  );
}

/** Agency: team ops — tutors + parent accounts + snapshot (no vizitinė). */
function AgencyOpsMock() {
  const { locale, t } = useTranslation();
  const personas = getLandingDemoPersonas(locale);
  const tutors = [
    { seed: 'rasa-a', name: personas.tutors[0], subject: `${t('landing.v2.demo.subjectMath')} · 8–12`, hours: '18 h', pay: '€420', live: true },
    { seed: 'tomas-k', name: personas.tutors[1], subject: `${t('landing.v2.demo.subjectEnglish')} · B1–C1`, hours: '14 h', pay: '€350', live: true },
    { seed: 'inga-j', name: personas.tutors[2], subject: `${t('landing.v2.demo.subjectPhysics')} · ${t('landing.v2.demo.exams')}`, hours: '11 h', pay: '€275', live: false },
  ];
  const parents = [
    { seed: 'mockai', family: personas.families[0], child: `${personas.children[0]} · ${t('landing.v2.demo.subjectEnglish')}`, pay: t('dash.paidLabel'), ok: true },
    { seed: 'petraiciai', family: personas.families[1], child: `${personas.children[1]} · ${t('landing.v2.demo.subjectMath')}`, pay: t('dash.paidLabel'), ok: true },
    { seed: 'kazlauskai', family: personas.families[2], child: `${personas.children[2]} · ${t('landing.v2.demo.subjectPhysics')}`, pay: '€40', ok: false },
  ];

  return (
    <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-3 py-2">
        <span className="text-[11px] font-semibold text-zinc-700">{t('landing.v2.demo.agencySummary')}</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">9 {t('landing.v2.demo.online')}</span>
      </div>

      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'lessons', label: t('common.lessons'), value: '86' },
            { key: 'revenue', label: t('dash.revenue'), value: '€2 140' },
            { key: 'unpaid', label: t('dash.unpaid'), value: '€320' },
          ].map((s) => (
            <div key={s.key} className="rounded-xl bg-zinc-50 px-2 py-2 text-center">
              <p className="text-[9px] text-zinc-400">{s.label}</p>
              <p className="mt-0.5 text-[13px] font-bold text-zinc-900">{s.value}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{t('landing.v2.animBizTutors')}</p>
            <span className="text-[10px] font-medium text-zinc-500">{t('landing.v2.demo.teamCount', { count: 11 })}</span>
          </div>
          <div className="space-y-1.5">
            {tutors.map((t) => (
              <div key={t.seed} className="flex items-center gap-2 rounded-xl bg-zinc-50 px-2.5 py-2">
                <div className="relative">
                  <MiniAvatar seed={t.seed} alt={t.name} size="sm" />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
                      t.live ? 'bg-emerald-400' : 'bg-zinc-300'
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-zinc-900">{t.name}</p>
                  <p className="truncate text-[10px] text-zinc-500">{t.subject}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold text-zinc-800">{t.hours}</p>
                  <p className="text-[10px] text-emerald-700">{t.pay}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{t('landing.v2.animBizParents')}</p>
          <div className="overflow-hidden rounded-xl border border-zinc-100">
            {parents.map((p, i) => (
              <div
                key={p.seed}
                className={`flex items-center gap-2 px-2.5 py-2 ${i > 0 ? 'border-t border-zinc-100' : ''}`}
              >
                <MiniAvatar seed={p.seed} alt={p.family} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold text-zinc-900">{p.family}</p>
                  <p className="truncate text-[10px] text-zinc-500">{p.child}</p>
                </div>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                    p.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {p.ok ? t('landing.v2.profileParentActive') : t('landing.v2.demo.waiting')}
                </span>
                <span className={`w-14 text-right text-[10px] font-semibold ${p.ok ? 'text-zinc-600' : 'text-amber-700'}`}>
                  {p.pay}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FeaturesBento({ audience }: { audience: LandingAudience }) {
  const { locale, t } = useTranslation();
  const isSolo = audience === 'solo';
  const calendarAudience = isSolo ? 'solo' : 'agency';
  const digitalBusinessCardPath = buildLocalizedPath('/features/digital-business-card', locale);

  return (
    <section id="features" className="scroll-mt-20 bg-zinc-50 py-16 sm:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-[1224px] px-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:gap-8 lg:gap-10">
          <Reveal>
            <div className="overflow-hidden rounded-3xl bg-zinc-900">
              <div className="px-5 pt-6 sm:px-8 sm:pt-8">
                <div className="max-w-full sm:max-w-[85%] lg:max-w-[70%]">
                  <h2 className="font-display text-2xl font-semibold leading-[1.3] tracking-[-0.5px] text-white sm:text-[32px] sm:tracking-[-1px] lg:text-[40px]">
                    {t('landing.v2.bento1Title')}
                  </h2>
                  <p className="mt-2 text-[15px] leading-[1.6] text-zinc-300 sm:mt-3 sm:text-base">
                    {t('landing.v2.bento1Sub')}
                  </p>
                </div>
              </div>
              <div className="relative mt-6 flex justify-end sm:mt-8">
                <img
                  key={`${calendarAudience}-${locale}`}
                  src={`/landing/calendar-${calendarAudience}-${locale}.jpg`}
                  alt={t('landing.calendarAlt')}
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.src = '/landing/calendar.png';
                  }}
                  className="h-[280px] w-[92%] rounded-tl-2xl object-cover object-left-top sm:h-[360px] sm:w-[88%] lg:h-[443px] lg:w-[84%]"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-20 sm:h-32"
                  style={{ background: 'linear-gradient(to top, #18181b 0%, transparent 100%)' }}
                />
              </div>
            </div>
          </Reveal>

          <div className="flex flex-col gap-6 sm:gap-8 xl:flex-row">
            <Reveal direction="left" className="xl:w-[42%]">
              <div className="h-full overflow-hidden rounded-3xl bg-white">
                <div className="flex h-full min-h-[560px] flex-col gap-5 px-5 pt-6 sm:min-h-[620px] sm:px-8 sm:pt-8">
                  <CardHeading title={t('landing.v2.bento2Title')} sub={t('landing.v2.bento2Sub')} />
                  <div className="flex flex-1 items-center justify-center pb-6 pt-2">
                    <PhoneFrame>
                      <StudentPaymentsScreen />
                    </PhoneFrame>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal direction="right" delay={120} className="xl:flex-1">
              <div className="h-full overflow-hidden rounded-3xl bg-white">
                <div className="flex h-full min-h-[560px] flex-col justify-between gap-6 p-5 sm:min-h-[620px] sm:p-8">
                  <div className="flex flex-1 items-center">
                    <FinanceMockup />
                  </div>
                  <CardHeading title={t('landing.v2.bento3Title')} sub={t('landing.v2.bento3Sub')} />
                </div>
              </div>
            </Reveal>
          </div>

          <div className="flex flex-col gap-6 sm:gap-8 xl:flex-row">
            <Reveal direction="left" className="xl:flex-1">
              <div className="h-full overflow-hidden rounded-3xl bg-zinc-900">
                <div className="flex h-full flex-col gap-6 px-5 py-5 sm:gap-8 sm:px-8 sm:py-8">
                  <div className="max-w-[597px]">
                    {isSolo ? (
                      <div className="mb-4 flex flex-wrap items-center gap-3">
                        <span className="rounded-full bg-violet-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                          {t('featuresIndex.newBadge')}
                        </span>
                        <span className="text-xs font-semibold text-zinc-400">{t('landing.v2.audienceSolo')}</span>
                      </div>
                    ) : null}
                    <CardHeading
                      title={t(isSolo ? 'landing.v2.bento4Title' : 'landing.v2.bento4TitleBiz')}
                      sub={t(isSolo ? 'landing.v2.bento4Sub' : 'landing.v2.bento4SubBiz')}
                      dark
                    />
                    {isSolo ? (
                      <Link
                        to={digitalBusinessCardPath}
                        className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/35 hover:bg-white/15"
                      >
                        {t('landing.v2.businessCardCta')}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}
                  </div>
                  <div className="flex flex-1 items-center justify-center pb-2">
                    {isSolo ? <PublicCardMock /> : <AgencyOpsMock />}
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal direction="right" delay={120} className="xl:w-[420px] xl:shrink-0">
              <div className="h-full overflow-hidden rounded-3xl bg-white">
                <div className="flex h-full flex-col justify-between gap-6 p-5 sm:gap-8 sm:p-8">
                  <div className="flex flex-1 items-center justify-center">
                    <StudentProfileMockup />
                  </div>
                  <CardHeading title={t('landing.v2.bento5Title')} sub={t('landing.v2.bento5Sub')} />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
