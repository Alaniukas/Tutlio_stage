import { Link } from 'react-router-dom';
import { ArrowRight, FileSignature, MailCheck, Palette, Wallet } from 'lucide-react';
import { buildLocalizedPath, localizedPagePath, useTranslation } from '@/lib/i18n';
import FeatureIcon from '../FeatureIcon';
import Reveal from '../Reveal';

/**
 * "Built around your process" — anonymised examples of client-specific work
 * Tutlio has shipped. Mirrored by the bot renderer in api/page-render.ts
 * (CUSTOM_EXAMPLE_KEYS); keep the example keys in sync. The examples name no
 * customers and no numbers on purpose.
 */
const EXAMPLES: { key: string; icon: typeof FileSignature }[] = [
  { key: 'ex1', icon: FileSignature },
  { key: 'ex2', icon: Wallet },
  { key: 'ex3', icon: MailCheck },
  { key: 'ex4', icon: Palette },
];

export function CustomizationCallout() {
  const { t, locale } = useTranslation();
  const contactsPath = buildLocalizedPath(localizedPagePath('contacts', locale), locale);

  return (
    <section className="bg-white">
      <div className="mx-auto w-full max-w-[1224px] px-5 pb-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="flex flex-col items-start gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <h2 className="font-display text-xl font-semibold text-zinc-900">{t('landing.custom.soloTitle')}</h2>
              <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-zinc-600">{t('landing.custom.soloNote')}</p>
            </div>
            <Link
              to={contactsPath}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
            >
              {t('landing.custom.cta')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function CustomizationSection() {
  const { t, locale } = useTranslation();
  const contactsPath = buildLocalizedPath(localizedPagePath('contacts', locale), locale);

  return (
    <section id="customization" className="scroll-mt-20 bg-white py-16 sm:py-20 lg:py-24">
      <div className="mx-auto w-full max-w-[1224px] px-5 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-12">
            <h2 className="font-display text-2xl font-semibold leading-[1.25] tracking-[-0.5px] text-zinc-900 sm:text-[32px] sm:tracking-[-1px] lg:text-[40px]">
              {t('landing.custom.title')}
            </h2>
            <p className="mt-4 text-[15px] leading-[1.7] text-zinc-600 sm:text-base">{t('landing.custom.sub')}</p>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
          {EXAMPLES.map((example, index) => {
            return (
              <Reveal key={example.key} delay={index * 80}>
                <article className="flex h-full gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
                  <FeatureIcon icon={example.icon} />
                  <div>
                    <h3 className="text-[15px] font-bold text-zinc-900 sm:text-base">{t(`landing.custom.${example.key}Title`)}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-600">{t(`landing.custom.${example.key}Desc`)}</p>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={200}>
          <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl bg-zinc-900 px-6 py-7 text-center sm:mt-10 sm:flex-row sm:justify-between sm:text-left">
            <p className="max-w-2xl text-[15px] leading-relaxed text-zinc-300">{t('landing.custom.note')}</p>
            <Link
              to={contactsPath}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-100"
            >
              {t('landing.custom.cta')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
