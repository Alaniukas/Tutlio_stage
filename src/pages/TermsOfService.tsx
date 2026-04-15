import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function TermsOfService() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> {t('legal.goBack')}
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('tos.title')}</h1>
        <p className="text-sm text-gray-500 mb-8" dangerouslySetInnerHTML={{ __html: t('tos.subtitle') }} />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 prose prose-gray max-w-none">
          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('tos.s1Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t('tos.s1p1') }} />

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('tos.s2Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{t('tos.s2p1')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('tos.s3Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t('tos.s3p1') }} />
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1 mt-2">
            <li dangerouslySetInnerHTML={{ __html: t('tos.s3Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('tos.s3Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('tos.s3Li3') }} />
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('tos.s4Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{t('tos.s4p1')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('tos.s5Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{t('tos.s5p1')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('tos.s6Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t('tos.s6p1') }} />
          <p className="text-gray-600 text-sm leading-relaxed mt-2" dangerouslySetInnerHTML={{ __html: t('tos.s6p2') }} />
          <p className="text-gray-600 text-sm leading-relaxed mt-2" dangerouslySetInnerHTML={{ __html: t('tos.s6p3') }} />
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1 mt-2">
            <li dangerouslySetInnerHTML={{ __html: t('tos.s6Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('tos.s6Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('tos.s6Li3') }} />
          </ul>
          <p className="text-gray-600 text-sm leading-relaxed mt-2">{t('tos.s6p4')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('tos.s7Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{t('tos.s7p1')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('tos.s8Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t('tos.s8p1') }} />

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('tos.s8_1Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('tos.s8_1p1')}</p>

          <h4 className="font-semibold text-gray-800 mt-3 mb-1 text-sm">{t('tos.s8_1aTitle')}</h4>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li>{t('tos.s8_1aLi1')}</li>
            <li>{t('tos.s8_1aLi2')}</li>
            <li>{t('tos.s8_1aLi3')}</li>
            <li>{t('tos.s8_1aLi4')}</li>
            <li>{t('tos.s8_1aLi5')}</li>
            <li>{t('tos.s8_1aLi6')}</li>
          </ul>

          <h4 className="font-semibold text-gray-800 mt-3 mb-1 text-sm">{t('tos.s8_1bTitle')}</h4>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('tos.s8_1bLi1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('tos.s8_1bLi2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('tos.s8_1bLi3') }} />
            <li dangerouslySetInnerHTML={{ __html: t('tos.s8_1bLi4') }} />
            <li dangerouslySetInnerHTML={{ __html: t('tos.s8_1bLi5') }} />
            <li dangerouslySetInnerHTML={{ __html: t('tos.s8_1bLi6') }} />
          </ul>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('tos.s8_2Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('tos.s8_2p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1 mt-2">
            <li>{t('tos.s8_2Li1')}</li>
            <li>{t('tos.s8_2Li2')}</li>
            <li>{t('tos.s8_2Li3')}</li>
            <li dangerouslySetInnerHTML={{ __html: t('tos.s8_2Li4') }} />
            <li>{t('tos.s8_2Li5')}</li>
            <li>{t('tos.s8_2Li6')}</li>
            <li>{t('tos.s8_2Li7')}</li>
          </ul>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('tos.s8_3Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('tos.s8_3p1')}</p>
          <p className="text-gray-600 text-sm leading-relaxed mt-2" dangerouslySetInnerHTML={{ __html: t('tos.s8_3p2') }} />

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('tos.s9Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{t('tos.s9p1')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('tos.s10Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{t('tos.s10p1')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('tos.s11Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{t('tos.s11p1')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('tos.s12Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t('tos.s12p1') }} />
        </div>

        <p className="text-center text-sm text-gray-500 mt-8">
          <Link to="/privacy-policy" className="text-indigo-600 hover:underline">{t('legal.privacyPolicy')}</Link>
          {' · '}
          <Link to="/dpa" className="text-indigo-600 hover:underline">{t('legal.dpa')}</Link>
          {' · '}
          <Link to="/" className="text-indigo-600 hover:underline">Tutlio</Link>
        </p>
      </div>
    </div>
  );
}
