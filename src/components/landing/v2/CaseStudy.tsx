import { Linkedin, Quote } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { CASE_STUDY, PLACEHOLDER_CASE_STUDY, SHOW_PLACEHOLDER_SOCIAL_PROOF } from './socialProof';

export default function CaseStudySection() {
  const { t } = useTranslation();
  const study = CASE_STUDY ?? (SHOW_PLACEHOLDER_SOCIAL_PROOF ? PLACEHOLDER_CASE_STUDY : null);
  if (!study) return null;

  return (
    <section className="bg-zinc-100">
      <div className="mx-auto w-full max-w-[1224px] px-5 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mb-10 text-center sm:mb-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 sm:text-sm">
            {t('landing.v2.caseLabel')}
          </p>
          <h2 className="mx-auto mt-3 max-w-3xl font-display text-2xl font-bold tracking-[-0.5px] text-zinc-900 sm:text-3xl">
            {study.headline}
          </h2>
        </div>

        <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-zinc-200/50">
          <div className="flex flex-col justify-between gap-6 border-b border-zinc-100 px-8 py-6 sm:flex-row sm:items-center sm:px-12 sm:py-8">
            {study.logo ? (
              <img src={study.logo} alt={study.org} className="h-10 w-auto max-w-[200px] object-contain object-left sm:h-12" />
            ) : (
              <span className="font-display text-lg font-semibold text-zinc-900">{study.org}</span>
            )}
            <div className="flex items-center gap-8 sm:gap-10">
              {study.stats.map((stat, i) => (
                <div key={stat.label} className="flex items-center gap-8 sm:gap-10">
                  {i > 0 && <div className="h-12 w-px bg-zinc-200" />}
                  <div>
                    <p className="font-display text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">{stat.value}</p>
                    <p className="mt-0.5 text-sm text-zinc-500">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-8 py-10 sm:px-12 sm:py-12 lg:py-14">
            <Quote className="mb-4 h-10 w-10 text-zinc-200 sm:h-12 sm:w-12" />
            <blockquote>
              <p className="font-display text-xl leading-relaxed text-zinc-600 sm:text-2xl sm:leading-relaxed">
                {study.quote.map((run, i) => (
                  <span key={i} className={run.emphasis ? 'font-semibold text-zinc-900' : undefined}>
                    {run.text}
                  </span>
                ))}
              </p>
            </blockquote>
            <div className="mt-8 flex items-center gap-4 sm:mt-10">
              {study.authorPhoto ? (
                <img src={study.authorPhoto} alt={study.authorName} className="h-14 w-14 shrink-0 rounded-full object-cover sm:h-16 sm:w-16" />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-400 sm:h-16 sm:w-16">
                  —
                </span>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-display text-base font-semibold text-zinc-900 sm:text-lg">{study.authorName}</p>
                  {study.authorLinkedIn && (
                    <a
                      href={study.authorLinkedIn}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${study.authorName} on LinkedIn`}
                      className="text-zinc-400 transition-colors hover:text-[#0A66C2]"
                    >
                      <Linkedin className="h-4 w-4" />
                    </a>
                  )}
                </div>
                <p className="text-sm text-zinc-500">{study.authorRole}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
