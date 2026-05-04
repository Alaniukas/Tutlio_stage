import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Building2, Lock, Plus, Eye, EyeOff, ArrowLeft, List, Pencil, FileText, Users } from 'lucide-react';
import { FEATURE_REGISTRY, FEATURE_CATEGORIES, getFeaturesByCategory } from '@/lib/featureRegistry';
import { useTranslation } from '@/lib/i18n';
import AdminBlogPanel from '@/components/admin/AdminBlogPanel';
type Step = 'lock' | 'panel';

interface FormState {
  orgName: string;
  orgEmail: string;
  tutorLicenseCount: number;
  adminEmail: string;
  adminPassword: string;
}

interface SchoolFormState {
  schoolName: string;
  schoolEmail: string;
  adminEmail: string;
  adminPassword: string;
}

interface OrgAdminStats {
  lessons_occurred: number;
  paid_revenue_eur: number;
  platform_fee_2pct_eur: number;
}

interface OrgListRow {
  id: string;
  name: string;
  email: string;
  tutor_license_count?: number;
  status: string;
  features: Record<string, unknown>;
  tutor_count: number;
  student_count: number;
  lessons_occurred: number;
  paid_revenue_eur: number;
  platform_fee_2pct_eur: number;
  created_at?: string;
}

interface TutorRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

interface ArchivedTutorRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface StudentRow {
  id: string;
  full_name: string;
  email: string | null;
  tutor_id: string;
}

interface AuditRow {
  id: string;
  created_at: string;
  action: string;
  details: Record<string, unknown>;
}

type PanelView = 'list' | 'create' | 'createSchool' | 'detail' | 'blog' | 'soloTutors';

interface SoloTutorAdminRow {
  id: string;
  full_name: string | null;
  email: string | null;
  subscription_plan: string | null;
  subscription_status: string | null;
  enable_manual_student_payments: boolean;
  effective_manual_student_payments: boolean;
}

export default function AdminPanel() {
  const { t, locale } = useTranslation();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const [step, setStep] = useState<Step>('lock');
  const [secretInput, setSecretInput] = useState('');
  const [platformAdminSecret, setPlatformAdminSecret] = useState('');
  const [lockError, setLockError] = useState(false);

  const [form, setForm] = useState<FormState>({
    orgName: '',
    orgEmail: '',
    tutorLicenseCount: 5,
    adminEmail: '',
    adminPassword: '',
  });
  const [schoolForm, setSchoolForm] = useState<SchoolFormState>({
    schoolName: '',
    schoolEmail: '',
    adminEmail: '',
    adminPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const [panelView, setPanelView] = useState<PanelView>('list');
  const [orgList, setOrgList] = useState<OrgListRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTutors, setDetailTutors] = useState<TutorRow[]>([]);
  const [detailArchivedTutors, setDetailArchivedTutors] = useState<ArchivedTutorRow[]>([]);
  const [detailStudents, setDetailStudents] = useState<StudentRow[]>([]);
  const [detailAudit, setDetailAudit] = useState<AuditRow[]>([]);
  const [editTutorLicenseCount, setEditTutorLicenseCount] = useState(0);
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');
  const [editFeatures, setEditFeatures] = useState<Record<string, boolean>>({});
  const [detailName, setDetailName] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [archiveLoadingTutorId, setArchiveLoadingTutorId] = useState<string | null>(null);
  const [unarchiveLoadingTutorId, setUnarchiveLoadingTutorId] = useState<string | null>(null);
  const [detailFeaturesBase, setDetailFeaturesBase] = useState<Record<string, unknown>>({});
  const [editManualPaymentUrl, setEditManualPaymentUrl] = useState('');
  const [detailStats, setDetailStats] = useState<OrgAdminStats | null>(null);
  const [soloTutors, setSoloTutors] = useState<SoloTutorAdminRow[]>([]);
  const [soloListLoading, setSoloListLoading] = useState(false);
  const [soloToggleLoadingId, setSoloToggleLoadingId] = useState<string | null>(null);

  const fetchOrgList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch('/api/admin-organizations', {
        headers: { 'x-admin-secret': platformAdminSecret },
      });
      const data = await res.json();
      if (res.ok && data.organizations) {
        setOrgList(data.organizations);
        setOverviewLoaded(false);
      }
      else setResult({ success: false, message: data.error || tRef.current('admin.failedToLoad') });
    } catch {
      setResult({ success: false, message: tRef.current('admin.serverError') });
    }
    setListLoading(false);
  }, [platformAdminSecret]);

  const loadOverviewStats = useCallback(async () => {
    if (!platformAdminSecret || overviewLoading) return;
    setOverviewLoading(true);
    setResult(null);
    try {
      const ids = orgList.map((o) => o.id).filter(Boolean);
      if (ids.length === 0) {
        setOverviewLoaded(true);
        return;
      }

      const next = new Map<string, Partial<OrgListRow>>();
      const concurrency = 6;
      for (let i = 0; i < ids.length; i += concurrency) {
        const batch = ids.slice(i, i + concurrency);
        const results = await Promise.all(
          batch.map(async (id) => {
            const res = await fetch(`/api/admin-organizations?id=${encodeURIComponent(id)}`, {
              headers: { 'x-admin-secret': platformAdminSecret },
            });
            const data = await res.json().catch(() => ({}));
            return { id, ok: res.ok, data };
          }),
        );
        for (const r of results) {
          if (!r.ok) continue;
          const s = r.data?.stats || {};
          next.set(r.id, {
            tutor_count: Number(s.tutor_count) || 0,
            student_count: Number(s.student_count) || 0,
            lessons_occurred: Number(s.lessons_occurred) || 0,
            paid_revenue_eur: Number(s.paid_revenue_eur) || 0,
            platform_fee_2pct_eur: Number(s.platform_fee_2pct_eur) || 0,
          });
        }
      }

      if (next.size > 0) {
        setOrgList((prev) =>
          prev.map((o) => {
            const patch = next.get(o.id);
            return patch ? ({ ...o, ...patch } as OrgListRow) : o;
          }),
        );
      }
      setOverviewLoaded(true);
    } catch {
      setResult({ success: false, message: tRef.current('admin.failedToLoad') });
    } finally {
      setOverviewLoading(false);
    }
  }, [orgList, overviewLoading, platformAdminSecret]);

  const totals = useMemo(() => {
    const revenue = orgList.reduce((s, o) => s + (Number(o.paid_revenue_eur) || 0), 0);
    const fee = orgList.reduce((s, o) => s + (Number(o.platform_fee_2pct_eur) || 0), 0);
    const students = orgList.reduce((s, o) => s + (Number(o.student_count) || 0), 0);
    const tutors = orgList.reduce((s, o) => s + (Number(o.tutor_count) || 0), 0);
    const lessons = orgList.reduce((s, o) => s + (Number(o.lessons_occurred) || 0), 0);
    return { revenue, fee, students, tutors, lessons };
  }, [orgList]);

  const fetchSoloTutors = useCallback(async () => {
    setSoloListLoading(true);
    try {
      const res = await fetch('/api/admin-individual-tutors', {
        headers: { 'x-admin-secret': platformAdminSecret },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.tutors)) setSoloTutors(data.tutors as SoloTutorAdminRow[]);
      else setResult({ success: false, message: data.error || tRef.current('admin.failedToLoad') });
    } catch {
      setResult({ success: false, message: tRef.current('admin.serverError') });
    }
    setSoloListLoading(false);
  }, [platformAdminSecret]);

  useEffect(() => {
    if (step === 'panel' && panelView === 'list') void fetchOrgList();
  }, [step, panelView, fetchOrgList]);

  // Auto-hydrate list stats (students/tutors/revenue/fees) without requiring any button click.
  useEffect(() => {
    if (step !== 'panel' || panelView !== 'list') return;
    if (!platformAdminSecret) return;
    if (listLoading) return;
    if (orgList.length === 0) return;
    if (overviewLoaded) return;
    if (overviewLoading) return;
    void loadOverviewStats();
  }, [
    step,
    panelView,
    platformAdminSecret,
    listLoading,
    orgList.length,
    overviewLoaded,
    overviewLoading,
    loadOverviewStats,
  ]);

  useEffect(() => {
    if (step === 'panel' && panelView === 'soloTutors') void fetchSoloTutors();
  }, [step, panelView, fetchSoloTutors]);

  const toggleSoloManualPayments = async (row: SoloTutorAdminRow) => {
    const next = !row.enable_manual_student_payments;
    setSoloToggleLoadingId(row.id);
    setResult(null);
    try {
      const res = await fetch('/api/admin-individual-tutors', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': platformAdminSecret,
        },
        body: JSON.stringify({ tutor_id: row.id, enable_manual_student_payments: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ success: false, message: data.error || tRef.current('admin.failedToSave') });
      } else {
        setResult({ success: true, message: tRef.current('admin.saved') });
        await fetchSoloTutors();
      }
    } catch {
      setResult({ success: false, message: tRef.current('admin.serverError') });
    } finally {
      setSoloToggleLoadingId(null);
    }
  };

  const openDetail = async (id: string) => {
    setDetailId(id);
    setPanelView('detail');
    setDetailLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin-organizations?id=${encodeURIComponent(id)}`, {
        headers: { 'x-admin-secret': platformAdminSecret },
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ success: false, message: data.error || tRef.current('common.error') });
        setDetailStats(null);
        setDetailLoading(false);
        return;
      }
      const org = data.organization;
      setDetailStats(
        data.stats && typeof data.stats === 'object'
          ? {
              lessons_occurred: Number(data.stats.lessons_occurred) || 0,
              paid_revenue_eur: Number(data.stats.paid_revenue_eur) || 0,
              platform_fee_2pct_eur: Number(data.stats.platform_fee_2pct_eur) || 0,
            }
          : null
      );
      setDetailName(org.name);
      setEditTutorLicenseCount(Number(org.tutor_license_count) || 0);
      setEditStatus(org.status === 'suspended' ? 'suspended' : 'active');

      const orgFeatures = org.features && typeof org.features === 'object' ? org.features : {};
      const mergedFeatures: Record<string, boolean> = {};
      Object.entries(FEATURE_REGISTRY).forEach(([featureId, definition]) => {
        let v = orgFeatures[featureId] as boolean | undefined;
        if (featureId === 'manual_payments' && v === undefined) {
          v = orgFeatures.enable_manual_student_payments as boolean | undefined;
        }
        mergedFeatures[featureId] = v ?? definition.defaultValue;
      });
      setEditFeatures(mergedFeatures);
      setDetailFeaturesBase(orgFeatures as Record<string, unknown>);
      const mpUrl = (orgFeatures as Record<string, unknown>).manual_payment_url;
      setEditManualPaymentUrl(typeof mpUrl === 'string' ? mpUrl : '');
      setDetailTutors(data.tutors || []);
      setDetailArchivedTutors(data.archived_tutors || []);
      setDetailStudents(data.students || []);
      setDetailAudit(data.audit || []);
    } catch {
      setResult({ success: false, message: tRef.current('admin.serverError') });
      setDetailStats(null);
    }
    setDetailLoading(false);
  };

  const saveDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailId) return;

    setSaveLoading(true);
    setResult(null);
    try {
      const merged: Record<string, unknown> = {
        ...detailFeaturesBase,
        ...editFeatures,
      };
      const trimmedUrl = editManualPaymentUrl.trim();
      if (trimmedUrl) merged.manual_payment_url = trimmedUrl;
      else delete merged.manual_payment_url;

      const manualOn = !!editFeatures.manual_payments;
      merged.manual_payments = manualOn;
      merged.enable_manual_student_payments = manualOn;

      const res = await fetch(`/api/admin-organizations?id=${encodeURIComponent(detailId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': platformAdminSecret,
        },
        body: JSON.stringify({
          tutor_license_count: editTutorLicenseCount,
          status: editStatus,
          features: merged,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, message: tRef.current('admin.saved') });
        void openDetail(detailId);
        void fetchOrgList();
      } else {
        setResult({ success: false, message: data.error || tRef.current('admin.failedToSave') });
      }
    } catch {
      setResult({ success: false, message: tRef.current('admin.serverError') });
    }
    setSaveLoading(false);
  };

  const archiveTutorFromAdmin = async (tutor: TutorRow) => {
    if (!detailId) return;
    const label = tutor.full_name || tutor.email || tutor.id;
    const confirmed = window.confirm(
      `Archyvuoti korepetitorių "${label}"?\n\nPaskyra nebus ištrinta, bet bus atkabinta nuo įmonės ir dings iš org admin pusės.`
    );
    if (!confirmed) return;

    setArchiveLoadingTutorId(tutor.id);
    setResult(null);
    try {
      const res = await fetch(`/api/admin-organizations?id=${encodeURIComponent(detailId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': platformAdminSecret,
        },
        body: JSON.stringify({
          action: 'archive_tutor',
          tutor_id: tutor.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ success: false, message: data.error || tRef.current('admin.failedToSave') });
      } else {
        setResult({ success: true, message: 'Korepetitorius suarchyvuotas.' });
        await openDetail(detailId);
        await fetchOrgList();
      }
    } catch {
      setResult({ success: false, message: tRef.current('admin.serverError') });
    } finally {
      setArchiveLoadingTutorId(null);
    }
  };

  const unarchiveTutorFromAdmin = async (tutor: ArchivedTutorRow) => {
    if (!detailId) return;
    const label = tutor.full_name || tutor.email || tutor.id;
    const confirmed = window.confirm(
      `Atarchyvuoti korepetitorių "${label}"?\n\nJis bus grąžintas atgal į šią įmonę, o anksčiau atkabinti jo mokiniai bus vėl priskirti jam.`
    );
    if (!confirmed) return;

    setUnarchiveLoadingTutorId(tutor.id);
    setResult(null);
    try {
      const res = await fetch(`/api/admin-organizations?id=${encodeURIComponent(detailId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': platformAdminSecret,
        },
        body: JSON.stringify({
          action: 'unarchive_tutor',
          tutor_id: tutor.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ success: false, message: data.error || tRef.current('admin.failedToSave') });
      } else {
        setResult({ success: true, message: 'Korepetitorius atarchyvuotas.' });
        await openDetail(detailId);
        await fetchOrgList();
      }
    } catch {
      setResult({ success: false, message: tRef.current('admin.serverError') });
    } finally {
      setUnarchiveLoadingTutorId(null);
    }
  };

  const toggleFeature = (featureId: string) => {
    setEditFeatures(prev => ({
      ...prev,
      [featureId]: !prev[featureId],
    }));
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLockError(false);
    try {
      const res = await fetch('/api/admin-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secretInput }),
      });
      if (res.ok) {
        setPlatformAdminSecret(secretInput);
        setSecretInput('');
        setStep('panel');
      } else {
        setLockError(true);
      }
    } catch {
      setLockError(true);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/create-company', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': platformAdminSecret,
        },
        body: JSON.stringify({
          orgName: form.orgName.trim(),
          orgEmail: form.orgEmail.trim(),
          tutorLicenseCount: form.tutorLicenseCount,
          adminEmail: form.adminEmail.trim(),
          adminPassword: form.adminPassword,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult({ success: true, message: tRef.current('admin.companyCreated', { name: form.orgName, email: form.adminEmail }) });
        setForm({ orgName: '', orgEmail: '', tutorLicenseCount: 5, adminEmail: '', adminPassword: '' });
        void fetchOrgList();
        setPanelView('list');
      } else {
        setResult({ success: false, message: data.error || tRef.current('admin.failedToCreate') });
      }
    } catch {
      setResult({ success: false, message: tRef.current('admin.serverError') });
    }

    setLoading(false);
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/create-school', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': platformAdminSecret,
        },
        body: JSON.stringify({
          schoolName: schoolForm.schoolName.trim(),
          schoolEmail: schoolForm.schoolEmail.trim(),
          adminEmail: schoolForm.adminEmail.trim(),
          adminPassword: schoolForm.adminPassword,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult({
          success: true,
          message: tRef.current('admin.schoolCreated', { name: schoolForm.schoolName.trim(), email: schoolForm.adminEmail.trim() }),
        });
        setSchoolForm({ schoolName: '', schoolEmail: '', adminEmail: '', adminPassword: '' });
        setPanelView('list');
      } else {
        setResult({ success: false, message: data.error || tRef.current('admin.failedToCreate') });
      }
    } catch {
      setResult({ success: false, message: tRef.current('admin.serverError') });
    }

    setLoading(false);
  };

  if (step === 'lock') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">Tutlio Admin</h1>
            <p className="text-slate-400 text-sm mt-1">{t('admin.enterPassword')}</p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-3">
            <Input
              type="password"
              placeholder="••••••••••••"
              value={secretInput}
              onChange={(e) => { setSecretInput(e.target.value); setLockError(false); }}
              className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl h-11 text-center text-lg tracking-widest"
              autoFocus
            />
            {lockError && (
              <p className="text-red-400 text-xs text-center">{t('admin.wrongPassword')}</p>
            )}
            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors"
            >
              {t('admin.enter')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Tutlio Admin</h1>
            <p className="text-slate-400 text-xs">{t('admin.settings')}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            type="button"
            onClick={() => { setPanelView('list'); setDetailId(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${panelView === 'list' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
          >
            <List className="w-4 h-4" />
            {t('admin.companies')}
          </button>
          <button
            type="button"
            onClick={() => { setPanelView('soloTutors'); setDetailId(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${panelView === 'soloTutors' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
          >
            <Users className="w-4 h-4" />
            {t('admin.soloTutors')}
          </button>
          <button
            type="button"
            onClick={() => { setPanelView('create'); setDetailId(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${panelView === 'create' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
          >
            <Plus className="w-4 h-4" />
            {t('admin.newCompany')}
          </button>
          <button
            type="button"
            onClick={() => { setPanelView('createSchool'); setDetailId(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${panelView === 'createSchool' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
          >
            <Plus className="w-4 h-4" />
            {t('admin.newSchool')}
          </button>
          <button
            type="button"
            onClick={() => { setPanelView('blog'); setDetailId(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${panelView === 'blog' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
          >
            <FileText className="w-4 h-4" />
            Blog
          </button>
        </div>

        {result && (
          <div className={`flex items-start gap-3 rounded-xl px-4 py-3 mb-5 text-sm ${result.success ? 'bg-green-900/50 border border-green-700 text-green-300' : 'bg-red-900/50 border border-red-700 text-red-300'}`}>
            {result.success
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            <span>{result.message}</span>
          </div>
        )}

        {panelView === 'soloTutors' && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">{t('admin.soloTutorsSubtitle')}</p>
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              {soloListLoading ? (
                <div className="p-8 text-center text-slate-400 text-sm">{t('common.loadingDots')}</div>
              ) : soloTutors.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">—</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-slate-400">
                        <th className="px-4 py-3 font-medium">{t('admin.thName')}</th>
                        <th className="px-4 py-3 font-medium">Email</th>
                        <th className="px-4 py-3 font-medium whitespace-nowrap">{t('admin.platformPlan')}</th>
                        <th className="px-4 py-3 font-medium whitespace-nowrap">{t('admin.platformSubStatus')}</th>
                        <th className="px-4 py-3 font-medium whitespace-nowrap">{t('admin.colManualEffective')}</th>
                        <th className="px-4 py-3 font-medium whitespace-nowrap">{t('admin.colManualPayments')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {soloTutors.map((row) => (
                        <tr key={row.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-4 py-3 font-medium text-white">{row.full_name || '—'}</td>
                          <td className="px-4 py-3 text-slate-300 truncate max-w-[200px]">{row.email || '—'}</td>
                          <td className="px-4 py-3 text-slate-300 font-mono text-xs">{row.subscription_plan || '—'}</td>
                          <td className="px-4 py-3 text-slate-300 text-xs">{row.subscription_status || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={row.effective_manual_student_payments ? 'text-emerald-400' : 'text-slate-500'}>
                              {row.effective_manual_student_payments ? 'ON' : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              disabled={soloToggleLoadingId === row.id}
                              onClick={() => void toggleSoloManualPayments(row)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                                row.enable_manual_student_payments ? 'bg-indigo-600' : 'bg-white/20'
                              } ${soloToggleLoadingId === row.id ? 'opacity-60' : ''}`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  row.enable_manual_student_payments ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {panelView === 'list' && (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {listLoading ? (
              <div className="p-8 text-center text-slate-400 text-sm">{t('common.loadingDots')}</div>
            ) : orgList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">{t('admin.noCompanies')}</div>
            ) : (
              <>
                <div className="p-4 border-b border-white/10">
                  <div className="text-sm text-slate-300">
                    {overviewLoading ? (
                      <span className="text-slate-400">Skaičiuojama suvestinė…</span>
                    ) : overviewLoaded ? (
                      <span className="text-emerald-300">Suvestinė įkelta</span>
                    ) : (
                      <span className="text-slate-400">Ruošiama suvestinė…</span>
                    )}
                  </div>
                </div>
                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-white/10">
                  {orgList.map((o) => {
                    const enabledFeatures = o.features && typeof o.features === 'object'
                      ? Object.values(o.features).filter(v => v === true).length
                      : 0;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className="w-full text-left p-4 hover:bg-white/5 transition-colors"
                        onClick={() => void openDetail(o.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-white truncate">{o.name}</p>
                            <p className="text-xs text-slate-400 truncate">{o.email || '—'}</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <span className="rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-slate-300">
                                {t('admin.tutorLicenseCount')}: {o.tutor_license_count ?? 0}
                              </span>
                              <span className="rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-slate-300">
                                {t('admin.students')}: {o.student_count}
                              </span>
                              <span className="rounded-lg bg-white/5 border border-white/10 px-2 py-1 text-slate-300 tabular-nums">
                                {t('admin.revenue')}: {(o.paid_revenue_eur ?? 0).toLocaleString('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-2">
                              {enabledFeatures > 0 ? t('admin.featEnabled', { count: enabledFeatures }) : t('admin.noFeatures')} ·{' '}
                              <span className={o.status === 'suspended' ? 'text-amber-400' : 'text-emerald-400'}>
                                {o.status === 'suspended' ? t('admin.suspended') : t('admin.activeStatus')}
                              </span>
                            </p>
                          </div>
                          <span className="text-indigo-400 text-xs font-semibold flex-shrink-0">{t('admin.details')}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-slate-400">
                      <th className="px-4 py-3 font-medium">{t('admin.thName')}</th>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">Korepet.</th>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">{t('admin.tutorLicenseCount')}</th>
                      <th className="px-4 py-3 font-medium">{t('admin.thStudents')}</th>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">{t('admin.thLessons')}</th>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">{t('admin.thRevenue')}</th>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">{t('admin.thFee')}</th>
                      <th className="px-4 py-3 font-medium">{t('admin.thFeatures')}</th>
                      <th className="px-4 py-3 font-medium">{t('admin.thStatus')}</th>
                      <th className="px-4 py-3 font-medium w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {orgList.map((o) => {
                      const enabledFeatures = o.features && typeof o.features === 'object'
                        ? Object.values(o.features).filter(v => v === true).length
                        : 0;
                      return (
                        <tr key={o.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-4 py-3 font-medium">{o.name}</td>
                          <td className="px-4 py-3 text-slate-300 tabular-nums">{o.tutor_count ?? 0}</td>
                          <td className="px-4 py-3 text-slate-300 tabular-nums">{o.tutor_license_count ?? 0}</td>
                          <td className="px-4 py-3 text-slate-300">{o.student_count}</td>
                          <td className="px-4 py-3 text-slate-300 tabular-nums">{o.lessons_occurred ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-300 tabular-nums">
                            {(o.paid_revenue_eur ?? 0).toLocaleString('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-slate-300 tabular-nums">
                            {(o.platform_fee_2pct_eur ?? 0).toLocaleString('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-slate-300">
                            {enabledFeatures > 0 ? (
                              <span className="text-indigo-400">{t('admin.featEnabled', { count: enabledFeatures })}</span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={o.status === 'suspended' ? 'text-amber-400' : 'text-emerald-400'}>
                              {o.status === 'suspended' ? t('admin.suspended') : t('admin.activeStatus')}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => void openDetail(o.id)}
                              className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              {t('admin.details')}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </>
            )}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 h-fit lg:sticky lg:top-4">
              <p className="text-sm font-semibold text-white mb-3">Bendra suvestinė</p>
              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between text-slate-300">
                  <span>Mokiniai</span>
                  <span className="tabular-nums font-semibold">{totals.students}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Korepetitoriai</span>
                  <span className="tabular-nums font-semibold">{totals.tutors}</span>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <span>Pamokos</span>
                  <span className="tabular-nums font-semibold">{totals.lessons}</span>
                </div>
                <div className="h-px bg-white/10 my-2" />
                <div className="flex items-center justify-between text-slate-200">
                  <span>Pajamos</span>
                  <span className="tabular-nums font-bold">
                    {totals.revenue.toLocaleString('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-200">
                  <span>Platformos mokestis (2%)</span>
                  <span className="tabular-nums font-bold">
                    {totals.fee.toLocaleString('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </span>
                </div>
              </div>
              {overviewLoading && (
                <p className="text-[11px] text-slate-400 mt-3">
                  Kraunama… (šis skaičiavimas gali užtrukti kelias sekundes)
                </p>
              )}
            </div>
          </div>
        )}

        {panelView === 'detail' && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => { setPanelView('list'); setDetailId(null); }}
              className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('admin.backToList')}
            </button>

            {detailLoading ? (
              <div className="text-slate-400 text-sm py-8">{t('common.loadingDots')}</div>
            ) : (
              <>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <h2 className="text-sm font-semibold text-slate-300 mb-4">{detailName}</h2>
                  {detailStats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                      <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('admin.students')}</p>
                        <p className="text-lg font-semibold text-white tabular-nums">{detailStudents.length}</p>
                      </div>
                      <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('admin.lessonsOccurred')}</p>
                        <p className="text-lg font-semibold text-white tabular-nums">{detailStats.lessons_occurred}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{t('admin.lessonsOccurredDesc')}</p>
                      </div>
                      <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('admin.paidRevenue')}</p>
                        <p className="text-lg font-semibold text-emerald-300 tabular-nums">
                          {detailStats.paid_revenue_eur.toLocaleString('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{t('admin.paidRevenueDesc')}</p>
                      </div>
                      <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-amber-200/90">{t('admin.platformFee')}</p>
                        <p className="text-lg font-semibold text-amber-200 tabular-nums">
                          {detailStats.platform_fee_2pct_eur.toLocaleString('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </p>
                      </div>
                    </div>
                  )}
                  <form onSubmit={saveDetail} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-slate-300">{t('admin.tutorLicenseCount')}</Label>
                        <Input
                          type="number"
                          min={0}
                          max={10000}
                          value={editTutorLicenseCount}
                          onChange={(e) => setEditTutorLicenseCount(Math.max(0, Number(e.target.value) || 0))}
                          className="bg-white/10 border-white/20 text-white rounded-xl"
                        />
                        <p className="text-[11px] text-slate-400">{t('admin.tutorLicenseCountHint')}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-slate-300">{t('admin.status')}</Label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as 'active' | 'suspended')}
                          className="w-full h-10 rounded-xl bg-white/10 border border-white/20 text-white px-3 text-sm"
                        >
                          <option value="active">{t('admin.activeFull')}</option>
                          <option value="suspended">{t('admin.suspendedFull')}</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-slate-300 text-base font-semibold">{t('admin.features')}</Label>
                        <p className="text-xs text-slate-400 mt-1">{t('admin.featuresDesc')}</p>
                      </div>
                      {Object.entries(getFeaturesByCategory()).map(([category, features]) => (
                        <div key={category} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{FEATURE_CATEGORIES[category as keyof typeof FEATURE_CATEGORIES].icon}</span>
                            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                              {locale === 'en' ? FEATURE_CATEGORIES[category as keyof typeof FEATURE_CATEGORIES].nameEn : FEATURE_CATEGORIES[category as keyof typeof FEATURE_CATEGORIES].name}
                            </h3>
                          </div>
                          <div className="space-y-2 pl-8">
                            {features.map(feature => (
                              <div key={feature.id} className="flex items-start justify-between gap-3 py-2 border-b border-white/5">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-white">{locale === 'en' ? feature.nameEn : feature.name}</p>
                                    {feature.pricingTier && (
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        feature.pricingTier === 'enterprise' ? 'bg-purple-500/20 text-purple-300' :
                                        feature.pricingTier === 'premium' ? 'bg-blue-500/20 text-blue-300' :
                                        'bg-green-500/20 text-green-300'
                                      }`}>
                                        {feature.pricingTier}
                                      </span>
                                    )}
                                    {feature.requiresSetup && (
                                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                                        {t('admin.needsSetup')}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-400 mt-0.5">{locale === 'en' ? feature.descriptionEn : feature.description}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleFeature(feature.id)}
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                                    editFeatures[feature.id] ? 'bg-indigo-600' : 'bg-white/20'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                      editFeatures[feature.id] ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
                      <div>
                        <Label className="text-slate-200 text-sm font-semibold">{t('admin.manualPaymentsTitle')}</Label>
                        <p className="text-xs text-slate-400 mt-1">{t('admin.manualPaymentsDesc')}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-slate-400 text-xs">{t('admin.paymentPageUrl')}</Label>
                        <Input
                          type="url"
                          inputMode="url"
                          placeholder="https://example.com/apmoketi"
                          value={editManualPaymentUrl}
                          onChange={(e) => setEditManualPaymentUrl(e.target.value)}
                          className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl"
                        />
                        <p className="text-[11px] text-slate-500">{t('admin.leaveEmptyNoButton')}</p>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={saveLoading}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl font-semibold text-sm"
                    >
                      {saveLoading ? t('common.saving') : t('common.save')}
                    </button>
                  </form>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('admin.tutorsCount', { count: detailTutors.length })}</h3>
                  <ul className="space-y-2 text-sm text-slate-300 max-h-48 overflow-y-auto">
                    {detailTutors.map((tu) => (
                      <li key={tu.id} className="flex justify-between gap-2 border-b border-white/5 pb-2">
                        <div className="min-w-0">
                          <span>{tu.full_name || '—'}</span>
                          <div className="text-slate-500 truncate text-xs">{tu.email}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void archiveTutorFromAdmin(tu)}
                          disabled={archiveLoadingTutorId === tu.id}
                          className="text-xs px-2 py-1 rounded-lg border border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {archiveLoadingTutorId === tu.id ? 'Archyvuojama...' : 'Archyvuoti'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Archyvuoti korepetitoriai ({detailArchivedTutors.length})
                  </h3>
                  {detailArchivedTutors.length === 0 ? (
                    <p className="text-sm text-slate-500">Nėra</p>
                  ) : (
                    <ul className="space-y-2 text-sm text-slate-300 max-h-48 overflow-y-auto">
                      {detailArchivedTutors.map((tu) => (
                        <li key={tu.id} className="flex justify-between gap-2 border-b border-white/5 pb-2">
                          <div className="min-w-0">
                            <span>{tu.full_name || '—'}</span>
                            <div className="text-slate-500 truncate text-xs">{tu.email || '—'}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void unarchiveTutorFromAdmin(tu)}
                            disabled={unarchiveLoadingTutorId === tu.id}
                            className="text-xs px-2 py-1 rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                          >
                            {unarchiveLoadingTutorId === tu.id ? 'Atstatoma...' : 'Atarchyvuoti'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('admin.students')} ({detailStudents.length})</h3>
                  <ul className="space-y-2 text-sm text-slate-300 max-h-64 overflow-y-auto">
                    {detailStudents.map((s) => (
                      <li key={s.id} className="flex justify-between gap-2 border-b border-white/5 pb-2">
                        <span>{s.full_name}</span>
                        <span className="text-slate-500 truncate">{s.email || '—'}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{t('admin.recentActions')}</h3>
                  <ul className="space-y-2 text-xs text-slate-400 font-mono max-h-40 overflow-y-auto">
                    {detailAudit.length === 0 ? (
                      <li>—</li>
                    ) : (
                      detailAudit.map((a) => (
                        <li key={a.id} className="border-b border-white/5 pb-2">
                          <span className="text-slate-500">{new Date(a.created_at).toLocaleString('lt-LT')}</span>
                          {' · '}
                          {a.action}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </>
            )}
          </div>
        )}

        {panelView === 'create' && (
          <form onSubmit={handleCreate} className="space-y-5 max-w-md">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('admin.companyData')}</p>

              <div className="space-y-1.5">
                <Label className="text-sm text-slate-300">{t('admin.companyName')}</Label>
                <Input
                  placeholder="UAB Korepetitoriai"
                  value={form.orgName}
                  onChange={(e) => setForm({ ...form, orgName: e.target.value })}
                  required
                  className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm text-slate-300">{t('admin.companyEmail')}</Label>
                <Input
                  type="email"
                  placeholder="info@imone.lt"
                  value={form.orgEmail}
                  onChange={(e) => setForm({ ...form, orgEmail: e.target.value })}
                  className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm text-slate-300">{t('admin.tutorLicenseCount')}</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.tutorLicenseCount}
                    onChange={(e) => setForm({ ...form, tutorLicenseCount: Number(e.target.value) })}
                    required
                    className="bg-white/10 border-white/20 text-white rounded-xl w-24"
                  />
                  <span className="text-slate-400 text-sm">{t('admin.tutorLicenseCountHint')}</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('admin.adminAccount')}</p>

              <div className="space-y-1.5">
                <Label className="text-sm text-slate-300">{t('admin.adminEmail')}</Label>
                <Input
                  type="email"
                  placeholder="admin@imone.lt"
                  value={form.adminEmail}
                  onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  required
                  className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm text-slate-300">{t('admin.adminPassword')}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('admin.min8')}
                    value={form.adminPassword}
                    onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                    required
                    minLength={8}
                    className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">{t('admin.passwordHint')}</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('admin.creating')}</>
              ) : (
                <><Plus className="w-4 h-4" /> {t('admin.createCompany')}</>
              )}
            </button>
          </form>
        )}

        {panelView === 'blog' && (
          <AdminBlogPanel adminSecret={platformAdminSecret} />
        )}

        {panelView === 'createSchool' && (
          <form onSubmit={handleCreateSchool} className="space-y-5 max-w-md">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('admin.schoolData')}</p>

              <div className="space-y-1.5">
                <Label className="text-sm text-slate-300">{t('admin.schoolNameLabel')}</Label>
                <Input
                  placeholder="Vilniaus gimnazija"
                  value={schoolForm.schoolName}
                  onChange={(e) => setSchoolForm({ ...schoolForm, schoolName: e.target.value })}
                  required
                  className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm text-slate-300">{t('admin.schoolContactEmail')}</Label>
                <Input
                  type="email"
                  placeholder="info@mokykla.lt"
                  value={schoolForm.schoolEmail}
                  onChange={(e) => setSchoolForm({ ...schoolForm, schoolEmail: e.target.value })}
                  required
                  className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl"
                />
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('admin.adminAccount')}</p>

              <div className="space-y-1.5">
                <Label className="text-sm text-slate-300">{t('admin.adminEmail')}</Label>
                <Input
                  type="email"
                  placeholder="admin@mokykla.lt"
                  value={schoolForm.adminEmail}
                  onChange={(e) => setSchoolForm({ ...schoolForm, adminEmail: e.target.value })}
                  required
                  className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm text-slate-300">{t('admin.adminPassword')}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('admin.min8')}
                    value={schoolForm.adminPassword}
                    onChange={(e) => setSchoolForm({ ...schoolForm, adminPassword: e.target.value })}
                    required
                    minLength={8}
                    className="bg-white/10 border-white/20 text-white placeholder:text-slate-500 rounded-xl pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">{t('admin.passwordHintSchool')}</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('admin.creating')}</>
              ) : (
                <><Plus className="w-4 h-4" /> {t('admin.createSchool')}</>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
