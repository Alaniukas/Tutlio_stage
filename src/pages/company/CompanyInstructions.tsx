import { Navigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import PwaInstallGuide from '@/components/PwaInstallGuide';
import { getCached } from '@/lib/dataCache';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { isInstructionsHiddenForOrg, orgInstructionVideoUrl } from '@/lib/marketMoney';
import {
  COMPANY_INSTRUCTION_PAGES,
  SCHOOL_INSTRUCTION_PAGES,
} from '@/lib/schoolInstructionsContent';

export default function CompanyInstructions() {
  const { t } = useTranslation();
  const location = useLocation();
  const orgBasePath = location.pathname.startsWith('/school') ? '/school' : '/company';
  const { organizationId, loading, entityType } = useOrgFeatures();
  const cachedOrgId =
    getCached<{ organizationId?: string }>('company_dashboard')?.organizationId ?? null;
  const instructionsHidden =
    isInstructionsHiddenForOrg(organizationId) ||
    isInstructionsHiddenForOrg(cachedOrgId);

  // Do not redirect while org features are still loading — that unmounts the page
  // before organizationId resolves and bounces the user back to the dashboard.
  if (!loading && instructionsHidden) {
    return <Navigate to={orgBasePath} replace />;
  }

  const videoUrl = orgInstructionVideoUrl(organizationId ?? cachedOrgId);
  const isSchoolView = entityType === 'school' || orgBasePath === '/school';
  const pages = isSchoolView ? SCHOOL_INSTRUCTION_PAGES : COMPANY_INSTRUCTION_PAGES;
  const titleKey = isSchoolView ? 'schoolInstr.title' : 'companyInstr.title';
  const subtitleKey = isSchoolView ? 'schoolInstr.subtitle' : 'companyInstr.subtitle';
  const overviewDescKey = isSchoolView ? 'schoolInstr.overviewDesc' : 'companyInstr.overviewDesc';

  return (
    <>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">{t(titleKey)}</h1>
          <p className="text-gray-600">{t(subtitleKey)}</p>
        </div>

        <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Play className="w-6 h-6 text-indigo-600" />
              {t('companyInstr.overviewTitle')}
            </CardTitle>
            <p className="text-sm text-gray-600 mt-2">{t(overviewDescKey)}</p>
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

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">{t('pwa.instructionsSectionTitle')}</h2>
          <PwaInstallGuide variant="instructions" />
        </section>

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
