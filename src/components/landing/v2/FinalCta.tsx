import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import { marketingAudienceFromLanding } from '@/lib/marketingAudience';
import Reveal from '../Reveal';
import type { LandingAudience } from './audience';

/** Risk-reversal chips. These must stay true for Tutlio — the 7-day trial does
 *  ask for card details, so there is deliberately no "no credit card" claim. */
const CHIPS = ['landing.v2.chip1', 'landing.v2.chip2', 'landing.v2.chip3'];

export default function FinalCta({ audience }: { audience: LandingAudience }) {
  const { t, locale } = useTranslation();
  const pricingHref = `${buildLocalizedPath('/pricing', locale)}?audience=${marketingAudienceFromLanding(audience)}`;

  return (
    <section className="bg-zinc-50">
      <div className="mx-auto w-full max-w-[1224px] px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <Reveal>
          <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm sm:p-10 lg:p-12">
            <h2 className="font-display text-2xl font-bold tracking-[-1px] text-zinc-900 sm:text-3xl">
              {t('landing.ctaTitle')}
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-base text-zinc-600">{t('landing.ctaDesc')}</p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                to={pricingHref}
                className="w-full rounded-lg bg-zinc-900 px-7 py-3.5 font-semibold text-white transition-colors hover:bg-zinc-800 sm:w-auto sm:px-8"
              >
                {t('landing.startFree')}
              </Link>
              <Link
                to={buildLocalizedPath('/features', locale)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-6 py-3.5 font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 sm:w-auto"
              >
                {t('landing.v2.ctaSecondary')}
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {CHIPS.map((key) => (
                <div key={key} className="flex items-center gap-1.5 text-sm text-zinc-500">
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>{t(key)}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
