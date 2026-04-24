import { Navigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play } from 'lucide-react';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { useTranslation } from '@/lib/i18n';

export default function CompanyInstructions() {
  const { t } = useTranslation();
  const location = useLocation();
  const { loading: featuresLoading, hasFeature } = useOrgFeatures();
  const orgBasePath = location.pathname.startsWith('/school') ? '/school' : '/company';

  // For manual (off-Stripe) orgs we don't show instructions page.
  if (!featuresLoading && hasFeature('manual_payments')) {
    return <Navigate to={orgBasePath} replace />;
  }

  const videoUrl = 'https://www.youtube.com/embed/FSOmO86hiQE';

  const pages = [
    { key: 'companyNav.overview', bullets: ['companyInstr.pageOverviewB1', 'companyInstr.pageOverviewB2', 'companyInstr.pageOverviewB3'] },
    { key: 'companyNav.tutors', bullets: ['companyInstr.pageTutorsB1', 'companyInstr.pageTutorsB2', 'companyInstr.pageTutorsB3'] },
    { key: 'companyNav.students', bullets: ['companyInstr.pageStudentsB1', 'companyInstr.pageStudentsB2', 'companyInstr.pageStudentsB3', 'companyInstr.pageStudentsB4'] },
    { key: 'companyNav.sessions', bullets: ['companyInstr.pageSessionsB1', 'companyInstr.pageSessionsB2', 'companyInstr.pageSessionsB3', 'companyInstr.pageSessionsB4'] },
    { key: 'companyNav.schedule', bullets: ['companyInstr.pageScheduleB1', 'companyInstr.pageScheduleB2', 'companyInstr.pageScheduleB3', 'companyInstr.pageScheduleB4'] },
    { key: 'companyNav.messages', bullets: ['companyInstr.pageMessagesB1', 'companyInstr.pageMessagesB2', 'companyInstr.pageMessagesB3'] },
    { key: 'companyNav.stats', bullets: ['companyInstr.pageStatsB1', 'companyInstr.pageStatsB2', 'companyInstr.pageStatsB3'] },
    { key: 'companyNav.lessonSettings', bullets: ['companyInstr.pageSettingsB1', 'companyInstr.pageSettingsB2', 'companyInstr.pageSettingsB3'] },
    { key: 'companyNav.finance', bullets: ['companyInstr.pageFinanceB1', 'companyInstr.pageFinanceB2', 'companyInstr.pageFinanceB3'] },
    { key: 'companyNav.invoices', bullets: ['companyInstr.pageInvoicesB1', 'companyInstr.pageInvoicesB2', 'companyInstr.pageInvoicesB3'] },
  ] as const;

  return (
    <>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">{t('companyInstr.title')}</h1>
          <p className="text-gray-600">{t('companyInstr.subtitle')}</p>
        </div>

        <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Play className="w-6 h-6 text-indigo-600" />
              {t('companyInstr.overviewTitle')}
            </CardTitle>
            <p className="text-sm text-gray-600 mt-2">{t('companyInstr.overviewDesc')}</p>
          </CardHeader>
          <CardContent>
            <div className="aspect-video w-full rounded-xl overflow-hidden bg-gray-100">
              <iframe
                width="100%"
                height="100%"
                src={videoUrl}
                title={t('companyInstr.overviewTitle')}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">{t('companyInstr.pagesTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pages.map((p) => (
                <div key={p.key} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="font-semibold text-gray-900">{t(p.key)}</p>
                  <ul className="mt-2 space-y-1.5 text-gray-600 list-disc list-inside">
                    {p.bullets.map((b) => (
                      <li key={b}>{t(b)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50 border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg">{t('companyInstr.needHelpTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-gray-600">
            <p>{t('companyInstr.needHelpDesc')}</p>
            <p>
              <a href="mailto:info@tutlio.lt" className="text-indigo-600 hover:underline">info@tutlio.lt</a>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
