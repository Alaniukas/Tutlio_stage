import { useState, useEffect } from 'react';

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
  const [branding, setBranding] = useState<OrgBranding | null>(null);
  const [loading, setLoading] = useState(false);

  const slug = slugOverride ?? new URLSearchParams(window.location.search).get('org');

  useEffect(() => {
    if (!slug) return;

    if (cache.has(slug)) {
      setBranding(cache.get(slug)!);
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
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [slug]);

  return { branding, loading, slug };
}
