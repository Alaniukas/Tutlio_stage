import { useEffect, useState } from 'react';
import {
  fallbackEnterpriseLicensePricing,
  type EnterpriseLicensePricing,
} from '@/lib/enterprisePricing';
import { currentMarket } from '@/lib/market';

/** Loads enterprise license tier pricing from Stripe (via the public API). */
export function useEnterpriseLicensePricing(enabled = true) {
  const [pricing, setPricing] = useState<EnterpriseLicensePricing | null>(() =>
    enabled ? fallbackEnterpriseLicensePricing(currentMarket()) : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setPricing((current) => current ?? fallbackEnterpriseLicensePricing(currentMarket()));
    setFailed(false);
    let cancelled = false;
    fetch('/api/enterprise-license-pricing')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('pricing unavailable'))))
      .then((data: EnterpriseLicensePricing) => {
        if (cancelled) return;
        if (!data?.tiers?.length) throw new Error('no tiers');
        setPricing(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { pricing, failed };
}
