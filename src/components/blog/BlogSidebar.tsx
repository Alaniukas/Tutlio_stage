import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { buildLocalizedPath } from '@/lib/i18n';
import type { BlogTocItem } from '@/lib/blogToc';

export function BlogSidebar({ toc, activeId }: { toc: BlogTocItem[]; activeId?: string }) {
  const { t, locale } = useTranslation();
  const pricingPath = buildLocalizedPath('/pricing', locale);

  return (
    <aside className="space-y-5 lg:sticky lg:top-24">
      {toc.length > 0 && (
        <nav className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
            {t('blog.onThisPage')}
          </p>
          <ul className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
            {toc.map((item) => {
              const active = activeId === item.id;
              return (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className={`block rounded-lg py-2 text-sm leading-snug transition-colors border-l-2 ${
                      item.level === 3 ? 'pl-5' : 'pl-3'
                    } ${
                      active
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 font-medium'
                        : 'border-transparent text-gray-500 hover:text-indigo-600 hover:bg-gray-50'
                    }`}
                  >
                    {item.text}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className="rounded-2xl bg-indigo-600 p-6 text-white shadow-lg shadow-indigo-600/20">
        <h3 className="text-lg font-bold leading-snug mb-2">{t('blog.ctaTitle')}</h3>
        <p className="text-indigo-100 text-sm leading-relaxed mb-5">{t('blog.ctaSubtitle')}</p>
        <Link
          to={pricingPath}
          className="inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-bold text-indigo-700 hover:bg-indigo-50 transition-colors"
        >
          {t('blog.ctaPrimary')}
        </Link>
        <Link
          to={pricingPath}
          className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-100 hover:text-white transition-colors"
        >
          {t('blog.ctaSecondary')} <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </aside>
  );
}

export function BlogInlineCta() {
  const { t, locale } = useTranslation();
  const registerPath = buildLocalizedPath('/register', locale);

  return (
    <div className="my-10 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50 p-6 sm:p-8 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white text-2xl font-bold shadow-md">
        T
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-bold text-gray-900 mb-1">{t('blog.inlineCtaTitle')}</h3>
        <p className="text-sm text-gray-600 leading-relaxed mb-4">{t('blog.inlineCtaBody')}</p>
        <Link
          to={registerPath}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          {t('blog.ctaPrimary')} <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

export function BlogHeroCover({ src, alt, title }: { src: string; alt: string; title?: string }) {
  return (
    <div className="relative mb-10 overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 shadow-sm">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(79,70,229,0.12),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.1),transparent_45%)]" />
      <div className="relative aspect-[16/9] sm:aspect-[2/1] flex items-center justify-center p-6 sm:p-10">
        <img
          src={src}
          alt={alt}
          className="max-h-full max-w-full object-contain drop-shadow-md animate-[blog-float_6s_ease-in-out_infinite]"
        />
      </div>
      {title && (
        <div className="relative border-t border-indigo-100/80 bg-white/70 px-6 py-4 backdrop-blur-sm">
          <p className="text-sm font-semibold text-indigo-900 line-clamp-2">{title}</p>
        </div>
      )}
    </div>
  );
}

export function BlogAuthorRow() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 mb-8 pb-8 border-b border-gray-100">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 text-white font-bold text-sm">
        T
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{t('blog.authorName')}</p>
        <p className="text-xs text-gray-500">{t('blog.authorRole')}</p>
      </div>
    </div>
  );
}
