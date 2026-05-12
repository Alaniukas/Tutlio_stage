import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface OrgBranding {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string;
  brand_color_secondary: string;
  entity_type: string;
}

interface OrgBrandingState {
  branding: OrgBranding | null;
  loading: boolean;
  slug: string | null;
}

const cache = new Map<string, OrgBranding>();

/**
 * Fetches org branding for whitelabel login.
 * Reads `?org=<slug>` from the URL or accepts a slug directly.
 */
export function useOrgBranding(slugOverride?: string | null): OrgBrandingState {
  const [searchParams] = useSearchParams();
  const [branding, setBranding] = useState<OrgBranding | null>(null);
  const [loading, setLoading] = useState(false);

  const slug = (slugOverride ?? searchParams.get('org'))?.trim() || null;

  useEffect(() => {
    if (!slug) {
      setBranding(null);
      setLoading(false);
      return;
    }

    if (cache.has(slug)) {
      setBranding(cache.get(slug)!);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/org-branding?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: OrgBranding | null) => {
        if (cancelled) return;
        if (data) {
          cache.set(slug, data);
          setBranding(data);
        } else {
          setBranding(null);
        }
      })
      .catch(() => {
        if (!cancelled) setBranding(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [slug]);

  return { branding, loading, slug };
}
