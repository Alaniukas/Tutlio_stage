import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { getCached, setCache } from '@/lib/dataCache';
import { parentStudentLinksDeduped } from '@/lib/preload';
import { supabase } from '@/lib/supabase';

const CACHE_KEY = 'parent_has_school_org';

export function useParentHasSchoolOrg(): boolean {
  const { user } = useUser();
  const [hasSchool, setHasSchool] = useState(() => getCached<boolean>(CACHE_KEY) === true);

  useEffect(() => {
    if (!user?.id) {
      setHasSchool(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const linksRes = await parentStudentLinksDeduped(user.id);
      const studentsRaw = (linksRes.data ?? [])
        .map((l: { students?: { tutor_id?: string | null } | null }) => l.students)
        .filter(Boolean);
      const tutorIds = [...new Set(
        studentsRaw
          .map((s) => s?.tutor_id)
          .filter((id): id is string => Boolean(id)),
      )];
      if (!tutorIds.length) {
        if (!cancelled) {
          setHasSchool(false);
          setCache(CACHE_KEY, false);
        }
        return;
      }
      const { data: profiles } = await supabase
        .from('profiles')
        .select('organization_id')
        .in('id', tutorIds);
      const orgIds = [...new Set(
        (profiles ?? [])
          .map((p) => p.organization_id as string | null)
          .filter((id): id is string => Boolean(id)),
      )];
      if (!orgIds.length) {
        if (!cancelled) {
          setHasSchool(false);
          setCache(CACHE_KEY, false);
        }
        return;
      }
      const { data: orgs } = await supabase
        .from('organizations')
        .select('entity_type')
        .in('id', orgIds);
      const yes = (orgs ?? []).some((o) => o.entity_type === 'school');
      if (!cancelled) {
        setHasSchool(yes);
        setCache(CACHE_KEY, yes);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return hasSchool;
}
