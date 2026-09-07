import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { stripLocalePrefix, useTranslation } from '@/lib/i18n';

type LegalDoc = 'tos' | 'priv' | 'dpa';

interface RelatedLink {
  to: string;
  labelKey: string;
}

interface LegalDocumentPageProps {
  doc: LegalDoc;
  relatedLinks: RelatedLink[];
  maxWidthClassName?: string;
  showPrintButton?: boolean;
}

function sanitizeLegalHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}

function getQuizReturnTo(state: unknown): string | null {
  if (!state || typeof state !== 'object' || !('returnTo' in state)) return null;

  const returnTo = (state as { returnTo?: unknown }).returnTo;
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
    return null;
  }

  try {
    const parsed = new URL(returnTo, 'https://tutlio.local');
    if (parsed.origin !== 'https://tutlio.local') return null;

    const pathname = stripLocalePrefix(parsed.pathname);
    if (pathname !== '/quiz' && !pathname.startsWith('/quiz/')) return null;

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export default function LegalDocumentPage({
  doc,
  relatedLinks,
  maxWidthClassName = 'max-w-3xl',
  showPrintButton = false,
}: LegalDocumentPageProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const quizReturnTo = getQuizReturnTo(location.state);
  const preservedQuizState = quizReturnTo ? { returnTo: quizReturnTo } : undefined;
  const bodyHtml = sanitizeLegalHtml(t(`${doc}.bodyHtml`));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={`${maxWidthClassName} mx-auto px-4 py-8 sm:py-12`}>
        <Link
          to={quizReturnTo ?? '/'}
          replace={Boolean(quizReturnTo)}
          className="mb-8 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> {t('legal.goBack')}
        </Link>

        <div className="mb-2 flex items-start justify-between gap-4">
          <h1 className="text-3xl font-bold text-gray-900">{t(`${doc}.title`)}</h1>
          {showPrintButton && (
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white transition-colors hover:bg-indigo-700"
            >
              <Download className="h-4 w-4" />
              {t('legal.downloadPdf')}
            </button>
          )}
        </div>
        <p className="mb-8 text-sm text-gray-500">{t(`${doc}.subtitle`)}</p>

        <article
          className="max-w-none rounded-2xl border border-gray-100 bg-white p-6 text-sm leading-relaxed text-gray-600 shadow-sm sm:p-8 [&_a]:text-indigo-600 [&_a]:underline [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-800 [&_li]:my-1 [&_p]:my-3 [&_strong]:font-semibold [&_strong]:text-gray-800 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        <p className="mt-8 text-center text-sm text-gray-500">
          {relatedLinks.map((link, index) => (
            <span key={link.to}>
              {index > 0 && ' · '}
              <Link
                to={link.to}
                replace={Boolean(quizReturnTo)}
                state={preservedQuizState}
                className="text-indigo-600 hover:underline"
              >
                {t(link.labelKey)}
              </Link>
            </span>
          ))}
          {' · '}
          <Link to="/" className="text-indigo-600 hover:underline">Tutlio</Link>
        </p>
      </div>
    </div>
  );
}
