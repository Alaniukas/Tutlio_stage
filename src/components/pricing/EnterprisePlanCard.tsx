import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEnterpriseLicensePricing } from '@/hooks/useEnterpriseLicensePricing';
import { displayPricingForQuantity, formatMoney, totalCentsForQuantity } from '@/lib/enterprisePricing';

interface Props {
  audience: 'tutor' | 'schools';
  /** Opens the existing enterprise contact / book-a-demo modal. */
  onBookDemo: () => void;
}

/**
 * Full-width enterprise row: plan identity + features on the left, the
 * license calculator with instant self-serve checkout on the right.
 * Tier prices come from Stripe via /api/enterprise-license-pricing; above the
 * self-serve cap (or when pricing is unavailable) it falls back to contact-only.
 */
export default function EnterprisePlanCard({ audience, onBookDemo }: Props) {
  const { t, locale } = useTranslation();
  const { pricing, failed: pricingFailed } = useEnterpriseLicensePricing();
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    if (pricing) setCount((c) => Math.min(Math.max(c, pricing.minLicenses), pricing.maxSelfServe));
  }, [pricing]);

  // Slider's last position (maxSelfServe + 1) means "more than the cap" -> contact sales.
  const sliderMax = pricing ? pricing.maxSelfServe + 1 : 0;
  const overMax = pricing ? count > pricing.maxSelfServe : false;
  const { unitCents, flatCents } =
    pricing && !overMax ? displayPricingForQuantity(pricing, count) : { unitCents: 0, flatCents: 0 };
  const totalCents = pricing && !overMax ? totalCentsForQuantity(pricing, count) : 0;

  const startCheckout = async (company?: string) => {
    if (!pricing) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/create-enterprise-checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify({ licenseCount: count, companyName: company, locale, audience }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.code === 'COMPANY_NAME_REQUIRED') {
        setCompanyDialogOpen(true);
      } else if (data.code === 'HAS_ACTIVE_LICENSE_SUBSCRIPTION') {
        setError(t('pricing.enterpriseHasSubscription'));
      } else {
        setError(data.error || t('common.error'));
      }
    } catch {
      setError(t('common.error'));
    }
    setLoading(false);
  };

  const handleBuyClick = async () => {
    if (!pricing) return;
    if (overMax) {
      onBookDemo();
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setCompanyDialogOpen(true);
      return;
    }
    await startCheckout();
  };

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    setCompanyDialogOpen(false);
    await startCheckout(companyName.trim());
  };

  const features = [
    t('pricing.allFeatures'),
    t('pricing.enterpriseMultiTutor'),
    t('pricing.enterpriseStats'),
    t('pricing.enterpriseAutoInvoices'),
    t('pricing.enterpriseCustom'),
    t('pricing.enterpriseSupport'),
  ];

  return (
    <div className="bg-gray-900 rounded-2xl p-7 lg:p-9 shadow-lg shadow-gray-900/20">
      <div className="grid lg:grid-cols-[1fr_380px] gap-8 lg:gap-12 items-start">
        {/* Plan identity + features */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-5 h-5 text-gray-400" />
            <h3 className="text-xl font-bold text-white">{t('pricing.enterprise')}</h3>
          </div>
          <p className="text-gray-400 text-[13px] leading-relaxed mb-6">{t('pricing.enterpriseDesc')}</p>

          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 mb-6">
            {features.map((feature, i) => (
              <li key={i} className="flex items-center gap-2 text-gray-300 text-[13px]">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                {feature}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onBookDemo}
            className="hidden lg:inline-flex items-center justify-center h-11 px-7 rounded-full border border-gray-700 text-gray-300 font-semibold text-[13px] transition-all duration-200 hover:scale-[1.02] hover:bg-gray-800 hover:text-white active:scale-[0.98]"
          >
            {t('pricing.bookDemo')}
          </button>
        </div>

        {/* License calculator */}
        <div className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-5 lg:p-6">
          {pricing ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="enterprise-license-count" className="text-[13px] text-gray-300 font-medium">
                  {t('pricing.licenseCountLabel')}
                </label>
                {overMax ? (
                  <span className="text-white font-bold text-sm tabular-nums">{pricing.maxSelfServe}+</span>
                ) : (
                  <input
                    type="number"
                    min={pricing.minLicenses}
                    max={sliderMax}
                    value={count}
                    onChange={(e) => {
                      const v = Math.floor(Number(e.target.value));
                      if (!Number.isFinite(v)) return;
                      setCount(Math.min(Math.max(v, pricing.minLicenses), sliderMax));
                    }}
                    className="w-16 bg-gray-900 border border-gray-700 text-white text-sm font-bold rounded-md px-2 py-0.5 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/40"
                  />
                )}
              </div>
              <input
                id="enterprise-license-count"
                type="range"
                min={pricing.minLicenses}
                max={sliderMax}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full accent-[#4f46e5] cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-gray-500 mt-1 mb-5">
                <span>{pricing.minLicenses}</span>
                <span>{pricing.maxSelfServe}+</span>
              </div>

              {/* Price */}
              <div className="mb-5">
                {overMax ? (
                  <span className="text-3xl font-bold text-white">{t('pricing.enterpriseCustomPrice')}</span>
                ) : (
                  <>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-bold text-white">{formatMoney(unitCents, pricing.currency)}</span>
                      <span className="text-gray-400 text-sm">{t('pricing.perLicensePerMonth')}</span>
                    </div>
                    {flatCents > 0 && (
                      <p className="text-gray-400 text-[13px] mt-1">
                        {t('pricing.enterpriseAdminFee', { fee: formatMoney(flatCents, pricing.currency) })}
                      </p>
                    )}
                    <p className="text-gray-300 text-[13px] mt-1 font-medium">
                      {t('pricing.enterpriseTotalPerMonth', {
                        total: formatMoney(totalCents, pricing.currency),
                        count,
                      })}
                    </p>
                  </>
                )}
              </div>

              {error && (
                <p className="text-[12px] text-red-300 bg-red-950/60 border border-red-900 rounded-lg px-3 py-2 mb-3">{error}</p>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={handleBuyClick}
                className="flex items-center justify-center gap-2 w-full h-11 rounded-full bg-white text-gray-900 font-semibold text-[13px] transition-all duration-200 hover:scale-[1.02] hover:bg-gray-100 active:scale-[0.98] disabled:opacity-70"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {overMax ? t('pricing.contactUs') : t('pricing.buyNow')}
              </button>
              <button
                type="button"
                onClick={onBookDemo}
                className="lg:hidden flex items-center justify-center w-full h-11 mt-2.5 rounded-full border border-gray-700 text-gray-300 font-semibold text-[13px] transition-all duration-200 hover:scale-[1.02] hover:bg-gray-800 hover:text-white active:scale-[0.98]"
              >
                {t('pricing.bookDemo')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onBookDemo}
              className="flex items-center justify-center gap-2 w-full h-11 rounded-full bg-white text-gray-900 font-semibold text-[13px] transition-all duration-200 hover:scale-[1.02] hover:bg-gray-100 active:scale-[0.98]"
            >
              {!pricingFailed && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('pricing.contactUs')}
            </button>
          )}
        </div>
      </div>

      {/* Company name for anonymous purchases */}
      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Building2 className="w-5 h-5 text-[#4f46e5]" />
              {t('enterpriseCheckout.companyTitle')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCompanySubmit} className="space-y-4">
            <p className="text-sm text-gray-500">
              {pricing &&
                t('enterpriseCheckout.companySummary', {
                  count,
                  total: formatMoney(totalCents, pricing.currency),
                })}
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('enterprise.companyName')}</label>
              <input
                type="text"
                required
                autoFocus
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/20 focus:border-[#4f46e5]"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !companyName.trim()}
              className="w-full h-11 rounded-full bg-gray-900 hover:bg-gray-800 text-white font-semibold text-sm transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('enterpriseCheckout.continueToPayment')}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
