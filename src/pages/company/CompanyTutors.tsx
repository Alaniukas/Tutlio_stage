import { useEffect, useMemo, useState } from 'react';
import CompanyLayout from '@/components/CompanyLayout';
import { supabase } from '@/lib/supabase';
import { getCached, setCache } from '@/lib/dataCache';
import {
  Users, Plus, Copy, Check, Trash2, UserCheck, UserX,
  ChevronRight, ChevronDown, X, Pencil, Mail, Send, AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { dedupeSubjectPresets, subjectPresetKey } from '@/lib/subjectPresetDedupe';
import { removeOrgSubjectTemplatesMatchingPreset } from '@/lib/orgSubjectTemplateCleanup';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tutor {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  cancellation_hours: number;
  cancellation_fee_percent: number;
  reminder_student_hours: number;
  reminder_tutor_hours: number;
  break_between_lessons: number;
  min_booking_hours: number;
  company_commission_percent?: number;
}

interface Invite {
  id: string;
  token: string;
  type: 'code' | 'full';
  used: boolean;
  used_by_profile_id: string | null;
  invitee_name: string | null;
  invitee_email: string | null;
  created_at: string;
  tutor?: Tutor | null;
}

interface Subject {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  color: string;
}

interface SubjectPreset {
  name: string;
  duration_minutes: number;
  price: number;
  color: string;
}

interface TutorDetail extends Tutor {
  subjects: Subject[];
  sessionCount: number;
  earnings: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLORS = [
  '#6366f1', // indigo
  '#4f46e5',
  '#10b981', // green
  '#22c55e',
  '#f97316', // orange
  '#f59e0b',
  '#ef4444', // red
  '#e11d48',
  '#ec4899', // pink
  '#db2777',
  '#8b5cf6', // violet
  '#a855f7',
  '#06b6d4', // cyan
  '#0ea5e9',
];

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── SubjectPresetList – shared in both invite types ─────────────────────────

function SubjectPresetList({
  subjects,
  onAdd,
  onRemove,
  orgCatalog,
}: {
  subjects: SubjectPreset[];
  onAdd: (s: SubjectPreset) => void;
  onRemove: (idx: number) => void;
  /** Subject catalog options from lesson settings */
  orgCatalog: { key: string; preset: SubjectPreset }[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [catalogPick, setCatalogPick] = useState<string>('');
  const [name, setName] = useState('');
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState(25);
  const [color, setColor] = useState('#6366f1');

  const addedSig = useMemo(() => new Set(subjects.map((s) => subjectPresetKey(s))), [subjects]);
  const catalogAvailable = useMemo(
    () => orgCatalog.filter((o) => !addedSig.has(subjectPresetKey(o.preset))),
    [orgCatalog, addedSig]
  );

  const add = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), duration_minutes: duration, price, color });
    setName(''); setDuration(60); setPrice(25); setColor('#6366f1');
    setOpen(false);
  };

  const pickFromCatalog = (key: string) => {
    if (key === '__none__') {
      setCatalogPick('');
      return;
    }
    const opt = orgCatalog.find((o) => o.key === key);
    if (!opt || addedSig.has(subjectPresetKey(opt.preset))) return;
    onAdd(opt.preset);
    setCatalogPick('');
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('compTut.subjectsOptional')}</Label>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> {t('compTut.addSubject')}
        </button>
      </div>

      {/* Added subjects */}
      {subjects.map((s, idx) => (
        <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
          <span className="flex-1 text-sm font-medium text-gray-800 truncate">{s.name}</span>
          <span className="text-xs text-gray-500">{s.price} € · {s.duration_minutes} min</span>
          <button onClick={() => onRemove(idx)} className="text-gray-400 hover:text-red-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {/* Inline add form */}
      {open && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-3">
          {orgCatalog.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-gray-600">{t('compTut.fromCatalog')}</Label>
              {catalogAvailable.length > 0 ? (
                <Select value={catalogPick || '__none__'} onValueChange={pickFromCatalog}>
                  <SelectTrigger className="rounded-xl h-9 text-sm bg-white">
                    <SelectValue placeholder={t('compTut.selectSubject')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('compTut.selectDefault')}</SelectItem>
                    {catalogAvailable.map((o) => (
                      <SelectItem key={o.key} value={o.key}>
                        {o.preset.name} · {o.preset.price} € · {o.preset.duration_minutes} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-gray-500">{t('compTut.allCatalogAdded')}</p>
              )}
            </div>
          )}
          {orgCatalog.length === 0 && (
            <p className="text-xs text-amber-800 bg-amber-50/80 border border-amber-100 rounded-lg px-2.5 py-1.5">
              {t('compTut.noCatalog')}
            </p>
          )}
          {orgCatalog.length > 0 && (
            <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{t('compTut.orManual')}</p>
          )}
          <Input
            placeholder={t('compTut.subjectNamePlaceholder')}
            value={name}
            onChange={e => setName(e.target.value)}
            className="rounded-xl text-sm"
            autoFocus={orgCatalog.length === 0}
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t('compTut.durationMin')}</Label>
              <Input type="number" value={duration} onChange={e => setDuration(Number(e.target.value) || 0)} className="rounded-xl text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">{t('compTut.priceEur')}</Label>
              <Input type="number" value={price} onChange={e => setPrice(Number(e.target.value) || 0)} className="rounded-xl text-sm" />
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: c, borderColor: color === c ? '#1e1b4b' : 'transparent', transform: color === c ? 'scale(1.15)' : 'scale(1)' }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => setOpen(false)}>{t('compTut.cancelBtn')}</Button>
            <Button size="sm" className="flex-1 rounded-xl" onClick={add} disabled={!name.trim()}>{t('compTut.addBtn')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SubjectRow – in tutor detail modal ──────────────────────────────────────

function SubjectRow({ subject, onSave, onDelete }: {
  subject: Subject;
  onSave: (s: Subject) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(subject.price);
  const [duration, setDuration] = useState(subject.duration_minutes);

  const save = () => { onSave({ ...subject, price, duration_minutes: duration }); setEditing(false); };

  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color }} />
      <p className="flex-1 text-sm font-medium text-gray-800 truncate">{subject.name}</p>
      {editing ? (
        <>
          <div className="flex items-center gap-1">
            <Input type="number" value={price} onChange={e => setPrice(Number(e.target.value) || 0)} className="w-16 h-7 text-xs rounded-lg px-2" />
            <span className="text-xs text-gray-400">€</span>
          </div>
          <div className="flex items-center gap-1">
            <Input type="number" value={duration} onChange={e => setDuration(Number(e.target.value) || 0)} className="w-16 h-7 text-xs rounded-lg px-2" />
            <span className="text-xs text-gray-400">min</span>
          </div>
          <button onClick={save} className="text-green-600 hover:text-green-700"><Check className="w-4 h-4" /></button>
          <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </>
      ) : (
        <>
          <span className="text-xs text-gray-500">{subject.price} € · {subject.duration_minutes} min</span>
          <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-indigo-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={() => onDelete(subject.id)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
        </>
      )}
    </div>
  );
}

function TutorSubjectPriceRow({ template, existing, onSave, onDelete }: {
  template: { id: string; name: string; price: number; duration_minutes: number; color: string };
  existing?: { price: number; duration_minutes: number };
  onSave: (templateId: string, price: number, duration: number) => void;
  onDelete: (templateId: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(existing?.price ?? template.price);
  const [duration, setDuration] = useState(existing?.duration_minutes ?? template.duration_minutes);

  useEffect(() => {
    setPrice(existing?.price ?? template.price);
    setDuration(existing?.duration_minutes ?? template.duration_minutes);
  }, [existing, template]);

  const save = () => {
    onSave(template.id, price, duration);
    setEditing(false);
  };

  const hasOverride = !!existing;

  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: template.color }} />
      <p className="flex-1 text-sm font-medium text-gray-800 truncate">{template.name}</p>
      {editing ? (
        <>
          <div className="flex items-center gap-1">
            <Input type="number" value={price} onChange={e => setPrice(Number(e.target.value) || 0)} className="w-16 h-7 text-xs rounded-lg px-2" />
            <span className="text-xs text-gray-400">€</span>
          </div>
          <div className="flex items-center gap-1">
            <Input type="number" value={duration} onChange={e => setDuration(Number(e.target.value) || 0)} className="w-16 h-7 text-xs rounded-lg px-2" />
            <span className="text-xs text-gray-400">min</span>
          </div>
          <button onClick={save} className="text-green-600 hover:text-green-700"><Check className="w-4 h-4" /></button>
          <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </>
      ) : (
        <>
          <span className={cn("text-xs", hasOverride ? "text-indigo-600 font-medium" : "text-gray-400")}>
            {hasOverride ? `${existing.price} € · ${existing.duration_minutes} min` : `${template.price} € · ${template.duration_minutes} min`}
          </span>
          {hasOverride && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">{t('compTut.customBadge')}</span>}
          <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-indigo-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
          {hasOverride && (
            <button onClick={() => onDelete(template.id)} className="text-gray-400 hover:text-red-500 transition-colors" title={t('compTut.resetToDefault')}><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TUTORS_CACHE_KEY = 'company_tutors';

export default function CompanyTutors() {
  const { t, dateFnsLocale } = useTranslation();
  const tc = getCached<any>(TUTORS_CACHE_KEY);
  const [loading, setLoading] = useState(!tc);
  const [orgId, setOrgId] = useState<string | null>(tc?.orgId ?? null);
  const [tutorLimit, setTutorLimit] = useState(tc?.tutorLimit ?? 0);
  const [tutors, setTutors] = useState<Tutor[]>(tc?.tutors ?? []);
  const [invites, setInvites] = useState<Invite[]>(tc?.invites ?? []);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // ── Invite modal ──
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [presetSubjects, setPresetSubjects] = useState<SubjectPreset[]>([]);
  /** Invite modal "Select from Lesson Settings": templates + subjects */
  const [orgSubjectCatalogOptions, setOrgSubjectCatalogOptions] = useState<{ key: string; preset: SubjectPreset }[]>([]);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  
  // Default Settings for New Invite
  const [inviteCancellationHours, setInviteCancellationHours] = useState(24);
  const [inviteCancellationFee, setInviteCancellationFee] = useState(0);
  const [inviteReminderStudent, setInviteReminderStudent] = useState(2);
  const [inviteReminderTutor, setInviteReminderTutor] = useState(2);
  const [inviteBreakBetween, setInviteBreakBetween] = useState(0);
  const [inviteMinBooking, setInviteMinBooking] = useState(1);
  const [inviteCommissionPercent, setInviteCommissionPercent] = useState(0);

  // Organization default settings
  const [orgDefaults, setOrgDefaults] = useState({
    cancellation_hours: 24,
    cancellation_fee_percent: 0,
    reminder_student_hours: 2,
    reminder_tutor_hours: 2,
    break_between_lessons: 0,
    min_booking_hours: 1,
    company_commission_percent: 0,
  });

  // Full invite fields
  const [inviteeName, setInviteeName] = useState('');
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [inviteePhone, setInviteePhone] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // ── Tutor detail modal ──
  const [selectedTutor, setSelectedTutor] = useState<TutorDetail | null>(null);
  const [tutorModalOpen, setTutorModalOpen] = useState(false);
  const [savingTutor, setSavingTutor] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectDuration, setNewSubjectDuration] = useState(60);
  const [newSubjectPrice, setNewSubjectPrice] = useState(25);
  const [newSubjectColor, setNewSubjectColor] = useState('#6366f1');
  const [addSubjectCatalogPick, setAddSubjectCatalogPick] = useState('');
  const [savingSubject, setSavingSubject] = useState(false);
  const [tutorSubjectPrices, setTutorSubjectPrices] = useState<{ id?: string; tutor_id: string; org_subject_template_id: string; price: number; duration_minutes: number }[]>([]);
  const [orgTemplates, setOrgTemplates] = useState<{ id: string; name: string; price: number; duration_minutes: number; color: string }[]>([]);

  /** Catalog entries this tutor does not have yet (templates + other subjects). */
  const catalogForAddSubject = useMemo(() => {
    if (!selectedTutor) return [];
    const added = new Set(selectedTutor.subjects.map((s) => subjectPresetKey(s)));
    return orgSubjectCatalogOptions.filter((o) => !added.has(subjectPresetKey(o.preset)));
  }, [orgSubjectCatalogOptions, selectedTutor]);

  // Extended tutor settings
  const [editCancellationHours, setEditCancellationHours] = useState(24);
  const [editCancellationFee, setEditCancellationFee] = useState(0);
  const [editReminderStudent, setEditReminderStudent] = useState(2);
  const [editReminderTutor, setEditReminderTutor] = useState(2);
  const [editBreakBetween, setEditBreakBetween] = useState(0);
  const [editMinBooking, setEditMinBooking] = useState(1);
  const [editCommissionPercent, setEditCommissionPercent] = useState(0);

  useEffect(() => { loadData({ silent: !!getCached(TUTORS_CACHE_KEY) }); }, []);

  const loadData = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      if (!silent) setLoading(false);
      return;
    }

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id, organizations(tutor_limit)')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!adminRow) {
      if (!silent) setLoading(false);
      return;
    }

    setOrgId(adminRow.organization_id);
    const org = adminRow.organizations as any;
    setTutorLimit(org?.tutor_limit || 0);

    // Try to load organization default settings (columns may not exist yet)
    const { data: orgData } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', adminRow.organization_id)
      .maybeSingle();

    if (orgData) {
      setOrgDefaults({
        cancellation_hours: (orgData as any).default_cancellation_hours || 24,
        cancellation_fee_percent: (orgData as any).default_cancellation_fee_percent || 0,
        reminder_student_hours: (orgData as any).default_reminder_student_hours ?? 2,
        reminder_tutor_hours: (orgData as any).default_reminder_tutor_hours ?? 2,
        break_between_lessons: (orgData as any).default_break_between_lessons || 0,
        min_booking_hours: (orgData as any).default_min_booking_hours || 1,
        company_commission_percent: (orgData as any).default_company_commission_percent || 0,
      });
    }

    // Find all organization admins so they are not shown as tutors
    const { data: adminUsers } = await supabase
      .from('organization_admins')
      .select('user_id')
      .eq('organization_id', adminRow.organization_id);
    const adminIds = new Set((adminUsers || []).map((a: any) => a.user_id));

    const { data: tutorData } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, cancellation_hours, cancellation_fee_percent, reminder_student_hours, reminder_tutor_hours, break_between_lessons, min_booking_hours, company_commission_percent')
      .eq('organization_id', adminRow.organization_id);

    // Filter out organization admins so they are not counted as tutors
    const visibleTutors = (tutorData || []).filter((t: any) => !adminIds.has(t.id));
    setTutors(visibleTutors);

    const { data: inviteData } = await supabase
      .from('tutor_invites')
      .select('*')
      .eq('organization_id', adminRow.organization_id)
      .order('created_at', { ascending: false });

    const enriched = (inviteData || []).map((inv: any) => ({
      ...inv,
      tutor: (tutorData || []).find((t: any) => t.id === inv.used_by_profile_id) || null,
    }));
    setInvites(enriched);

    const catalogOptions: { key: string; preset: SubjectPreset }[] = [];
    const rawTpl = (orgData as { org_subject_templates?: unknown } | null)?.org_subject_templates;
    const parsedTemplates: { id: string; name: string; price: number; duration_minutes: number; color: string }[] = [];
    if (Array.isArray(rawTpl)) {
      for (const t of rawTpl as { id?: string; name?: string; duration_minutes?: number; price?: unknown; color?: string }[]) {
        if (!t?.id || !String(t.name || '').trim()) continue;
        const tpl = {
          id: t.id,
          name: String(t.name).trim(),
          duration_minutes: t.duration_minutes ?? 60,
          price: Number(t.price) || 0,
          color: t.color || '#6366f1',
        };
        parsedTemplates.push(tpl);
        catalogOptions.push({ key: `tpl-${t.id}`, preset: tpl });
      }
    }
    setOrgTemplates(parsedTemplates);
    if (visibleTutors.length > 0) {
      const { data: subjectRows } = await supabase
        .from('subjects')
        .select('id, name, duration_minutes, price, color')
        .in('tutor_id', visibleTutors.map((t: { id: string }) => t.id));
      for (const r of subjectRows || []) {
        const row = r as { id: string; name: string; duration_minutes: number; price: unknown; color: string | null };
        catalogOptions.push({
          key: `sub-${row.id}`,
          preset: {
            name: String(row.name || '').trim(),
            duration_minutes: row.duration_minutes ?? 60,
            price: Number(row.price) || 0,
            color: row.color || '#6366f1',
          },
        });
      }
    }
    const seenCatalog = new Set<string>();
    const catalogDeduped = catalogOptions.filter((o) => {
      const k = subjectPresetKey(o.preset);
      if (seenCatalog.has(k)) return false;
      seenCatalog.add(k);
      return true;
    });
    catalogDeduped.sort((a, b) => a.preset.name.localeCompare(b.preset.name, 'lt'));
    setOrgSubjectCatalogOptions(catalogDeduped);

    setCache(TUTORS_CACHE_KEY, {
      orgId: adminRow.organization_id, tutorLimit: org?.tutor_limit || 0,
      tutors: visibleTutors, invites: enriched,
    });
    if (!silent) setLoading(false);
  };

  // ── Invite modal helpers ──

  const openInviteModal = () => {
    setPresetSubjects([]);

    // Load organization defaults
    setInviteCancellationHours(orgDefaults.cancellation_hours);
    setInviteCancellationFee(orgDefaults.cancellation_fee_percent);
    setInviteReminderStudent(orgDefaults.reminder_student_hours);
    setInviteReminderTutor(orgDefaults.reminder_tutor_hours);
    setInviteBreakBetween(orgDefaults.break_between_lessons);
    setInviteMinBooking(orgDefaults.min_booking_hours);
    setInviteCommissionPercent(orgDefaults.company_commission_percent);

    setInviteeName(''); setInviteeEmail(''); setInviteePhone('');
    setInviteError(null); setInviteSuccess(null);
    setSettingsExpanded(false);
    setInviteModalOpen(true);
  };

  const handleSendFullInvite = async () => {
    if (!orgId || !inviteeEmail.trim()) return;
    setSendingInvite(true);
    setInviteError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/invite-tutor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          organizationId: orgId,
          inviteeName: inviteeName.trim() || undefined,
          inviteeEmail: inviteeEmail.trim(),
          inviteePhone: inviteePhone.trim() || undefined,
          subjects: dedupeSubjectPresets(presetSubjects),
          cancellation_hours: inviteCancellationHours,
          cancellation_fee_percent: inviteCancellationFee,
          reminder_student_hours: inviteReminderStudent,
          reminder_tutor_hours: inviteReminderTutor,
          break_between_lessons: inviteBreakBetween,
          min_booking_hours: inviteMinBooking,
          company_commission_percent: inviteCommissionPercent,
        }),
      });
      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || `HTTP ${res.status}` };
      }

      if (!res.ok) {
        const msg =
          data?.error ||
          data?.message ||
          t('compTut.serverError', { status: String(res.status) });
        setInviteError(msg);
        return;
      }

      if (data.success) {
        await loadData();
        if (data.emailSent === false) {
          setInviteSuccess(null);
          setInviteError(
            [data.emailError, t('compTut.inviteCreatedCopy')]
              .filter(Boolean)
              .join(' ')
          );
        } else {
          setInviteError(null);
          setInviteSuccess(t('compTut.inviteSent', { email: inviteeEmail }));
        }
      } else {
        setInviteError(data.error || t('compTut.inviteFailed'));
      }
    } catch (e: any) {
      setInviteError(e?.message || t('compTut.serverErrorGeneric'));
    }
    setSendingInvite(false);
  };

  const handleDeleteInvite = async (inviteId: string) => {
    await supabase.from('tutor_invites').delete().eq('id', inviteId);
    setInvites(prev => prev.filter(i => i.id !== inviteId));
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/register?org_token=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  // ── Tutor detail modal helpers ──

  const openTutor = async (tutor: Tutor) => {
    const { data: subjects } = await supabase.from('subjects').select('*').eq('tutor_id', tutor.id);

    // OPTIMIZED: Limit sessions query to last year for stats
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const { data: sessions } = await supabase
      .from('sessions')
      .select('price, status')
      .eq('tutor_id', tutor.id)
      .eq('status', 'completed')
      .gte('start_time', oneYearAgo.toISOString())
      .limit(1000);

    const { data: tspData } = await supabase
      .from('tutor_subject_prices')
      .select('*')
      .eq('tutor_id', tutor.id);

    const sessionCount = (sessions || []).length;
    const earnings = (sessions || []).reduce((sum, s: any) => sum + (s.price || 0), 0);
    setTutorSubjectPrices((tspData || []).map((r: any) => ({
      id: r.id, tutor_id: r.tutor_id, org_subject_template_id: r.org_subject_template_id,
      price: Number(r.price), duration_minutes: r.duration_minutes,
    })));
    setSelectedTutor({ ...tutor, subjects: subjects || [], sessionCount, earnings });
    setEditName(tutor.full_name);
    setEditPhone(tutor.phone || '');
    setShowAddSubject(false);
    setNewSubjectName('');
    setAddSubjectCatalogPick('');

    // Set extended settings
    setEditCancellationHours(tutor.cancellation_hours ?? orgDefaults.cancellation_hours);
    setEditCancellationFee(tutor.cancellation_fee_percent ?? orgDefaults.cancellation_fee_percent);
    setEditReminderStudent(tutor.reminder_student_hours ?? orgDefaults.reminder_student_hours);
    setEditReminderTutor(tutor.reminder_tutor_hours ?? orgDefaults.reminder_tutor_hours);
    setEditBreakBetween(tutor.break_between_lessons ?? orgDefaults.break_between_lessons);
    setEditMinBooking(tutor.min_booking_hours ?? orgDefaults.min_booking_hours);
    setEditCommissionPercent(tutor.company_commission_percent ?? orgDefaults.company_commission_percent);
    setTutorModalOpen(true);
  };

  const handleSaveTutor = async () => {
    if (!selectedTutor) return;
    setSavingTutor(true);
    await supabase.from('profiles').update({ 
      full_name: editName, 
      phone: editPhone,
      cancellation_hours: editCancellationHours,
      cancellation_fee_percent: editCancellationFee,
      reminder_student_hours: editReminderStudent,
      reminder_tutor_hours: editReminderTutor,
      break_between_lessons: editBreakBetween,
      min_booking_hours: editMinBooking,
      company_commission_percent: editCommissionPercent,
    }).eq('id', selectedTutor.id);
    await loadData();
    setTutorModalOpen(false);
    setSavingTutor(false);
  };

  const handleSaveTutorSubjectPrice = async (templateId: string, price: number, durationMinutes: number) => {
    if (!selectedTutor || !orgId) return;
    const existing = tutorSubjectPrices.find(p => p.org_subject_template_id === templateId);
    if (existing?.id) {
      const { error } = await supabase.from('tutor_subject_prices')
        .update({ price, duration_minutes: durationMinutes })
        .eq('id', existing.id);
      if (!error) {
        setTutorSubjectPrices(prev => prev.map(p => p.id === existing.id ? { ...p, price, duration_minutes: durationMinutes } : p));
      }
    } else {
      const { data, error } = await supabase.from('tutor_subject_prices')
        .insert({ tutor_id: selectedTutor.id, org_subject_template_id: templateId, organization_id: orgId, price, duration_minutes: durationMinutes })
        .select()
        .single();
      if (!error && data) {
        setTutorSubjectPrices(prev => [...prev, {
          id: (data as any).id, tutor_id: selectedTutor.id,
          org_subject_template_id: templateId, price, duration_minutes: durationMinutes,
        }]);
      }
    }
  };

  const handleDeleteTutorSubjectPrice = async (templateId: string) => {
    const existing = tutorSubjectPrices.find(p => p.org_subject_template_id === templateId);
    if (!existing?.id) return;
    const { error } = await supabase.from('tutor_subject_prices').delete().eq('id', existing.id);
    if (!error) {
      setTutorSubjectPrices(prev => prev.filter(p => p.id !== existing.id));
    }
  };

  const handleSaveSubject = async (subject: Subject) => {
    await supabase.from('subjects').update({ price: subject.price, duration_minutes: subject.duration_minutes }).eq('id', subject.id);
    if (selectedTutor) setSelectedTutor({ ...selectedTutor, subjects: selectedTutor.subjects.map(s => s.id === subject.id ? subject : s) });
  };

  const handleAddSubject = async () => {
    if (!selectedTutor || !newSubjectName.trim()) return;
    setSavingSubject(true);
    const { data } = await supabase.from('subjects').insert({
      tutor_id: selectedTutor.id, name: newSubjectName.trim(),
      duration_minutes: newSubjectDuration, price: newSubjectPrice, color: newSubjectColor,
    }).select().single();
    if (data) {
      if (orgId) {
        await removeOrgSubjectTemplatesMatchingPreset(orgId, {
          name: data.name,
          duration_minutes: data.duration_minutes,
          price: data.price,
          color: data.color || '#6366f1',
        });
      }
      setSelectedTutor({ ...selectedTutor, subjects: [...selectedTutor.subjects, data] });
      await loadData({ silent: true });
    }
    setNewSubjectName(''); setNewSubjectDuration(60); setNewSubjectPrice(25); setNewSubjectColor('#6366f1');
    setShowAddSubject(false);
    setSavingSubject(false);
  };

  const handleDeleteSubject = async (subjectId: string) => {
    await supabase.from('subjects').delete().eq('id', subjectId);
    if (selectedTutor) setSelectedTutor({ ...selectedTutor, subjects: selectedTutor.subjects.filter(s => s.id !== subjectId) });
  };

  const activeSlots = tutors.length;
  const freeSlots = tutorLimit - activeSlots;
  const canCreateInvite = activeSlots < tutorLimit;
  const unusedInvites = invites.filter(i => !i.used);

  if (loading) {
    return <CompanyLayout><div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div></CompanyLayout>;
  }

  return (
    <CompanyLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('compTut.title')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {t('compTut.activeSlots', { active: String(activeSlots), free: String(freeSlots), limit: String(tutorLimit) })}
            </p>
          </div>
          <button
            onClick={openInviteModal}
            disabled={!canCreateInvite}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
              canCreateInvite ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            )}
          >
            <Plus className="w-4 h-4" /> {t('compTut.createInvite')}
          </button>
        </div>

        {/* Capacity bar */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 rounded-2xl border border-slate-900/40 shadow-md p-4 text-white">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-slate-100">{t('compTut.capacityUsage')}</span>
            <span className="text-indigo-100">{activeSlots} / {tutorLimit}</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 via-sky-400 to-indigo-400 rounded-full transition-all"
              style={{ width: tutorLimit > 0 ? `${(activeSlots / tutorLimit) * 100}%` : '0%' }}
            />
          </div>
          {freeSlots === 0 && (
            <p className="text-xs text-amber-200 mt-2 font-medium">
              {t('compTut.limitReached')}
            </p>
          )}
        </div>

        {/* Registered tutors */}
        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">{t('compTut.registered', { count: String(tutors.length) })}</h2>
          {tutors.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">{t('compTut.noTutors')}</div>
          ) : (
            <div className="space-y-2">
              {tutors.map(tutor => (
                <button key={tutor.id} onClick={() => openTutor(tutor)}
                  className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-center gap-3 hover:border-indigo-200 hover:shadow-md transition-all text-left hover:bg-indigo-50/40"
                >
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-indigo-700">{tutor.full_name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{tutor.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">{tutor.email}</p>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full font-medium">
                    <UserCheck className="w-3 h-3" /> {t('compTut.active')}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Pending invites */}
        {unusedInvites.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('compTut.pendingInvites', { count: String(unusedInvites.length) })}</h2>
            <div className="space-y-2">
              {unusedInvites.map(invite => (
                <div key={invite.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{invite.invitee_name || invite.invitee_email}</p>
                      <p className="text-xs text-gray-400">{invite.invitee_email} · {format(new Date(invite.created_at), 'd MMM yyyy', { locale: dateFnsLocale })}</p>
                      {invite.token && (
                        <p className="text-xs font-mono text-violet-600 mt-1 truncate" title={invite.token}>
                          {t('compTut.code', { token: invite.token })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {invite.token && (
                      <button
                        type="button"
                        onClick={() => copyLink(invite.token)}
                        className="text-xs font-medium text-violet-600 hover:text-violet-700 px-3 py-1.5 rounded-lg bg-violet-50 hover:bg-violet-100 transition-colors"
                      >
                        {copiedToken === invite.token ? t('compTut.copied') : t('compTut.copyLink')}
                      </button>
                    )}
                    <button onClick={() => handleDeleteInvite(invite.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Used invites */}
        {invites.filter(i => i.used).length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{t('compTut.usedInvites')}</h2>
            <div className="space-y-2">
              {invites.filter(i => i.used).map(invite => (
                <div key={invite.id} className="bg-gray-50 rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3 opacity-60">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <p className="text-sm font-mono text-gray-500 tracking-widest">{invite.type === 'full' ? invite.invitee_email : invite.token}</p>
                  {invite.tutor && <span className="text-xs text-gray-500 ml-auto">→ {invite.tutor.full_name}</span>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Invite Modal ─────────────────────────────────────────────────────── */}
      <Dialog open={inviteModalOpen} onOpenChange={open => { setInviteModalOpen(open); if (!open) { setInviteSuccess(null); setInviteError(null); } }}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('compTut.createInviteTitle')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-3">
              <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 text-sm text-violet-700">
                {t('compTut.inviteDesc')}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">{t('compTut.emailLabel')}</Label>
                <Input type="email" placeholder={t('compTut.emailPlaceholder')} value={inviteeEmail} onChange={e => setInviteeEmail(e.target.value)} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">{t('compTut.nameLabel')}</Label>
                <Input placeholder={t('compTut.namePlaceholder')} value={inviteeName} onChange={e => setInviteeName(e.target.value)} className="rounded-xl" />
              </div>
            </div>

            {/* Subjects (shared) */}
            <div className="border-t border-gray-100 pt-4">
              <SubjectPresetList
                subjects={presetSubjects}
                onAdd={s => setPresetSubjects(prev => [...prev, s])}
                onRemove={idx => setPresetSubjects(prev => prev.filter((_, i) => i !== idx))}
                orgCatalog={orgSubjectCatalogOptions}
              />
            </div>

            {/* Default Settings (shared) - Collapsible */}
            <div className="border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => setSettingsExpanded(!settingsExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('compTut.defaultSettings')}
                </p>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-gray-400 transition-transform",
                    settingsExpanded && "rotate-180"
                  )}
                />
              </button>

              {settingsExpanded && (
                <div className="mt-3 px-1 space-y-3">
                  <p className="text-xs text-slate-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2" dangerouslySetInnerHTML={{ __html: t('compTut.settingsNote') }} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600">{t('compTut.cancellationH')}</Label>
                      <Input type="number" value={inviteCancellationHours} onChange={e => setInviteCancellationHours(Number(e.target.value) || 0)} className="rounded-xl" />
                      <p className="text-[11px] text-gray-400">{t('compTut.cancellationHHint')}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600">{t('compTut.cancellationFee')}</Label>
                      <Input type="number" value={inviteCancellationFee} onChange={e => setInviteCancellationFee(Number(e.target.value) || 0)} className="rounded-xl" />
                      <p className="text-[11px] text-gray-400">{t('compTut.cancellationFeeHint')}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600">{t('compTut.minBooking')}</Label>
                      <Input type="number" value={inviteMinBooking} onChange={e => setInviteMinBooking(Number(e.target.value) || 0)} className="rounded-xl" />
                      <p className="text-[11px] text-gray-400">{t('compTut.minBookingHint')}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600">{t('compTut.breakMin')}</Label>
                      <Input type="number" value={inviteBreakBetween} onChange={e => setInviteBreakBetween(Number(e.target.value) || 0)} className="rounded-xl" />
                      <p className="text-[11px] text-gray-400">{t('compTut.breakHint')}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600">{t('compTut.studentReminder')}</Label>
                      <Input type="number" min={0} value={inviteReminderStudent} onChange={e => setInviteReminderStudent(Math.max(0, Number(e.target.value) || 0))} className="rounded-xl" />
                      <p className="text-[11px] text-gray-400">{t('compTut.studentReminderHint')}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-gray-600">{t('compTut.tutorReminder')}</Label>
                      <Input type="number" min={0} value={inviteReminderTutor} onChange={e => setInviteReminderTutor(Math.max(0, Number(e.target.value) || 0))} className="rounded-xl" />
                      <p className="text-[11px] text-gray-400">{t('compTut.tutorReminderHint')}</p>
                    </div>
                    <div className="space-y-1.5 col-span-2 pt-2 border-t border-gray-100">
                      <Label className="text-xs font-medium text-gray-600">{t('compTut.commission')}</Label>
                      <Input
                        type="number"
                        value={inviteCommissionPercent}
                        onChange={e => setInviteCommissionPercent(Number(e.target.value) || 0)}
                        className="rounded-xl w-32"
                      />
                      <p className="text-xs text-gray-400">
                        {t('compTut.fixedPayDesc')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Result messages */}
            {inviteError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {inviteError}
              </div>
            )}
            {inviteSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2 font-medium">
                <Check className="w-4 h-4 flex-shrink-0" /> {inviteSuccess}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteModalOpen(false)}>{t('compTut.closeBtn')}</Button>
            {!inviteSuccess && (
              <Button
                onClick={handleSendFullInvite}
                disabled={sendingInvite || !inviteeEmail.trim()}
                className="gap-2"
              >
                {sendingInvite ? t('compTut.sending') : <><Send className="w-4 h-4" /> {t('compTut.sendInvite')}</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Tutor detail modal ─────────────────────────────────────────────── */}
      <Dialog open={tutorModalOpen} onOpenChange={setTutorModalOpen}>
        <DialogContent className="max-w-3xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('compTut.tutorInfo')}</DialogTitle></DialogHeader>

          {selectedTutor && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-gray-900">{selectedTutor.sessionCount}</p>
                  <p className="text-xs text-gray-500">{t('compTut.lessonsTaught')}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-gray-900">{selectedTutor.earnings.toFixed(2)} €</p>
                  <p className="text-xs text-gray-500">{t('compTut.totalEarned')}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">{t('compTut.fullName')}</Label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">{t('compTut.email')}</Label>
                  <Input value={selectedTutor.email} disabled className="rounded-xl bg-gray-50 text-gray-400" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-gray-600">{t('compTut.phone')}</Label>
                  <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="rounded-xl" />
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-gray-100">
                <div className="pb-3 border-b border-gray-100">
                  <Label className="text-xs font-medium text-gray-600">{t('compTut.commission')}</Label>
                  <p className="text-[11px] text-gray-500 mb-1.5">{t('compTut.tutorFixedPayDesc')}</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={editCommissionPercent}
                      onChange={e => setEditCommissionPercent(Number(e.target.value) || 0)}
                      className="rounded-xl w-28"
                    />
                    <span className="text-xs text-gray-500">{t('compTut.eurPerLesson')}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{t('compTut.lessonSettings')}</p>
                  <p className="text-[11px] text-gray-500" dangerouslySetInnerHTML={{ __html: t('compTut.tutorSettingsNote') }} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-600">{t('compTut.cancellationH')}</Label>
                    <Input type="number" value={editCancellationHours} onChange={e => setEditCancellationHours(Number(e.target.value) || 0)} className="rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-600">{t('compTut.cancellationFee')}</Label>
                    <Input type="number" value={editCancellationFee} onChange={e => setEditCancellationFee(Number(e.target.value) || 0)} className="rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-600">{t('compTut.minBooking')}</Label>
                    <Input type="number" value={editMinBooking} onChange={e => setEditMinBooking(Number(e.target.value) || 0)} className="rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-600">{t('compTut.breakMin')}</Label>
                    <Input type="number" value={editBreakBetween} onChange={e => setEditBreakBetween(Number(e.target.value) || 0)} className="rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-600">{t('compTut.studentReminder')}</Label>
                    <Input type="number" min={0} value={editReminderStudent} onChange={e => setEditReminderStudent(Math.max(0, Number(e.target.value) || 0))} className="rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-gray-600">{t('compTut.tutorReminder')}</Label>
                    <Input type="number" min={0} value={editReminderTutor} onChange={e => setEditReminderTutor(Math.max(0, Number(e.target.value) || 0))} className="rounded-xl" />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{t('compTut.subjects')}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddSubject((o) => !o);
                      setAddSubjectCatalogPick('');
                    }}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> {t('compTut.addSubject')}
                  </button>
                </div>

                {selectedTutor.subjects.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {selectedTutor.subjects.map(subj => (
                      <SubjectRow key={subj.id} subject={subj} onSave={handleSaveSubject} onDelete={handleDeleteSubject} />
                    ))}
                  </div>
                )}

                {showAddSubject && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-indigo-700">{t('compTut.newSubject')}</p>

                    {orgSubjectCatalogOptions.length > 0 && catalogForAddSubject.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-gray-600">{t('compTut.fromOrgCatalog')}</Label>
                        <Select
                          value={addSubjectCatalogPick || '__none__'}
                          onValueChange={(key) => {
                            if (key === '__none__') {
                              setAddSubjectCatalogPick('');
                              return;
                            }
                            const opt = orgSubjectCatalogOptions.find((o) => o.key === key);
                            if (!opt) return;
                            const p = opt.preset;
                            setNewSubjectName(p.name);
                            setNewSubjectDuration(p.duration_minutes);
                            setNewSubjectPrice(p.price);
                            setNewSubjectColor(p.color);
                            setAddSubjectCatalogPick(key);
                          }}
                        >
                          <SelectTrigger className="rounded-xl h-10 text-sm bg-white w-full">
                            <SelectValue placeholder={t('compTut.selectSubject')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">{t('compTut.selectDefault')}</SelectItem>
                            {catalogForAddSubject.map((o) => (
                              <SelectItem key={o.key} value={o.key}>
                                {o.preset.name} · {o.preset.price} € · {o.preset.duration_minutes} min
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {orgSubjectCatalogOptions.length > 0 && catalogForAddSubject.length === 0 && (
                      <p className="text-xs text-gray-600 bg-white/60 border border-indigo-100 rounded-lg px-2.5 py-2">
                        {t('compTut.allCatalogAssigned')}
                      </p>
                    )}

                    {orgSubjectCatalogOptions.length === 0 && (
                      <p className="text-xs text-amber-800 bg-amber-50/80 border border-amber-100 rounded-lg px-2.5 py-1.5">
                        {t('compTut.noCatalogOrg')}
                      </p>
                    )}

                    {orgSubjectCatalogOptions.length > 0 && catalogForAddSubject.length > 0 && (
                      <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">{t('compTut.orManual')}</p>
                    )}

                    <Input
                      placeholder={t('compTut.subjectPlaceholder')}
                      value={newSubjectName}
                      onChange={(e) => {
                        setNewSubjectName(e.target.value);
                        setAddSubjectCatalogPick('');
                      }}
                      className="rounded-xl text-sm"
                      autoFocus={orgSubjectCatalogOptions.length === 0}
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-600">{t('compTut.durationMin')}</Label>
                        <Input type="number" value={newSubjectDuration} onChange={e => setNewSubjectDuration(Number(e.target.value) || 0)} className="rounded-xl text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-600">{t('compTut.priceEur')}</Label>
                        <Input type="number" value={newSubjectPrice} onChange={e => setNewSubjectPrice(Number(e.target.value) || 0)} className="rounded-xl text-sm" />
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {COLORS.map(c => (
                        <button key={c} type="button" onClick={() => setNewSubjectColor(c)}
                          className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 shrink-0"
                          style={{ backgroundColor: c, borderColor: newSubjectColor === c ? '#1e1b4b' : 'transparent', transform: newSubjectColor === c ? 'scale(1.2)' : 'scale(1)' }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => { setShowAddSubject(false); setNewSubjectName(''); setAddSubjectCatalogPick(''); }}>{t('compTut.cancelBtn')}</Button>
                      <Button size="sm" className="flex-1 rounded-xl" onClick={handleAddSubject} disabled={savingSubject || !newSubjectName.trim()}>
                        {savingSubject ? t('compTut.saving') : t('compTut.addBtn')}
                      </Button>
                    </div>
                  </div>
                )}

                {selectedTutor.subjects.length === 0 && !showAddSubject && (
                  <p className="text-xs text-gray-400 italic">{t('compTut.noSubjects')}</p>
                )}

              {orgTemplates.length > 0 && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t('compTut.tutorPricing')}</p>
                  <p className="text-[11px] text-gray-400 mb-3">{t('compTut.tutorPricingHint')}</p>
                  <div className="space-y-2">
                    {orgTemplates.map(tpl => {
                      const existing = tutorSubjectPrices.find(p => p.org_subject_template_id === tpl.id);
                      return (
                        <TutorSubjectPriceRow
                          key={tpl.id}
                          template={tpl}
                          existing={existing ? { price: existing.price, duration_minutes: existing.duration_minutes } : undefined}
                          onSave={handleSaveTutorSubjectPrice}
                          onDelete={handleDeleteTutorSubjectPrice}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTutorModalOpen(false)}>{t('compTut.cancelBtn')}</Button>
            <Button onClick={handleSaveTutor} disabled={savingTutor}>{savingTutor ? t('compTut.saving') : t('compTut.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CompanyLayout>
  );
}
