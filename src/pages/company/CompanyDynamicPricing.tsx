import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { BadgeEuro, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { useOrgEntityType } from '@/contexts/OrgEntityContext';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { isSchoolOrg, showDynamicPricingNav } from '@/lib/orgIntakeMode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Toast from '@/components/Toast';
import {
  isDynamicPricingSchemaMissing,
  type OrganizationDynamicPricingRule,
} from '@/lib/organizationDynamicPricing';

type EditableRule = Required<Pick<OrganizationDynamicPricingRule, 'grade_min' | 'grade_max' | 'lessons_per_week' | 'price'>> & {
  id: string;
  organization_id: string;
};

const sortRules = (rules: EditableRule[]) =>
  [...rules].sort(
    (a, b) => b.lessons_per_week - a.lessons_per_week || a.grade_min - b.grade_min,
  );

export default function CompanyDynamicPricing() {
  const { t } = useTranslation();
  const entityType = useOrgEntityType();
  const { loading: featuresLoading, organizationId: orgIdFromFeatures } = useOrgFeatures();
  const allowed =
    !featuresLoading && !isSchoolOrg(entityType) && showDynamicPricingNav(orgIdFromFeatures, entityType);
  const [organizationId, setOrganizationId] = useState('');
  const [rules, setRules] = useState<EditableRule[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadRules = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: admin, error: adminError } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (adminError || !admin?.organization_id) {
      setToast({ message: t('dynamicPricing.loadError'), type: 'error' });
      setLoading(false);
      return;
    }

    setOrganizationId(admin.organization_id);
    const { data, error } = await supabase
      .from('organization_dynamic_pricing')
      .select('id, organization_id, grade_min, grade_max, lessons_per_week, price')
      .eq('organization_id', admin.organization_id)
      .order('lessons_per_week', { ascending: false })
      .order('grade_min', { ascending: true });

    if (error && !isDynamicPricingSchemaMissing(error)) {
      setToast({ message: t('dynamicPricing.loadError'), type: 'error' });
    } else {
      setRules(
        sortRules(
          (data ?? []).map((row) => ({
            ...row,
            grade_min: Number(row.grade_min),
            grade_max: Number(row.grade_max),
            lessons_per_week: Number(row.lessons_per_week),
            price: Number(row.price),
          })),
        ),
      );
      setDeletedIds([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!allowed) return;
    void loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const validationError = useMemo(() => {
    for (const rule of rules) {
      if (!Number.isInteger(rule.grade_min) || !Number.isInteger(rule.grade_max)) {
        return t('dynamicPricing.wholeGrades');
      }
      if (rule.grade_min < 1 || rule.grade_max > 12 || rule.grade_min > rule.grade_max) {
        return t('dynamicPricing.gradeRangeError');
      }
      if (!Number.isInteger(rule.lessons_per_week) || rule.lessons_per_week < 1) {
        return t('dynamicPricing.frequencyError');
      }
      if (!Number.isFinite(rule.price) || rule.price < 0) {
        return t('dynamicPricing.priceError');
      }
    }

    for (let i = 0; i < rules.length; i += 1) {
      for (let j = i + 1; j < rules.length; j += 1) {
        const a = rules[i];
        const b = rules[j];
        if (a.lessons_per_week !== b.lessons_per_week) continue;
        if (a.grade_min <= b.grade_max && b.grade_min <= a.grade_max) {
          return t('dynamicPricing.overlapError', { frequency: a.lessons_per_week });
        }
      }
    }

    return null;
  }, [rules, t]);

  const updateRule = (id: string, patch: Partial<EditableRule>) => {
    setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const addRule = () => {
    if (!organizationId) return;
    setRules((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        organization_id: organizationId,
        grade_min: 1,
        grade_max: 8,
        lessons_per_week: 1,
        price: 0,
      },
    ]);
  };

  const removeRule = (id: string) => {
    setRules((current) => current.filter((rule) => rule.id !== id));
    setDeletedIds((current) => [...current, id]);
  };

  const saveRules = async () => {
    if (!organizationId || validationError) return;
    setSaving(true);

    if (deletedIds.length > 0) {
      const { error } = await supabase
        .from('organization_dynamic_pricing')
        .delete()
        .eq('organization_id', organizationId)
        .in('id', deletedIds);
      if (error) {
        setToast({ message: t('dynamicPricing.saveError'), type: 'error' });
        setSaving(false);
        return;
      }
    }

    if (rules.length > 0) {
      const now = new Date().toISOString();
      const { error } = await supabase.from('organization_dynamic_pricing').upsert(
        rules.map((rule) => ({ ...rule, organization_id: organizationId, updated_at: now })),
        { onConflict: 'id' },
      );
      if (error) {
        setToast({ message: t('dynamicPricing.saveError'), type: 'error' });
        setSaving(false);
        return;
      }
    }

    setToast({ message: t('dynamicPricing.saved'), type: 'success' });
    await loadRules();
    setSaving(false);
  };

  if (!featuresLoading && !allowed) {
    return <Navigate to={isSchoolOrg(entityType) ? '/school' : '/company'} replace />;
  }

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-indigo-600">
            <BadgeEuro className="h-6 w-6" />
            <span className="text-sm font-semibold uppercase tracking-wide">{t('dynamicPricing.eyebrow')}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-950">{t('dynamicPricing.title')}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">{t('dynamicPricing.subtitle')}</p>
        </div>
        <Button onClick={saveRules} disabled={saving || Boolean(validationError)} className="rounded-xl">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t('common.save')}
        </Button>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        {t('dynamicPricing.frequencyNote')}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="hidden grid-cols-[1fr_1fr_1.2fr_1fr_48px] gap-4 border-b border-gray-200 bg-gray-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 md:grid">
          <span>{t('dynamicPricing.gradeFrom')}</span>
          <span>{t('dynamicPricing.gradeTo')}</span>
          <span>{t('dynamicPricing.lessonsPerWeek')}</span>
          <span>{t('dynamicPricing.pricePerLesson')}</span>
          <span />
        </div>

        {rules.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-medium text-gray-900">{t('dynamicPricing.emptyTitle')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('dynamicPricing.emptyBody')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {sortRules(rules).map((rule) => (
              <div key={rule.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_1fr_1.2fr_1fr_48px] md:items-end">
                <div className="space-y-1.5">
                  <Label className="md:hidden">{t('dynamicPricing.gradeFrom')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={rule.grade_min}
                    onChange={(event) => updateRule(rule.id, { grade_min: Number(event.target.value) })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="md:hidden">{t('dynamicPricing.gradeTo')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={rule.grade_max}
                    onChange={(event) => updateRule(rule.id, { grade_max: Number(event.target.value) })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="md:hidden">{t('dynamicPricing.lessonsPerWeek')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={rule.lessons_per_week}
                    onChange={(event) => updateRule(rule.id, { lessons_per_week: Number(event.target.value) })}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="md:hidden">{t('dynamicPricing.pricePerLesson')}</Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={rule.price}
                      onChange={(event) => updateRule(rule.id, { price: Number(event.target.value) })}
                      className="rounded-xl pr-9"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">€</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRule(rule.id)}
                  className="h-10 w-10 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-gray-200 bg-gray-50 px-5 py-4">
          <Button type="button" variant="outline" onClick={addRule} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            {t('dynamicPricing.addRule')}
          </Button>
        </div>
      </div>

      {validationError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{validationError}</p>
      )}
    </div>
  );
}
