import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function PrivacyPolicy() {
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

        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('priv.title')}</h1>
        <p className="text-sm text-gray-500 mb-8" dangerouslySetInnerHTML={{ __html: t('priv.subtitle') }} />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 prose prose-gray max-w-none">
          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('priv.s1Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t('priv.s1p1') }} />

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('priv.s2Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t('priv.s2p1') }} />

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('priv.s2_1Title')}</h3>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('priv.s2_1Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s2_1Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s2_1Li3') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s2_1Li4') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s2_1Li5') }} />
          </ul>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('priv.s2_2Title')}</h3>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('priv.s2_2Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s2_2Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s2_2Li3') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s2_2Li4') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s2_2Li5') }} />
          </ul>

          <p className="text-gray-600 text-sm leading-relaxed mt-3" dangerouslySetInnerHTML={{ __html: t('priv.s2Contact') }} />

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('priv.s3Title')}</h2>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('priv.s3Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s3Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s3Li3') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s3Li4') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s3Li5') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s3Li6') }} />
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('priv.s4Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{t('priv.s4p1')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('priv.s5Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{t('priv.s5p1')}</p>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('priv.s5_1Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('priv.s5_1p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1 mt-2">
            <li dangerouslySetInnerHTML={{ __html: t('priv.s5_1Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s5_1Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s5_1Li3') }} />
          </ul>
          <p className="text-gray-600 text-sm leading-relaxed mt-2">{t('priv.s5_1p2')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('priv.s6Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t('priv.s6p1') }} />
          <p className="text-gray-600 text-sm leading-relaxed mt-3" dangerouslySetInnerHTML={{ __html: t('priv.s6p2') }} />
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1 mt-2">
            <li dangerouslySetInnerHTML={{ __html: t('priv.s6Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s6Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('priv.s6Li3') }} />
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('priv.s6_1Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{t('priv.s6_1p1')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('priv.s7Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{t('priv.s7p1')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-6 mb-2">{t('priv.s8Title')}</h2>
          <p className="text-gray-600 text-sm leading-relaxed">{t('priv.s8p1')}</p>
        </div>

        <p className="text-center text-sm text-gray-500 mt-8">
          <Link to="/terms" className="text-indigo-600 hover:underline">{t('legal.termsOfService')}</Link>
          {' · '}
          <Link to="/dpa" className="text-indigo-600 hover:underline">{t('legal.dpa')}</Link>
          {' · '}
          <Link to="/" className="text-indigo-600 hover:underline">Tutlio</Link>
        </p>
      </div>
    </div>
  );
}
