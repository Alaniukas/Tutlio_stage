import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, Circle, Minus, X } from 'lucide-react';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import BigDifferenceBand from '@/components/landing/v2/BigDifferenceBand';
import { applyPageDocumentMeta } from '@/lib/documentMeta';
import {
  COMPARE_FAQ_INDEXES,
  COMPARE_GLANCE_KEYS,
  COMPARE_HUB_PATH,
  COMPARE_REASON_INDEXES,
  COMPARE_REVIEWED_ON,
  COMPARE_ROWS,
  COMPARISON_PAGE_IDS,
  COMPARISON_PAGES,
  type CompareCell,
  isComparisonPageId,
} from '@/lib/comparisonPages';
import { formatReviewedDate } from '@/lib/compareReviewedDate';
import { landingPathForAudience } from '@/lib/marketingAudience';

const CELL_ICON = {
  yes: { Icon: Check, className: 'bg-emerald-100 text-emerald-700' },
  partial: { Icon: Circle, className: 'bg-amber-100 text-amber-700' },
  no: { Icon: X, className: 'bg-red-100 text-red-700' },
  na: { Icon: Minus, className: 'bg-zinc-100 text-zinc-500' },
} as const;

function MatrixCell({ cell }: { cell: CompareCell }) {
  const { t } = useTranslation();
  const note = cell.noteKey ? t(cell.noteKey) : cell.note;
  if (cell.value === 'text') {
    return <td className="px-3 py-3 align-top text-sm font-medium text-gray-900 sm:px-4">{note}</td>;
  }
  const { Icon, className } = CELL_ICON[cell.value];
  return (
    <td className="px-3 py-3 align-top sm:px-4">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${className}`}>
          <Icon className="h-3 w-3" strokeWidth={3} />
          <span className="sr-only">{t(`compare.legend.${cell.value}`)}</span>
        </span>
        {note ? <span className="text-[13px] leading-snug text-gray-600">{note}</span> : null}
      </div>
    </td>
  );
}

/**
 * Public comparison page (/compare/:competitor). Mirrors the bot-SSR version
 * in api/compare-render.ts — same config and dictionary keys — so crawlers
 * and humans read the same claims.
 */
export default function ComparePage() {
  const { competitor } = useParams<{ competitor: string }>();
  const { t, locale } = useTranslation();
  const id = competitor && isComparisonPageId(competitor) ? competitor : null;
  const cfg = id ? COMPARISON_PAGES[id] : null;
  const params = cfg ? { name: cfg.name, date: formatReviewedDate(locale, COMPARE_REVIEWED_ON) } : undefined;
  const tx = (key: string) => t(key, params);

  useEffect(() => {
    if (!cfg || !params) return;
    applyPageDocumentMeta(t('compare.metaTitle', params), t(`compare.${cfg.keyPrefix}.metaDesc`, params));
  }, [cfg, params, t]);

  if (!id || !cfg) {
    return <Navigate to={buildLocalizedPath(COMPARE_HUB_PATH, locale)} replace />;
  }

  const p = cfg.keyPrefix;
  const pricingPath = buildLocalizedPath('/pricing', locale);
  const others = COMPARISON_PAGE_IDS.filter((other) => other !== id);

  const ctaButtons = (
    <div className="flex flex-wrap justify-center gap-3">
      <Link
        to={`${pricingPath}?audience=solo`}
        className="inline-flex h-12 items-center justify-center rounded-full bg-[#4f46e5] px-8 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:bg-[#4338ca] hover:shadow-lg active:scale-[0.98]"
      >
        {t('compare.ctaSolo')}
      </Link>
      <Link
        to={`${pricingPath}?audience=agency`}
        className="inline-flex h-12 items-center justify-center rounded-full border border-gray-300 px-8 text-sm font-semibold text-gray-700 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
      >
        {t('compare.ctaAgency')}
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar audience="agency" />

      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <section className="relative overflow-hidden bg-white">
          <div className="relative z-10 mx-auto max-w-[1200px] px-6 pb-16 pt-16 text-center">
            <nav aria-label="Breadcrumb" className="mb-5 flex justify-center gap-2 text-[12px] font-medium uppercase tracking-wide text-gray-400">
              <Link to={buildLocalizedPath('/', locale)} className="hover:text-gray-700">Tutlio</Link>
              <span aria-hidden>/</span>
              <Link to={buildLocalizedPath(COMPARE_HUB_PATH, locale)} className="hover:text-gray-700">{t('compare.hub.badge')}</Link>
            </nav>
            <h1 className="font-display mx-auto mb-6 max-w-3xl text-[2rem] font-bold leading-[1.15] tracking-tight text-gray-900 sm:text-[2.75rem] lg:text-[3.25rem]">
              {tx('compare.vsTitle')}
            </h1>
            <div className="mx-auto max-w-2xl space-y-4 text-[15px] leading-relaxed text-gray-600 lg:text-base">
              <p>{tx(`compare.${p}.intro1`)}</p>
              <p>{tx(`compare.${p}.intro2`)}</p>
            </div>
            <div className="mt-8">{ctaButtons}</div>
            <p className="mt-5 text-[13px] text-gray-400">{tx('compare.reviewed')}</p>
          </div>
        </section>

        <BigDifferenceBand />

        <section className="mx-auto max-w-[1200px] px-6 py-14">
          <h2 className="font-display mb-6 text-2xl font-bold text-gray-900 sm:text-3xl">{t('compare.glanceTitle')}</h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-gray-50 text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-3 py-3 sm:px-4" />
                  <th scope="col" className="px-3 py-3 text-[#4f46e5] sm:px-4">Tutlio</th>
                  <th scope="col" className="px-3 py-3 sm:px-4">{cfg.name}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {COMPARE_GLANCE_KEYS.map((k) => (
                  <tr key={k}>
                    <th scope="row" className="w-[22%] px-3 py-3 align-top text-[13px] font-semibold text-gray-500 sm:px-4">{t(`compare.glance.${k}`)}</th>
                    <td className="px-3 py-3 align-top text-gray-800 sm:px-4">{tx(`compare.tutlio.glance.${k}`)}</td>
                    <td className="px-3 py-3 align-top text-gray-800 sm:px-4">{tx(`compare.${p}.glance.${k}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-[#fafaf9] py-14">
          <div className="mx-auto max-w-[1200px] px-6">
            <h2 className="font-display mb-3 text-2xl font-bold text-gray-900 sm:text-3xl">{t('compare.matrixTitle')}</h2>
            <p className="mb-6 max-w-3xl text-[14px] leading-relaxed text-gray-500">{tx('compare.matrixSub')}</p>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-gray-50 text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th scope="col" className="px-3 py-3 sm:px-4" />
                    <th scope="col" className="px-3 py-3 text-[#4f46e5] sm:px-4">Tutlio</th>
                    <th scope="col" className="px-3 py-3 sm:px-4">{cfg.name}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {COMPARE_ROWS.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className="w-[40%] px-3 py-3 align-top text-[14px] font-medium text-gray-900 sm:px-4">{t(`compare.row.${row.key}`)}</th>
                      <MatrixCell cell={row.tutlio} />
                      <MatrixCell cell={row.competitors[id]} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-gray-500">
              {(['yes', 'partial', 'no', 'na'] as const).map((v) => {
                const { Icon, className } = CELL_ICON[v];
                return (
                  <li key={v} className="flex items-center gap-2">
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full ${className}`}>
                      <Icon className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                    {t(`compare.legend.${v}`)}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-6 py-14">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-6 sm:p-8">
              <h2 className="font-display mb-4 text-xl font-bold text-gray-900">{t('compare.chooseTutlio')}</h2>
              <ul className="space-y-3">
                {COMPARE_REASON_INDEXES.map((n) => (
                  <li key={n} className="flex gap-3 text-[14px] leading-relaxed text-gray-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#4f46e5]" strokeWidth={3} />
                    <span>{tx(`compare.${p}.tutlioFor${n}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
              <h2 className="font-display mb-4 text-xl font-bold text-gray-900">{tx('compare.chooseThem')}</h2>
              <ul className="space-y-3">
                {COMPARE_REASON_INDEXES.map((n) => (
                  <li key={n} className="flex gap-3 text-[14px] leading-relaxed text-gray-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" strokeWidth={3} />
                    <span>{tx(`compare.${p}.themFor${n}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="bg-[#f9f9f8] py-16">
          <div className="mx-auto max-w-[760px] px-6">
            <h2 className="font-display mb-8 text-center text-2xl font-bold text-gray-900 sm:text-3xl">{t('compare.faqTitle')}</h2>
            <div className="divide-y divide-gray-200">
              {COMPARE_FAQ_INDEXES.map((n) => (
                <details key={n} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-semibold text-gray-900">
                    {tx(`compare.${p}.faq.q${n}`)}
                    <span className="ml-4 text-gray-400 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-[14px] leading-relaxed text-gray-500">{tx(`compare.${p}.faq.a${n}`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[860px] px-6 py-14">
          <h2 className="font-display mb-3 text-2xl font-bold text-gray-900">{tx('compare.switchTitle')}</h2>
          <p className="text-[15px] leading-relaxed text-gray-600">{t('compare.switchBody')}</p>
          <p className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-[15px] font-medium leading-relaxed text-gray-900">{tx(`compare.${p}.verdict`)}</p>
        </section>

        <section className="bg-[#fafaf9] py-14">
          <div className="mx-auto max-w-[1200px] px-6">
            <h2 className="font-display mb-6 text-2xl font-bold text-gray-900">{t('compare.otherTitle')}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {others.map((other) => (
                <Link
                  key={other}
                  to={buildLocalizedPath(COMPARISON_PAGES[other].path, locale)}
                  className="group rounded-2xl border border-gray-200 bg-white p-5 transition-all hover:border-indigo-200 hover:shadow-lg"
                >
                  <h3 className="text-[15px] font-bold text-gray-900 group-hover:text-[#4f46e5]">{t('compare.vsTitle', { name: COMPARISON_PAGES[other].name })}</h3>
                  <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[#4f46e5]">
                    {t('compare.hub.cardCta')} <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
            <p className="mt-6 text-[13px] text-gray-500">
              <Link to={buildLocalizedPath(landingPathForAudience('solo'), locale)} className="font-medium text-gray-700 underline hover:no-underline">{t('landing.v2.audienceSolo')}</Link>
              <span className="mx-2">·</span>
              <Link to={buildLocalizedPath(landingPathForAudience('biz'), locale)} className="font-medium text-gray-700 underline hover:no-underline">{t('landing.v2.audienceBiz')}</Link>
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-[1200px] px-6 py-20 text-center">
          <h2 className="font-display mb-3 text-2xl font-bold text-gray-900 sm:text-3xl">{t('compare.ctaTitle')}</h2>
          <p className="mx-auto mb-8 max-w-md text-[15px] leading-relaxed text-gray-500">{t('compare.ctaSub')}</p>
          {ctaButtons}
          <p className="mx-auto mt-10 max-w-3xl text-[12px] leading-relaxed text-gray-400">{tx('compare.disclaimer')}</p>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
