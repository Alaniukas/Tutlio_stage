import { Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Layout from '@/components/Layout';
import { useTranslation } from '@/lib/i18n';
import { useUser } from '@/contexts/UserContext';

export default function Instructions() {
  const { t } = useTranslation();
  const { profile } = useUser();

  const isOrgTutor = !!profile?.organization_id;

  if (!isOrgTutor) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-gray-900">{t('instructions.tutorTitle')}</h1>
            <p className="text-gray-600">{t('instructions.tutorDesc')}</p>
          </div>

          <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Play className="w-6 h-6 text-indigo-600" />
                {t('instructions.overviewTitle')}
              </CardTitle>
              <p className="text-sm text-gray-600 mt-2">{t('instructions.overviewDesc')}</p>
            </CardHeader>
            <CardContent>
              <div className="aspect-video w-full rounded-xl overflow-hidden bg-gray-100">
                <iframe
                  width="100%"
                  height="100%"
                  src="https://www.youtube.com/embed/tnmveVNlxJI"
                  title={t('instructions.overviewTitle')}
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
              <CardTitle className="text-lg">{t('tutorInstr.pagesTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'nav.dashboard', bullets: ['tutorInstr.pageDashboardB1', 'tutorInstr.pageDashboardB2', 'tutorInstr.pageDashboardB3'] },
                  { key: 'nav.calendar', bullets: ['tutorInstr.pageCalendarB1', 'tutorInstr.pageCalendarB2', 'tutorInstr.pageCalendarB3', 'tutorInstr.pageCalendarB4'] },
                  { key: 'nav.students', bullets: ['tutorInstr.pageStudentsB1', 'tutorInstr.pageStudentsB2', 'tutorInstr.pageStudentsB3', 'tutorInstr.pageStudentsB4'] },
                  { key: 'nav.waitlist', bullets: ['tutorInstr.pageWaitlistB1', 'tutorInstr.pageWaitlistB2', 'tutorInstr.pageWaitlistB3'] },
                  { key: 'nav.messages', bullets: ['tutorInstr.pageMessagesB1', 'tutorInstr.pageMessagesB2', 'tutorInstr.pageMessagesB3'] },
                  { key: 'nav.finance', bullets: ['tutorInstr.pageFinanceB1', 'tutorInstr.pageFinanceB2', 'tutorInstr.pageFinanceB3', 'tutorInstr.pageFinanceB4'] },
                  { key: 'nav.invoices', bullets: ['tutorInstr.pageInvoicesB1', 'tutorInstr.pageInvoicesB2', 'tutorInstr.pageInvoicesB3'] },
                  { key: 'nav.lessonSettings', bullets: ['tutorInstr.pageLessonSettingsB1', 'tutorInstr.pageLessonSettingsB2', 'tutorInstr.pageLessonSettingsB3'] },
                  { key: 'nav.settings', bullets: ['tutorInstr.pageSettingsB1', 'tutorInstr.pageSettingsB2', 'tutorInstr.pageSettingsB3'] },
                ].map((p) => (
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
              <CardTitle className="text-lg">{t('instructions.needHelp')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-gray-600">
              <p>{t('instructions.helpDesc')}</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>
                  {t('common.email')}:{' '}
                  <a href="mailto:info@tutlio.lt" className="text-indigo-600 hover:underline">
                    info@tutlio.lt
                  </a>
                </li>
                <li>
                  {t('instructions.termsLink')}{' '}
                  <a href="/terms-of-service" className="text-indigo-600 hover:underline">
                    {t('instructions.readHere')}
                  </a>
                </li>
                <li>
                  {t('instructions.privacyLink')}{' '}
                  <a href="/privacy-policy" className="text-indigo-600 hover:underline">
                    {t('instructions.readHere')}
                  </a>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">{t('orgTutorInstr.title')}</h1>
          <p className="text-gray-600">{t('orgTutorInstr.subtitle')}</p>
        </div>

          <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Play className="w-6 h-6 text-indigo-600" />
                {t('orgTutorInstr.overviewTitle')}
              </CardTitle>
              <p className="text-sm text-gray-600 mt-2">{t('orgTutorInstr.overviewDesc')}</p>
            </CardHeader>
            <CardContent>
              <div className="aspect-video w-full rounded-xl overflow-hidden bg-gray-100">
                <iframe
                  width="100%"
                  height="100%"
                  src="https://www.youtube.com/embed/bwKeZE8vwfU"
                  title={t('orgTutorInstr.overviewTitle')}
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
              <CardTitle className="text-lg">{t('orgTutorInstr.pagesTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: 'nav.dashboard', bullets: ['orgTutorInstr.pageDashboardB1', 'orgTutorInstr.pageDashboardB2', 'orgTutorInstr.pageDashboardB3'] },
                  { key: 'nav.calendar', bullets: ['orgTutorInstr.pageCalendarB1', 'orgTutorInstr.pageCalendarB2', 'orgTutorInstr.pageCalendarB3', 'orgTutorInstr.pageCalendarB4'] },
                  { key: 'nav.students', bullets: ['orgTutorInstr.pageStudentsB1', 'orgTutorInstr.pageStudentsB2', 'orgTutorInstr.pageStudentsB3'] },
                  { key: 'nav.waitlist', bullets: ['orgTutorInstr.pageWaitlistB1', 'orgTutorInstr.pageWaitlistB2', 'orgTutorInstr.pageWaitlistB3'] },
                  { key: 'nav.messages', bullets: ['orgTutorInstr.pageMessagesB1', 'orgTutorInstr.pageMessagesB2', 'orgTutorInstr.pageMessagesB3'] },
                  { key: 'nav.finance', bullets: ['orgTutorInstr.pageFinanceB1', 'orgTutorInstr.pageFinanceB2', 'orgTutorInstr.pageFinanceB3'] },
                  { key: 'nav.lessonSettings', bullets: ['orgTutorInstr.pageLessonSettingsB1', 'orgTutorInstr.pageLessonSettingsB2', 'orgTutorInstr.pageLessonSettingsB3'] },
                ].map((p) => (
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
              <CardTitle className="text-lg">{t('orgTutorInstr.needHelpTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-gray-600">
              <p>{t('orgTutorInstr.needHelpDesc')}</p>
              <p>
                <a href="mailto:info@tutlio.lt" className="text-indigo-600 hover:underline">info@tutlio.lt</a>
              </p>
            </CardContent>
          </Card>
      </div>
    </Layout>
  );
}
