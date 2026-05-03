import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Smartphone, Share, PlusSquare, MoreVertical, Download } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useUser } from '@/contexts/UserContext';
import {
  isPwaInstallPermanentlyHidden,
  setPwaInstallPermanentlyHidden,
  isGuideSettingsSessionHidden,
  setGuideSettingsSessionHidden,
} from '@/lib/pwaInstallPrefs';

function getDeviceType(): 'ios' | 'android' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
}

export type PwaInstallGuideVariant = 'settings' | 'instructions';

interface PwaInstallGuideProps {
  /** `instructions` – žinyno puslapis: visada rodoma (ignoruoja slapinimą iš nustatymų). */
  variant?: PwaInstallGuideVariant;
}

export default function PwaInstallGuide({ variant = 'settings' }: PwaInstallGuideProps) {
  const { t } = useTranslation();
  const { user } = useUser();
  const sectionRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const device = getDeviceType();
  const embedded = variant === 'instructions';

  const [allowViaDeepLink, setAllowViaDeepLink] = useState(() =>
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('section') === 'install-app',
  );

  const [localHideForever, setLocalHideForever] = useState(false);
  const [localHideSessionGuide, setLocalHideSessionGuide] = useState(false);

  useEffect(() => {
    if (!user?.id || embedded) return;
    setLocalHideSessionGuide(isGuideSettingsSessionHidden(user.id));
  }, [user?.id, embedded]);

  useEffect(() => {
    if (searchParams.get('section') !== 'install-app') return;
    setAllowViaDeepLink(true);

    const scroll = () =>
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    scroll();
    const t1 = window.setTimeout(scroll, 90);
    const t2 = window.setTimeout(scroll, 420);

    const stripTmr = window.setTimeout(() => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('section');
        return next;
      }, { replace: true });
    }, 620);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(stripTmr);
    };
  }, [searchParams, setSearchParams]);

  const permBlocked =
    !embedded &&
    !!(user?.id && (localHideForever || isPwaInstallPermanentlyHidden(user.id))) &&
    !allowViaDeepLink;
  const sessBlocked =
    !embedded &&
    !!(user?.id && localHideSessionGuide) &&
    !allowViaDeepLink;

  if (permBlocked || sessBlocked) return null;

  const handleHideGuideThisSession = () => {
    if (!user?.id) return;
    setGuideSettingsSessionHidden(user.id);
    setLocalHideSessionGuide(true);
  };

  const handleHideGuideForever = () => {
    if (!user?.id) return;
    setPwaInstallPermanentlyHidden(user.id);
    setLocalHideForever(true);
  };

  return (
    <div
      ref={sectionRef}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5 scroll-mt-28"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">{t('pwa.guideTitle')}</h2>
          <p className="text-xs text-gray-500">{t('pwa.guideSubtitle')}</p>
        </div>
      </div>

      <p className="text-sm text-gray-600">{t('pwa.guideIntro')}</p>

      {(device === 'ios' || device === 'desktop') && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              1
            </span>
            iPhone / iPad (Safari)
          </h3>
          <div className="ml-8 space-y-2">
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <Share className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
              <span>{t('pwa.iosStep1')}</span>
            </div>
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <PlusSquare className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
              <span>{t('pwa.iosStep2')}</span>
            </div>
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <Download className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
              <span>{t('pwa.iosStep3')}</span>
            </div>
          </div>
        </div>
      )}

      {(device === 'android' || device === 'desktop') && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              {device === 'desktop' ? '2' : '1'}
            </span>
            Android (Chrome)
          </h3>
          <div className="ml-8 space-y-2">
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <MoreVertical className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
              <span>{t('pwa.androidStep1')}</span>
            </div>
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <PlusSquare className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
              <span>{t('pwa.androidStep2')}</span>
            </div>
            <div className="flex items-start gap-3 text-sm text-gray-600">
              <Download className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
              <span>{t('pwa.androidStep3')}</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
        <p className="text-xs text-indigo-700">{t('pwa.guideTip')}</p>
      </div>

      {!embedded && user?.id && (
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={handleHideGuideThisSession}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          >
            {t('pwa.guideHideThisVisit')}
          </button>
          <button
            type="button"
            onClick={handleHideGuideForever}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-800 px-3 py-2 rounded-xl border border-indigo-100 bg-indigo-50/60 hover:bg-indigo-50 transition-colors"
          >
            {t('pwa.guideDontShowInSettings')}
          </button>
        </div>
      )}
    </div>
  );
}
