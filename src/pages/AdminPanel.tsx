import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, CheckCircle2, Building2, Lock, Plus, Eye, EyeOff, ArrowLeft, List, Pencil } from 'lucide-react';
import { FEATURE_REGISTRY, FEATURE_CATEGORIES, getFeaturesByCategory } from '@/lib/featureRegistry';
import { useTranslation } from '@/lib/i18n';
type Step = 'lock' | 'panel';

interface FormState {
  orgName: string;
  orgEmail: string;
  tutorLimit: number;
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
  tutor_limit: number;
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

type PanelView = 'list' | 'create' | 'createSchool' | 'detail';

export default function AdminPanel() {
  const { t, locale } = useTranslation();
  const [step, setStep] = useState<Step>('lock');
  const [secretInput, setSecretInput] = useState('');
  const [platformAdminSecret, setPlatformAdminSecret] = useState('');
  const [lockError, setLockError] = useState(false);

  const [form, setForm] = useState<FormState>({
    orgName: '',
    orgEmail: '',
    tutorLimit: 5,
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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTutors, setDetailTutors] = useState<TutorRow[]>([]);
  const [detailStudents, setDetailStudents] = useState<StudentRow[]>([]);
  const [detailAudit, setDetailAudit] = useState<AuditRow[]>([]);
  const [editTutorLimit, setEditTutorLimit] = useState(5);
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');
  const [editFeatures, setEditFeatures] = useState<Record<string, boolean>>({});
  const [detailName, setDetailName] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [detailFeaturesBase, setDetailFeaturesBase] = useState<Record<string, unknown>>({});
  const [detailStats, setDetailStats] = useState<OrgAdminStats | null>(null);

  const fetchOrgList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch('/api/admin-organizations', {
        headers: { 'x-admin-secret': platformAdminSecret },
      });
      const data = await res.json();
      if (res.ok && data.organizations) setOrgList(data.organizations);
      else setResult({ success: false, message: data.error || t('admin.failedToLoad') });
    } catch {
      setResult({ success: false, message: t('admin.serverError') });
    }
    setListLoading(false);
  }, [platformAdminSecret, t]);

  useEffect(() => {
    if (step === 'panel' && panelView === 'list') void fetchOrgList();
  }, [step, panelView, fetchOrgList]);

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
        setResult({ success: false, message: data.error || t('common.error') });
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
      setEditTutorLimit(org.tutor_limit);
      setEditStatus(org.status === 'suspended' ? 'suspended' : 'active');

      const orgFeatures = org.features && typeof org.features === 'object' ? org.features : {};
      const mergedFeatures: Record<string, boolean> = {};
      Object.entries(FEATURE_REGISTRY).forEach(([featureId, definition]) => {
        mergedFeatures[featureId] = orgFeatures[featureId] ?? definition.defaultValue;
      });
      setEditFeatures(mergedFeatures);
      setDetailFeaturesBase(orgFeatures as Record<string, unknown>);
      setDetailTutors(data.tutors || []);
      setDetailStudents(data.students || []);
      setDetailAudit(data.audit || []);
    } catch {
      setResult({ success: false, message: t('admin.serverError') });
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
      const res = await fetch(`/api/admin-organizations?id=${encodeURIComponent(detailId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': platformAdminSecret,
        },
        body: JSON.stringify({
          tutor_limit: editTutorLimit,
          status: editStatus,
          features: merged,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ success: true, message: t('admin.saved') });
        void openDetail(detailId);
        void fetchOrgList();
      } else {
        setResult({ success: false, message: data.error || t('admin.failedToSave') });
      }
    } catch {
      setResult({ success: false, message: t('admin.serverError') });
    }
    setSaveLoading(false);
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
          tutorLimit: form.tutorLimit,
          adminEmail: form.adminEmail.trim(),
          adminPassword: form.adminPassword,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult({ success: true, message: t('admin.companyCreated', { name: form.orgName, email: form.adminEmail }) });
        setForm({ orgName: '', orgEmail: '', tutorLimit: 5, adminEmail: '', adminPassword: '' });
        void fetchOrgList();
        setPanelView('list');
      } else {
        setResult({ success: false, message: data.error || t('admin.failedToCreate') });
      }
    } catch {
      setResult({ success: false, message: t('admin.serverError') });
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
          message: t('admin.schoolCreated', { name: schoolForm.schoolName.trim(), email: schoolForm.adminEmail.trim() }),
        });
        setSchoolForm({ schoolName: '', schoolEmail: '', adminEmail: '', adminPassword: '' });
        setPanelView('list');
      } else {
        setResult({ success: false, message: data.error || t('admin.failedToCreate') });
      }
    } catch {
      setResult({ success: false, message: t('admin.serverError') });
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
        </div>

        {result && (
          <div className={`flex items-start gap-3 rounded-xl px-4 py-3 mb-5 text-sm ${result.success ? 'bg-green-900/50 border border-green-700 text-green-300' : 'bg-red-900/50 border border-red-700 text-red-300'}`}>
            {result.success
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            <span>{result.message}</span>
          </div>
        )}

        {panelView === 'list' && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {listLoading ? (
              <div className="p-8 text-center text-slate-400 text-sm">{t('common.loadingDots')}</div>
            ) : orgList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">{t('admin.noCompanies')}</div>
            ) : (
              <>
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
                                {t('admin.tutorsSlash')}: {o.tutor_count} / {o.tutor_limit}
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
                      <th className="px-4 py-3 font-medium">{t('admin.thTutorLimit')}</th>
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
                          <td className="px-4 py-3 text-slate-300">{o.tutor_count} / {o.tutor_limit}</td>
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
                        <Label className="text-slate-300">{t('admin.tutorLimit')}</Label>
                        <Input
                          type="number"
                          min={1}
                          max={10000}
                          value={editTutorLimit}
                          onChange={(e) => setEditTutorLimit(Number(e.target.value))}
                          className="bg-white/10 border-white/20 text-white rounded-xl"
                        />
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
                        <span>{tu.full_name || '—'}</span>
                        <span className="text-slate-500 truncate">{tu.email}</span>
                      </li>
                    ))}
                  </ul>
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
                <Label className="text-sm text-slate-300">{t('admin.tutorLimitLabel')}</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={form.tutorLimit}
                    onChange={(e) => setForm({ ...form, tutorLimit: Number(e.target.value) })}
                    required
                    className="bg-white/10 border-white/20 text-white rounded-xl w-24"
                  />
                  <span className="text-slate-400 text-sm">{t('admin.maxTutors')}</span>
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
