import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { useTranslation } from '@/lib/i18n';
import { resolveField, formatBlogDate } from '@/lib/blogLocale';

export default function Blog() {
  const { t, locale } = useTranslation();
  const [posts, setPosts] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin-blog')
      .then(r => r.json())
      .then(d => setPosts(d.posts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const title = (p: Record<string, unknown>) => resolveField(p, 'title', locale);
  const excerpt = (p: Record<string, unknown>) => resolveField(p, 'excerpt', locale);
  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar />
      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <section className="py-16 sm:py-24">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
            <h1 className="font-display text-3xl md:text-4xl text-gray-900 font-bold tracking-tight mb-3">
              {t('landing.blogTitle')}
            </h1>
            <p className="text-gray-500 text-base max-w-xl mb-12">
              {t('blog.subtitle')}
            </p>

            {loading ? (
              <div className="text-center text-gray-400 py-16">{t('common.loadingDots')}</div>
            ) : posts.length === 0 ? (
              <div className="text-center text-gray-400 py-16">{t('blog.empty')}</div>
            ) : (
              <>
                {featured && (
                  <Link to={`/blog/${String(featured.slug)}`} className="group block mb-12">
                    <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-center">
                      {featured.cover_image ? (
                        <div className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-[16/10]">
                          <img src={String(featured.cover_image)} alt={title(featured)}
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        </div>
                      ) : (
                        <div className="rounded-2xl bg-gray-100 aspect-[16/10]" />
                      )}
                      <div>
                        {featured.tag && (
                          <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold mb-3">{String(featured.tag)}</span>
                        )}
                        <h2 className="font-display text-xl md:text-2xl text-gray-900 font-bold leading-snug mb-3 group-hover:text-indigo-600 transition-colors">
                          {title(featured)}
                        </h2>
                        <p className="text-gray-500 text-sm leading-relaxed mb-4 line-clamp-3">{excerpt(featured)}</p>
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
                          {t('blog.readMore')} <ArrowRight className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </Link>
                )}

                {rest.length > 0 && (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {rest.map((post) => (
                      <Link key={String(post.id)} to={`/blog/${String(post.slug)}`} className="group">
                        {post.cover_image ? (
                          <div className="relative rounded-xl overflow-hidden bg-gray-100 aspect-[16/10] mb-4">
                            <img src={String(post.cover_image)} alt={title(post)}
                              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                          </div>
                        ) : (
                          <div className="rounded-xl bg-gray-100 aspect-[16/10] mb-4" />
                        )}
                        <div className="flex items-center gap-2 mb-2">
                          {post.tag && <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-semibold">{String(post.tag)}</span>}
                          {post.published_at && <span className="text-[11px] text-gray-400">{formatBlogDate(String(post.published_at), locale)}</span>}
                        </div>
                        <h3 className="font-semibold text-gray-900 leading-snug group-hover:text-indigo-600 transition-colors mb-1">{title(post)}</h3>
                        <p className="text-gray-500 text-sm line-clamp-2">{excerpt(post)}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
