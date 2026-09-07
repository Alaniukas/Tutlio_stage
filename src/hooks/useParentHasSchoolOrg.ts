import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { getCached, setCache } from '@/lib/dataCache';
import { parentStudentLinksDeduped } from '@/lib/preload';
import { supabase } from '@/lib/supabase';
import { schoolTerminologyForOrg, type SchoolTerminology } from '@/lib/i18n/schoolTerminology';

const CACHE_KEY = 'parent_school_org';

export type ParentSchoolOrgState = {
  hasSchoolOrg: boolean;
  /** Union of the school orgs' wording flags; `null` while unresolved or when no school org. */
  terminology: SchoolTerminology | null;
};

const EMPTY: ParentSchoolOrgState = { hasSchoolOrg: false, terminology: null };

type OrgRow = { id: string; entity_type: string | null; features: Record<string, unknown> | null };

/**
 * Whether any linked child belongs to a school-type organization. Resolved
 * from `students.organization_id` first (group members often have no assigned
 * tutor), then from the assigned tutor's org as a fallback.
 */
export function useParentSchoolOrg(): ParentSchoolOrgState {
  const { user } = useUser();
  const [state, setState] = useState<ParentSchoolOrgState>(() => getCached<ParentSchoolOrgState>(CACHE_KEY) ?? EMPTY);

  useEffect(() => {
    if (!user?.id) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    const finish = (next: ParentSchoolOrgState) => {
      setCache(CACHE_KEY, next);
      if (!cancelled) setState(next);
    };
    void (async () => {
      const linksRes = await parentStudentLinksDeduped(user.id);
      const studentsRaw = (linksRes.data ?? []).flatMap((link) => {
        const nested = (link as { students?: unknown }).students;
        if (!nested) return [];
        return Array.isArray(nested) ? nested : [nested];
      }) as Array<{ tutor_id?: string | null; organization_id?: string | null }>;

      const orgIds = new Set<string>();
      for (const s of studentsRaw) if (s?.organization_id) orgIds.add(s.organization_id);

      const tutorIds = [...new Set(
        studentsRaw
          .filter((s) => !s?.organization_id && s?.tutor_id)
          .map((s) => s.tutor_id as string),
      )];
      if (tutorIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('organization_id')
          .in('id', tutorIds);
        for (const p of profiles ?? []) {
          const id = (p as { organization_id?: string | null }).organization_id;
          if (id) orgIds.add(id);
        }
      }
      if (!orgIds.size) return finish(EMPTY);

      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, entity_type, features')
        .in('id', [...orgIds]);
      const schools = ((orgs ?? []) as OrgRow[]).filter((o) => o.entity_type === 'school');
      if (!schools.length) return finish(EMPTY);

      const terminology = schools
        .map((o) => schoolTerminologyForOrg(o.entity_type, o.features))
        .reduce<SchoolTerminology>(
          (acc, mode) => ({ staff: acc.staff || mode.staff, activity: acc.activity || mode.activity }),
          { staff: false, activity: false },
        );
      finish({ hasSchoolOrg: true, terminology });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return state;
}

export function useParentHasSchoolOrg(): boolean {
  return useParentSchoolOrg().hasSchoolOrg;
}
