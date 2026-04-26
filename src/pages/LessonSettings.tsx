import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Trash2, Plus, BookOpen, Clock, Euro, Save, Pencil, ShieldAlert, Bell, CalendarClock, ChevronDown, Lock, Building2, AlertTriangle, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrgTutorPolicy } from '@/hooks/useOrgTutorPolicy';
import { useTranslation } from '@/lib/i18n';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Subject {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  color: string;
  meeting_link?: string;
  grade_min?: number | null;
  grade_max?: number | null;
  is_group?: boolean;
  max_students?: number | null;
}

interface LessonSettings {
  cancellation_hours: number;
  cancellation_fee_percent: number;
  reminder_student_hours: number;
  reminder_tutor_hours: number;
  break_between_lessons: number;
  min_booking_hours: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CANCELLATION_HOURS_OPTIONS = [2, 6, 12, 24, 48];
const CANCELLATION_FEE_OPTIONS = [0, 25, 50, 75, 100];
const BREAK_MINUTES_OPTIONS = [0, 5, 10, 15, 20, 30];
const REMINDER_HOURS_OPTIONS = [0, 0.5, 1, 2, 4, 6, 12, 24];
const BOOKING_HOURS_OPTIONS = [1, 2, 3, 6, 12, 24];
const SUBJECT_COLOR_VALUES = [
  { key: 'lessonSet.colorBlue' as const, value: '#6366f1' },
  { key: 'lessonSet.colorGreen' as const, value: '#10b981' },
  { key: 'lessonSet.colorOrange' as const, value: '#f59e0b' },
  { key: 'lessonSet.colorRed' as const, value: '#ef4444' },
  { key: 'lessonSet.colorPink' as const, value: '#ec4899' },
  { key: 'lessonSet.colorPurple' as const, value: '#8b5cf6' },
  { key: 'lessonSet.colorCyan' as const, value: '#06b6d4' },
];

// ─── Collapsible Section Component ───────────────────────────────────────────

function SettingsSection({
  icon, iconBg, title, description, children, defaultOpen = false,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", iconBg)}>
            {icon}
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500">{description}</p>
          </div>
        </div>
        <ChevronDown className={cn("w-5 h-5 text-gray-400 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <div className={cn("transition-all duration-200 ease-in-out", open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0 overflow-hidden")}>
        <div className="px-6 pb-6 border-t border-gray-50">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Dropdown with Custom Input Helper ───────────────────────────────────────

function DropdownWithCustom({
  label, options, value, onChange, suffix, min = 0, max = 168, hint, icon, error, disabled,
  customLabel, currentLabel, changeLabel, listLabel,
}: {
  label: string;
  options: number[];
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  min?: number;
  max?: number;
  hint?: string;
  icon?: React.ReactNode;
  error?: string;
  disabled?: boolean;
  customLabel?: string;
  currentLabel?: string;
  changeLabel?: string;
  listLabel?: string;
}) {
  const [custom, setCustom] = useState(!options.includes(value));
  return (
    <div className={cn('space-y-2', disabled && 'opacity-60 pointer-events-none')}>
      <Label className="flex items-center gap-2 text-sm font-medium">
        {icon} {label}
      </Label>
      {!custom ? (
        <>
          <Select
            disabled={disabled}
            value={options.includes(value) ? value.toString() : 'custom'}
            onValueChange={(v) => {
              if (v === 'custom') setCustom(true);
              else onChange(parseFloat(v));
            }}
          >
            <SelectTrigger className={cn("rounded-xl", error && "border-red-500")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map(h => (
                <SelectItem key={h} value={h.toString()}>{h} {suffix}</SelectItem>
              ))}
              <SelectItem value="custom">{customLabel}</SelectItem>
            </SelectContent>
          </Select>
          {!options.includes(value) && (
            <p className="text-xs text-indigo-600 font-medium">
              {currentLabel || `Current: ${value} ${suffix}`}{' '}
              <button onClick={() => setCustom(true)} className="underline ml-1">{changeLabel || 'Change'}</button>
            </p>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            step="any"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className={cn("rounded-xl", error && "border-red-500")}
          />
          <span className="text-sm text-gray-500 whitespace-nowrap">{suffix}</span>
          <button type="button" disabled={disabled} onClick={() => setCustom(false)} className="text-xs text-indigo-600 underline whitespace-nowrap">{listLabel || 'List'}</button>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function LessonSettingsPage() {
  const { t } = useTranslation();
  const orgPolicy = useOrgTutorPolicy();
  const [orgName, setOrgName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [settings, setSettings] = useState<LessonSettings>({
    cancellation_hours: 24,
    cancellation_fee_percent: 0,
    reminder_student_hours: 2,
    reminder_tutor_hours: 2,
    break_between_lessons: 0,
    min_booking_hours: 24,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [paymentTiming, setPaymentTiming] = useState<'before_lesson' | 'after_lesson'>('before_lesson');
  const [paymentDeadlineHours, setPaymentDeadlineHours] = useState<number | null>(null);

  // Subject dialog state
  const [isSubjectDialogOpen, setIsSubjectDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [newSubject, setNewSubject] = useState({ name: '', duration_minutes: 60, price: 25, color: '#6366f1', meeting_link: '', grade_min: null as number | null, grade_max: null as number | null, is_group: false, max_students: null as number | null });
  const [savingSubject, setSavingSubject] = useState(false);

  // Validation error
  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    const reloadSubjects = async () => {
      if (document.visibilityState !== 'visible') return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: subjectsData, error } = await supabase
        .from('subjects')
        .select('*')
        .eq('tutor_id', user.id)
        .order('name');
      if (!error) setSubjects(subjectsData || []);
    };
    const onVis = () => {
      void reloadSubjects();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);

    const { data: tutorData } = await supabase
      .from('profiles')
      .select('cancellation_hours, cancellation_fee_percent, reminder_student_hours, reminder_tutor_hours, break_between_lessons, min_booking_hours, payment_timing, payment_deadline_hours, organization_id, organizations(name)')
      .eq('id', user.id)
      .single();

    if (tutorData?.organization_id) {
      setOrgName((tutorData.organizations as any)?.name || null);
    }

    setSettings({
      cancellation_hours: tutorData?.cancellation_hours ?? 24,
      cancellation_fee_percent: tutorData?.cancellation_fee_percent ?? 0,
      reminder_student_hours: tutorData?.reminder_student_hours ?? 2,
      reminder_tutor_hours: tutorData?.reminder_tutor_hours ?? 2,
      break_between_lessons: tutorData?.break_between_lessons ?? 0,
      min_booking_hours: tutorData?.min_booking_hours ?? 24,
    });
    setPaymentTiming((tutorData?.payment_timing as 'before_lesson' | 'after_lesson') ?? 'before_lesson');
    setPaymentDeadlineHours(tutorData?.payment_deadline_hours ?? null);

    const { data: subjectsData, error } = await supabase
      .from('subjects')
      .select('*')
      .eq('tutor_id', user.id)
      .order('name');

    if (!error) setSubjects(subjectsData || []);
    setLoading(false);
  };

  const canEditLessonSettings = !orgName || (!orgPolicy.loading && orgPolicy.canEditLessonPricing);
  const canEditSubjects = !orgName || (!orgPolicy.loading && orgPolicy.editSubjects);
  const canEditPricing = !orgName || (!orgPolicy.loading && orgPolicy.editPricing);
  const canEditCancellation = !orgName || (!orgPolicy.loading && orgPolicy.editCancellation);
  const canEditBreakBetween = !orgName || (!orgPolicy.loading && orgPolicy.editBreakBetweenLessons);
  const canEditMinBooking = !orgName || (!orgPolicy.loading && orgPolicy.editMinBookingHours);
  const canEditReminders = !orgName || (!orgPolicy.loading && orgPolicy.editReminders);
  /** Profile fields (not subjects) – "Save all" */
  const canSaveProfileFields =
    !orgName ||
    orgPolicy.editCancellation ||
    orgPolicy.editBreakBetweenLessons ||
    orgPolicy.editMinBookingHours ||
    orgPolicy.editReminders;

  /** Rodyti € kainas dalykuose ir baudos pavyzdyje */
  const showSubjectPrices = !orgPolicy.isOrgTutor || (!orgPolicy.loading && orgPolicy.editPricing);

  const handleSaveAll = async () => {
    if (orgName && !orgPolicy.canEditLessonPricing) {
      alert(t('lessonSet.orgBlocked'));
      return;
    }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const patch: Record<string, number> = {};
    if (!orgName || orgPolicy.editCancellation) {
      patch.cancellation_hours = settings.cancellation_hours;
      patch.cancellation_fee_percent = settings.cancellation_fee_percent;
    }
    if (!orgName || orgPolicy.editBreakBetweenLessons) {
      patch.break_between_lessons = settings.break_between_lessons;
    }
    if (!orgName || orgPolicy.editMinBookingHours) {
      patch.min_booking_hours = settings.min_booking_hours;
    }
    if (!orgName || orgPolicy.editReminders) {
      patch.reminder_student_hours = settings.reminder_student_hours;
      patch.reminder_tutor_hours = settings.reminder_tutor_hours;
    }

    if (Object.keys(patch).length === 0) {
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', user.id);

    if (error) {
      console.error('[LessonSettings] profiles update', error);
      alert(error.message || t('lessonSet.saveFailed'));
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  // Subject CRUD
  const openAddSubjectDialog = () => {
    setEditingSubject(null);
    setNewSubject({ name: '', duration_minutes: 60, price: 25, color: '#6366f1', meeting_link: '', grade_min: null, grade_max: null, is_group: false, max_students: null });
    setIsSubjectDialogOpen(true);
  };

  const openEditSubjectDialog = (subject: Subject) => {
    setEditingSubject(subject);
    setNewSubject({
      name: subject.name,
      duration_minutes: subject.duration_minutes,
      price: subject.price,
      color: subject.color,
      meeting_link: subject.meeting_link || '',
      grade_min: subject.grade_min || null,
      grade_max: subject.grade_max || null,
      is_group: subject.is_group || false,
      max_students: subject.max_students || null,
    });
    setIsSubjectDialogOpen(true);
  };

  const handleSaveSubject = async () => {
    if (!newSubject.name.trim()) return;
    if (orgName && !orgPolicy.editSubjects) return;
    setSavingSubject(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const priceToSave =
      orgName && !orgPolicy.editPricing ? (editingSubject?.price ?? newSubject.price) : newSubject.price;

    if (editingSubject) {
      const { error } = await supabase.from('subjects').update({
        name: newSubject.name.trim(),
        duration_minutes: newSubject.duration_minutes,
        price: priceToSave,
        color: newSubject.color,
        meeting_link: newSubject.meeting_link.trim() || null,
        grade_min: newSubject.grade_min,
        grade_max: newSubject.grade_max,
        is_group: newSubject.is_group,
        max_students: newSubject.is_group ? newSubject.max_students : null,
      }).eq('id', editingSubject.id);
      if (!error) { await fetchData(); setIsSubjectDialogOpen(false); }
    } else {
      const { error } = await supabase.from('subjects').insert([{
        tutor_id: user.id,
        name: newSubject.name.trim(),
        duration_minutes: newSubject.duration_minutes,
        price: orgName && !orgPolicy.editPricing ? 0 : newSubject.price,
        color: newSubject.color,
        meeting_link: newSubject.meeting_link.trim() || null,
        grade_min: newSubject.grade_min,
        grade_max: newSubject.grade_max,
        is_group: newSubject.is_group,
        max_students: newSubject.is_group ? newSubject.max_students : null,
      }]);
      if (!error) { await fetchData(); setIsSubjectDialogOpen(false); }
    }
    setSavingSubject(false);
  };

  const handleDeleteSubject = async (id: string) => {
    if (orgName && !orgPolicy.editSubjects) return;
    if (!confirm(t('lessonSet.deleteConfirm'))) return;
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (!error) fetchData();
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('lessonSet.title')}</h1>
            <p className="text-gray-500 mt-1 text-sm">{t('lessonSet.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-sm text-green-600 font-medium animate-fade-in">
                {t('lessonSet.saved')}
              </span>
            )}
            <Button
              onClick={handleSaveAll}
              disabled={saving || loading || !canEditLessonSettings || (Boolean(orgName) && !canSaveProfileFields)}
              className="rounded-xl gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? t('lessonSet.saving') : t('lessonSet.saveAll')}
            </Button>
          </div>
        </div>

        {/* Org banner */}
        {orgName && (
          <div className="flex items-center gap-3 bg-slate-800 rounded-2xl px-5 py-4 text-white shadow-sm">
            <Building2 className="w-5 h-5 text-slate-300 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-400 font-medium">{t('lessonSet.company')}</p>
              <p className="font-semibold text-sm">{orgName}</p>
            </div>
          </div>
        )}

        {/* === SUBJECTS / PRICING === */}
        <SettingsSection
          icon={<BookOpen className="w-5 h-5 text-emerald-600" />}
          iconBg="bg-emerald-100"
          title={orgPolicy.isOrgTutor ? t('lessonSet.subjects') : t('lessonSet.subjectPrices')}
          description={orgPolicy.isOrgTutor ? (orgPolicy.editPricing ? t('lessonSet.subjectPricesDesc') : t('lessonSet.subjectPricesDescOrg')) : (orgName ? t('lessonSet.subjectPricesDescOrg') : t('lessonSet.subjectPricesDesc'))}
          defaultOpen={true}
        >
          <div className="pt-4">
            {orgName && !orgPolicy.editSubjects && !orgPolicy.editPricing && (
              <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 mb-4">
                <Lock className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                <p className="text-sm text-indigo-700">{t('lessonSet.orgLockedAll', { org: orgName || '' })}</p>
              </div>
            )}
            {orgName && orgPolicy.editSubjects && !orgPolicy.editPricing && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                <Lock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-900">
                  {t('lessonSet.orgPriceNote')}
                </p>
              </div>
            )}
            {canEditSubjects && (
              <div className="flex justify-end mb-4">
                <Button onClick={openAddSubjectDialog} size="sm" className="rounded-xl gap-2">
                  <Plus className="w-4 h-4" /> {t('lessonSet.addSubject')}
                </Button>
              </div>
            )}

            {subjects.length === 0 ? (
              <div className="text-center py-8 px-4">
                <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <BookOpen className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-gray-500 font-medium text-sm">{t('lessonSet.noSubjects')}</p>
                {canEditSubjects && (
                  <Button onClick={openAddSubjectDialog} variant="outline" size="sm" className="mt-3 rounded-xl gap-2">
                    <Plus className="w-4 h-4" /> {t('lessonSet.addFirst')}
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3">
                {subjects.map((subject, idx) => (
                  <div
                    key={subject.id}
                    className="flex items-center justify-between gap-3 p-4 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all animate-fade-in"
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color }} />
                      <div className="min-w-0">
                        <span className="font-semibold text-gray-900 text-sm truncate block">{subject.name}</span>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="flex items-center gap-1 text-gray-500 text-xs">
                            <Clock className="w-3 h-3" />{subject.duration_minutes} min
                          </span>
                          {showSubjectPrices && (
                          <span className="flex items-center gap-1 text-indigo-600 text-xs font-semibold">
                            <Euro className="w-3 h-3" />{subject.price}
                          </span>
                          )}
                          {subject.grade_min !== null && subject.grade_max !== null && (
                            <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                              🎓 {subject.grade_min}-{subject.grade_max === 13 ? 'Studentas' : `${subject.grade_max} kl`}
                            </span>
                          )}
                          {subject.is_group && (
                            <span className="flex items-center gap-1 text-violet-600 bg-violet-50 px-2 py-0.5 rounded-md text-xs font-semibold border border-violet-200">
                              <Users className="w-3 h-3" />
                              {t('lessonSet.groupLabel', { count: String(subject.max_students || '?') })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {canEditSubjects && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => openEditSubjectDialog(subject)} className="w-8 h-8 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteSubject(subject.id)} className="w-8 h-8 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </SettingsSection>

        {/* === LESSON & NOTIFICATION SETTINGS === */}
        <SettingsSection
          icon={<Bell className="w-5 h-5 text-violet-600" />}
          iconBg="bg-violet-100"
          title={t('lessonSet.settingsTitle')}
          description={t('lessonSet.settingsDesc')}
          defaultOpen={true}
        >
          <div className="pt-4 space-y-8">

            {/* Cancellation */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" /> {t('lessonSet.cancelPolicy')}
              </h3>
              {orgName && !canEditCancellation && (
                <div className="flex items-center gap-2 mb-3 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <Lock className="w-3.5 h-3.5 flex-shrink-0" /> {t('lessonSet.orgManaged')}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DropdownWithCustom
                  label={t('lessonSet.cancelDeadline')}
                  options={CANCELLATION_HOURS_OPTIONS}
                  value={settings.cancellation_hours}
                  onChange={(v) => setSettings({ ...settings, cancellation_hours: v })}
                  suffix={t('common.hours')}
                  min={1}
                  max={168}
                  hint={t('lessonSet.cancelDeadlineHint')}
                  icon={<Clock className="w-4 h-4 text-gray-400" />}
                  disabled={!!(orgName && !canEditCancellation)}
                  customLabel={t('lessonSet.customInput')} changeLabel={t('lessonSet.change')} listLabel={t('lessonSet.listView')}
                />
                {(!orgName || canEditCancellation) && (
                <DropdownWithCustom
                  label={t('lessonSet.feeSize')}
                  options={CANCELLATION_FEE_OPTIONS}
                  value={settings.cancellation_fee_percent}
                  onChange={(v) => setSettings({ ...settings, cancellation_fee_percent: v })}
                  suffix={t('lessonSet.feeSuffix')}
                  min={0}
                  max={100}
                  hint={t('lessonSet.cancelFeeHint')}
                  icon={<Euro className="w-4 h-4 text-gray-400" />}
                  disabled={!!(orgName && !canEditCancellation)}
                  customLabel={t('lessonSet.customInput')} changeLabel={t('lessonSet.change')} listLabel={t('lessonSet.listView')}
                />
                )}
              </div>
              {settings.cancellation_fee_percent > 0 && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700">
                  <span dangerouslySetInnerHTML={{ __html: t('lessonSet.cancelExample', {
                    hours: String(settings.cancellation_hours),
                    price: String(subjects[0]?.price ?? 25),
                    fee: ((subjects[0]?.price ?? 25) * settings.cancellation_fee_percent / 100).toFixed(2),
                    percent: String(settings.cancellation_fee_percent),
                  }) }} />
                </div>
              )}
            </div>

            <div className="h-px bg-gray-100" />

            {/* Registration + Payment Validation */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-blue-600" /> {t('lessonSet.registrationSettings')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  {orgName && !canEditMinBooking && (
                    <div className="flex items-center gap-2 text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      <Lock className="w-3.5 h-3.5 flex-shrink-0" /> {t('lessonSet.orgManagedShort')}
                    </div>
                  )}
                  <DropdownWithCustom
                    label={t('lessonSet.bookingDeadline')}
                    options={BOOKING_HOURS_OPTIONS}
                    value={settings.min_booking_hours}
                    onChange={(v) => setSettings({ ...settings, min_booking_hours: v })}
                    suffix={t('common.hours')}
                    min={0}
                    max={168}
                    hint={t('lessonSet.bookingDeadlineHint')}
                    icon={<CalendarClock className="w-4 h-4 text-gray-400" />}
                    disabled={!!(orgName && !canEditMinBooking)}
                    error={
                      paymentTiming === 'before_lesson' &&
                      paymentDeadlineHours != null &&
                      settings.min_booking_hours < paymentDeadlineHours
                        ? t('lessonSet.bookingError', { booking: String(settings.min_booking_hours), payment: String(paymentDeadlineHours) })
                        : undefined
                    }
                    customLabel={t('lessonSet.customInput')} changeLabel={t('lessonSet.change')} listLabel={t('lessonSet.listView')}
                  />
                </div>
                <div className="space-y-2">
                  {orgName && !canEditBreakBetween && (
                    <div className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                      <Lock className="w-3.5 h-3.5 flex-shrink-0" /> {t('lessonSet.orgManagedShort')}
                    </div>
                  )}
                  <DropdownWithCustom
                    label={t('lessonSet.breakBetween')}
                    options={BREAK_MINUTES_OPTIONS}
                    value={settings.break_between_lessons}
                    onChange={(v) => setSettings({ ...settings, break_between_lessons: v })}
                    suffix="min."
                    min={0}
                    max={120}
                    hint={t('lessonSet.breakHint')}
                    icon={<Clock className="w-4 h-4 text-gray-400" />}
                    disabled={!!(orgName && !canEditBreakBetween)}
                    customLabel={t('lessonSet.customInput')} changeLabel={t('lessonSet.change')} listLabel={t('lessonSet.listView')}
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-gray-100" />

            {/* Notifications */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Bell className="w-4 h-4 text-violet-600" /> {t('lessonSet.reminders')}
              </h3>
              {orgName && !canEditReminders && (
                <div className="flex items-center gap-2 mb-3 text-xs text-violet-800 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                  <Lock className="w-3.5 h-3.5 flex-shrink-0" /> {t('lessonSet.orgManaged')}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DropdownWithCustom
                  label={t('lessonSet.reminderStudent')}
                  options={REMINDER_HOURS_OPTIONS}
                  value={settings.reminder_student_hours}
                  onChange={(v) => setSettings({ ...settings, reminder_student_hours: v })}
                  suffix={t('lessonSet.reminderStudentSuffix')}
                  min={0}
                  max={72}
                  hint={t('lessonSet.reminderStudentHint')}
                  icon={<Bell className="w-4 h-4 text-gray-400" />}
                  disabled={!!(orgName && !canEditReminders)}
                  customLabel={t('lessonSet.customInput')} changeLabel={t('lessonSet.change')} listLabel={t('lessonSet.listView')}
                />
                <DropdownWithCustom
                  label={t('lessonSet.reminderTutor')}
                  options={REMINDER_HOURS_OPTIONS}
                  value={settings.reminder_tutor_hours}
                  onChange={(v) => setSettings({ ...settings, reminder_tutor_hours: v })}
                  suffix={t('lessonSet.reminderTutorSuffix')}
                  min={0}
                  max={72}
                  hint={t('lessonSet.reminderTutorHint')}
                  icon={<Bell className="w-4 h-4 text-gray-400" />}
                  disabled={!!(orgName && !canEditReminders)}
                  customLabel={t('lessonSet.customInput')} changeLabel={t('lessonSet.change')} listLabel={t('lessonSet.listView')}
                />
              </div>
            </div>

            <div className="h-px bg-gray-100" />

          </div>
        </SettingsSection>

        {/* Bottom save button (mobile) */}
        <div className="pb-6 flex justify-end">
          <Button
            onClick={handleSaveAll}
            disabled={saving || loading || !canEditLessonSettings || (Boolean(orgName) && !canSaveProfileFields)}
            className="rounded-xl gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? t('lessonSet.saving') : t('lessonSet.saveAll')}
          </Button>
        </div>
      </div>

      {/* Subject Dialog */}
      <Dialog open={isSubjectDialogOpen} onOpenChange={setIsSubjectDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[420px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSubject ? t('lessonSet.editSubject') : t('lessonSet.addNewSubject')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Dalyko pavadinimas</Label>
              <Input
                placeholder={t('lessonSet.namePlaceholder')}
                value={newSubject.name}
                onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                className="rounded-xl"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Prisijungimo nuoroda (neprivaloma)</Label>
              <Input
                placeholder="https://meet.google.com/..."
                value={newSubject.meeting_link}
                onChange={(e) => setNewSubject({ ...newSubject, meeting_link: e.target.value })}
                className="rounded-xl"
              />
              <p className="text-xs text-gray-500">{t('lessonSet.meetingLinkHint')}</p>
            </div>
            <div className={cn('grid gap-4', showSubjectPrices ? 'grid-cols-2' : 'grid-cols-1')}>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" /> {t('lessonSet.duration')}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={newSubject.duration_minutes}
                    onChange={(e) => setNewSubject({ ...newSubject, duration_minutes: parseInt(e.target.value) || 60 })}
                    className="rounded-xl pr-12"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">min</span>
                </div>
              </div>
              {showSubjectPrices && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Euro className="w-4 h-4 text-gray-400" /> {t('lessonSet.priceLabel')}
                </Label>
                <Input
                  type="number"
                  value={newSubject.price}
                  onChange={(e) => setNewSubject({ ...newSubject, price: parseFloat(e.target.value) || 0 })}
                  className="rounded-xl"
                />
              </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t('lessonSet.grades')}</Label>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  value={newSubject.grade_min?.toString() || 'all'}
                  onValueChange={(v) =>
                    setNewSubject({
                      ...newSubject,
                      grade_min: v === 'all' ? null : parseInt(v),
                      grade_max:
                        v === 'all'
                          ? null
                          : newSubject.grade_max === null
                          ? parseInt(v)
                          : Math.max(parseInt(v), newSubject.grade_max || 0),
                    })
                  }
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={t('lessonSet.gradeFrom')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('lessonSet.allGrades')}</SelectItem>
                    {[...Array(12)].map((_, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>
                        {t('lessonSet.gradeN', { n: String(i + 1) })}
                      </SelectItem>
                    ))}
                    <SelectItem value="13">{t('lessonSet.gradeUniversity')}</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={newSubject.grade_max?.toString() || 'all'}
                  onValueChange={(v) =>
                    setNewSubject({
                      ...newSubject,
                      grade_max: v === 'all' ? null : parseInt(v),
                      grade_min:
                        v === 'all'
                          ? null
                          : newSubject.grade_min === null
                          ? parseInt(v)
                          : Math.min(parseInt(v), newSubject.grade_min || 0),
                    })
                  }
                  disabled={newSubject.grade_min === null}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={t('lessonSet.gradeTo')} />
                  </SelectTrigger>
                  <SelectContent>
                    {[...Array(12)].map((_, i) => (
                      <SelectItem
                        key={i + 1}
                        value={(i + 1).toString()}
                        disabled={
                          newSubject.grade_min !== null && i + 1 < newSubject.grade_min
                        }
                      >
                        {t('lessonSet.gradeN', { n: String(i + 1) })}
                      </SelectItem>
                    ))}
                    <SelectItem
                      value="13"
                      disabled={newSubject.grade_min !== null && 13 < newSubject.grade_min}
                    >
                      {t('lessonSet.gradeUniversity')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-gray-500">
                {t('lessonSet.gradeHint')}
              </p>
            </div>

            {/* Group lesson checkbox */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_group"
                  checked={newSubject.is_group}
                  onChange={(e) => setNewSubject({
                    ...newSubject,
                    is_group: e.target.checked,
                    max_students: e.target.checked ? (newSubject.max_students || 5) : null
                  })}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <Label htmlFor="is_group" className="cursor-pointer font-medium text-gray-900">
                    {t('lessonSet.groupLesson')}
                  </Label>
                </div>
              </div>

              {newSubject.is_group && (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-900">{t('lessonSet.important')}</p>
                        <p className="text-xs text-amber-800 mt-1" dangerouslySetInnerHTML={{ __html: t('lessonSet.groupDesc') }} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max_students">{t('lessonSet.maxStudents')}</Label>
                    <Input
                      id="max_students"
                      type="number"
                      min="2"
                      max="50"
                      value={newSubject.max_students || ''}
                      onChange={(e) => setNewSubject({
                        ...newSubject,
                        max_students: parseInt(e.target.value) || null
                      })}
                      className="rounded-xl"
                      placeholder="Pvz. 5"
                    />
                    <p className="text-xs text-gray-500">
                      {t('lessonSet.maxStudentsHint')}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t('lessonSet.color')}</Label>
              <div className="flex gap-2 flex-wrap">
                {SUBJECT_COLOR_VALUES.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setNewSubject({ ...newSubject, color: c.value })}
                    className="w-8 h-8 rounded-full border-2 transition-all hover:scale-110"
                    style={{
                      backgroundColor: c.value,
                      borderColor: newSubject.color === c.value ? '#1e1b4b' : 'transparent',
                      transform: newSubject.color === c.value ? 'scale(1.2)' : 'scale(1)',
                      boxShadow: newSubject.color === c.value ? `0 0 0 3px ${c.value}40` : 'none',
                    }}
                    title={t(c.key)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSubjectDialogOpen(false)} className="rounded-xl">
              {t('lessonSet.cancel')}
            </Button>
            <Button onClick={handleSaveSubject} disabled={savingSubject || !newSubject.name.trim()} className="rounded-xl">
              {savingSubject ? t('lessonSet.saving') : editingSubject ? t('lessonSet.saveChanges') : t('lessonSet.addSubject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
