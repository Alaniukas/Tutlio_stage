import { useEffect, useMemo, useState } from 'react';
import { Percent, Info, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { isMoksloVaisiaiOrg } from '@/lib/marketMoney';
import { customerTotal, MARKET_FEES } from '@/lib/marketMoney';
import {
  DEFAULT_ORG_PAYER_FEE_SPLIT,
  orgNetFromPayerFeeSplit,
  parseOrgPayerFeeSplitConfig,
  type OrgPayerFeeSplit,
} from '@/lib/orgPayerFeeSplit';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';

type Props = {
  orgId: string | null;
};

function SplitSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const { t } = useTranslation();
  const orgShare = 100 - value;
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-sm font-medium text-gray-800">{label}</Label>
          <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
        </div>
        <div className="text-right text-xs shrink-0">
          <p className="font-semibold text-indigo-700">{t('companyFinance.payerFeeSplitPayerShare', { percent: String(value) })}</p>
          <p className="text-gray-500">{t('companyFinance.payerFeeSplitOrgShare', { percent: String(orgShare) })}</p>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-600"
      />
    </div>
  );
}

export default function OrgPayerFeeSplitSettings({ orgId }: Props) {
  const { t } = useTranslation();
  const { hasFeature, loading: featuresLoading } = useOrgFeatures();
  const enabled = hasFeature('org_payer_fee_split') && isMoksloVaisiaiOrg(orgId);

  const [split, setSplit] = useState<OrgPayerFeeSplit>(DEFAULT_ORG_PAYER_FEE_SPLIT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('organizations')
        .select('features')
        .eq('id', orgId)
        .maybeSingle();
      if (cancelled) return;
      const feat = (data?.features as Record<string, unknown> | null) ?? {};
      setSplit(parseOrgPayerFeeSplitConfig(feat.payer_fee_split));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, enabled]);

  const preview = useMemo(() => {
    const base = 20;
    const total = customerTotal(base, 'default', null, split);
    const fee = total - base;
    const orgNet = orgNetFromPayerFeeSplit(base, 'default', split);
    const orgAbsorbed = Math.round((base - orgNet) * 100) / 100;
    return { base, total, fee, orgNet, orgAbsorbed };
  }, [split]);

  const handleSave = async () => {
    if (!orgId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { data: current } = await supabase
        .from('organizations')
        .select('features')
        .eq('id', orgId)
        .maybeSingle();
      const merged = {
        ...((current?.features as Record<string, unknown> | null) ?? {}),
        payer_fee_split: {
          platform_share: split.platformShare,
          stripe_percent_share: split.stripePercentShare,
          stripe_fixed_share: split.stripeFixedShare,
        },
      };
      const { error: updErr } = await supabase
        .from('organizations')
        .update({ features: merged })
        .eq('id', orgId);
      if (updErr) throw updErr;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (featuresLoading || !enabled) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Percent className="w-5 h-5 text-indigo-600" />
          {t('companyFinance.payerFeeSplitTitle')}
        </h2>
        <p className="text-sm text-gray-500 mt-1">{t('companyFinance.payerFeeSplitDesc')}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 space-y-5">
            <SplitSlider
              label={t('companyFinance.payerFeeSplitPlatform', {
                percent: String(Math.round(MARKET_FEES.platformPercent * 100)),
              })}
              hint={t('companyFinance.payerFeeSplitPlatformHint')}
              value={split.platformShare}
              onChange={(v) => setSplit((s) => ({ ...s, platformShare: v }))}
            />
            <SplitSlider
              label={t('companyFinance.payerFeeSplitStripePercent', {
                percent: String(Math.round(MARKET_FEES.stripePercent * 1000) / 10),
              })}
              hint={t('companyFinance.payerFeeSplitStripePercentHint')}
              value={split.stripePercentShare}
              onChange={(v) => setSplit((s) => ({ ...s, stripePercentShare: v }))}
            />
            <SplitSlider
              label={t('companyFinance.payerFeeSplitStripeFixed')}
              hint={t('companyFinance.payerFeeSplitStripeFixedHint')}
              value={split.stripeFixedShare}
              onChange={(v) => setSplit((s) => ({ ...s, stripeFixedShare: v }))}
            />
          </div>

          <div className="flex items-start gap-3 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
            <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="text-sm text-indigo-900">
              <p className="font-medium">{t('companyFinance.payerFeeSplitPreview')}</p>
              <p className="mt-1 text-indigo-800">
                {t('companyFinance.payerFeeSplitPreviewLine', {
                  base: preview.base.toFixed(2),
                  total: preview.total.toFixed(2),
                  fee: preview.fee.toFixed(2),
                })}
              </p>
              <p className="mt-2 text-indigo-800">
                {preview.orgAbsorbed > 0
                  ? t('companyFinance.payerFeeSplitPreviewOrgLineAbsorbed', {
                      net: preview.orgNet.toFixed(2),
                      base: preview.base.toFixed(2),
                      absorbed: preview.orgAbsorbed.toFixed(2),
                    })
                  : t('companyFinance.payerFeeSplitPreviewOrgLine', {
                      net: preview.orgNet.toFixed(2),
                      base: preview.base.toFixed(2),
                    })}
              </p>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {t('companyFinance.payerFeeSplitSave')}
            </Button>
            {saved && (
              <span className={cn('inline-flex items-center gap-1 text-sm text-emerald-700')}>
                <CheckCircle2 className="w-4 h-4" />
                {t('companyFinance.payerFeeSplitSaved')}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
