import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { TimeInput } from '@/components/ui/time-input';
import { authHeaders } from '@/lib/apiHelpers';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { useTranslation } from '@/lib/i18n';
import { formatScheduleLabel } from '@/lib/extraLessonsContract';

type Group = {
  id: string;
  name: string;
  tutor_id: string;
  school_year_start: string;
  school_year_end: string;
  platform: string;
  duration_minutes: number;
  meeting_link?: string | null;
  slots?: { weekday: number; start_time: string; end_time: string }[];
  members?: { student_id: string; student?: { full_name: string } | null }[];
};

const WEEKDAYS = [
  { v: 1, label: 'Pirmadienis' },
  { v: 2, label: 'Antradienis' },
  { v: 3, label: 'Trečiadienis' },
  { v: 4, label: 'Ketvirtadienis' },
  { v: 5, label: 'Penktadienis' },
];

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatLtDate(iso: string): string {
  const d = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || '—';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}

export default function CompanyClassGroups() {
  const { t } = useTranslation();
  const { hasFeature } = useOrgFeatures();
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState('');
  const [yearStart, setYearStart] = useState('2026-09-01');
  const [yearEnd, setYearEnd] = useState('2027-06-15');
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState('16:00');
  const [duration, setDuration] = useState(45);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endTime = addMinutes(startTime, duration);

  const load = async () => {
    const headers = await authHeaders();
    const res = await fetch('/api/school-class-groups', { headers });
    const data = await res.json();
    if (res.ok) setGroups(data.groups || []);
  };

  useEffect(() => { void load(); }, []);

  if (!hasFeature('school_class_groups')) {
    return <p className="text-sm text-gray-500">{t('school.groups.disabled')}</p>;
  }

  const create = async () => {
    setBusy(true);
    setError(null);
    const headers = await authHeaders();
    const res = await fetch('/api/school-class-groups', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name,
        school_year_start: yearStart,
        school_year_end: yearEnd,
        duration_minutes: duration,
        slots: [{ weekday, start_time: startTime, end_time: endTime }],
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'Nepavyko sukurti grupės.');
    else {
      setName('');
      await load();
    }
    setBusy(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t('school.groups.title')}</h1>
      <p className="text-sm text-gray-600">{t('school.groups.lead')}</p>
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="font-semibold">{t('school.groups.new')}</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>{t('school.groups.name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="pvz. Matematika 5 kl." className="rounded-xl" />
          </div>
          <div>
            <Label>{t('school.groups.weekday')}</Label>
            <select
              className="w-full border rounded-xl h-9 px-2 text-sm"
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
            >
              {WEEKDAYS.map((d) => <option key={d.v} value={d.v}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <Label>{t('school.groups.from')}</Label>
            <TimeInput value={startTime} onChange={setStartTime} className="rounded-xl" />
          </div>
          <div>
            <Label>Trukmė (min.)</Label>
            <Input
              type="number"
              min={15}
              step={5}
              value={duration}
              onChange={(e) => setDuration(Math.max(15, Number(e.target.value) || 45))}
              className="rounded-xl"
            />
            <p className="text-xs text-gray-500 mt-1">Iki {endTime}</p>
          </div>
          <div>
            <Label>{t('school.groups.yearStart')}</Label>
            <DateInput value={yearStart} onChange={(e) => setYearStart(e.target.value)} className="rounded-xl" />
          </div>
          <div>
            <Label>{t('school.groups.yearEnd')}</Label>
            <DateInput value={yearEnd} onChange={(e) => setYearEnd(e.target.value)} className="rounded-xl" />
          </div>
        </div>
        <Button className="bg-emerald-600 hover:bg-emerald-700 rounded-xl" disabled={busy || !name} onClick={create}>
          {busy ? '…' : t('school.groups.create')}
        </Button>
      </div>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.id} className="rounded-xl border bg-white p-4">
            <div className="font-semibold text-gray-900">{g.name}</div>
            <div className="text-sm text-gray-600">
              {formatLtDate(g.school_year_start)} – {formatLtDate(g.school_year_end)} · {g.platform} · {g.duration_minutes} min.
            </div>
            <div className="text-sm text-gray-600 mt-1">
              {formatScheduleLabel((g.slots || []).map((s) => ({
                weekday: Number(s.weekday),
                start_time: String(s.start_time).slice(0, 5),
                end_time: String(s.end_time).slice(0, 5),
              }))) || '—'}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {t('school.groups.members')}: {(g.members || []).map((m) => m.student?.full_name).filter(Boolean).join(', ') || '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
