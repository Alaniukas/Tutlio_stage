import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { IN_APP_SUPPORT_ENABLED } from '@/lib/inAppSupportAvailability';
import { inAppSupportLabel } from '@/lib/inAppSupport';
import {
  IN_APP_SUPPORT_FAB_SIZE_PX,
  inAppSupportLauncherInsets,
} from '@/lib/inAppSupportLauncher';
import { useTranslation } from '@/lib/i18n';
import { clearSupportDiagnostics, installSupportDiagnostics } from '@/lib/supportDiagnostics';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import SupportRobotIcon from './SupportRobotIcon';
import { InAppSupportPopover } from './InAppSupportAgent';

let diagnosticsUserId: string | null = null;

export type SupportPopoverAnchor = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type SupportAgentContextValue = {
  openSupportAgent: (anchor?: HTMLElement | null) => void;
};

const SupportAgentContext = createContext<SupportAgentContextValue>({
  openSupportAgent: () => {},
});

export function useInAppSupportAgent(): SupportAgentContextValue {
  return useContext(SupportAgentContext);
}

function InAppSupportLauncherButton({
  pathname,
  onOpen,
}: {
  pathname: string;
  onOpen: () => void;
}) {
  const { locale } = useTranslation();
  const insets = inAppSupportLauncherInsets(pathname);

  return (
    <button
      type="button"
      data-testid="in-app-support-launcher"
      onClick={onOpen}
      className={cn(
        'fixed right-3 z-[210] grid place-items-center rounded-full bg-white text-indigo-700 shadow-[0_16px_40px_-12px_rgba(49,46,129,0.45)] ring-1 ring-indigo-100 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_46px_-12px_rgba(49,46,129,0.5)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 sm:right-4',
      )}
      style={{
        bottom: insets.fabBottom,
        width: IN_APP_SUPPORT_FAB_SIZE_PX,
        height: IN_APP_SUPPORT_FAB_SIZE_PX,
      }}
      aria-label={inAppSupportLabel(locale)}
      title={inAppSupportLabel(locale)}
    >
      <SupportRobotIcon className="h-11 w-11" />
    </button>
  );
}

export default function InAppSupportProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [sourcePath, setSourcePath] = useState('');
  const [anchor, setAnchor] = useState<SupportPopoverAnchor | null>(null);
  const pathname = `${location.pathname}${location.search}`;

  useEffect(() => {
    if (!IN_APP_SUPPORT_ENABLED) return;
    const uninstall = installSupportDiagnostics();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id || null;
      if (diagnosticsUserId && diagnosticsUserId !== nextUserId) clearSupportDiagnostics();
      diagnosticsUserId = nextUserId;
    });
    return () => {
      subscription.unsubscribe();
      uninstall();
    };
  }, []);

  const openSupportAgent = useCallback((element?: HTMLElement | null) => {
    if (!IN_APP_SUPPORT_ENABLED) return;
    const rect = element?.getBoundingClientRect();
    setAnchor(rect ? {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    } : null);
    setSourcePath(`${location.pathname}${location.search}`);
    setHasOpened(true);
    setOpen(true);
  }, [location.pathname, location.search]);

  const contextValue = useMemo(() => ({ openSupportAgent }), [openSupportAgent]);

  if (!IN_APP_SUPPORT_ENABLED) {
    return <SupportAgentContext.Provider value={contextValue}>{children}</SupportAgentContext.Provider>;
  }

  return (
    <SupportAgentContext.Provider value={contextValue}>
      {children}
      {!open ? (
        <InAppSupportLauncherButton
          pathname={location.pathname}
          onOpen={() => openSupportAgent()}
        />
      ) : null}
      {hasOpened ? (
        <InAppSupportPopover
          open={open}
          anchor={anchor}
          pathname={location.pathname}
          sourcePath={sourcePath}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </SupportAgentContext.Provider>
  );
}
