import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { dedupeAuthGetUser, tutorSidebarProfileDeduped } from '@/lib/preload';

export interface OrgBrandingData {
  name: string;
  logo_url: string | null;
  brand_color: string;
  slug: string | null;
  enabled: boolean;
}

const DEFAULT: OrgBrandingData = { name: '', logo_url: null, brand_color: '#6366f1', slug: null, enabled: false };

const OrgBrandingContext = createContext<OrgBrandingData>(DEFAULT);

export function useOrgBrandingContext(): OrgBrandingData {
  return useContext(OrgBrandingContext);
}

const CACHE_KEY = 'tutlio_org_branding';

function getCached(): OrgBrandingData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCache(data: OrgBrandingData) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
}

export function clearOrgBrandingCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

export function OrgBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<OrgBrandingData>(() => getCached() || DEFAULT);

  useEffect(() => {
    const cached = getCached();
    if (cached) {
      setBranding(cached);
      return;
    }

    let cancelled = false;

    async function load() {
      const user = await dedupeAuthGetUser();
      if (!user || cancelled) return;

      // Use deduplicated profile fetch (already cached by Layout/other components)
      const { data: profile } = await tutorSidebarProfileDeduped(user.id);
      const orgId = profile?.organization_id ?? null;

      if (!orgId || cancelled) {
        // Don't do expensive student lookup here — student branding
        // is resolved via their tutor's org when loading student data.
        return;
      }

      await fetchOrgBranding(orgId);
    }

    async function fetchOrgBranding(orgId: string) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name, slug, logo_url, brand_color, features')
        .eq('id', orgId)
        .maybeSingle();

      if (cancelled || !org) return;

      const features = (org.features && typeof org.features === 'object' ? org.features : {}) as Record<string, unknown>;
      if (!features.custom_branding) return;
      if (!org.logo_url) return;

      const data: OrgBrandingData = {
        name: org.name,
        logo_url: org.logo_url,
        brand_color: org.brand_color || '#6366f1',
        slug: org.slug || null,
        enabled: true,
      };
      setBranding(data);
      setCache(data);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <OrgBrandingContext.Provider value={branding}>
      {children}
    </OrgBrandingContext.Provider>
  );
}
