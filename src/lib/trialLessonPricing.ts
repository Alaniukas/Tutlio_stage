export type TrialLessonPriceMode = 'fixed' | 'discount_percent';

export type TrialLessonPricing = {
  mode: TrialLessonPriceMode;
  fixedPriceEur: number;
  discountPercent: number | null;
};

/** Missing mode preserves the existing fixed-price setting for every organization. */
export function parseTrialLessonPricing(features: Record<string, unknown> | null | undefined): TrialLessonPricing {
  const fixed = features?.trial_lesson_price_eur;
  const discount = features?.trial_lesson_discount_percent;
  return {
    mode: features?.trial_lesson_price_mode === 'discount_percent' ? 'discount_percent' : 'fixed',
    fixedPriceEur: typeof fixed === 'number' && Number.isFinite(fixed) && fixed >= 0 ? fixed : 0,
    discountPercent: typeof discount === 'number' && Number.isFinite(discount) && discount >= 0 && discount <= 100
      ? discount
      : null,
  };
}

/** The regular price is already resolved for the selected subject, student and tutor. */
export function trialLessonPrice(pricing: TrialLessonPricing, regularPrice: number | null | undefined): number {
  if (pricing.mode === 'fixed') return pricing.fixedPriceEur;
  if (pricing.discountPercent === null) throw new Error('Invalid trial lesson discount percent');
  if (typeof regularPrice !== 'number' || !Number.isFinite(regularPrice) || regularPrice < 0) {
    throw new Error('A regular lesson price is required for a percentage trial discount');
  }
  const regularCents = Math.round(regularPrice * 100);
  return Math.round(regularCents * (100 - pricing.discountPercent) / 100) / 100;
}

// Mano Korepetitorius-only settings copy; other app locales use English here.
const TRIAL_PRICING_COPY = {
  lt: {
    mode: 'Bandomosios kainodara', fixed: 'Fiksuota kaina', discount: 'Nuolaida nuo pamokos kainos',
    percent: 'Nuolaida (%)', help: 'Taikoma pasirinkto dalyko įprastai kainai pagal mokinį ir klasę.',
    invalid: 'Bandomosios pamokos nuolaida turi būti nuo 0 iki 100 %.',
    priceNote: 'Kaina apskaičiuota nuo pasirinkto dalyko pamokos kainos. Galite koreguoti.',
  },
  en: {
    mode: 'Trial pricing', fixed: 'Fixed price', discount: 'Discount from lesson price',
    percent: 'Discount (%)', help: 'Applied to the regular price for the selected subject, student and grade.',
    invalid: 'The trial lesson discount must be between 0 and 100%.',
    priceNote: 'Calculated from the selected subject’s regular lesson price. You can adjust it.',
  },
  pl: {
    mode: 'Cena lekcji próbnej', fixed: 'Stała cena', discount: 'Rabat od ceny lekcji',
    percent: 'Rabat (%)', help: 'Naliczany od zwykłej ceny wybranego przedmiotu dla ucznia i klasy.',
    invalid: 'Rabat na lekcję próbną musi wynosić od 0 do 100%.',
    priceNote: 'Cena obliczona od zwykłej ceny wybranego przedmiotu. Możesz ją zmienić.',
  },
} as const;

export function trialPricingCopy(locale: string, key: keyof typeof TRIAL_PRICING_COPY.en): string {
  return TRIAL_PRICING_COPY[locale === 'lt' || locale === 'pl' ? locale : 'en'][key];
}
