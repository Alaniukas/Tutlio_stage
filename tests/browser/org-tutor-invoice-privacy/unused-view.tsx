import type { ReactNode } from 'react';
// Settings are not exercised here; the legacy invoice route redirects before
// rendering its layout. Keep unrelated services out of this isolated fixture.
export default function UnusedView({ children }: { children?: ReactNode }) { return <>{children}</>; }
