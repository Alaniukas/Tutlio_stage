import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Minus, Plus } from 'lucide-react';
import { buildLocalizedPath, localizedPagePath, useTranslation } from '@/lib/i18n';
import { LOCALE_FORMAT_TAGS } from '@/lib/i18n/locales';
import { localeAvailabilityParams } from '@/lib/i18n/localeAvailability';
import Reveal from '../Reveal';

/**
 * Same five questions the bot renderer already serves as FAQPage JSON-LD
 * (api/page-render.ts). Keep this list in sync with LANDING_FAQ_KEYS there.
 */
const FAQ_KEYS = ['whatIs', 'whoFor', 'waitlist', 'freeTrial', 'languages'] as const;

/** Bump whenever an answer above changes — shown as the freshness signal. */
const FAQ_LAST_UPDATED = '2026-09-01';

export default function FaqSection() {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState<string | null>(FAQ_KEYS[0]);
  const languageParams = localeAvailabilityParams(locale);

  const lastUpdated = new Date(`${FAQ_LAST_UPDATED}T12:00:00`).toLocaleDateString(LOCALE_FORMAT_TAGS[locale], {
    year: 'numeric',
    month: 'long',
  });

  return (
    <section className="bg-zinc-50 px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto flex w-full max-w-[1224px] flex-col items-center gap-8 sm:gap-10 lg:gap-12">
        <Reveal>
          <div className="flex flex-col gap-3 text-left sm:items-center sm:gap-4 sm:text-center">
            <h2 className="font-display text-2xl font-bold tracking-[-1px] text-zinc-900 sm:text-3xl sm:tracking-[-1.5px] lg:text-5xl">
              {t('landing.faqTitle')}
            </h2>
            <p className="max-w-[600px] text-[15px] leading-[1.7] text-zinc-600 sm:text-base">
              {t('landing.v2.faqSub')}
            </p>
            <p className="text-sm text-zinc-500">{lastUpdated}</p>
          </div>
        </Reveal>

        <div className="flex w-full flex-col gap-6 sm:gap-8">
          <div className="space-y-3 sm:space-y-4">
            {FAQ_KEYS.map((key) => {
              const isOpen = open === key;
              return (
                <div key={key} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                  <h3>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : key)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${key}`}
                      className="flex w-full items-center justify-between p-4 text-left sm:p-5 lg:p-6"
                    >
                      <span className="pr-3 text-sm font-semibold text-zinc-900 sm:pr-4 sm:text-base">
                        {t(`landing.faq.${key}Q`)}
                      </span>
                      <span className="shrink-0 rounded-full bg-zinc-900 p-1 text-white">
                        {isOpen
                          ? <Minus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          : <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                      </span>
                    </button>
                  </h3>
                  {isOpen && (
                    <div
                      id={`faq-panel-${key}`}
                      className="border-t border-zinc-100 px-4 pb-4 pt-3 sm:px-5 sm:pb-5 sm:pt-4 lg:px-6 lg:pb-6"
                    >
                      <p className="text-sm leading-relaxed text-zinc-600 sm:text-base">
                        {t(`landing.faq.${key}A`, key === 'languages' ? languageParams : undefined)}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <Link
              to={buildLocalizedPath('/features', locale)}
              className="group inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 underline hover:no-underline sm:text-base"
            >
              {t('landing.v2.exploreAll')}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <p className="text-center text-sm text-zinc-500">
              <Link
                to={buildLocalizedPath(localizedPagePath('contacts', locale), locale)}
                className="font-medium text-zinc-700 underline hover:no-underline"
              >
                {t('common.contacts')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
