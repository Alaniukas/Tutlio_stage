import { Link } from 'react-router-dom';
import { ArrowRight, Clock } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { resolveField, formatBlogDate, blogPostPath } from '@/lib/blogLocale';
import { estimateReadingMinutes } from '@/lib/blogReadingTime';

export function BlogFeaturedCard({ post }: { post: Record<string, unknown> }) {
  const { t, locale } = useTranslation();
  const title = resolveField(post, 'title', locale);
  const excerpt = resolveField(post, 'excerpt', locale);
  const content = resolveField(post, 'content', locale);
  const mins = estimateReadingMinutes(content || excerpt);

  return (
    <Link to={blogPostPath(post, locale)} className="group block mb-10">
      <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
        <div className="grid md:grid-cols-2">
          <div className="relative min-h-[220px] bg-gradient-to-br from-indigo-50 via-white to-violet-50 border-b md:border-b-0 md:border-r border-gray-100">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(79,70,229,0.15),transparent_55%)]" />
            {post.cover_image ? (
              <img
                src={String(post.cover_image)}
                alt={title}
                className="relative z-[1] h-full w-full object-contain p-8 transition-transform duration-500 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-indigo-300 text-6xl font-bold">T</div>
            )}
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-8">
            {post.tag && (
              <span className="inline-block w-fit rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 mb-3">
                {String(post.tag)}
              </span>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
              <Clock className="w-3.5 h-3.5" />
              <span>{t('blog.minRead', { min: String(mins) })}</span>
              {post.published_at && (
                <>
                  <span>•</span>
                  <time>{formatBlogDate(String(post.published_at), locale, { year: 'numeric', month: 'long', day: 'numeric' })}</time>
                </>
              )}
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-gray-900 leading-snug mb-3 group-hover:text-indigo-600 transition-colors">
              {title}
            </h2>
            <p className="text-gray-500 text-sm leading-relaxed line-clamp-3 mb-4">{excerpt}</p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
              {t('blog.readArticle')} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

export function BlogGridCard({ post }: { post: Record<string, unknown> }) {
  const { t, locale } = useTranslation();
  const title = resolveField(post, 'title', locale);
  const excerpt = resolveField(post, 'excerpt', locale);

  return (
    <Link to={blogPostPath(post, locale)} className="group block h-full">
      <article className="h-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md hover:border-indigo-100">
        <div className="relative aspect-[16/10] bg-gradient-to-br from-indigo-50 to-violet-50 border-b border-gray-100">
          {post.cover_image ? (
            <img
              src={String(post.cover_image)}
              alt={title}
              className="h-full w-full object-contain p-5 transition-transform duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : null}
        </div>
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {post.tag && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
                {String(post.tag)}
              </span>
            )}
            {post.published_at && (
              <span className="text-[11px] text-gray-400">
                {formatBlogDate(String(post.published_at), locale)}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 leading-snug group-hover:text-indigo-600 transition-colors mb-2 line-clamp-2">
            {title}
          </h3>
          <p className="text-gray-500 text-sm line-clamp-2">{excerpt}</p>
        </div>
      </article>
    </Link>
  );
}
