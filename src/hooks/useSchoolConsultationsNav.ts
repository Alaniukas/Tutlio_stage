import { useEffect, useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { getCached, setCache } from '@/lib/dataCache';
import { parentStudentLinksDeduped } from '@/lib/preload';
import { supabase } from '@/lib/supabase';
import { schoolConsultationsEnabled } from '@/lib/schoolConsultationsOrg';

const CACHE_KEY = 'school_consultations_nav_visible';

export function useSchoolConsultationsNav(): boolean {
  const { user } = useUser();
  const [visible, setVisible] = useState(() => getCached<boolean>(CACHE_KEY) === true);

  useEffect(() => {
    if (!user?.id) {
      setVisible(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const linksRes = await parentStudentLinksDeduped(user.id);
      const studentsRaw = (linksRes.data ?? []).flatMap((link) => {
        const nested = link.students;
        if (!nested) return [];
        return Array.isArray(nested) ? nested : [nested];
      });
      const studentIds = studentsRaw.map((s) => s?.id).filter(Boolean) as string[];
      if (!studentIds.length) {
        const { data: selfStudent } = await supabase
          .from('students')
          .select('id, organization_id')
          .eq('linked_user_id', user.id)
          .limit(1)
          .maybeSingle();
        if (selfStudent?.organization_id) {
          const ok = await orgHasConsultations(selfStudent.organization_id, selfStudent.id);
          if (!cancelled) {
            setVisible(ok);
            setCache(CACHE_KEY, ok);
          }
          return;
        }
        if (!cancelled) {
          setVisible(false);
          setCache(CACHE_KEY, false);
        }
        return;
      }
      const { data: students } = await supabase
        .from('students')
        .select('id, organization_id')
        .in('id', studentIds);
      const orgIds = [...new Set((students ?? []).map((s) => s.organization_id).filter(Boolean))] as string[];
      let ok = false;
      for (const oid of orgIds) {
        const sid = students?.find((s) => s.organization_id === oid)?.id;
        if (sid && (await orgHasConsultations(oid, sid))) {
          ok = true;
          break;
        }
      }
      if (!cancelled) {
        setVisible(ok);
        setCache(CACHE_KEY, ok);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return visible;
}

async function orgHasConsultations(orgId: string, studentId: string): Promise<boolean> {
  const { data: org } = await supabase
    .from('organizations')
    .select('features')
    .eq('id', orgId)
    .maybeSingle();
  const features = (org?.features || {}) as Record<string, unknown>;
  if (!schoolConsultationsEnabled(orgId, features)) return false;
  const { data: contract } = await supabase
    .from('school_contracts')
    .select('id')
    .eq('student_id', studentId)
    .eq('kind', 'annual')
    .eq('signing_status', 'signed')
    .is('archived_at', null)
    .maybeSingle();
  return Boolean(contract);
}
