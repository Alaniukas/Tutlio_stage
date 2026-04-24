import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import CompanyOrgWaitlistPanel, { type OrgTutorOption } from '@/components/CompanyOrgWaitlistPanel';
import { getCached, setCache } from '@/lib/dataCache';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { ArrowLeft, ListOrdered } from 'lucide-react';

export default function CompanyWaitlist() {
  const { t } = useTranslation();
  const location = useLocation();
  const orgBasePath = location.pathname.startsWith('/school') ? '/school' : '/company';
  const wc = getCached<{ tutors: OrgTutorOption[] }>('company_waitlist');
  const [loading, setLoading] = useState(!wc);
  const [tutors, setTutors] = useState<OrgTutorOption[]>(wc?.tutors ?? []);

  useEffect(() => {
    if (getCached('company_waitlist')) return;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: adminRow } = await supabase
        .from('organization_admins')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!adminRow) {
        setLoading(false);
        return;
      }
      const { data: adminUsers } = await supabase
        .from('organization_admins')
        .select('user_id')
        .eq('organization_id', adminRow.organization_id);
      const adminIds = new Set((adminUsers || []).map((a: { user_id: string }) => a.user_id));
      const { data: profilesList } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('organization_id', adminRow.organization_id)
        .order('full_name');
      const tutorsList = (profilesList || []).filter((t) => !adminIds.has(t.id));
      setTutors(tutorsList);
      setCache('company_waitlist', { tutors: tutorsList });
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <>
        <div className="max-w-5xl mx-auto flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-5">
        <Link
          to={`${orgBasePath}/sessions`}
          className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('compWaitlist.backToLessons')}
        </Link>

        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
            <ListOrdered className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('compWaitlist.title')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('compWaitlist.description')}</p>
          </div>
        </div>

        <CompanyOrgWaitlistPanel tutors={tutors} variant="page" />
      </div>
    </>
  );
}
