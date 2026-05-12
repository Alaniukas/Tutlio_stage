import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { dedupeAuthGetUser, tutorSidebarProfileDeduped } from '@/lib/preload';

export interface OrgBrandingData {
  name: string;
  logo_url: string | null;
  brand_color: string;
  brand_color_secondary: string;
  slug: string | null;
  enabled: boolean;
}

const DEFAULT: OrgBrandingData = {
  name: '',
  logo_url: null,
  brand_color: '#6366f1',
  brand_color_secondary: '#8b5cf6',
  slug: null,
  enabled: false,
};

const OrgBrandingContext = createContext<OrgBrandingData>(DEFAULT);

export function useOrgBrandingContext(): OrgBrandingData {
  return useContext(OrgBrandingContext);
}

const CACHE_KEY = 'tutlio_org_branding';

function getCached(): OrgBrandingData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrgBrandingData;
    if (parsed && typeof parsed.brand_color_secondary !== 'string') {
      parsed.brand_color_secondary = '#8b5cf6';
    }
    return parsed;
  } catch {
    return null;
  }
}

function setCache(data: OrgBrandingData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function clearOrgBrandingCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

const ACTIVE_STUDENT_PROFILE_KEY = 'tutlio_active_student_profile_id';

function getActiveStudentProfileId(): string | null {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_STUDENT_PROFILE_KEY) : null;
  } catch {
    return null;
  }
}

/** Resolve org ID from a single student row (direct org_id or via tutor). */
async function resolveOrgFromStudentRow(row: { organization_id?: string | null; tutor_id?: string | null }): Promise<string | null> {
  if (row.organization_id) return row.organization_id;
  if (!row.tutor_id) return null;
  const { data: tutorProf } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', row.tutor_id)
    .maybeSingle();
  return (tutorProf?.organization_id as string | null) ?? null;
}

/** Resolve organization UUID for branding: tutors (profile / org admin row), students, parents. */
async function resolveOrganizationIdForUser(userId: string): Promise<string | null> {
  // 1. Tutor profile
  const { data: profile } = await tutorSidebarProfileDeduped(userId);
  const fromProfile = profile?.organization_id ?? null;
  if (fromProfile) return fromProfile;

  // 2. Org admin
  const { data: adminRow } = await supabase
    .from('organization_admins')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  if (adminRow?.organization_id) return adminRow.organization_id as string;

  // 3. Student — respect active profile selection
  const { data: studentRows } = await supabase
    .from('students')
    .select('id, organization_id, tutor_id')
    .eq('linked_user_id', userId);
  const allStudentRows = (studentRows as any[]) ?? [];

  if (allStudentRows.length > 0) {
    const activeId = getActiveStudentProfileId();
    const activeRow = activeId ? allStudentRows.find((r: any) => r.id === activeId) : null;

    if (activeRow) {
      // Use org from the selected tutor — may be null (no whitelabel)
      return resolveOrgFromStudentRow(activeRow);
    }

    // No explicit selection — prefer row with org, then first row
    const withOrg = allStudentRows.find((r: any) => r.organization_id);
    if (withOrg) return withOrg.organization_id as string;

    for (const row of allStudentRows) {
      const orgId = await resolveOrgFromStudentRow(row);
      if (orgId) return orgId;
    }

    return null;
  }

  // 4. Parent
  const { data: parentProfileId, error: parentErr } = await supabase.rpc('get_parent_profile_id_by_user_id', {
    p_user_id: userId,
  });
  if (parentErr || !parentProfileId) return null;

  const parentId = String(parentProfileId);
  const { data: link } = await supabase
    .from('parent_students')
    .select('student_id')
    .eq('parent_id', parentId)
    .limit(1)
    .maybeSingle();
  if (!link?.student_id) return null;

  const { data: childOrg } = await supabase
    .from('students')
    .select('organization_id, tutor_id')
    .eq('id', link.student_id)
    .maybeSingle();
  if (!childOrg) return null;

  return resolveOrgFromStudentRow(childOrg);
}

export function OrgBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<OrgBrandingData>(() => getCached() || DEFAULT);

  useEffect(() => {
    const root = document.documentElement;
    if (branding.enabled) {
      root.style.setProperty('--org-brand', branding.brand_color);
      root.style.setProperty('--org-brand-secondary', branding.brand_color_secondary || branding.brand_color);
      root.setAttribute('data-org-whitelabel', '1');
    } else {
      root.style.setProperty('--org-brand', '#4f46e5');
      root.style.setProperty('--org-brand-secondary', '#7c3aed');
      root.removeAttribute('data-org-whitelabel');
    }
  }, [branding.enabled, branding.brand_color, branding.brand_color_secondary]);

  useEffect(() => {
    const cached = getCached();
    if (cached) {
      setBranding(cached);
      return;
    }

    let cancelled = false;

    async function fetchOrgBranding(orgId: string) {
      try {
        const res = await fetch(`/api/org-branding?id=${encodeURIComponent(orgId)}`);
        if (!res.ok) return;
        const org = await res.json();
        if (cancelled || !org?.name) return;

        const data: OrgBrandingData = {
          name: org.name,
          logo_url: org.logo_url ?? null,
          brand_color: org.brand_color || '#6366f1',
          brand_color_secondary: org.brand_color_secondary || '#8b5cf6',
          slug: org.slug || null,
          enabled: true,
        };
        setBranding(data);
        setCache(data);
      } catch {
        /* network error — leave default branding */
      }
    }

    async function load() {
      const user = await dedupeAuthGetUser();
      if (!user || cancelled) return;

      const orgId = await resolveOrganizationIdForUser(user.id);
      if (cancelled) return;

      if (!orgId) {
        // No org for this user/profile — cache default so we don't re-fetch on next mount
        setBranding(DEFAULT);
        setCache(DEFAULT);
        return;
      }

      await fetchOrgBranding(orgId);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return <OrgBrandingContext.Provider value={branding}>{children}</OrgBrandingContext.Provider>;
}
