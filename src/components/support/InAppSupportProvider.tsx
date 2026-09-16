import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

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

const InAppSupportPopover = lazy(() => import('./InAppSupportAgent').then((module) => ({
  default: module.InAppSupportPopover,
})));

export function useInAppSupportAgent(): SupportAgentContextValue {
  return useContext(SupportAgentContext);
}

export default function InAppSupportProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [sourcePath, setSourcePath] = useState('');
  const [anchor, setAnchor] = useState<SupportPopoverAnchor | null>(null);

  const openSupportAgent = useCallback((element?: HTMLElement | null) => {
    const rect = element?.getBoundingClientRect();
    setAnchor(rect ? {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
    } : null);
    setSourcePath(`${location.pathname}${location.search}`);
    setOpen(true);
  }, [location.pathname, location.search]);
  const contextValue = useMemo(() => ({ openSupportAgent }), [openSupportAgent]);

  return (
    <SupportAgentContext.Provider value={contextValue}>
      {children}
      {open && (
        <Suspense fallback={null}>
          <InAppSupportPopover
            anchor={anchor}
            sourcePath={sourcePath}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </SupportAgentContext.Provider>
  );
}
