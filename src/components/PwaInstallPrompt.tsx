import { useState, useEffect, type MouseEvent } from 'react';
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
import { isStandalonePwa } from '@/lib/pwaPortal';

interface PwaInstallPromptProps {
  settingsPath: string;
}

export default function PwaInstallPrompt({ settingsPath }: PwaInstallPromptProps) {
  const { t } = useTranslation();
  const { user } = useUser();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    clearLegacyPwaGlobalSessionKeys();
    if (!user?.id) return;
    if (isStandalonePwa()) return;
    if (isBannerSessionDismissed(user.id)) return;
    if (isPwaInstallPermanentlyHidden(user.id)) return;

    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, [user?.id]);

  useEffect(() => {
    const syncDialog = () => {
      setDialogOpen(!!document.querySelector('[role="dialog"][data-state="open"]'));
    };
    syncDialog();
    const observer = new MutationObserver(syncDialog);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
    return () => observer.disconnect();
  }, []);

  if (!visible || dialogOpen) return null;

  const handleDismiss = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (user?.id) setBannerSessionDismissed(user.id);
    else setBannerSessionDismissed('anon');
    setVisible(false);
  };

  const handleDontShowAgain = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (user?.id) setPwaInstallPermanentlyHidden(user.id);
    else {
      setPwaInstallPermanentlyHidden('anon');
      setBannerSessionDismissed('anon');
    }
    setVisible(false);
  };

  /** Nebesaugome globalaus session rakto („Kaip įdiegti?) – naujoje skiltyje atsidaro gidą, banerį galima rodyti vėl po navigacijos. */
  const handleHowTo = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setVisible(false);
    navigate(`${settingsPath}?section=install-app`);
  };

  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md animate-fade-in top-[max(1rem,env(safe-area-inset-top))] pointer-events-auto">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200/80 px-4 py-3 space-y-2.5">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Smartphone className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-sm text-gray-700 font-medium flex-1 min-w-0 leading-snug">
            {t('pwa.bannerText')}
          </p>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0 -mr-1 -mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-2 pl-11">
          <button
            type="button"
            onClick={handleHowTo}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
          >
            {t('pwa.howToInstall')}
          </button>
          <button
            type="button"
            onClick={handleDontShowAgain}
            className="text-[11px] text-gray-400 hover:text-gray-600 font-medium whitespace-nowrap transition-colors"
          >
            {t('pwa.dontShowAgain')}
          </button>
        </div>
      </div>
    </div>
  );
}
