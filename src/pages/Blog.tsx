import { useState, useEffect } from 'react';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { useTranslation } from '@/lib/i18n';
import { BlogFeaturedCard, BlogGridCard } from '@/components/blog/BlogCards';

export default function Blog() {
  const { t, locale } = useTranslation();
  const [posts, setPosts] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setPosts([]);
    fetch(`/api/admin-blog?locale=${encodeURIComponent(locale)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { if (!controller.signal.aborted) setPosts(d.posts || []); })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [locale]);

  const featured = posts[0];
  const rest = posts.slice(1);

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar />
      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <section className="py-14 sm:py-20">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
            <div className="max-w-2xl mb-10">
              <h1 className="font-display text-3xl md:text-4xl text-gray-900 font-bold tracking-tight mb-3">
                {t('landing.blogTitle')}
              </h1>
              <p className="text-gray-500 text-base leading-relaxed">{t('blog.subtitle')}</p>
            </div>

            {loading ? (
              <div className="text-center text-gray-400 py-16">{t('common.loadingDots')}</div>
            ) : posts.length === 0 ? (
              <div className="text-center text-gray-400 py-16">{t('blog.empty')}</div>
            ) : (
              <>
                {featured && <BlogFeaturedCard post={featured} />}
                {rest.length > 0 && (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {rest.map((post) => (
                      <BlogGridCard key={String(post.id)} post={post} />
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
