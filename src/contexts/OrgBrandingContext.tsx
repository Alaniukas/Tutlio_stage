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

/** Which portal the provider serves — branding must follow the viewed portal, not every role the account has. */
export type OrgBrandingScope = 'tutor' | 'student' | 'parent';

const CACHE_KEY = 'tutlio_org_branding';

/** Cache is bound to user + scope: a logout hard-redirect can race the SIGNED_OUT
 *  cleanup, so the next account in the same tab must never reuse this entry. */
interface CachedBranding {
  userId: string;
  scope: OrgBrandingScope;
  data: OrgBrandingData;
}

function getCached(): CachedBranding | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBranding;
    // Legacy entries (plain OrgBrandingData without user binding) are ignored.
    if (!parsed || typeof parsed.userId !== 'string' || typeof parsed.scope !== 'string' || !parsed.data) {
      return null;
    }
    if (typeof parsed.data.brand_color_secondary !== 'string') {
      parsed.data.brand_color_secondary = '#8b5cf6';
    }
    return parsed;
  } catch {
    return null;
  }
}

function setCache(userId: string, scope: OrgBrandingScope, data: OrgBrandingData) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ userId, scope, data } satisfies CachedBranding));
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

/** Resolve organization UUID for branding, limited to the portal being viewed. */
async function resolveOrganizationIdForUser(userId: string, scope: OrgBrandingScope): Promise<string | null> {
  if (scope === 'tutor') return resolveOrgForTutorPortal(userId);
  if (scope === 'student') return resolveOrgForStudentPortal(userId);
  return resolveOrgForParentPortal(userId);
}

/** Tutor portal: only the tutor's own org (profile) or org-admin membership counts.
 *  Never fall through to student/parent links — an individual tutor who is also
 *  linked as someone's student must not inherit that org's branding here. */
async function resolveOrgForTutorPortal(userId: string): Promise<string | null> {
  const { data: profile } = await tutorSidebarProfileDeduped(userId);
  const fromProfile = profile?.organization_id ?? null;
  if (fromProfile) return fromProfile;

  const { data: adminRow } = await supabase
    .from('organization_admins')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return (adminRow?.organization_id as string | null) ?? null;
}

/** Student portal: org via the student rows — respect active profile selection. */
async function resolveOrgForStudentPortal(userId: string): Promise<string | null> {
  const { data: studentRows } = await supabase
    .from('students')
    .select('id, organization_id, tutor_id')
    .eq('linked_user_id', userId);
  const allStudentRows = (studentRows as any[]) ?? [];
  if (allStudentRows.length === 0) return null;

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

/** Parent portal: org via the first linked child. */
async function resolveOrgForParentPortal(userId: string): Promise<string | null> {
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

export function OrgBrandingProvider({ scope, children }: { scope: OrgBrandingScope; children: ReactNode }) {
  // Optimistic initial value to avoid flicker; load() re-validates it against the
  // signed-in user + scope and resets if the cache belongs to another account.
  const [branding, setBranding] = useState<OrgBrandingData>(() => getCached()?.data || DEFAULT);

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
    let cancelled = false;

    async function fetchOrgBranding(userId: string, orgId: string) {
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
        setCache(userId, scope, data);
      } catch {
        /* network error — leave default branding */
      }
    }

    async function load() {
      const user = await dedupeAuthGetUser();
      if (!user || cancelled) return;

      const cached = getCached();
      if (cached && cached.userId === user.id && cached.scope === scope) {
        setBranding(cached.data);
        return;
      }

      // Cache belongs to another account/portal (or none) — drop the optimistic
      // value now so a previous user's branding never sticks.
      setBranding(DEFAULT);

      const orgId = await resolveOrganizationIdForUser(user.id, scope);
      if (cancelled) return;

      if (!orgId) {
        // No org for this user/portal — cache default so we don't re-fetch on next mount
        setCache(user.id, scope, DEFAULT);
        return;
      }

      await fetchOrgBranding(user.id, orgId);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return <OrgBrandingContext.Provider value={branding}>{children}</OrgBrandingContext.Provider>;
}
