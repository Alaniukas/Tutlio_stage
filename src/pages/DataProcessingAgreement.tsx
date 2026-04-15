import { Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function DataProcessingAgreement() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> {t('legal.goBack')}
        </Link>

        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold text-gray-900">{t('dpa.title')}</h1>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('legal.downloadPdf')}
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-8" dangerouslySetInnerHTML={{ __html: t('dpa.subtitle') }} />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 prose prose-gray max-w-none">
          <p className="text-gray-600 text-sm leading-relaxed bg-indigo-50 border border-indigo-200 rounded-xl p-4" dangerouslySetInnerHTML={{ __html: t('dpa.note') }} />

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s1Title')}</h2>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s1_1Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s1_1p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s1_1Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s1_1Li2') }} />
          </ul>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s1_2Title')}</h3>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s1_2Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s1_2Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s1_2Li3') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s1_2Li4') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s1_2Li5') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s1_2Li6') }} />
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s2Title')}</h2>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s2_1Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s2_1p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li>{t('dpa.s2_1Li1')}</li>
            <li>{t('dpa.s2_1Li2')}</li>
            <li>{t('dpa.s2_1Li3')}</li>
            <li>{t('dpa.s2_1Li4')}</li>
            <li>{t('dpa.s2_1Li5')}</li>
            <li>{t('dpa.s2_1Li6')}</li>
            <li>{t('dpa.s2_1Li7')}</li>
            <li>{t('dpa.s2_1Li8')}</li>
          </ul>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s2_2Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s2_2p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s2_2Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s2_2Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s2_2Li3') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s2_2Li4') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s2_2Li5') }} />
          </ul>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s2_3Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s2_3p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li>{t('dpa.s2_3Li1')}</li>
            <li>{t('dpa.s2_3Li2')}</li>
            <li>{t('dpa.s2_3Li3')}</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s3Title')}</h2>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s3_1Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s3_1p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_1Li1') }} />
            <li>
              <span dangerouslySetInnerHTML={{ __html: t('dpa.s3_1Li2') }} />
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li>{t('dpa.s3_1Li2a')}</li>
                <li>{t('dpa.s3_1Li2b')}</li>
                <li>{t('dpa.s3_1Li2c')}</li>
                <li>{t('dpa.s3_1Li2d')}</li>
                <li>{t('dpa.s3_1Li2e')}</li>
              </ul>
            </li>
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_1Li3') }} />
            <li>
              <span dangerouslySetInnerHTML={{ __html: t('dpa.s3_1Li4') }} />
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li>{t('dpa.s3_1Li4a')}</li>
                <li>{t('dpa.s3_1Li4b')}</li>
                <li>{t('dpa.s3_1Li4c')}</li>
                <li>{t('dpa.s3_1Li4d')}</li>
              </ul>
            </li>
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_1Li5') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_1Li6') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_1Li7') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_1Li8') }} />
          </ul>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s3_2Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s3_2p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_2Li1') }} />
            <li>
              <span dangerouslySetInnerHTML={{ __html: t('dpa.s3_2Li2') }} />
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li>{t('dpa.s3_2Li2a')}</li>
                <li>{t('dpa.s3_2Li2b')}</li>
                <li>{t('dpa.s3_2Li2c')}</li>
                <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_2Li2d') }} />
                <li>{t('dpa.s3_2Li2e')}</li>
              </ul>
            </li>
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_2Li3') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_2Li4') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_2Li5') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_2Li6') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_2Li7') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s3_2Li8') }} />
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s4Title')}</h2>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s4_1Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s4_1p1')}</p>

          <div className="bg-gray-50 rounded-xl p-4 mt-3 space-y-3">
            <div className="border-l-4 border-indigo-500 pl-3">
              <p className="font-semibold text-gray-800 text-sm">{t('dpa.s4Supabase')}</p>
              <p className="text-gray-600 text-xs mt-1" dangerouslySetInnerHTML={{ __html: t('dpa.s4SupabaseService') }} />
              <p className="text-gray-600 text-xs" dangerouslySetInnerHTML={{ __html: t('dpa.s4SupabaseLocation') }} />
              <p className="text-gray-600 text-xs" dangerouslySetInnerHTML={{ __html: t('dpa.s4SupabaseGdpr') }} />
              <p className="text-gray-600 text-xs"><span dangerouslySetInnerHTML={{ __html: t('dpa.s4PrivacyLabel') }} /> <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">supabase.com/privacy</a></p>
            </div>

            <div className="border-l-4 border-green-500 pl-3">
              <p className="font-semibold text-gray-800 text-sm">{t('dpa.s4Stripe')}</p>
              <p className="text-gray-600 text-xs mt-1" dangerouslySetInnerHTML={{ __html: t('dpa.s4StripeService') }} />
              <p className="text-gray-600 text-xs" dangerouslySetInnerHTML={{ __html: t('dpa.s4StripeLocation') }} />
              <p className="text-gray-600 text-xs" dangerouslySetInnerHTML={{ __html: t('dpa.s4StripeGdpr') }} />
              <p className="text-gray-600 text-xs"><span dangerouslySetInnerHTML={{ __html: t('dpa.s4PrivacyLabel') }} /> <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">stripe.com/privacy</a></p>
            </div>

            <div className="border-l-4 border-blue-500 pl-3">
              <p className="font-semibold text-gray-800 text-sm">{t('dpa.s4Resend')}</p>
              <p className="text-gray-600 text-xs mt-1" dangerouslySetInnerHTML={{ __html: t('dpa.s4ResendService') }} />
              <p className="text-gray-600 text-xs" dangerouslySetInnerHTML={{ __html: t('dpa.s4ResendLocation') }} />
              <p className="text-gray-600 text-xs" dangerouslySetInnerHTML={{ __html: t('dpa.s4ResendGdpr') }} />
              <p className="text-gray-600 text-xs"><span dangerouslySetInnerHTML={{ __html: t('dpa.s4PrivacyLabel') }} /> <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">resend.com/legal/privacy-policy</a></p>
            </div>
          </div>

          <h3 className="text-lg font-semibold text-gray-800 mt-5 mb-2">{t('dpa.s4_2Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t('dpa.s4_2p1') }} />

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s5Title')}</h2>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s5_1Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s5_1p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s5_1Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s5_1Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s5_1Li3') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s5_1Li4') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s5_1Li5') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s5_1Li6') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s5_1Li7') }} />
          </ul>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s5_2Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s5_2p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li>{t('dpa.s5_2Li1')}</li>
            <li>{t('dpa.s5_2Li2')}</li>
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s5_2Li3') }} />
          </ul>
          <p className="text-gray-600 text-sm leading-relaxed mt-2" dangerouslySetInnerHTML={{ __html: t('dpa.s5_2p2') }} />

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s6Title')}</h2>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s6_1Title')}</h3>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s6_1Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s6_1Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s6_1Li3') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s6_1Li4') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s6_1Li5') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s6_1Li6') }} />
          </ul>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s6_2Title')}</h3>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s6_2Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s6_2Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s6_2Li3') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s6_2Li4') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s6_2Li5') }} />
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s7Title')}</h2>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s7_1Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s7_1p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s7_1Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s7_1Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s7_1Li3') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s7_1Li4') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s7_1Li5') }} />
          </ul>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s7_2Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s7_2p1')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s8Title')}</h2>

          <p className="text-gray-600 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t('dpa.s8p1') }} />
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1 mt-2">
            <li>{t('dpa.s8Li1')}</li>
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s8Li2') }} />
            <li>{t('dpa.s8Li3')}</li>
          </ul>
          <p className="text-gray-600 text-sm leading-relaxed mt-2">{t('dpa.s8p2')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s9Title')}</h2>

          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s9p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1 mt-2">
            <li>{t('dpa.s9Li1')}</li>
            <li>{t('dpa.s9Li2')}</li>
            <li>{t('dpa.s9Li3')}</li>
            <li>{t('dpa.s9Li4')}</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s10Title')}</h2>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s10_1Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s10_1p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1 mt-2">
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s10_1Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s10_1Li2') }} />
          </ul>

          <h3 className="text-lg font-semibold text-gray-800 mt-4 mb-2">{t('dpa.s10_2Title')}</h3>
          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s10_2p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1 mt-2">
            <li>{t('dpa.s10_2Li1')}</li>
            <li>{t('dpa.s10_2Li2')}</li>
            <li>{t('dpa.s10_2Li3')}</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s11Title')}</h2>

          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s11p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1 mt-2">
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s11Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s11Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s11Li3') }} />
          </ul>
          <p className="text-gray-600 text-sm leading-relaxed mt-2">{t('dpa.s11p2')}</p>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s12Title')}</h2>

          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mt-3">
            <p className="text-gray-800 text-sm font-semibold mb-2">{t('dpa.s12BoxTitle')}</p>
            <ul className="text-gray-600 text-sm space-y-1">
              <li dangerouslySetInnerHTML={{ __html: t('dpa.s12EmailLabel') }} />
              <li dangerouslySetInnerHTML={{ __html: t('dpa.s12SubjectLabel') }} />
              <li><span dangerouslySetInnerHTML={{ __html: t('dpa.s12ResponseLabel') }} /> {t('dpa.s12Response')}</li>
            </ul>
            <p className="text-gray-600 text-xs mt-3" dangerouslySetInnerHTML={{ __html: t('dpa.s12Note') }} />
          </div>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s13Title')}</h2>

          <p className="text-gray-600 text-sm leading-relaxed">{t('dpa.s13p1')}</p>
          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1 mt-2">
            <li><Link to="/terms" className="text-indigo-600 hover:underline">{t('dpa.s13Li1')}</Link></li>
            <li><Link to="/privacy-policy" className="text-indigo-600 hover:underline">{t('dpa.s13Li2')}</Link></li>
            <li>{t('dpa.s13Li3')}</li>
          </ul>

          <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">{t('dpa.s14Title')}</h2>

          <ul className="list-disc pl-5 text-gray-600 text-sm space-y-1">
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s14Li1') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s14Li2') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s14Li3') }} />
            <li dangerouslySetInnerHTML={{ __html: t('dpa.s14Li4') }} />
          </ul>

          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5 mt-8">
            <p className="text-gray-800 text-sm font-semibold mb-2">{t('dpa.consentTitle')}</p>
            <p className="text-gray-600 text-xs" dangerouslySetInnerHTML={{ __html: t('dpa.consentText') }} />
          </div>

          <hr className="my-8 border-gray-200" />

          <p className="text-xs text-gray-500 text-center" dangerouslySetInnerHTML={{ __html: `${t('dpa.footerCreated')} | ${t('dpa.footerVersion')} | ${t('dpa.footerEntity')}` }} />
        </div>

        <p className="text-center text-sm text-gray-500 mt-8">
          <Link to="/privacy-policy" className="text-indigo-600 hover:underline">{t('legal.privacyPolicy')}</Link>
          {' · '}
          <Link to="/terms" className="text-indigo-600 hover:underline">{t('legal.termsOfService')}</Link>
          {' · '}
          <Link to="/" className="text-indigo-600 hover:underline">Tutlio</Link>
        </p>
      </div>
    </div>
  );
}
