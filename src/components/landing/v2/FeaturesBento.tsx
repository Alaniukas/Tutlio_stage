import { useTranslation } from '@/lib/i18n';
import Reveal from '../Reveal';
import FinanceMockup from './FinanceMockup';
import PhoneFrame from './PhoneFrame';
import StudentPaymentsScreen from './StudentPaymentsScreen';
import StudentProfileMockup from './StudentProfileMockup';
import WaitlistPipeline from './WaitlistPipeline';

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

export default function FeaturesBento() {
  const { t } = useTranslation();

  return (
    <section id="features" className="scroll-mt-20 bg-zinc-50 py-16 sm:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-[1224px] px-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:gap-8 lg:gap-10">
          {/* Row 1 — full-width dark calendar card */}
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
                  src="/landing/calendar.png"
                  alt={t('landing.calendarAlt')}
                  loading="lazy"
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

          {/* Row 2 — student portal (phone) + finance. Heading leads on the
              left, trails the visual on the right. */}
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

          {/* Row 3 — waitlist (dark) + student database */}
          <div className="flex flex-col gap-6 sm:gap-8 xl:flex-row">
            <Reveal direction="left" className="xl:flex-1">
              <div className="h-full overflow-hidden rounded-3xl bg-zinc-900">
                <div className="flex h-full flex-col gap-6 px-5 pt-5 sm:gap-8 sm:px-8 sm:pt-8">
                  <div className="max-w-[597px]">
                    <CardHeading title={t('landing.v2.bento4Title')} sub={t('landing.v2.bento4Sub')} dark />
                  </div>
                  {/* Fills the card and clips at its bottom edge. */}
                  <div className="min-h-0 flex-1">
                    <WaitlistPipeline />
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
