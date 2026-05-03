import { useState } from 'react';
import { Play, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StudentLayout from '@/components/StudentLayout';
import { useTranslation } from '@/lib/i18n';
import PwaInstallGuide from '@/components/PwaInstallGuide';

interface VideoSection {
  id: string;
  titleKey: string;
  videoUrl: string;
  descKey?: string;
}

export default function StudentInstructions() {
  const { t } = useTranslation();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const OVERVIEW_VIDEO = {
    title: t('instructions.studentOverviewTitle'),
    videoUrl: 'https://www.youtube.com/embed/YOUR_STUDENT_OVERVIEW_VIDEO_ID',
    description: t('instructions.studentOverviewDesc'),
  };

  const VIDEO_SECTIONS: VideoSection[] = [
    { id: 'dashboard', titleKey: 'instructions.studentDashboardVideo', videoUrl: 'https://www.youtube.com/embed/YOUR_STUDENT_DASHBOARD_VIDEO_ID', descKey: 'instructions.studentDashboardVideoDesc' },
    { id: 'sessions', titleKey: 'instructions.studentSessionsVideo', videoUrl: 'https://www.youtube.com/embed/YOUR_STUDENT_SESSIONS_VIDEO_ID', descKey: 'instructions.studentSessionsVideoDesc' },
    { id: 'booking', titleKey: 'instructions.studentBookingVideo', videoUrl: 'https://www.youtube.com/embed/YOUR_STUDENT_BOOKING_VIDEO_ID', descKey: 'instructions.studentBookingVideoDesc' },
    { id: 'waitlist', titleKey: 'instructions.studentWaitlistVideo', videoUrl: 'https://www.youtube.com/embed/YOUR_STUDENT_WAITLIST_VIDEO_ID', descKey: 'instructions.studentWaitlistVideoDesc' },
    { id: 'settings', titleKey: 'instructions.studentSettingsVideo', videoUrl: 'https://www.youtube.com/embed/YOUR_STUDENT_SETTINGS_VIDEO_ID', descKey: 'instructions.studentSettingsVideoDesc' },
  ];

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  return (
    <StudentLayout>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">{t('instructions.studentTitle')}</h1>
        <p className="text-gray-600">{t('instructions.studentDesc')}</p>
      </div>

      <Card className="border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Play className="w-6 h-6 text-indigo-600" />
            {OVERVIEW_VIDEO.title}
          </CardTitle>
          {OVERVIEW_VIDEO.description && <p className="text-sm text-gray-600 mt-2">{OVERVIEW_VIDEO.description}</p>}
        </CardHeader>
        <CardContent>
          <div className="aspect-video w-full rounded-xl overflow-hidden bg-gray-100">
            <iframe width="100%" height="100%" src={OVERVIEW_VIDEO.videoUrl} title={OVERVIEW_VIDEO.title} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900 mb-4">{t('instructions.functionsTitle')}</h2>
        {VIDEO_SECTIONS.map(section => (
          <Card key={section.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="cursor-pointer hover:bg-gray-50/50 transition-colors rounded-t-xl" onClick={() => toggleSection(section.id)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold text-gray-800">{t(section.titleKey)}</CardTitle>
                {expandedSections.has(section.id) ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </div>
              {section.descKey && !expandedSections.has(section.id) && <p className="text-sm text-gray-600 mt-1">{t(section.descKey)}</p>}
            </CardHeader>
            {expandedSections.has(section.id) && (
              <CardContent className="pt-0">
                {section.descKey && <p className="text-sm text-gray-600 mb-4">{t(section.descKey)}</p>}
                <div className="aspect-video w-full rounded-xl overflow-hidden bg-gray-100">
                  <iframe width="100%" height="100%" src={section.videoUrl} title={t(section.titleKey)} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="w-full h-full" />
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">{t('pwa.instructionsSectionTitle')}</h2>
        <PwaInstallGuide variant="instructions" />
      </section>

      <Card className="bg-gray-50 border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg">{t('instructions.needHelp')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600">
          <p>{t('instructions.helpDescStudent')}</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>{t('common.email')}: <a href="mailto:info@tutlio.lt" className="text-indigo-600 hover:underline">info@tutlio.lt</a></li>
            <li>{t('instructions.termsLink')} <a href="/terms-of-service" className="text-indigo-600 hover:underline">{t('instructions.readHere')}</a></li>
            <li>{t('instructions.privacyLink')} <a href="/privacy-policy" className="text-indigo-600 hover:underline">{t('instructions.readHere')}</a></li>
          </ul>
        </CardContent>
      </Card>
      </div>
    </StudentLayout>
  );
}
