import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { dedupeAuthGetUser, rpcGetStudentProfilesDeduped } from '@/lib/preload';
import { fetchStudentPortalPolicyMap } from '@/lib/studentBookingPolicy';

/**
 * Org portal-gating flags resolved ONCE per session BEFORE student pages
 * mount, so proklase-style orgs never even load booking/waitlist/cancel UI
 * (previously each page resolved the flags inside its own data fetch, causing
 * a mount + fetch + flash). Fail-open: RLS remains the enforcement layer.
 */
export interface StudentPortalPolicy {
  /** False until the first resolution (cached resolutions are immediate). */
  resolved: boolean;
  activeStudentId: string | null;
  organizationId: string | null;
  /** Org feature disable_student_booking. */
  bookingDisabled: boolean;
  /** Org feature disable_student_reschedule_cancel. */
  actionsDisabled: boolean;
  /** Org feature student_payments_page ("Mokėjimai" portal section). */
  paymentsPageEnabled: boolean;
}

const DEFAULT: StudentPortalPolicy = {
  resolved: false,
  activeStudentId: null,
  organizationId: null,
  bookingDisabled: false,
  actionsDisabled: false,
  paymentsPageEnabled: false,
};

const CACHE_KEY = 'tutlio_student_policy';
const ACTIVE_STUDENT_PROFILE_KEY = 'tutlio_active_student_profile_id';

type CachedPolicy = { userId: string; policy: StudentPortalPolicy };

function readCache(userId: string | null): StudentPortalPolicy | null {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPolicy;
    if (parsed.userId !== userId) return null;
    return { ...parsed.policy, resolved: true };
  } catch {
    return null;
  }
}

function writeCache(userId: string, policy: StudentPortalPolicy) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ userId, policy } satisfies CachedPolicy));
  } catch {
    /* ignore */
  }
}

export function clearStudentPolicyCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

const StudentPolicyContext = createContext<StudentPortalPolicy>(DEFAULT);

/** Safe without a provider (e.g. parent-embed mode) — returns the unresolved default. */
export function useStudentPolicy(): StudentPortalPolicy {
  return useContext(StudentPolicyContext);
}

export function StudentPolicyProvider({ children }: { children: ReactNode }) {
  const [policy, setPolicy] = useState<StudentPortalPolicy>(DEFAULT);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const user = await dedupeAuthGetUser();
        if (cancelled) return;
        if (!user) {
          setPolicy({ ...DEFAULT, resolved: true });
          return;
        }

        // Cache hit renders immediately; a background refresh reconciles.
        const cached = readCache(user.id);
        if (cached) setPolicy(cached);

        const { data: studentRows } = await rpcGetStudentProfilesDeduped(user.id, null);
        if (cancelled) return;
        const rows = (studentRows || []) as Array<{ id: string }>;
        const activeId =
          typeof window !== 'undefined' ? localStorage.getItem(ACTIVE_STUDENT_PROFILE_KEY) : null;
        const selected = rows.find((row) => row.id === activeId) || rows[0];
        if (!selected) {
          const fallback = { ...DEFAULT, resolved: true };
          setPolicy(fallback);
          writeCache(user.id, fallback);
          return;
        }
        // Mirror StudentLayout: pin the active profile on first resolve so nav
        // and pages agree on the active child.
        if (typeof window !== 'undefined' && !activeId) {
          localStorage.setItem(ACTIVE_STUDENT_PROFILE_KEY, selected.id);
        }

        const map = await fetchStudentPortalPolicyMap([selected.id]);
        if (cancelled) return;
        const entry = map[selected.id];
        const next: StudentPortalPolicy = {
          resolved: true,
          activeStudentId: selected.id,
          organizationId: entry?.organizationId ?? null,
          bookingDisabled: entry?.bookingDisabled === true,
          actionsDisabled: entry?.actionsDisabled === true,
          paymentsPageEnabled: entry?.paymentsPageEnabled === true,
        };
        setPolicy(next);
        writeCache(user.id, next);
      } catch {
        if (!cancelled) setPolicy((prev) => ({ ...prev, resolved: true }));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return <StudentPolicyContext.Provider value={policy}>{children}</StudentPolicyContext.Provider>;
}
