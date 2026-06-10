import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation, buildLocalizedPath } from '@/lib/i18n';

/**
 * Landing page after enterprise license checkout.
 * flow=org  -> existing organization topped up licenses
 * flow=new  -> new company; the webhook provisions the org and emails the
 *              admin a password-setup link, so we point them to their inbox.
 */
export default function EnterpriseSuccess() {
  const { t, locale } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isExistingOrg = searchParams.get('flow') === 'org';

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">{t('enterpriseSuccess.title')}</h1>

        {isExistingOrg ? (
          <>
            <p className="text-sm text-gray-500 mb-8">{t('enterpriseSuccess.orgDesc')}</p>
            <Button
              onClick={() => navigate('/company/tutors')}
              className="w-full rounded-2xl bg-gray-900 hover:bg-gray-800 font-bold h-12"
            >
              <Building2 className="w-4 h-4 mr-2" />
              {t('enterpriseSuccess.goToCompany')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">{t('enterpriseSuccess.newDesc')}</p>
            <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-left mb-8">
              <Mail className="w-5 h-5 text-[#4f46e5] shrink-0 mt-0.5" />
              <p className="text-[13px] text-indigo-900 leading-relaxed">{t('enterpriseSuccess.checkEmail')}</p>
            </div>
          </>
        )}

        <Link
          to={buildLocalizedPath('/', locale)}
          className="inline-block mt-4 text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
        >
          {t('enterpriseSuccess.backHome')}
        </Link>
      </div>
    </div>
  );
}
