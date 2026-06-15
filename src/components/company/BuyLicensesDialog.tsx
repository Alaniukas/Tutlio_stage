import { useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useEnterpriseLicensePricing } from '@/hooks/useEnterpriseLicensePricing';
import { displayPricingForQuantity, formatMoney, totalCentsForQuantity } from '@/lib/enterprisePricing';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current org license count — used to preselect the quantity. */
  currentLicenseCount: number;
}

/**
 * Org admin license purchase: starts an authenticated enterprise checkout for
 * the admin's organization. Orgs that already have a license subscription
 * manage quantity via the Stripe billing portal instead (see CompanyTutors).
 */
export default function BuyLicensesDialog({ open, onOpenChange, currentLicenseCount }: Props) {
  const { t, locale } = useTranslation();
  const { pricing, failed: pricingFailed } = useEnterpriseLicensePricing(open);
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pricing || !open) return;
    const preferred = currentLicenseCount > 0 ? currentLicenseCount : 5;
    setCount(Math.min(Math.max(preferred, pricing.minLicenses), pricing.maxSelfServe));
  }, [pricing, open, currentLicenseCount]);

  const totalCents = pricing ? totalCentsForQuantity(pricing, count) : 0;
  const { unitCents, flatCents } = pricing
    ? displayPricingForQuantity(pricing, count)
    : { unitCents: 0, flatCents: 0 };

  const startCheckout = async () => {
    if (!pricing) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError(t('common.error'));
        setLoading(false);
        return;
      }
      const res = await fetch('/api/create-enterprise-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ licenseCount: count, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(
        data.code === 'HAS_ACTIVE_LICENSE_SUBSCRIPTION'
          ? t('compTut.licenseSubscriptionExists')
          : data.error || t('common.error'),
      );
    } catch {
      setError(t('common.error'));
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="w-5 h-5 text-[#4f46e5]" />
            {t('compTut.buyLicensesTitle')}
          </DialogTitle>
        </DialogHeader>

        {pricingFailed ? (
          <p className="text-sm text-red-600 py-4">{t('compTut.buyLicensesUnavailable')}</p>
        ) : !pricing ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-gray-500">{t('compTut.buyLicensesDesc')}</p>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="buy-license-count" className="text-sm font-medium text-gray-700">
                  {t('pricing.licenseCountLabel')}
                </label>
                <input
                  type="number"
                  min={pricing.minLicenses}
                  max={pricing.maxSelfServe}
                  value={count}
                  onChange={(e) => {
                    const v = Math.floor(Number(e.target.value));
                    if (!Number.isFinite(v)) return;
                    setCount(Math.min(Math.max(v, pricing.minLicenses), pricing.maxSelfServe));
                  }}
                  className="w-20 h-9 px-2 rounded-lg border border-gray-200 text-sm font-bold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5]"
                />
              </div>
              <input
                id="buy-license-count"
                type="range"
                min={pricing.minLicenses}
                max={pricing.maxSelfServe}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full accent-[#4f46e5] cursor-pointer"
              />
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-baseline justify-between">
              <div>
                <span className="text-sm text-gray-600">
                  {formatMoney(unitCents, pricing.currency, locale)} {t('pricing.perLicensePerMonth')}
                </span>
                {flatCents > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {t('pricing.enterpriseAdminFee', { fee: formatMoney(flatCents, pricing.currency, locale) })}
                  </p>
                )}
              </div>
              <span className="text-lg font-bold text-gray-900">
                {formatMoney(totalCents, pricing.currency, locale)}
                <span className="text-xs font-medium text-gray-400 ml-1">{t('common.perMonth')}</span>
              </span>
            </div>

            {currentLicenseCount > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {t('compTut.buyLicensesReplaceNote', { current: currentLicenseCount })}
              </p>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              disabled={loading}
              onClick={startCheckout}
              className="w-full h-11 rounded-full bg-gray-900 hover:bg-gray-800 text-white font-semibold text-sm transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('enterpriseCheckout.continueToPayment')}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
