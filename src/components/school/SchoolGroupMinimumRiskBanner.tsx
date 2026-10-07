import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

type RiskGroup = {
  id: string;
  name: string;
  eligibleCount: number;
  minimum: number;
  occurrenceLabel: string;
};

export default function SchoolGroupMinimumRiskBanner(props: {
  enabled: boolean;
  groupsHref?: string;
}) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<RiskGroup[]>([]);
  const groupsHref = props.groupsHref || '/school/groups';

  useEffect(() => {
    if (!props.enabled) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/school-group-minimum-risk', { headers: await authHeaders() });
        if (!response.ok || cancelled) return;
        const payload = await response.json() as { groups?: RiskGroup[] };
        if (!cancelled) setGroups(payload.groups || []);
      } catch {
        if (!cancelled) setGroups([]);
      }
    })();
    return () => { cancelled = true; };
  }, [props.enabled]);

  if (!props.enabled || groups.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {groups.map((group) => (
        <div
          key={group.id}
          className="p-4 rounded-2xl border border-amber-200 bg-amber-50 flex flex-wrap items-start gap-3"
        >
          <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {t('school.groups.minimumRiskTitle', { name: group.name })}
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              {t('school.groups.minimumRiskDetail', {
                date: group.occurrenceLabel,
                n: group.eligibleCount,
                minimum: group.minimum,
              })}
            </p>
          </div>
          <Link to={groupsHref}>
            <Button variant="outline" size="sm" className="rounded-xl border-amber-300 text-amber-900 hover:bg-amber-100">
              {t('school.groups.minimumRiskAction')}
            </Button>
          </Link>
        </div>
      ))}
    </div>
  );
}
