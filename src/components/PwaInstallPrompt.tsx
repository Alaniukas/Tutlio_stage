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
  avoidBottomNavigation?: boolean;
}

export default function PwaInstallPrompt({ settingsPath, avoidBottomNavigation = false }: PwaInstallPromptProps) {
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
    <div
      className={`fixed inset-x-3 z-40 mx-auto max-w-md animate-fade-in pointer-events-auto sm:inset-x-auto sm:left-1/2 sm:top-[max(1rem,env(safe-area-inset-top))] sm:bottom-auto sm:w-[calc(100%-2rem)] sm:-translate-x-1/2 ${
        avoidBottomNavigation
          ? 'bottom-[calc(5.75rem+env(safe-area-inset-bottom))]'
          : 'bottom-[max(1rem,env(safe-area-inset-bottom))]'
      }`}
    >
      <div className="space-y-2.5 rounded-2xl border border-gray-200/80 bg-white px-3 py-3 shadow-xl sm:px-4">
        <div className="relative flex items-start gap-3 pr-10 sm:pr-0">
          <div className="mt-0.5 hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 sm:flex">
            <Smartphone className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="min-w-0 flex-1 text-xs font-medium leading-snug text-gray-700 sm:text-sm">
            {t('pwa.bannerText')}
          </p>
          <button
            type="button"
            onClick={handleDismiss}
            className="absolute -right-1 -top-1 flex min-h-[44px] min-w-[44px] flex-shrink-0 touch-manipulation items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600 sm:static sm:-my-1 sm:-mr-1"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:pl-11">
          <button
            type="button"
            onClick={handleHowTo}
            className="flex min-h-[44px] touch-manipulation items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-center text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            {t('pwa.howToInstall')}
          </button>
          <button
            type="button"
            onClick={handleDontShowAgain}
            className="flex min-h-[44px] touch-manipulation items-center justify-center rounded-xl px-2 py-2 text-center text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
          >
            {t('pwa.dontShowAgain')}
          </button>
        </div>
      </div>
    </div>
  );
}
