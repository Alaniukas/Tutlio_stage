import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { useTranslation } from '@/lib/i18n';
import { resolveField, formatBlogDate } from '@/lib/blogLocale';
import { markdownToHtml } from '@/lib/markdown';
import { usePlatform } from '@/contexts/PlatformContext';
import { applyDefaultDocumentMeta } from '@/lib/documentMeta';

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const { t, locale } = useTranslation();
  const { platform } = usePlatform();
  const [post, setPost] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/admin-blog?slug=${encodeURIComponent(slug)}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then(d => setPost(d.post))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  const title = post ? resolveField(post, 'title', locale) : '';
  const content = post ? resolveField(post, 'content', locale) : '';

  useEffect(() => {
    if (title) document.title = `${title} | Tutlio`;
    return () => applyDefaultDocumentMeta(locale, platform);
  }, [title, locale, platform]);

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar />
      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <article className="py-12 sm:py-20">
          <div className="max-w-[720px] mx-auto px-5 sm:px-6">
            <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-8">
              <ArrowLeft className="w-4 h-4" /> {t('blog.backToAll')}
            </Link>

            {loading ? (
              <div className="text-center text-gray-400 py-20">{t('common.loadingDots')}</div>
            ) : notFound || !post ? (
              <div className="text-center py-20">
                <p className="text-gray-400 text-lg mb-4">{t('blog.notFound')}</p>
                <Link to="/blog" className="text-indigo-600 font-semibold text-sm hover:underline">{t('blog.backToAll')}</Link>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-4">
                    {post.tag && <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold">{String(post.tag)}</span>}
                    {post.published_at && (
                      <time className="text-sm text-gray-400">
                        {formatBlogDate(String(post.published_at), locale, { year: 'numeric', month: 'long', day: 'numeric' })}
                      </time>
                    )}
                  </div>
                  <h1 className="font-display text-3xl md:text-4xl text-gray-900 font-bold leading-tight tracking-tight">{title}</h1>
                </div>

                {post.cover_image && (
                  <div className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-[16/9] mb-10">
                    <img src={String(post.cover_image)} alt={title} className="absolute inset-0 w-full h-full object-cover" />
                  </div>
                )}

                <div className="blog-content prose prose-gray max-w-none" dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
              </>
            )}
          </div>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
