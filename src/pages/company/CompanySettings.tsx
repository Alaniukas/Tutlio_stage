import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Save, Trash2, Plus, BookOpen, Clock, Euro, Pencil, Users, Eye, AlertTriangle } from 'lucide-react';
import Toast from '@/components/Toast';
import { useTranslation } from '@/lib/i18n';
import {
  EMPTY_ORG_LESSON_SCOPE,
  parseOrgLessonEditScope,
  anyOrgLessonEdit,
  type OrgLessonEditScope,
} from '@/lib/orgTutorLessonEdit';
import { subjectPresetKey, subjectTutorLessonKey, tutorSubjectsContainLessonDuplicate } from '@/lib/subjectPresetDedupe';
import { removeOrgSubjectTemplatesMatchingPreset } from '@/lib/orgSubjectTemplateCleanup';
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  parseOrgContactVisibility,
  DEFAULT_TUTOR_SEES_CONTACT,
  DEFAULT_STUDENT_SEES_TUTOR,
  type TutorSeesContactMode,
  type StudentSeesTutorContactMode,
} from '@/lib/orgContactVisibility';
import { getCached, setCache } from '@/lib/dataCache';

type TrialCommentMode = 'student_and_parent' | 'internal_only';

interface OrgSubjectTemplate {
  id: string;
  name: string;
  duration_minutes: number;
  price: number;
  color: string;
  meeting_link?: string | null;
  grade_min?: number | null;
  grade_max?: number | null;
  is_group?: boolean;
  max_students?: number | null;
}

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
  tutor_id: string;
  tutor_name?: string;
  /** Entry from organizations.org_subject_templates (no tutor assigned) */
  isOrgTemplate?: boolean;
}

const SUBJECT_COLOR_VALUES = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899',
  '#8b5cf6', '#06b6d4', '#1d4ed8', '#ea580c', '#16a34a',
  '#92400e', '#6b7280',
];

const DEFAULT_SETTINGS = {
  cancellation_hours: 24,
  cancellation_fee_percent: 50,
  reminder_student_hours: 24,
  reminder_tutor_hours: 24,
  break_between_lessons: 15,
  min_booking_hours: 24,
  company_commission_percent: 0,
};

export default function CompanySettings() {
  const { t } = useTranslation();
  const sc = getCached<any>('company_settings');
  const [loading, setLoading] = useState(!sc);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(sc?.orgId ?? null);
  const [settings, setSettings] = useState(sc?.settings ?? { ...DEFAULT_SETTINGS });
  const [lessonEditScope, setLessonEditScope] = useState<OrgLessonEditScope>(
    sc?.lessonEditScope ?? { ...EMPTY_ORG_LESSON_SCOPE }
  );
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [orgTutors, setOrgTutors] = useState<{ id: string; full_name: string }[]>(sc?.orgTutors ?? []);
  const [subjects, setSubjects] = useState<Subject[]>(sc?.subjects ?? []);
  const [isSubjectDialogOpen, setIsSubjectDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [newSubject, setNewSubject] = useState({
    name: '', duration_minutes: 60, price: 25, color: '#6366f1',
    meeting_link: '', grade_min: null as number | null, grade_max: null as number | null,
    is_group: false, max_students: null as number | null,
  });
  const [selectedTutorIds, setSelectedTutorIds] = useState<string[]>([]);
  const [savingSubject, setSavingSubject] = useState(false);

  const [orgFeaturesSnapshot, setOrgFeaturesSnapshot] = useState<Record<string, unknown>>(
    sc?.orgFeaturesSnapshot ?? {}
  );
  const [contactTutorStudentEmail, setContactTutorStudentEmail] = useState<TutorSeesContactMode>(
    sc?.contactTutorStudentEmail ?? DEFAULT_TUTOR_SEES_CONTACT
  );
  const [contactTutorStudentPhone, setContactTutorStudentPhone] = useState<TutorSeesContactMode>(
    sc?.contactTutorStudentPhone ?? DEFAULT_TUTOR_SEES_CONTACT
  );
  const [contactStudentTutorEmail, setContactStudentTutorEmail] =
    useState<StudentSeesTutorContactMode>(sc?.contactStudentTutorEmail ?? DEFAULT_STUDENT_SEES_TUTOR);
  const [contactStudentTutorPhone, setContactStudentTutorPhone] =
    useState<StudentSeesTutorContactMode>(sc?.contactStudentTutorPhone ?? DEFAULT_STUDENT_SEES_TUTOR);

  const [trialTopic, setTrialTopic] = useState(sc?.trialTopic ?? t('compSet.trialTopicDefault'));
  const [trialDurationMinutes, setTrialDurationMinutes] = useState(sc?.trialDurationMinutes ?? 60);
  const [trialPriceEur, setTrialPriceEur] = useState(sc?.trialPriceEur ?? 0);
  const [trialCommentMode, setTrialCommentMode] = useState<TrialCommentMode>(
    sc?.trialCommentMode ?? 'internal_only'
  );
  const [trialCommentRequired, setTrialCommentRequired] = useState(sc?.trialCommentRequired ?? false);
  const [notifyTutorsOnAssign, setNotifyTutorsOnAssign] = useState(sc?.notifyTutorsOnAssign ?? false);
  const [enableManualStudentPayments, setEnableManualStudentPayments] = useState(sc?.enableManualStudentPayments ?? false);

  useEffect(() => { if (!getCached('company_settings')) fetchSettings(); }, []);

  const fetchSettings = async () => {
    if (!getCached('company_settings')) setLoading(true);
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

    const orgIdVal = adminRow.organization_id;
    setOrgId(orgIdVal);

    const { data: orgData } = await supabase
      .from('organizations')
      .select('default_cancellation_hours, default_cancellation_fee_percent, default_reminder_student_hours, default_reminder_tutor_hours, default_break_between_lessons, default_min_booking_hours, default_company_commission_percent, org_tutors_can_edit_lesson_settings, org_tutor_lesson_edit, org_subject_templates, features, tutor_license_count')
      .eq('id', adminRow.organization_id)
      .single();

    let nextSettings = { ...DEFAULT_SETTINGS };
    let nextLessonEditScope: OrgLessonEditScope = { ...EMPTY_ORG_LESSON_SCOPE };
    let nextOrgFeaturesSnapshot: Record<string, unknown> = {};
    let nextContactTutorStudentEmail: TutorSeesContactMode = DEFAULT_TUTOR_SEES_CONTACT;
    let nextContactTutorStudentPhone: TutorSeesContactMode = DEFAULT_TUTOR_SEES_CONTACT;
    let nextContactStudentTutorEmail: StudentSeesTutorContactMode = DEFAULT_STUDENT_SEES_TUTOR;
    let nextContactStudentTutorPhone: StudentSeesTutorContactMode = DEFAULT_STUDENT_SEES_TUTOR;
    let nextTrialTopic = t('compSet.trialTopicDefault');
    let nextTrialDurationMinutes = 60;
    let nextTrialPriceEur = 0;
    let nextTrialCommentMode: TrialCommentMode = 'internal_only';
    let nextTrialCommentRequired = false;

    if (orgData) {
      const rawFeat = (orgData as { features?: unknown }).features;
      const featObj = rawFeat && typeof rawFeat === 'object' && !Array.isArray(rawFeat) ? (rawFeat as Record<string, unknown>) : {};
      nextOrgFeaturesSnapshot = featObj;
      const cv = parseOrgContactVisibility(featObj);
      nextContactTutorStudentEmail = cv.tutorSeesStudentEmail;
      nextContactTutorStudentPhone = cv.tutorSeesStudentPhone;
      nextContactStudentTutorEmail = cv.studentSeesTutorEmail;
      nextContactStudentTutorPhone = cv.studentSeesTutorPhone;
      const ft = featObj['trial_lesson_topic'];
      if (typeof ft === 'string' && ft.trim()) nextTrialTopic = ft.trim();
      const fd = featObj['trial_lesson_duration_minutes'];
      if (typeof fd === 'number' && Number.isFinite(fd) && fd > 0) nextTrialDurationMinutes = Math.round(fd);
      const fp = featObj['trial_lesson_price_eur'];
      if (typeof fp === 'number' && Number.isFinite(fp) && fp >= 0) nextTrialPriceEur = fp;
      const fcm = featObj['trial_lesson_comment_mode'];
      if (fcm === 'student_and_parent' || fcm === 'internal_only') nextTrialCommentMode = fcm;
      const fcr = featObj['trial_comment_required'];
      nextTrialCommentRequired = fcr === true;
      setEnableManualStudentPayments(
        featObj['manual_payments'] === true || featObj['enable_manual_student_payments'] === true,
      );
      nextSettings = {
        cancellation_hours: orgData.default_cancellation_hours || 24,
        cancellation_fee_percent: orgData.default_cancellation_fee_percent || 50,
        reminder_student_hours: orgData.default_reminder_student_hours ?? 24,
        reminder_tutor_hours: orgData.default_reminder_tutor_hours ?? 24,
        break_between_lessons: orgData.default_break_between_lessons || 15,
        min_booking_hours: orgData.default_min_booking_hours || 24,
        company_commission_percent: orgData.default_company_commission_percent || 0,
      };
      const raw = (orgData as { org_tutor_lesson_edit?: unknown }).org_tutor_lesson_edit as Record<string, unknown> | null | undefined;
      const legacy = (orgData as { org_tutors_can_edit_lesson_settings?: boolean }).org_tutors_can_edit_lesson_settings === true;
      nextLessonEditScope = parseOrgLessonEditScope(raw, legacy);

      setOrgFeaturesSnapshot(featObj);
      setContactTutorStudentEmail(cv.tutorSeesStudentEmail);
      setContactTutorStudentPhone(cv.tutorSeesStudentPhone);
      setContactStudentTutorEmail(cv.studentSeesTutorEmail);
      setContactStudentTutorPhone(cv.studentSeesTutorPhone);
      setTrialTopic(nextTrialTopic);
      setTrialDurationMinutes(nextTrialDurationMinutes);
      setTrialPriceEur(nextTrialPriceEur);
      setTrialCommentMode(nextTrialCommentMode);
      setTrialCommentRequired(nextTrialCommentRequired);
      setNotifyTutorsOnAssign(featObj['notify_tutors_on_student_assign'] === true);
      setSettings(nextSettings);
      setLessonEditScope(nextLessonEditScope);
    }

    const tutorList = await getOrgVisibleTutors(
      supabase as any,
      adminRow.organization_id,
      'id, full_name, email',
    );
    setOrgTutors(tutorList);

    const rawTemplates = (orgData as { org_subject_templates?: unknown } | null)?.org_subject_templates;
    const templateList: OrgSubjectTemplate[] = Array.isArray(rawTemplates)
      ? (rawTemplates as OrgSubjectTemplate[])
      : [];

    let dbRows: Subject[] = [];
    if (tutorList.length > 0) {
      const { data: subjectsData } = await supabase
        .from('subjects')
        .select('*')
        .in('tutor_id', tutorList.map((t: any) => t.id))
        .order('name');

      dbRows = (subjectsData || []).map((s: any) => ({
        ...s,
        tutor_name: tutorList.find((t: any) => t.id === s.tutor_id)?.full_name || '-',
      }));
    }

    const dbPresetKeys = new Set(
      dbRows.map((s) =>
        subjectPresetKey({
          name: s.name,
          duration_minutes: s.duration_minutes,
          price: s.price,
          color: s.color,
        })
      )
    );
    const templateListVisible = templateList.filter((tpl) => {
      const k = subjectPresetKey({
        name: tpl.name,
        duration_minutes: tpl.duration_minutes,
        price: tpl.price,
        color: tpl.color || '#6366f1',
      });
      return !dbPresetKeys.has(k);
    });

    const templateRows: Subject[] = templateListVisible.map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      duration_minutes: tpl.duration_minutes,
      price: tpl.price,
      color: tpl.color,
      meeting_link: tpl.meeting_link || undefined,
      grade_min: tpl.grade_min ?? null,
      grade_max: tpl.grade_max ?? null,
      is_group: tpl.is_group || false,
      max_students: tpl.max_students ?? null,
      tutor_id: '',
      tutor_name: t('compSet.noTutorTemplate'),
      isOrgTemplate: true,
    }));

    if (templateListVisible.length !== templateList.length) {
      await supabase
        .from('organizations')
        .update({ org_subject_templates: templateListVisible })
        .eq('id', adminRow.organization_id);
    }

    const merged = [...templateRows, ...dbRows].sort((a, b) => a.name.localeCompare(b.name, 'lt'));
    setSubjects(merged);

    const prevCache = getCached<any>('company_settings');
    if (orgData) {
      setCache('company_settings', {
        orgId: orgIdVal,
        settings: nextSettings,
        lessonEditScope: nextLessonEditScope,
        orgFeaturesSnapshot: nextOrgFeaturesSnapshot,
        contactTutorStudentEmail: nextContactTutorStudentEmail,
        contactTutorStudentPhone: nextContactTutorStudentPhone,
        contactStudentTutorEmail: nextContactStudentTutorEmail,
        contactStudentTutorPhone: nextContactStudentTutorPhone,
        trialTopic: nextTrialTopic,
        trialDurationMinutes: nextTrialDurationMinutes,
        trialPriceEur: nextTrialPriceEur,
        trialCommentMode: nextTrialCommentMode,
        trialCommentRequired: nextTrialCommentRequired,
        orgTutors: tutorList,
        subjects: merged,
      });
    } else {
      setCache('company_settings', {
        ...(prevCache || {}),
        orgId: orgIdVal,
        orgTutors: tutorList,
        subjects: merged,
      });
    }

    setLoading(false);
  };

  const openAddSubjectDialog = () => {
    setEditingSubject(null);
    setNewSubject({ name: '', duration_minutes: 60, price: 25, color: '#6366f1', meeting_link: '', grade_min: null, grade_max: null, is_group: false, max_students: null });
    setSelectedTutorIds([]);
    setIsSubjectDialogOpen(true);
  };

  const openEditSubjectDialog = (subject: Subject) => {
    if (subject.isOrgTemplate) {
      setEditingSubject(subject);
      setNewSubject({
        name: subject.name,
        duration_minutes: subject.duration_minutes,
        price: subject.price,
        color: subject.color,
        meeting_link: subject.meeting_link || '',
        grade_min: subject.grade_min ?? null,
        grade_max: subject.grade_max ?? null,
        is_group: subject.is_group || false,
        max_students: subject.max_students || null,
      });
      setSelectedTutorIds([]);
      setIsSubjectDialogOpen(true);
      return;
    }

    setEditingSubject(subject);
    setNewSubject({
      name: subject.name,
      duration_minutes: subject.duration_minutes,
      price: subject.price,
      color: subject.color,
      meeting_link: subject.meeting_link || '',
      grade_min: subject.grade_min ?? null,
      grade_max: subject.grade_max ?? null,
      is_group: subject.is_group || false,
      max_students: subject.max_students || null,
    });
    // Edit this row only — do not pre-select every tutor with the same name (that caused accidental deletes/duplicates).
    setSelectedTutorIds([subject.tutor_id]);
    setIsSubjectDialogOpen(true);
  };

  const handleSaveSubject = async () => {
    if (!newSubject.name.trim() || !orgId) return;
    setSavingSubject(true);

    const subjectData = {
      name: newSubject.name.trim(),
      duration_minutes: newSubject.duration_minutes,
      price: newSubject.price,
      color: newSubject.color,
      meeting_link: newSubject.meeting_link.trim() || null,
      grade_min: newSubject.grade_min,
      grade_max: newSubject.grade_max,
      is_group: newSubject.is_group,
      max_students: newSubject.is_group ? newSubject.max_students : null,
    };

    const loadTemplates = async (): Promise<OrgSubjectTemplate[]> => {
      const { data: row } = await supabase
        .from('organizations')
        .select('org_subject_templates')
        .eq('id', orgId)
        .single();
      const raw = row?.org_subject_templates;
      return Array.isArray(raw) ? (raw as OrgSubjectTemplate[]) : [];
    };

    if (editingSubject?.isOrgTemplate) {
      const templates = await loadTemplates();
      const idx = templates.findIndex((t) => t.id === editingSubject.id);

      if (selectedTutorIds.length > 0) {
        const lessonK = subjectTutorLessonKey(subjectData);
        const existingLessonKeys = new Set(
          subjects
            .filter((s) => !s.isOrgTemplate && selectedTutorIds.includes(s.tutor_id))
            .map((s) => `${s.tutor_id}|${subjectTutorLessonKey(s)}`)
        );
        const toInsertTutorIds = selectedTutorIds.filter(
          (tid) => !existingLessonKeys.has(`${tid}|${lessonK}`)
        );
        if (toInsertTutorIds.length > 0) {
          const { error: insErr } = await supabase
            .from('subjects')
            .insert(toInsertTutorIds.map((tutorId) => ({ ...subjectData, tutor_id: tutorId })));
          if (insErr) {
            alert(t('compSet.errorPrefix', { msg: insErr.message }));
            setSavingSubject(false);
            return;
          }
        }
        const nextTemplates = templates.filter((t) => t.id !== editingSubject.id);
        await supabase.from('organizations').update({ org_subject_templates: nextTemplates }).eq('id', orgId);
      } else {
        const nextTemplates =
          idx >= 0
            ? templates.map((t) => (t.id === editingSubject.id ? { ...t, ...subjectData, id: t.id } : t))
            : [...templates, { ...subjectData, id: editingSubject.id }];
        const { error } = await supabase.from('organizations').update({ org_subject_templates: nextTemplates }).eq('id', orgId);
        if (error) {
          alert('Klaida: ' + error.message);
          setSavingSubject(false);
          return;
        }
      }
      setIsSubjectDialogOpen(false);
      fetchSettings();
      setSavingSubject(false);
      return;
    }

    if (editingSubject && !editingSubject.isOrgTemplate) {
      if (selectedTutorIds.length !== 1) {
        alert(t('compSet.subjectEditNeedOneTutor'));
        setSavingSubject(false);
        return;
      }
      const newTutorId = selectedTutorIds[0];

      const conflictingPeers = subjects.filter(
        (s) => !s.isOrgTemplate && s.tutor_id === newTutorId && s.id !== editingSubject.id
      );
      if (tutorSubjectsContainLessonDuplicate(conflictingPeers, subjectData)) {
        alert(t('compSet.subjectDuplicateForTutor'));
        setSavingSubject(false);
        return;
      }

      const { error: updErr } = await supabase
        .from('subjects')
        .update({ ...subjectData, tutor_id: newTutorId })
        .eq('id', editingSubject.id);

      if (updErr) {
        alert(t('compSet.errorPrefix', { msg: updErr.message }));
        setSavingSubject(false);
        return;
      }

      if (orgId) await removeOrgSubjectTemplatesMatchingPreset(orgId, subjectData);

      setIsSubjectDialogOpen(false);
      fetchSettings();
      setSavingSubject(false);
      return;
    }

    // New subject (no tutors selected)
    if (selectedTutorIds.length === 0) {
      const templates = await loadTemplates();
      const newTpl: OrgSubjectTemplate = { ...subjectData, id: crypto.randomUUID() };
      const { error } = await supabase
        .from('organizations')
        .update({ org_subject_templates: [...templates, newTpl] })
        .eq('id', orgId);
      if (error) {
        alert(t('compSet.errorPrefix', { msg: error.message }));
      } else {
        setIsSubjectDialogOpen(false);
        fetchSettings();
      }
      setSavingSubject(false);
      return;
    }

    const lessonK = subjectTutorLessonKey(subjectData);
    const existingRows = subjects.filter((s) => !s.isOrgTemplate && selectedTutorIds.includes(s.tutor_id));
    const occupied = new Set(existingRows.map((s) => `${s.tutor_id}|${subjectTutorLessonKey(s)}`));
    const tutorIdsToInsert = selectedTutorIds.filter((tid) => !occupied.has(`${tid}|${lessonK}`));
    if (tutorIdsToInsert.length === 0) {
      alert(t('compSet.subjectDuplicateForTutor'));
      setSavingSubject(false);
      return;
    }
    const inserts = tutorIdsToInsert.map((tutorId) => ({ ...subjectData, tutor_id: tutorId }));
    const { error } = await supabase.from('subjects').insert(inserts);
    if (!error) {
      if (orgId) await removeOrgSubjectTemplatesMatchingPreset(orgId, subjectData);
      setIsSubjectDialogOpen(false);
      fetchSettings();
    } else {
      alert(t('compSet.errorPrefix', { msg: error.message }));
    }
    setSavingSubject(false);
  };

  const handleDeleteSubject = async (subject: Subject) => {
    if (!confirm(t('compSet.confirmDelete'))) return;
    if (subject.isOrgTemplate) {
      if (!orgId) return;
      const { data: orgRow } = await supabase.from('organizations').select('org_subject_templates').eq('id', orgId).single();
      const arr = (orgRow?.org_subject_templates as OrgSubjectTemplate[]) || [];
      const next = arr.filter((t) => t.id !== subject.id);
      const { error } = await supabase.from('organizations').update({ org_subject_templates: next }).eq('id', orgId);
      if (!error) fetchSettings();
      return;
    }
    const { error } = await supabase.from('subjects').delete().eq('id', subject.id);
    if (error) {
      alert(t('compSet.errorDeleting', { msg: error.message }));
      return;
    }
    fetchSettings();
  };

  const handleSave = async () => {
    if (!orgId) return;
    const overwriteExistingTutors = confirm(t('compSet.confirmOverwrite'));
    if (!overwriteExistingTutors) {
      return;
    }

    setSaving(true);
    const anyLessonEdit = anyOrgLessonEdit(lessonEditScope);

    const mergedFeatures: Record<string, unknown> = {
      ...orgFeaturesSnapshot,
      contact_tutor_student_email: contactTutorStudentEmail,
      contact_tutor_student_phone: contactTutorStudentPhone,
      contact_student_tutor_email: contactStudentTutorEmail,
      contact_student_tutor_phone: contactStudentTutorPhone,
      trial_lesson_topic: trialTopic.trim() || t('compSet.trialTopicDefault'),
      trial_lesson_duration_minutes: Math.max(15, Number(trialDurationMinutes) || 60),
      trial_lesson_price_eur: Math.max(0, Number(trialPriceEur) || 0),
      trial_lesson_comment_mode: trialCommentMode,
      trial_comment_required: trialCommentRequired,
      notify_tutors_on_student_assign: notifyTutorsOnAssign,
      manual_payments: enableManualStudentPayments,
      enable_manual_student_payments: enableManualStudentPayments,
    };

    const { error } = await supabase
      .from('organizations')
      .update({
        default_cancellation_hours: settings.cancellation_hours,
        default_cancellation_fee_percent: settings.cancellation_fee_percent,
        default_reminder_student_hours: settings.reminder_student_hours,
        default_reminder_tutor_hours: settings.reminder_tutor_hours,
        default_break_between_lessons: settings.break_between_lessons,
        default_min_booking_hours: settings.min_booking_hours,
        default_company_commission_percent: settings.company_commission_percent,
        org_tutor_lesson_edit: lessonEditScope,
        org_tutors_can_edit_lesson_settings: anyLessonEdit,
        features: mergedFeatures,
      })
      .eq('id', orgId);

    if (!error) {
      setOrgFeaturesSnapshot(mergedFeatures);
    }

    if (error) {
      setToastMessage({ message: t('compSet.errorSaving'), type: 'error' });
      setSaving(false);
      return;
    }

    const tutorRows = await getOrgVisibleTutors(
      supabase as any,
      orgId,
      'id, email',
    );
    const tutorIds = tutorRows.map((p) => p.id);

    if (tutorIds.length > 0) {
      const { error: tutorsUpdateError } = await supabase
        .from('profiles')
        .update({
          cancellation_hours: settings.cancellation_hours,
          cancellation_fee_percent: settings.cancellation_fee_percent,
          reminder_student_hours: settings.reminder_student_hours,
          reminder_tutor_hours: settings.reminder_tutor_hours,
          break_between_lessons: settings.break_between_lessons,
          min_booking_hours: settings.min_booking_hours,
          company_commission_percent: settings.company_commission_percent,
          enable_manual_student_payments: enableManualStudentPayments,
        })
        .in('id', tutorIds);

      if (tutorsUpdateError) {
        setToastMessage({
          message: t('compSet.savedButTutorsFailed'),
          type: 'error',
        });
        setSaving(false);
        return;
      }
    }

    setToastMessage({
      message: t('compSet.savedAndApplied', { count: String(tutorIds.length) }),
      type: 'success',
    });

    const prevCache = getCached<any>('company_settings');
    setCache('company_settings', {
      ...(prevCache || {}),
      orgId,
      settings: {
        cancellation_hours: settings.cancellation_hours,
        cancellation_fee_percent: settings.cancellation_fee_percent,
        reminder_student_hours: settings.reminder_student_hours,
        reminder_tutor_hours: settings.reminder_tutor_hours,
        break_between_lessons: settings.break_between_lessons,
        min_booking_hours: settings.min_booking_hours,
        company_commission_percent: settings.company_commission_percent,
      },
      lessonEditScope,
      orgFeaturesSnapshot: mergedFeatures,
      contactTutorStudentEmail,
      contactTutorStudentPhone,
      contactStudentTutorEmail,
      contactStudentTutorPhone,
      trialTopic,
      trialDurationMinutes,
      trialPriceEur,
      trialCommentMode,
      trialCommentRequired,
      notifyTutorsOnAssign,
      enableManualStudentPayments,
      orgTutors,
      subjects,
    });

    setSaving(false);
  };

  if (loading) {
    return (
      <>
        <div className="w-full max-w-[1600px] mx-auto">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
            <p className="text-center text-gray-500">{t('compSet.loading')}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {toastMessage && (
        <Toast message={toastMessage.message} type={toastMessage.type} onClose={() => setToastMessage(null)} />
      )}
      <div className="w-full max-w-[1600px] mx-auto">
        <div className="mb-4 sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-gray-100">
          <div className="py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Settings className="w-6 h-6 text-indigo-600" /> {t('compSet.title')}
              </h1>
              <p className="text-gray-500 mt-1 text-sm" dangerouslySetInnerHTML={{ __html: t('compSet.titleDesc') }} />
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button onClick={handleSave} disabled={saving} className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700">
                <Save className="w-4 h-4" />
                {saving ? t('compSet.saving') : t('compSet.saveSettings')}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-gray-900">{t('compSet.tutorNotifications')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{t('compSet.tutorNotificationsDesc')}</p>
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyTutorsOnAssign}
                onChange={(e) => setNotifyTutorsOnAssign(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">{t('compSet.notifyTutorsOnAssign')}</span>
            </label>
            <p className="text-xs text-gray-400 ml-8">{t('compSet.notifyTutorsOnAssignDesc')}</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center flex-shrink-0">
                <Eye className="w-5 h-5 text-sky-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-gray-900">{t('compSet.contactVisibility')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('compSet.contactVisibilityDesc')}
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('compSet.tutorStudentEmail')}</Label>
                <Select value={contactTutorStudentEmail} onValueChange={(v) => setContactTutorStudentEmail(v as TutorSeesContactMode)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">{t('compSet.bothStudentPayer')}</SelectItem>
                    <SelectItem value="student">{t('compSet.studentOnly')}</SelectItem>
                    <SelectItem value="parent">{t('compSet.payerOnly')}</SelectItem>
                    <SelectItem value="none">{t('compSet.dontShow')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('compSet.tutorStudentPhone')}</Label>
                <Select value={contactTutorStudentPhone} onValueChange={(v) => setContactTutorStudentPhone(v as TutorSeesContactMode)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">{t('compSet.bothStudentPayer')}</SelectItem>
                    <SelectItem value="student">{t('compSet.studentOnly')}</SelectItem>
                    <SelectItem value="parent">{t('compSet.payerOnly')}</SelectItem>
                    <SelectItem value="none">{t('compSet.dontShow')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('compSet.studentTutorEmail')}</Label>
                <Select value={contactStudentTutorEmail} onValueChange={(v) => setContactStudentTutorEmail(v as StudentSeesTutorContactMode)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="show">{t('compSet.show')}</SelectItem>
                    <SelectItem value="hide">{t('compSet.hide')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('compSet.studentTutorPhone')}</Label>
                <Select value={contactStudentTutorPhone} onValueChange={(v) => setContactStudentTutorPhone(v as StudentSeesTutorContactMode)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="show">{t('compSet.show')}</SelectItem>
                    <SelectItem value="hide">{t('compSet.hide')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-amber-700" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-gray-900">{t('compSet.trialLesson')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('compSet.trialDesc')}
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('compSet.topicLabel')}</Label>
                <input
                  value={trialTopic}
                  onChange={(e) => setTrialTopic(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder={t('compSet.trialPlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('compSet.durationMin')}</Label>
                <input
                  type="number"
                  min={15}
                  step={5}
                  value={trialDurationMinutes}
                  onChange={(e) => setTrialDurationMinutes(Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('compSet.priceEur')}</Label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={trialPriceEur}
                  onChange={(e) => setTrialPriceEur(Number(e.target.value))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('compSet.commentVisibility')}</Label>
                <Select value={trialCommentMode} onValueChange={(v) => setTrialCommentMode(v as TrialCommentMode)}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal_only">{t('compSet.commentInternal')}</SelectItem>
                    <SelectItem value="student_and_parent">{t('compSet.commentPublic')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-full">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trialCommentRequired}
                    onChange={(e) => setTrialCommentRequired(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">{t('compSet.trialCommentRequired')}</span>
                </label>
                <p className="text-xs text-gray-400 ml-6">{t('compSet.trialCommentRequiredDesc')}</p>
              </div>
            </div>
          </div>

          {/* Subject Management Section */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-emerald-600" /> {t('compSet.subjectManagement')}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('compSet.subjectManagementDesc')}
                </p>
              </div>
              <Button onClick={openAddSubjectDialog} size="sm" className="gap-2 rounded-xl">
                <Plus className="w-4 h-4" /> {t('compSet.addSubject')}
              </Button>
            </div>

            {subjects.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{t('compSet.noSubjects')}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {subjects.map(subject => (
                  <div key={subject.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-900">{subject.name}</span>
                          {subject.is_group && (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                              <Users className="w-3 h-3" /> {t('compSet.groupLesson', { count: String(subject.max_students) })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{subject.duration_minutes} min</span>
                          <span className="flex items-center gap-1"><Euro className="w-3 h-3" />{subject.price}</span>
                          <span className="text-gray-400">{subject.tutor_name}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => openEditSubjectDialog(subject)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSubject(subject)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('compSet.cancellationSettings')}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('compSet.autoCancellationH')}</Label>
                  <Input
                    type="number"
                    value={settings.cancellation_hours}
                    onChange={(e) => setSettings({ ...settings, cancellation_hours: parseInt(e.target.value) || 0 })}
                    className="rounded-xl"
                  />
                  <p className="text-xs text-gray-500">
                    {t('compSet.autoCancellationDesc')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>{t('compSet.cancellationFee')}</Label>
                  <Input
                    type="number"
                    value={settings.cancellation_fee_percent}
                    onChange={(e) => setSettings({ ...settings, cancellation_fee_percent: parseInt(e.target.value) || 0 })}
                    className="rounded-xl"
                  />
                  <p className="text-xs text-gray-500">
                    {t('compSet.cancellationFeeDesc')}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('compSet.reminders')}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('compSet.reminderStudent')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.reminder_student_hours}
                    onChange={(e) => setSettings({ ...settings, reminder_student_hours: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="rounded-xl"
                  />
                  <p className="text-xs text-gray-500">
                    {t('compSet.reminderStudentDesc')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>{t('compSet.reminderTutor')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.reminder_tutor_hours}
                    onChange={(e) => setSettings({ ...settings, reminder_tutor_hours: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="rounded-xl"
                  />
                  <p className="text-xs text-gray-500">
                    {t('compSet.reminderTutorDesc')}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('compSet.schedule')}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('compSet.breakBetween')}</Label>
                  <Input
                    type="number"
                    value={settings.break_between_lessons}
                    onChange={(e) => setSettings({ ...settings, break_between_lessons: parseInt(e.target.value) || 0 })}
                    className="rounded-xl"
                  />
                  <p className="text-xs text-gray-500">
                    {t('compSet.breakBetweenDesc')}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>{t('compSet.minBooking')}</Label>
                  <Input
                    type="number"
                    value={settings.min_booking_hours}
                    onChange={(e) => setSettings({ ...settings, min_booking_hours: parseInt(e.target.value) || 0 })}
                    className="rounded-xl"
                  />
                  <p className="text-xs text-gray-500">
                    {t('compSet.minBookingDesc')}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('compSet.companyTutors')}</h2>
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl mb-6 space-y-4">
                <div>
                  <Label className="text-sm font-semibold text-gray-900">{t('compSet.editScopeLabel')}</Label>
                  <p className="text-xs text-gray-500 mt-1 mb-2">
                    {t('compSet.editScopeDesc')}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600"
                      checked={lessonEditScope.subjects}
                      onChange={(e) =>
                        setLessonEditScope((s) => ({ ...s, subjects: e.target.checked }))
                      }
                    />
                    <span>{t('compSet.scopeSubjects')}</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600"
                      checked={lessonEditScope.pricing}
                      onChange={(e) =>
                        setLessonEditScope((s) => ({ ...s, pricing: e.target.checked }))
                      }
                    />
                    <span>{t('compSet.scopePricing')}</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600"
                      checked={lessonEditScope.cancellation}
                      onChange={(e) =>
                        setLessonEditScope((s) => ({ ...s, cancellation: e.target.checked }))
                      }
                    />
                    <span>{t('compSet.scopeCancellation')}</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600"
                      checked={lessonEditScope.break_between_lessons}
                      onChange={(e) =>
                        setLessonEditScope((s) => ({ ...s, break_between_lessons: e.target.checked }))
                      }
                    />
                    <span>{t('compSet.scopeBreak')}</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600"
                      checked={lessonEditScope.min_booking_hours}
                      onChange={(e) =>
                        setLessonEditScope((s) => ({ ...s, min_booking_hours: e.target.checked }))
                      }
                    />
                    <span>{t('compSet.scopeMinBooking')}</span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600"
                      checked={lessonEditScope.reminders}
                      onChange={(e) =>
                        setLessonEditScope((s) => ({ ...s, reminders: e.target.checked }))
                      }
                    />
                    <span>{t('compSet.scopeReminders')}</span>
                  </label>
                </div>
              </div>

              <div className="p-4 bg-sky-50 border border-sky-100 rounded-xl mb-6 space-y-3">
                <div>
                  <Label className="text-sm font-semibold text-gray-900">
                    {t('compSet.manualStudentPayments')}
                  </Label>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('compSet.manualStudentPaymentsDesc')}
                  </p>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableManualStudentPayments}
                    onChange={(e) => setEnableManualStudentPayments(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">
                    {t('compSet.enableManualStudentPayments')}
                  </span>
                </label>
                {enableManualStudentPayments && (
                  <p className="text-xs text-sky-800 bg-sky-100 border border-sky-200 rounded-lg px-3 py-2">
                    {t('compSet.manualStudentPaymentsActive')}
                  </p>
                )}
              </div>

              <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('compSet.tutorPay')}</h2>
              <div className="space-y-2">
                <Label>{t('compSet.defaultPay')}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={settings.company_commission_percent}
                    onChange={(e) => setSettings({ ...settings, company_commission_percent: parseInt(e.target.value) || 0 })}
                    className="rounded-xl w-32"
                  />
                  <span className="text-sm text-gray-500">{t('compSet.eurPerLesson')}</span>
                </div>
                <p className="text-xs text-gray-500">
                  {t('compSet.payDesc')}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <Button onClick={handleSave} disabled={saving} className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700">
                <Save className="w-4 h-4" />
                {saving ? t('compSet.saving') : t('compSet.saveSettings')}
              </Button>
            </div>
          </div>
        </div>
      </div>
      {/* Subject Dialog */}
      <Dialog open={isSubjectDialogOpen} onOpenChange={setIsSubjectDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSubject ? t('compSet.editSubject') : t('compSet.addNewSubject')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>{t('compSet.subjectNameLabel')}</Label>
              <Input
                placeholder={t('compSet.subjectNamePlaceholder')}
                value={newSubject.name}
                onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                className="rounded-xl"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>{t('compSet.tutorsOptional')}</Label>
              {orgTutors.length === 0 ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                  {t('compSet.noTutorsTemplateHint')}
                </p>
              ) : (
                <div className="border rounded-xl p-3 space-y-2 max-h-40 overflow-y-auto">
                  {orgTutors.map(tutor => (
                    <label key={tutor.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTutorIds.includes(tutor.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTutorIds(prev => [...prev, tutor.id]);
                          } else {
                            setSelectedTutorIds(prev => prev.filter(id => id !== tutor.id));
                          }
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                      />
                      <span className="text-sm">{tutor.full_name}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500">
                {editingSubject?.isOrgTemplate
                  ? t('compSet.templateAssignHint')
                  : editingSubject
                    ? t('compSet.editAssignHint')
                    : t('compSet.newSubjectHint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('compSet.meetingLink')}</Label>
              <Input
                placeholder="https://meet.google.com/..."
                value={newSubject.meeting_link}
                onChange={(e) => setNewSubject({ ...newSubject, meeting_link: e.target.value })}
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('compSet.duration')}</Label>
                <Input
                  type="number"
                  value={newSubject.duration_minutes}
                  onChange={(e) => setNewSubject({ ...newSubject, duration_minutes: parseInt(e.target.value) || 60 })}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('compSet.price')}</Label>
                <Input
                  type="number"
                  value={newSubject.price}
                  onChange={(e) => setNewSubject({ ...newSubject, price: parseFloat(e.target.value) || 0 })}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('compSet.color')}</Label>
              <div className="flex gap-2 flex-wrap">
                {SUBJECT_COLOR_VALUES.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewSubject({ ...newSubject, color })}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${newSubject.color === color ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('compSet.gradeFrom')}</Label>
                <Select
                  value={newSubject.grade_min?.toString() ?? 'none'}
                  onValueChange={(v) => setNewSubject({ ...newSubject, grade_min: (v && v !== 'none') ? parseInt(v) : null })}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={t('compSet.allGrades')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('compSet.allGrades')}</SelectItem>
                    {Array.from({ length: 13 }, (_, i) => i + 1).map(n => (
                      <SelectItem key={n} value={n.toString()}>{n <= 12 ? t('compSet.grade', { label: String(n) }) : t('compSet.university')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('compSet.gradeTo')}</Label>
                <Select
                  value={newSubject.grade_max?.toString() ?? 'none'}
                  onValueChange={(v) => setNewSubject({ ...newSubject, grade_max: (v && v !== 'none') ? parseInt(v) : null })}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder={t('compSet.allGrades')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('compSet.allGrades')}</SelectItem>
                    {Array.from({ length: 13 }, (_, i) => i + 1).map(n => (
                      <SelectItem key={n} value={n.toString()}>{n <= 12 ? t('compSet.grade', { label: String(n) }) : t('compSet.university')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newSubject.is_group}
                  onChange={(e) => setNewSubject({ ...newSubject, is_group: e.target.checked, max_students: e.target.checked ? (newSubject.max_students || 5) : null })}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                />
                <span className="text-sm font-medium">{t('compSet.groupCheckbox')}</span>
              </label>
              {newSubject.is_group && (
                <div className="space-y-2 mt-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-900">{t('lessonSet.important')}</p>
                        <p className="text-xs text-amber-800 mt-1" dangerouslySetInnerHTML={{ __html: t('lessonSet.groupDesc') }} />
                      </div>
                    </div>
                  </div>
                  <Label>{t('compSet.maxStudents')}</Label>
                  <Input
                    type="number"
                    min={2}
                    value={newSubject.max_students ?? 5}
                    onChange={(e) => setNewSubject({ ...newSubject, max_students: parseInt(e.target.value) || 5 })}
                    className="rounded-xl"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSubjectDialogOpen(false)}>{t('compSet.cancelBtn')}</Button>
            <Button onClick={handleSaveSubject} disabled={savingSubject || !newSubject.name.trim()}>
              {savingSubject ? t('compSet.saving') : editingSubject ? t('compSet.saveBtn') : t('compSet.createBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
