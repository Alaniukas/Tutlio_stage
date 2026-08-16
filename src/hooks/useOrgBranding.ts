import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { isProKlaseOrg } from '@/lib/marketMoney';

export interface OrgBranding {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string;
  brand_color_secondary: string;
  entity_type: string;
  login_description?: string;
  hide_powered_by?: boolean;
}

interface OrgBrandingState {
  branding: OrgBranding | null;
  loading: boolean;
  slug: string | null;
}

const memoryCache = new Map<string, OrgBranding>();
const STORAGE_KEY = 'tutlio_login_org_branding_v1';

function readStored(cacheKey: string): OrgBranding | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, OrgBranding>;
    const row = map[cacheKey];
    return row && typeof row.slug === 'string' ? row : null;
  } catch {
    return null;
  }
}

function writeStored(cacheKey: string, data: OrgBranding) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, OrgBranding>) : {};
    map[cacheKey] = data;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function slugFromWindow(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('org')?.trim() || null;
  } catch {
    return null;
  }
}

/** First-paint hint so Pro Klasė never flashes Tutlio chrome. */
export function optimisticBrandingForSlug(slug: string | null): OrgBranding | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase();
  if (!isProKlaseOrg(key)) return null;
  const qa = key === 'proklase-qa' || key.startsWith('proklase-qa');
  return {
    id: '',
    name: qa ? 'Pro Klasė QA Demo' : 'Pro Klasė',
    slug: key,
    logo_url: null,
    brand_color: qa ? '#4B0091' : '#004ec2',
    brand_color_secondary: qa ? '#E1557D' : '#0066ff',
    entity_type: 'company',
    hide_powered_by: true,
  };
}

function initialForSlug(slug: string | null, locale: string): OrgBranding | null {
  if (!slug) return null;
  const cacheKey = `${slug}:${locale}`;
  return memoryCache.get(cacheKey) || readStored(cacheKey) || optimisticBrandingForSlug(slug);
}

/**
 * Fetches org branding for whitelabel login.
 * Reads `?org=<slug>` from the URL or accepts a slug directly.
 */
export function useOrgBranding(slugOverride?: string | null): OrgBrandingState {
  const [searchParams] = useSearchParams();
  const { locale } = useTranslation();
  const slug = (slugOverride ?? searchParams.get('org') ?? slugFromWindow())?.trim() || null;
  const cacheKey = slug ? `${slug}:${locale}` : null;

  const [branding, setBranding] = useState<OrgBranding | null>(() => initialForSlug(slug, locale));
  const [loading, setLoading] = useState(() => Boolean(slug) && !memoryCache.has(`${slug}:${locale}`) && !readStored(`${slug}:${locale}`));

  useEffect(() => {
    if (!slug || !cacheKey) {
      setBranding(null);
      setLoading(false);
      return;
    }

    const cached = memoryCache.get(cacheKey) || readStored(cacheKey);
    if (cached) {
      setBranding(cached);
      setLoading(false);
    } else {
      setBranding((prev) => prev || optimisticBrandingForSlug(slug));
      setLoading(true);
    }

    let cancelled = false;
    fetch(`/api/org-branding?slug=${encodeURIComponent(slug)}&locale=${encodeURIComponent(locale)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: OrgBranding | null) => {
        if (cancelled) return;
        if (data) {
          memoryCache.set(cacheKey, data);
          writeStored(cacheKey, data);
          setBranding(data);
        } else if (!cached) {
          setBranding(optimisticBrandingForSlug(slug));
        }
      })
      .catch(() => {
        if (!cancelled && !cached) setBranding(optimisticBrandingForSlug(slug));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [slug, cacheKey, locale]);

  return { branding, loading, slug };
}
