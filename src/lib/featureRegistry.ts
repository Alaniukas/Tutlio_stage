/**
 * Feature Registry - centralized definition of all organization features
 *
 * This registry defines all possible features that can be enabled/disabled
 * for organizations. Each feature has metadata for display and validation.
 */

export interface FeatureDefinition {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  category: 'appearance' | 'analytics' | 'payments' | 'automation' | 'integrations' | 'advanced';
  defaultValue: boolean;
  requiresSetup?: boolean; // If true, feature needs additional configuration
  pricingTier?: 'basic' | 'premium' | 'enterprise'; // For future pricing tiers
}

export const FEATURE_CATEGORIES = {
  appearance: {
    name: 'Išvaizda',
    nameEn: 'Appearance',
    icon: '🎨',
  },
  analytics: {
    name: 'Analitika',
    nameEn: 'Analytics',
    icon: '📊',
  },
  payments: {
    name: 'Mokėjimai',
    nameEn: 'Payments',
    icon: '💳',
  },
  automation: {
    name: 'Automatizacija',
    nameEn: 'Automation',
    icon: '🤖',
  },
  integrations: {
    name: 'Integracijos',
    nameEn: 'Integrations',
    icon: '🔌',
  },
  advanced: {
    name: 'Pažangios funkcijos',
    nameEn: 'Advanced Features',
    icon: '⚡',
  },
} as const;

/**
 * Feature Registry
 * Add new features here - they will automatically appear in admin panel
 *
 * IMPORTANT: Only add features that are FULLY IMPLEMENTED
 * Each feature here should have corresponding UI/logic in the app
 */
export const FEATURE_REGISTRY: Record<string, FeatureDefinition> = {
  // ─────────────────────────────────────────────────────────────────────
  // Org Admin Calendar Features
  // ─────────────────────────────────────────────────────────────────────

  org_admin_calendar_view: {
    id: 'org_admin_calendar_view',
    name: 'Org Admin Kalendoriaus Peržiūra',
    nameEn: 'Org Admin Calendar View',
    description: 'Org admin gali matyti visų org korepetitorių kalendorius ir kurti pamokas',
    descriptionEn: 'Org admin can view all org tutors calendars and create sessions',
    category: 'advanced',
    defaultValue: false,
    pricingTier: 'basic',
  },

  org_admin_calendar_full_control: {
    id: 'org_admin_calendar_full_control',
    name: 'Org Admin Pilnas Kalendoriaus Valdymas',
    nameEn: 'Org Admin Full Calendar Control',
    description: 'Org admin gali pilnai valdyti org korepetitorių kalendorius (kurti/redaguoti/trinti laisvą laiką ir pamokas)',
    descriptionEn: 'Org admin can fully control org tutors calendars (create/edit/delete availability and sessions)',
    category: 'advanced',
    defaultValue: false,
    requiresSetup: false,
    pricingTier: 'premium',
  },

  per_student_payment_override: {
    id: 'per_student_payment_override',
    name: 'Mokinio mokėjimo būdas (individualiai)',
    nameEn: 'Per-student payment method',
    description:
      'Leidžia korepetitoriams / org adminui mokinio kortelėje pasirinkti mokėjimo būdą (pamoka po pamokos, mėnesinės sąskaitos, paketai) ir perrašyti bendras finansų taisykles',
    descriptionEn:
      'Allows setting per-student payment method in the student card, overriding tutor finance defaults',
    category: 'payments',
    defaultValue: false,
    pricingTier: 'premium',
  },

  /** When enabled, org sends prepaid packages outside Stripe; payer gets instructions / optional payment URL; org admin confirms in Students. */
  manual_payments: {
    id: 'manual_payments',
    name: 'Rankiniai (ne-Stripe) paketų mokėjimai',
    nameEn: 'Manual (off-Stripe) package payments',
    description:
      'Įjungus: paketai be Stripe — mokėtojui laiškas su suma. Žemiau (violetinė sekcija) galite įrašyti mokėjimo puslapio URL. Org admin „Mokiniai“ patvirtina gavimą.',
    descriptionEn: 'Org prepaid packages without Stripe; optional payment URL in admin section below.',
    category: 'payments',
    defaultValue: false,
    requiresSetup: true,
    pricingTier: 'enterprise',
  },
};

/**
 * Get all features grouped by category
 */
export function getFeaturesByCategory() {
  const grouped: Record<string, FeatureDefinition[]> = {};

  Object.values(FEATURE_REGISTRY).forEach(feature => {
    if (!grouped[feature.category]) {
      grouped[feature.category] = [];
    }
    grouped[feature.category].push(feature);
  });

  return grouped;
}

/**
 * Get feature definition by ID
 */
export function getFeature(featureId: string): FeatureDefinition | undefined {
  return FEATURE_REGISTRY[featureId];
}

/**
 * Get all feature IDs
 */
export function getAllFeatureIds(): string[] {
  return Object.keys(FEATURE_REGISTRY);
}

/**
 * Validate features object (ensure all keys are valid feature IDs)
 */
export function validateFeatures(features: Record<string, unknown>): boolean {
  const validIds = new Set(getAllFeatureIds());
  return Object.keys(features).every(key => validIds.has(key));
}
