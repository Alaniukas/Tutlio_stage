import { Star } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { getTestimonials } from './socialProof';

/**
 * Testimonial marquee. Ratings render visually but are deliberately NOT emitted
 * as Review/aggregateRating JSON-LD — wire that up only once the reviews are
 * real and verifiable, or the rich result is a fabricated one.
 */
export default function Testimonials() {
  const { locale, t } = useTranslation();
  const items = getTestimonials(locale);

  if (items.length === 0) return null;

  return (
    <section className="bg-white py-16 sm:py-20 lg:py-24" aria-labelledby="testimonials-heading">
      <div className="flex flex-col gap-6 sm:gap-8 lg:gap-10">
        <div className="mx-auto w-full max-w-[1224px] px-5 sm:px-6 lg:px-8">
          <h2
            id="testimonials-heading"
            className="text-center font-display text-2xl font-bold tracking-[-1px] text-zinc-900 sm:text-3xl sm:tracking-[-1.5px] lg:text-5xl"
          >
            {t('landing.v2.testimonialsTitle')}
          </h2>
        </div>

        <div className="relative w-full overflow-hidden py-2">
          <div className="flex w-max animate-marquee gap-4 sm:gap-6">
            {[0, 1].map((setIdx) => (
              <div key={setIdx} className="flex shrink-0 gap-4 pr-4 sm:gap-6 sm:pr-6">
                {items.map((item) => (
                  <article
                    key={`${setIdx}-${item.name}`}
                    className="w-[300px] shrink-0 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm sm:w-[360px] sm:p-6 lg:w-[404px]"
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      {item.photo ? (
                        <img
                          src={item.photo}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="h-10 w-10 rounded-full object-cover bg-zinc-100 sm:h-12 sm:w-12"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-500 sm:h-12 sm:w-12">
                          {item.name.replace(/[^\p{L}]/gu, '').slice(0, 2).toUpperCase() || '—'}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-zinc-900 sm:text-base">{item.name}</div>
                        <div className="truncate text-xs text-zinc-500 sm:text-sm">{item.role}</div>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-600 sm:mt-4 sm:text-base">{item.quote}</p>
                    <div className="mt-3 flex items-center gap-2 sm:mt-4">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            aria-hidden
                            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
                              n <= item.rating ? 'fill-amber-400 text-amber-400' : 'text-zinc-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-semibold text-zinc-900 sm:text-base">
                        {item.rating.toFixed(1)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white to-transparent sm:w-16" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white to-transparent sm:w-16" />
        </div>
      </div>
    </section>
  );
}
