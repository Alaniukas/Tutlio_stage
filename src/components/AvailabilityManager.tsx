import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateInput } from '@/components/ui/date-input';
import { Trash2, Plus, Pencil, Check, X } from 'lucide-react';
import TimeSpinner from '@/components/TimeSpinner';
import Toast from '@/components/Toast';
import { useTranslation } from '@/lib/i18n';
import { tutorUsesManualStudentPayments } from '@/lib/subscription';

interface AvailabilitySlot {
  id: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  is_recurring: boolean;
  specific_date: string | null;
  end_date: string | null;
  subject_ids: string[];
}

function timeToMinutes(time: string) {
  const [hStr, mStr] = time.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const aS = timeToMinutes(aStart);
  const aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(bStart);
  const bE = timeToMinutes(bEnd);
  if (aS === null || aE === null || bS === null || bE === null) return false;
  return aS < bE && aE > bS;
}

function isAvailabilityStillValid(endDate: string | null) {
  if (!endDate) return true;
  const d = new Date(endDate);
  if (Number.isNaN(d.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() >= today.getTime();
}

export default function AvailabilityManager() {
  const { t } = useTranslation();

  const DAYS = useMemo(() => [
    { value: 1, label: t('avail.monday') },
    { value: 2, label: t('avail.tuesday') },
    { value: 3, label: t('avail.wednesday') },
    { value: 4, label: t('avail.thursday') },
    { value: 5, label: t('avail.friday') },
    { value: 6, label: t('avail.saturday') },
    { value: 0, label: t('avail.sunday') },
  ], [t]);

  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [isOrgTutor, setIsOrgTutor] = useState(false);

  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  const [dayOfWeek, setDayOfWeek] = useState<string>('1');
  const [recurringStart, setRecurringStart] = useState('09:00');
  const [recurringEnd, setRecurringEnd] = useState('17:00');
  const [recurringEndDate, setRecurringEndDate] = useState<string>('');

  const [specificDate, setSpecificDate] = useState('');
  const [specificStart, setSpecificStart] = useState('09:00');
  const [specificEnd, setSpecificEnd] = useState('17:00');

  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  const syncAvailabilityToGoogle = async (userId: string) => {
    try {
      const response = await fetch(`${window.location.origin}/api/google-calendar-sync`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ userId }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || (data as any)?.success === false) {
        console.error(
          'Failed to sync availability to Google Calendar:',
          (data as any)?.error || (data as any)?.message || 'Unknown error'
        );
      }
    } catch (err) {
      console.error('Failed to sync availability to Google Calendar:', err);
    }
  };

  useEffect(() => {
    fetchAvailabilityAndSubjects();
  }, []);

  const fetchAvailabilityAndSubjects = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from('profiles')
      .select(
        'stripe_account_id, organization_id, subscription_plan, manual_subscription_exempt, enable_manual_student_payments',
      )
      .eq('id', user.id)
      .single();
    const manualOk = tutorUsesManualStudentPayments(profileData);
    setStripeConnected(!!profileData?.stripe_account_id || manualOk);
    setIsOrgTutor(!!profileData?.organization_id);

    const { data: subs } = await supabase.from('subjects').select('id, name, grade_min, grade_max, is_group, max_students').eq('tutor_id', user.id);
    setSubjects(subs || []);

    const { data, error } = await supabase
      .from('availability')
      .select('*')
      .eq('tutor_id', user.id)
      .order('day_of_week', { ascending: true });

    if (error) console.error('Error fetching availability:', error);
    else setSlots(data as AvailabilitySlot[] || []);
    setLoading(false);
  };

  const seatLabel = (count: number) => {
    if (count === 1) return t('avail.seat');
    if (count < 10) return t('avail.seats');
    return t('avail.seatsMany');
  };

  const addRecurringSlot = async () => {
    if (!isOrgTutor && !stripeConnected) {
      alert(t('avail.stripeRequired'));
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const startMin = timeToMinutes(recurringStart);
    const endMin = timeToMinutes(recurringEnd);
    if (startMin === null || endMin === null || startMin >= endMin) {
      setSaving(false);
      alert(t('avail.invalidTimeRange'));
      return;
    }

    const dayNum = parseInt(dayOfWeek);
    const { data: existingRecurring } = await supabase
      .from('availability')
      .select('id, start_time, end_time, end_date')
      .eq('tutor_id', user.id)
      .eq('is_recurring', true)
      .eq('day_of_week', dayNum);

    if (existingRecurring && existingRecurring.length > 0) {
      const validExisting = existingRecurring.filter((s: any) => isAvailabilityStillValid(s.end_date ?? null));
      const hasOverlap = validExisting.some((s: any) =>
        rangesOverlap(recurringStart, recurringEnd, s.start_time, s.end_time)
      );
      if (hasOverlap) {
        setSaving(false);
        alert(t('avail.overlapError'));
        return;
      }
    }

    const { error } = await supabase.from('availability').insert([
      {
        tutor_id: user.id,
        day_of_week: dayNum,
        start_time: recurringStart,
        end_time: recurringEnd,
        is_recurring: true,
        end_date: recurringEndDate || null,
        subject_ids: selectedSubjects,
      },
    ]);

    if (error) {
      console.error('Error adding slot:', error);
      setToastMessage({ message: t('avail.addFailed'), type: 'error' });
    } else {
      await syncAvailabilityToGoogle(user.id);
      await fetchAvailabilityAndSubjects();
      setSelectedSubjects([]);
      setToastMessage({ message: t('avail.addSuccess'), type: 'success' });
    }
    setSaving(false);
  };

  const addSpecificSlot = async () => {
    if (!specificDate) return;
    if (!isOrgTutor && !stripeConnected) {
      alert(t('avail.stripeRequired'));
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const startMin = timeToMinutes(specificStart);
    const endMin = timeToMinutes(specificEnd);
    if (startMin === null || endMin === null || startMin >= endMin) {
      setSaving(false);
      alert(t('avail.invalidTimeRange'));
      return;
    }

    const { data: existingSpecific } = await supabase
      .from('availability')
      .select('id, start_time, end_time')
      .eq('tutor_id', user.id)
      .eq('is_recurring', false)
      .eq('specific_date', specificDate);

    if (existingSpecific && existingSpecific.length > 0) {
      const hasOverlap = existingSpecific.some((s: any) =>
        rangesOverlap(specificStart, specificEnd, s.start_time, s.end_time)
      );
      if (hasOverlap) {
        setSaving(false);
        alert(t('avail.overlapError'));
        return;
      }
    }

    const { error } = await supabase.from('availability').insert([
      {
        tutor_id: user.id,
        specific_date: specificDate,
        start_time: specificStart,
        end_time: specificEnd,
        is_recurring: false,
        subject_ids: selectedSubjects,
      },
    ]);

    if (error) {
      console.error('Error adding slot:', error);
      setToastMessage({ message: t('avail.addFailed'), type: 'error' });
    } else {
      await syncAvailabilityToGoogle(user.id);
      await fetchAvailabilityAndSubjects();
      setSelectedSubjects([]);
      setToastMessage({ message: t('avail.addSuccess'), type: 'success' });
    }
    setSaving(false);
  };

  const deleteSlot = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const slotToDelete = slots.find(s => s.id === id);
    if (!slotToDelete) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const now = new Date().toISOString();
    const { data: activeSessions } = await supabase
      .from('sessions')
      .select('start_time, end_time')
      .eq('tutor_id', user.id)
      .eq('status', 'active')
      .gte('start_time', now);

    if (activeSessions && activeSessions.length > 0) {
      const hasOverlap = activeSessions.some(session => {
        const sessionStart = new Date(session.start_time);
        const sessionEnd = new Date(session.end_time);

        const sessionDayOfWeek = sessionStart.getDay();
        const sessionDateStr = `${sessionStart.getFullYear()}-${String(sessionStart.getMonth() + 1).padStart(2, '0')}-${String(sessionStart.getDate()).padStart(2, '0')}`;

        const matchesDay = slotToDelete.is_recurring && slotToDelete.day_of_week === sessionDayOfWeek;
        const matchesDate = !slotToDelete.is_recurring && slotToDelete.specific_date === sessionDateStr;

        if (matchesDay || matchesDate) {
          const sessionStartMins = sessionStart.getHours() * 60 + sessionStart.getMinutes();
          const sessionEndMins = sessionEnd.getHours() * 60 + sessionEnd.getMinutes();

          const [slotStartH, slotStartM] = slotToDelete.start_time.split(':').map(Number);
          const [slotEndH, slotEndM] = slotToDelete.end_time.split(':').map(Number);
          const slotStartMins = slotStartH * 60 + slotStartM;
          const slotEndMins = slotEndH * 60 + slotEndM;

          return (sessionStartMins < slotEndMins && sessionEndMins > slotStartMins);
        }
        return false;
      });

      if (hasOverlap) {
        alert(t('avail.cannotDeleteBooked'));
        return;
      }
    }

    const { error } = await supabase.from('availability').delete().eq('id', id);
    if (error) {
      console.error('Error deleting slot:', error);
      setToastMessage({ message: t('avail.deleteFailed'), type: 'error' });
    } else {
      await syncAvailabilityToGoogle(user.id);
      await fetchAvailabilityAndSubjects();
      setToastMessage({ message: t('avail.deleteSuccess'), type: 'success' });
    }
  };

  const startEditing = (slot: AvailabilitySlot) => {
    setEditingSlotId(slot.id);
    setEditStart(slot.start_time.slice(0, 5));
    setEditEnd(slot.end_time.slice(0, 5));
    setEditEndDate(slot.end_date || '');
  };

  const cancelEditing = () => setEditingSlotId(null);

  const saveSlot = async (slotId: string) => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const slotToEdit = slots.find(s => s.id === slotId);
    if (!slotToEdit) {
      setSaving(false);
      return;
    }

    const startMin = timeToMinutes(editStart);
    const endMin = timeToMinutes(editEnd);
    if (startMin === null || endMin === null || startMin >= endMin) {
      setSaving(false);
      alert(t('avail.invalidTimeRange'));
      return;
    }

    if (slotToEdit.is_recurring) {
      const dayNum = slotToEdit.day_of_week;
      const { data: existingRecurring } = await supabase
        .from('availability')
        .select('id, start_time, end_time, end_date')
        .eq('tutor_id', user.id)
        .eq('is_recurring', true)
        .eq('day_of_week', dayNum)
        .neq('id', slotId);

      const validExisting = (existingRecurring || []).filter((s: any) => isAvailabilityStillValid(s.end_date ?? null));
      const hasOverlap = validExisting.some((s: any) =>
        rangesOverlap(editStart, editEnd, s.start_time, s.end_time)
      );
      if (hasOverlap) {
        setSaving(false);
        alert(t('avail.overlapError'));
        return;
      }
    } else {
      const dateStr = slotToEdit.specific_date;
      const { data: existingSpecific } = await supabase
        .from('availability')
        .select('id, start_time, end_time')
        .eq('tutor_id', user.id)
        .eq('is_recurring', false)
        .eq('specific_date', dateStr)
        .neq('id', slotId);

      const hasOverlap = (existingSpecific || []).some((s: any) =>
        rangesOverlap(editStart, editEnd, s.start_time, s.end_time)
      );
      if (hasOverlap) {
        setSaving(false);
        alert(t('avail.overlapError'));
        return;
      }
    }

    const { error } = await supabase.from('availability').update({
      start_time: editStart,
      end_time: editEnd,
      end_date: editEndDate || null,
    }).eq('id', slotId);
    if (error) {
      console.error('Error updating slot:', error);
      setToastMessage({ message: t('avail.updateFailed'), type: 'error' });
    } else {
      await syncAvailabilityToGoogle(user.id);
      setEditingSlotId(null);
      await fetchAvailabilityAndSubjects();
      setToastMessage({ message: t('avail.updateSuccess'), type: 'success' });
    }
    setSaving(false);
  };

  const subjectBadge = (s: any) => (
    <span>
      {s.name}
      {s.is_group && s.max_students && (
        <span className="text-xs text-violet-600 font-semibold ml-1">
          ({t('avail.groupLabel')} - {s.max_students} {seatLabel(s.max_students)})
        </span>
      )}
      {s.grade_min && s.grade_max && (
        <span className="text-xs text-emerald-600 ml-1">
          ({s.grade_min}-{s.grade_max === 13 ? 'Studentas' : `${s.grade_max} kl`})
        </span>
      )}
    </span>
  );

  return (
    <div className="space-y-6 pt-2">
      {toastMessage && (
        <Toast
          message={toastMessage.message}
          type={toastMessage.type}
          onClose={() => setToastMessage(null)}
        />
      )}
      <Tabs defaultValue="recurring" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="recurring" className="rounded-xl">{t('avail.recurringTab')}</TabsTrigger>
          <TabsTrigger value="specific" className="rounded-xl">{t('avail.specificTab')}</TabsTrigger>
        </TabsList>

        {/* === RECURRING TAB === */}
        <TabsContent value="recurring" className="space-y-4 mt-4">
          <Card className="rounded-2xl border-gray-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('avail.addRecurring')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('avail.dayOfWeek')}</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((day) => (
                      <SelectItem key={day.value} value={day.value.toString()}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('avail.time')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col items-center bg-gray-50 rounded-xl border border-gray-100 py-1">
                    <span className="text-xs text-gray-500 font-medium mt-1">{t('avail.from')}</span>
                    <TimeSpinner value={recurringStart} onChange={setRecurringStart} minuteStep={1} />
                  </div>
                  <div className="flex flex-col items-center bg-gray-50 rounded-xl border border-gray-100 py-1">
                    <span className="text-xs text-gray-500 font-medium mt-1">{t('avail.to')}</span>
                    <TimeSpinner value={recurringEnd} onChange={setRecurringEnd} minuteStep={1} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('avail.validUntil')}</Label>
                <DateInput
                  value={recurringEndDate}
                  onChange={(e) => setRecurringEndDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-400">{t('avail.leaveEmptyForever')}</p>
              </div>

              {subjects.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <Label>{t('avail.whichSubjects')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {subjects.map(s => (
                      <label key={s.id} className="flex items-center gap-2 text-sm border p-2 rounded-xl cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selectedSubjects.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedSubjects([...selectedSubjects, s.id]);
                            else setSelectedSubjects(selectedSubjects.filter(id => id !== s.id));
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        {subjectBadge(s)}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">{t('avail.noSubjectMeansAll')}</p>
                </div>
              )}

              <button
                type="button"
                onClick={addRecurringSlot}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-4 h-4" />
                {saving ? t('avail.saving') : t('avail.addTime')}
              </button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <h3 className="font-medium text-sm text-gray-700">{t('avail.yourSchedule')}</h3>
            {loading ? (
              <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
            ) : slots.filter((s) => s.is_recurring).length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">{t('avail.noSlots')}</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {slots
                  .filter((s) => s.is_recurring)
                  .map((slot) => (
                    <div
                      key={slot.id}
                      className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm"
                    >
                      {editingSlotId === slot.id ? (
                        <div className="space-y-3">
                          <span className="text-sm font-semibold text-gray-800">
                            {DAYS.find((d) => d.value === slot.day_of_week)?.label}
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col items-center bg-gray-50 rounded-xl border border-gray-100 py-1">
                              <span className="text-xs text-gray-500 font-medium mt-1">{t('avail.from')}</span>
                              <TimeSpinner value={editStart} onChange={setEditStart} minuteStep={1} />
                            </div>
                            <div className="flex flex-col items-center bg-gray-50 rounded-xl border border-gray-100 py-1">
                              <span className="text-xs text-gray-500 font-medium mt-1">{t('avail.to')}</span>
                              <TimeSpinner value={editEnd} onChange={setEditEnd} minuteStep={1} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-gray-500">{t('avail.validUntil')}</label>
                            <DateInput
                              value={editEndDate}
                              onChange={(e) => setEditEndDate(e.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveSlot(slot.id)}
                              disabled={saving}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" /> {t('common.save')}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditing}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" /> {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">
                              {DAYS.find((d) => d.value === slot.day_of_week)?.label}
                            </p>
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-lg">
                                {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                              </span>
                              {slot.end_date && (
                                <span className="text-xs text-amber-600 font-medium">
                                  {t('avail.until')} {slot.end_date}
                                </span>
                              )}
                              {slot.subject_ids && slot.subject_ids.length > 0 && (
                                <span className="text-[10px] text-gray-400">
                                  {slot.subject_ids.length} {t('avail.subjects')}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => startEditing(slot)}
                              className="p-2 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => deleteSlot(slot.id, e)}
                              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* === SPECIFIC DATE TAB === */}
        <TabsContent value="specific" className="space-y-4 mt-4">
          <Card className="rounded-2xl border-gray-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('avail.addSpecific')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t('avail.date')}</Label>
                <DateInput
                  value={specificDate}
                  onChange={(e) => setSpecificDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>{t('avail.from')}</Label>
                  <div className="bg-gray-50 p-1 rounded-xl border border-gray-100 flex justify-center">
                    <TimeSpinner value={specificStart} onChange={setSpecificStart} minuteStep={1} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('avail.to')}</Label>
                  <div className="bg-gray-50 p-1 rounded-xl border border-gray-100 flex justify-center">
                    <TimeSpinner value={specificEnd} onChange={setSpecificEnd} minuteStep={1} />
                  </div>
                </div>
              </div>

              {subjects.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <Label>{t('avail.whichSubjects')}</Label>
                  <div className="flex flex-wrap gap-2">
                    {subjects.map(s => (
                      <label key={s.id} className="flex items-center gap-2 text-sm border p-2 rounded-xl cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selectedSubjects.includes(s.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedSubjects([...selectedSubjects, s.id]);
                            else setSelectedSubjects(selectedSubjects.filter(id => id !== s.id));
                          }}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        {subjectBadge(s)}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400">{t('avail.noSubjectMeansAll')}</p>
                </div>
              )}

              <button
                type="button"
                onClick={addSpecificSlot}
                disabled={saving || !specificDate}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-4 h-4" />
                {saving ? t('avail.saving') : t('avail.addTime')}
              </button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <h3 className="font-medium text-sm text-gray-700">{t('avail.specificDays')}</h3>
            {slots.filter((s) => !s.is_recurring).length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">{t('avail.noSpecificDays')}</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {slots
                  .filter((s) => !s.is_recurring)
                  .map((slot) => (
                    <div
                      key={slot.id}
                      className="p-3 bg-white border border-gray-100 rounded-xl shadow-sm"
                    >
                      {editingSlotId === slot.id ? (
                        <div className="space-y-3">
                          <span className="text-sm font-semibold text-gray-800">{slot.specific_date}</span>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col items-center bg-gray-50 rounded-xl border border-gray-100 py-1">
                              <span className="text-xs text-gray-500 font-medium mt-1">{t('avail.from')}</span>
                              <TimeSpinner value={editStart} onChange={setEditStart} minuteStep={1} />
                            </div>
                            <div className="flex flex-col items-center bg-gray-50 rounded-xl border border-gray-100 py-1">
                              <span className="text-xs text-gray-500 font-medium mt-1">{t('avail.to')}</span>
                              <TimeSpinner value={editEnd} onChange={setEditEnd} minuteStep={1} />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveSlot(slot.id)}
                              disabled={saving}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" /> {t('common.save')}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditing}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" /> {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{slot.specific_date}</p>
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <span className="text-xs text-gray-500 bg-gray-50 px-2 py-0.5 rounded-lg">
                                {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                              </span>
                              {slot.subject_ids && slot.subject_ids.length > 0 && (
                                <span className="text-[10px] text-gray-400">
                                  {slot.subject_ids.length} {t('avail.subjects')}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => startEditing(slot)}
                              className="p-2 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSlot(slot.id)}
                              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
