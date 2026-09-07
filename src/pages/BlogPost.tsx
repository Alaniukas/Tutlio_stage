import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Clock } from 'lucide-react';
import LandingNavbar from '@/components/LandingNavbar';
import LandingFooter from '@/components/LandingFooter';
import { useTranslation, buildLocalizedPath } from '@/lib/i18n';
import { resolveField, formatBlogDate, blogPostPath, postSlug } from '@/lib/blogLocale';
import { markdownToHtml } from '@/lib/markdown';
import { extractBlogToc, injectHeadingIds } from '@/lib/blogToc';
import { estimateReadingMinutes } from '@/lib/blogReadingTime';
import { BlogSidebar, BlogInlineCta, BlogHeroCover, BlogAuthorRow } from '@/components/blog/BlogSidebar';
import { usePlatform } from '@/contexts/PlatformContext';
import { applyDefaultDocumentMeta } from '@/lib/documentMeta';

interface RelatedPost {
  id: string;
  slug: string;
  title: string;
  tag: string;
  url: string;
}

function splitHtmlAfterFirstH2(html: string): { before: string; after: string } {
  const idx = html.search(/<\/h2>/i);
  if (idx === -1) return { before: html, after: '' };
  return { before: html.slice(0, idx + 5), after: html.slice(idx + 5) };
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t, locale } = useTranslation();
  const { platform } = usePlatform();
  const [post, setPost] = useState<Record<string, unknown> | null>(null);
  const [related, setRelated] = useState<RelatedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    fetch(`/api/admin-blog?slug=${encodeURIComponent(slug)}&locale=${encodeURIComponent(locale)}`)
      .then(r => { if (!r.ok) throw new Error('Not found'); return r.json(); })
      .then((d: { post?: Record<string, unknown>; redirectSlug?: string; related?: RelatedPost[] }) => {
        if (!d.post) throw new Error('Not found');
        const target = d.redirectSlug || postSlug(d.post, locale);
        if (target && target !== slug) {
          navigate(blogPostPath(d.post, locale), { replace: true });
          return;
        }
        setPost(d.post);
        setRelated(Array.isArray(d.related) ? d.related : []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug, locale, navigate]);

  const title = post ? resolveField(post, 'title', locale) : '';
  const excerpt = post ? resolveField(post, 'excerpt', locale) : '';
  const content = post ? resolveField(post, 'content', locale) : '';

  const toc = useMemo(() => extractBlogToc(content), [content]);
  const readingMin = useMemo(() => estimateReadingMinutes(content || excerpt), [content, excerpt]);
  const contentHtml = useMemo(() => {
    if (!content) return { before: '', after: '' };
    const html = injectHeadingIds(markdownToHtml(content), toc);
    return splitHtmlAfterFirstH2(html);
  }, [content, toc]);

  useEffect(() => {
    if (!toc.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveSection(e.target.id);
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );
    for (const item of toc) {
      const el = document.getElementById(item.id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [toc, contentHtml]);

  useEffect(() => {
    if (title) document.title = `${title} | Tutlio`;
    return () => applyDefaultDocumentMeta(locale, platform);
  }, [title, locale, platform]);

  const homePath = buildLocalizedPath('/', locale);
  const blogPath = buildLocalizedPath('/blog', locale);

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      <LandingNavbar />
      <main className="flex-1 pt-[60px] md:pt-[72px]">
        <article className="py-10 sm:py-14">
          <div className="max-w-[1200px] mx-auto px-5 sm:px-6">
            {loading ? (
              <div className="text-center text-gray-400 py-20">{t('common.loadingDots')}</div>
            ) : notFound || !post ? (
              <div className="text-center py-20">
                <p className="text-gray-400 text-lg mb-4">{t('blog.notFound')}</p>
                <Link to={blogPath} className="text-indigo-600 font-semibold text-sm hover:underline">{t('blog.backToAll')}</Link>
              </div>
            ) : (
              <>
                <nav className="flex flex-wrap items-center gap-1.5 text-sm text-gray-400 mb-6">
                  <Link to={homePath} className="hover:text-indigo-600 transition-colors">{t('blog.breadcrumbHome')}</Link>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <Link to={blogPath} className="hover:text-indigo-600 transition-colors">{t('blog.breadcrumbBlog')}</Link>
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span className="text-gray-600 line-clamp-1">{title}</span>
                </nav>

                <header className="max-w-3xl mb-8">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    {post.tag && (
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                        {String(post.tag)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-400">
                      <Clock className="w-3.5 h-3.5" />
                      {t('blog.minRead', { min: String(readingMin) })}
                    </span>
                    {post.published_at && (
                      <>
                        <span className="text-gray-300">•</span>
                        <time className="text-sm text-gray-400">
                          {formatBlogDate(String(post.published_at), locale, { year: 'numeric', month: 'long', day: 'numeric' })}
                        </time>
                      </>
                    )}
                  </div>
                  <h1 className="font-display text-3xl md:text-[2.5rem] text-gray-900 font-bold leading-tight tracking-tight mb-4">
                    {title}
                  </h1>
                  {excerpt && <p className="text-lg text-gray-500 leading-relaxed">{excerpt}</p>}
                </header>

                <BlogAuthorRow />

                {post.cover_image && (
                  <BlogHeroCover src={String(post.cover_image)} alt={title} title={title} />
                )}

                <div className="grid lg:grid-cols-[minmax(0,1fr)_280px] gap-10 lg:gap-12 items-start">
                  <div className="min-w-0">
                    <div
                      className="blog-content prose prose-gray max-w-none rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm"
                      dangerouslySetInnerHTML={{ __html: contentHtml.before }}
                    />
                    {contentHtml.after && (
                      <>
                        <BlogInlineCta />
                        <div
                          className="blog-content prose prose-gray max-w-none rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm mt-6"
                          dangerouslySetInnerHTML={{ __html: contentHtml.after }}
                        />
                      </>
                    )}
                    {!contentHtml.after && contentHtml.before && (
                      <div className="mt-6">
                        <BlogInlineCta />
                      </div>
                    )}

                    {related.length > 0 && (
                      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">{t('blog.readAlso')}</h2>
                        <ul className="space-y-2">
                          {related.map((item) => (
                            <li key={item.id}>
                              <Link
                                to={buildLocalizedPath(`/blog/${item.slug}`, locale)}
                                className="text-indigo-600 hover:text-indigo-800 text-sm font-medium hover:underline"
                              >
                                {item.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>

                  <BlogSidebar toc={toc} activeId={activeSection} />
                </div>
              </>
            )}
          </div>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
