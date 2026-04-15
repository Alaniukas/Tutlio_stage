import { createContext, useContext, type ReactNode } from 'react';
import { type Platform, DEFAULT_PLATFORM } from '@/lib/platform';

interface PlatformContextValue {
  platform: Platform;
}

const PlatformContext = createContext<PlatformContextValue>({
  platform: DEFAULT_PLATFORM,
});

export function PlatformProvider({
  platform,
  children,
}: {
  platform: Platform;
  children: ReactNode;
}) {
  return (
    <PlatformContext.Provider value={{ platform }}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): PlatformContextValue {
  return useContext(PlatformContext);
}
