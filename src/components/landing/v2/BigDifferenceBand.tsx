import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { buildLocalizedPath, localizedPagePath, useTranslation } from '@/lib/i18n';

const CHIP_KEYS = ['compare.customChip1', 'compare.customChip2', 'compare.customChip3', 'compare.customChip4'] as const;

/**
 * "The big difference" band on the comparison pages: the one message the
 * pages exist to land - Tutlio is adapted to each client - set apart from
 * the neutral comparison content by colour and size. Mirrored in
 * api/compare-render.ts.
 */
export default function BigDifferenceBand() {
  const { t, locale } = useTranslation();
  const contactsPath = buildLocalizedPath(localizedPagePath('contacts', locale), locale);

  return (
    <section className="mx-auto max-w-[1200px] px-6 py-10">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-indigo-800 to-violet-700 px-6 py-10 text-white shadow-[0_30px_60px_-30px_rgba(49,46,129,0.7)] sm:px-10 sm:py-12 lg:px-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-violet-400/30 blur-3xl"
        />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-[44px]">
              {t('compare.customTitle')}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-indigo-100 sm:text-base">{t('compare.customBody')}</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {CHIP_KEYS.map((key) => (
                <li key={key} className="rounded-full bg-white/10 px-3 py-1 text-[13px] font-medium text-white ring-1 ring-inset ring-white/20">
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>
          <Link
            to={contactsPath}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-indigo-900 shadow-lg transition-transform hover:scale-[1.03] lg:self-center"
          >
            {t('compare.customCta')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
