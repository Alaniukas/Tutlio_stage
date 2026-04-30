import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { resolveField, formatBlogDate } from '@/lib/blogLocale';
import Reveal from './Reveal';

export default function BlogSection() {
  const { t, locale } = useTranslation();
  const [posts, setPosts] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    fetch('/api/admin-blog')
      .then(r => r.json())
      .then(d => { if (d.posts?.length) setPosts(d.posts.slice(0, 3)); })
      .catch(() => {});
  }, []);

  const title = (p: Record<string, unknown>) => resolveField(p, 'title', locale);

  const featured = posts[0];
  const second = posts[1];
  const third = posts[2];

  if (!featured) {
    return <StaticFallback />;
  }

  return (
    <section className="py-16 sm:py-24 lg:py-32 bg-white">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
        <Reveal>
          <div className="flex items-end justify-between mb-10">
            <h2 className="font-display text-2xl md:text-[2rem] text-gray-900 leading-snug max-w-sm font-bold tracking-tight">
              {t('landing.blogTitle')}
            </h2>
            <Link
              to="/blog"
              className="hidden md:flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 hover:text-gray-600 transition-colors whitespace-nowrap"
            >
              {t('landing.blogSeeAll')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-[1.1fr_1fr] gap-4 sm:gap-5">
          <Reveal delay={100}>
            <Link to={`/blog/${String(featured.slug)}`} className="group relative rounded-2xl overflow-hidden bg-gray-100 min-h-[280px] sm:min-h-[420px] block">
              {featured.cover_image ? (
                <img
                  src={String(featured.cover_image)}
                  alt={title(featured)}
                  className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-violet-600" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                {featured.tag && (
                  <span className="inline-block px-3 py-1 rounded-md bg-white/15 backdrop-blur-sm text-[11px] font-semibold text-white/90 mb-3">
                    {String(featured.tag)}
                  </span>
                )}
                <h3 className="font-display text-lg text-white leading-snug font-semibold">
                  {title(featured)}
                </h3>
              </div>
            </Link>
          </Reveal>

          <Reveal delay={250}>
            <div className="flex flex-col gap-5 h-full">
              {second ? (
                <Link to={`/blog/${String(second.slug)}`} className="rounded-2xl bg-gray-900 p-7 flex flex-col justify-between flex-1 min-h-[195px] group">
                  <span className="text-[11px] font-semibold text-gray-500">
                    {second.published_at ? formatBlogDate(String(second.published_at), locale) : ''}
                  </span>
                  <div>
                    <h3 className="font-semibold text-white text-base leading-snug mb-4 group-hover:text-indigo-300 transition-colors">
                      {title(second)}
                    </h3>
                    <div className="flex items-center gap-3">
                      {second.tag && (
                        <span className="px-3 py-1 rounded-full bg-white/10 text-white/80 text-[11px] font-semibold">
                          {String(second.tag)}
                        </span>
                      )}
                      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center ml-auto">
                        <ArrowRight className="w-3.5 h-3.5 text-white/60" />
                      </div>
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="rounded-2xl bg-gray-900 p-7 flex-1 min-h-[195px]" />
              )}

              {third ? (
                <Link to={`/blog/${String(third.slug)}`} className="group relative rounded-2xl overflow-hidden bg-gray-100 flex-1 min-h-[195px] block">
                  {third.cover_image ? (
                    <img
                      src={String(third.cover_image)}
                      alt={title(third)}
                      className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6">
                    <h3 className="font-semibold text-white text-sm leading-snug">
                      {title(third)}
                    </h3>
                  </div>
                </Link>
              ) : (
                <div className="rounded-2xl bg-gray-100 flex-1 min-h-[195px]" />
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function StaticFallback() {
  const { t } = useTranslation();

  return (
    <section className="py-16 sm:py-24 lg:py-32 bg-white">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
        <Reveal>
          <div className="flex items-end justify-between mb-10">
            <h2 className="font-display text-2xl md:text-[2rem] text-gray-900 leading-snug max-w-sm font-bold tracking-tight">
              {t('landing.blogTitle')}
            </h2>
            <Link
              to="/blog"
              className="hidden md:flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 hover:text-gray-600 transition-colors whitespace-nowrap"
            >
              {t('landing.blogSeeAll')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </Reveal>

        <div className="grid md:grid-cols-[1.1fr_1fr] gap-4 sm:gap-5">
          <Reveal delay={100}>
            <div className="group relative rounded-2xl overflow-hidden bg-gray-100 min-h-[280px] sm:min-h-[420px]">
              <img
                src="/landing/waitlist.png"
                alt={t('landing.blogFeatured')}
                className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <span className="inline-block px-3 py-1 rounded-md bg-white/15 backdrop-blur-sm text-[11px] font-semibold text-white/90 mb-3">
                  {t('landing.blogFeaturedDate')}
                </span>
                <h3 className="font-display text-lg text-white leading-snug font-semibold">
                  {t('landing.blogFeatured')}
                </h3>
              </div>
            </div>
          </Reveal>

          <Reveal delay={250}>
            <div className="flex flex-col gap-5 h-full">
              <div className="rounded-2xl bg-gray-900 p-7 flex flex-col justify-between flex-1 min-h-[195px]">
                <span className="text-[11px] font-semibold text-gray-500">
                  {t('landing.blogPost1Date')}
                </span>
                <div>
                  <h3 className="font-semibold text-white text-base leading-snug mb-4">
                    {t('landing.blogPost1')}
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full bg-white/10 text-white/80 text-[11px] font-semibold">
                      {t('landing.tag.waitlist')}
                    </span>
                    <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center ml-auto">
                      <ArrowRight className="w-3.5 h-3.5 text-white/60" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="group relative rounded-2xl overflow-hidden bg-gray-100 flex-1 min-h-[195px]">
                <img
                  src="/landing/settings.png"
                  alt={t('landing.blogPost2')}
                  className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <h3 className="font-semibold text-white text-sm leading-snug">
                    {t('landing.blogPost2')}
                  </h3>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
