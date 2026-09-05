import { useEffect, useState } from 'react';
import { getCached, setCache } from '@/lib/dataCache';
import { orgSuspensionRowDeduped } from '@/lib/preload';
import { schoolTerminologyForOrg, type SchoolTerminology } from '@/lib/i18n/schoolTerminology';

const cacheKey = (orgId: string) => `org_terminology:${orgId}`;

/**
 * Terminology mode for an organization the current user belongs to through a
 * student profile (student portal). `null` until the org row is known.
 */
export function useOrgTerminologyMode(orgId: string | null | undefined): SchoolTerminology | null {
  const [mode, setMode] = useState<SchoolTerminology | null>(() =>
    orgId ? getCached<SchoolTerminology>(cacheKey(orgId)) : null,
  );

  useEffect(() => {
    if (!orgId) {
      setMode(null);
      return;
    }
    const cached = getCached<SchoolTerminology>(cacheKey(orgId));
    if (cached) {
      setMode(cached);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await orgSuspensionRowDeduped(orgId);
        const row = data as { entity_type?: string | null; features?: Record<string, unknown> | null } | null;
        const next = schoolTerminologyForOrg(row?.entity_type, row?.features ?? null);
        setCache(cacheKey(orgId), next);
        if (!cancelled) setMode(next);
      } catch {
        if (!cancelled) setMode(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return mode;
}
