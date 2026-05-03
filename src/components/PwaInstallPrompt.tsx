import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Smartphone } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useUser } from '@/contexts/UserContext';
import {
  clearLegacyPwaGlobalSessionKeys,
  isPwaInstallPermanentlyHidden,
  isBannerSessionDismissed,
  setBannerSessionDismissed,
  setPwaInstallPermanentlyHidden,
} from '@/lib/pwaInstallPrefs';

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

interface PwaInstallPromptProps {
  settingsPath: string;
}

export default function PwaInstallPrompt({ settingsPath }: PwaInstallPromptProps) {
  const { t } = useTranslation();
  const { user } = useUser();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    clearLegacyPwaGlobalSessionKeys();
    if (!user?.id) return;
    if (isStandalonePwa()) return;
    if (isBannerSessionDismissed(user.id)) return;
    if (isPwaInstallPermanentlyHidden(user.id)) return;

    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, [user?.id]);

  if (!visible) return null;

  const handleDismiss = () => {
    if (user?.id) setBannerSessionDismissed(user.id);
    setVisible(false);
  };

  const handleDontShowAgain = () => {
    if (user?.id) setPwaInstallPermanentlyHidden(user.id);
    setVisible(false);
  };

  /** Nebesaugome globalaus session rakto („Kaip įdiegti?) – naujoje skiltyje atsidaro gidą, banerį galima rodyti vėl po navigacijos. */
  const handleHowTo = () => {
    setVisible(false);
    navigate(`${settingsPath}?section=install-app`);
  };

  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md animate-fade-in top-[max(1rem,env(safe-area-inset-top))]">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/80 flex items-center gap-3 pl-4 pr-2 py-2.5">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-4 h-4 text-indigo-600" />
        </div>
        <p className="text-sm text-gray-700 font-medium flex-1 min-w-0 leading-snug">
          {t('pwa.bannerText')}
        </p>
        <button
          onClick={handleHowTo}
          className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors flex-shrink-0"
        >
          {t('pwa.howToInstall')}
        </button>
        <button
          onClick={handleDontShowAgain}
          className="text-[11px] text-gray-400 hover:text-gray-600 font-medium flex-shrink-0 whitespace-nowrap transition-colors"
        >
          {t('pwa.dontShowAgain')}
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
