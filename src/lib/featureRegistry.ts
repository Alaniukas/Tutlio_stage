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

  school_contract_esign: {
    id: 'school_contract_esign',
    name: 'Sutarčių pasirašymas el. parašu (GoSign)',
    nameEn: 'Contract e-signing (GoSign)',
    description:
      'Mokyklos sutartys pasirašomos el. parašu per Registrų centro GoSign (direktorė pasirašo sistemoje, tėvai – per saugią nuorodą). Reikia GoSign prieigų (GOSIGN_* aplinkos kintamieji).',
    descriptionEn:
      'School contracts are e-signed via Registrų centras GoSign (director signs in-app, parents via a secure link). Requires GoSign credentials (GOSIGN_* env vars).',
    category: 'integrations',
    defaultValue: false,
    requiresSetup: true,
    pricingTier: 'enterprise',
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

  custom_branding: {
    id: 'custom_branding',
    name: 'Whitelabel / organizacijos stilius',
    nameEn: 'Whitelabel / Custom Branding',
    description:
      'Mokiniai, tėvai ir korepetitoriai mato organizacijos logo ir spalvas vietoj Tutlio. Login puslapyje rodomas org logo su "powered by Tutlio".',
    descriptionEn:
      'Students, parents, and tutors see the organization\'s logo and colors instead of Tutlio. Login page shows org logo with "powered by Tutlio".',
    category: 'appearance',
    defaultValue: false,
    requiresSetup: true,
    pricingTier: 'enterprise',
  },

  /** When enabled, org uses prepaid packages / lesson flows outside Stripe student checkout; org admin confirms in Students. */
  manual_payments: {
    id: 'manual_payments',
    name: 'Rankiniai (ne-Stripe) mokinių mokėjimai',
    nameEn: 'Manual (off-Stripe) student payments',
    description:
      'Įjungus: visi org korepetitoriai naudoja rankinį mokinių mokėjimų režimą (be Stripe Checkout). Žemiau galite nurodyti mokėjimo puslapio URL el. laiškuose.',
    descriptionEn:
      'When on, org tutors use manual student payments (bank transfer etc.) instead of Stripe Checkout. Optional payment page URL below.',
    category: 'payments',
    defaultValue: false,
    requiresSetup: true,
    pricingTier: 'enterprise',
  },

  perlas_finance: {
    id: 'perlas_finance',
    name: 'PerlasFinance banko pavedimai',
    nameEn: 'PerlasFinance bank transfers',
    description:
      'Mokėjimai banko pavedimu (PerlasFinance) ir išmokėjimų skiltis organizacijos finansuose. Įjungti tik testuojamoms organizacijoms.',
    descriptionEn:
      'Bank transfer payments (PerlasFinance) and payout section in org finance. Enable only for pilot organizations.',
    category: 'payments',
    defaultValue: false,
    requiresSetup: true,
    pricingTier: 'enterprise',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Pro Klase intake funnel (Phase 1)
  // ─────────────────────────────────────────────────────────────────────

  tutor_frequency_search: {
    id: 'tutor_frequency_search',
    name: 'Korepetitorių paieška pagal dažnį',
    nameEn: 'Tutor search by frequency',
    description:
      'Org admin gali ieškoti korepetitorių pagal dalyką, laisvą laiką ir pamokų dažnį per savaitę (pvz. 2 k./sav.). Pirmenybė teikiama mokinio pagrindiniam korepetitoriui.',
    descriptionEn:
      'Org admin can search tutors by subject, free time, and lessons-per-week frequency (e.g. 2x/week). The student\'s primary tutor is ranked first.',
    category: 'advanced',
    defaultValue: false,
    pricingTier: 'premium',
  },

  trial_reservation_flow: {
    id: 'trial_reservation_flow',
    name: 'Bandomosios pamokos rezervacija (pirma apmokėjimas)',
    nameEn: 'Trial reservation (pay-to-confirm)',
    description:
      'Rezervuojami laikai bandomajai pamokai ir laikomi kol apmokama. Neapmokėjus per nustatytą terminą, laikas vėl tampa laisvas. Korepetitorius informuojamas ir mokinys/tėvas kviečiami tik po apmokėjimo. Terminą galite nustatyti žemiau (val.).',
    descriptionEn:
      'Trial lesson slots are reserved and held until paid. If unpaid within the deadline, the slot is released. The tutor is notified and the student/parent invited only after payment. Configure the deadline (hours) below.',
    category: 'payments',
    defaultValue: false,
    requiresSetup: true,
    pricingTier: 'premium',
  },

  trial_followup_alert: {
    id: 'trial_followup_alert',
    name: 'Įspėjimas: po bandomosios neišsiųstas paketas',
    nameEn: 'Alert: no package after trial',
    description:
      'Po įvykusios bandomosios pamokos mokinys pažymimas raudonai „Reikia dėmesio" skiltyje ir mokinio kortelėje, jei dar neišsiųstas pamokų paketas.',
    descriptionEn:
      'After a completed trial lesson, the student is flagged red in the "Needs attention" section and on the student card if no lesson package has been sent yet.',
    category: 'advanced',
    defaultValue: false,
    pricingTier: 'premium',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Pro Klase intake funnel (Phase 2)
  // ─────────────────────────────────────────────────────────────────────

  package_reservation_flow: {
    id: 'package_reservation_flow',
    name: 'Paketo rezervacija su laikais (apmokėjimas iki termino)',
    nameEn: 'Package reservation with times (pay-by-deadline)',
    description:
      'Siunčiant paketą po bandomosios pamokos galima iš karto rezervuoti pamokų laikus. Laikai laikomi kol apmokama; neapmokėjus iki termino (nustatomas val. prieš pirmą pamoką, žemiau) laikai atlaisvinami ir paketas deaktyvuojamas. Korepetitorius informuojamas ir mokinys/tėvas kviečiami tik po apmokėjimo.',
    descriptionEn:
      'When sending a package after a trial, lesson times can be reserved up front. Slots are held until paid; if unpaid by the deadline (configured in hours before the first lesson, below) they are released and the package is deactivated. The tutor is notified and the student/parent invited only after payment.',
    category: 'payments',
    defaultValue: false,
    requiresSetup: true,
    pricingTier: 'premium',
  },

  student_card_booking: {
    id: 'student_card_booking',
    name: 'Pamokų rezervavimas mokinio kortelėje',
    nameEn: 'Book lessons from the student card',
    description:
      'Org admin gali ieškoti korepetitoriaus laiko ir rezervuoti pamokas tiesiai mokinio kortelėje. Korepetitorius visada informuojamas apie naujas pamokas.',
    descriptionEn:
      'Org admin can find a tutor slot and book lessons directly from the student card. The tutor is always notified about new lessons.',
    category: 'advanced',
    defaultValue: false,
    pricingTier: 'premium',
  },

  monthly_packages: {
    id: 'monthly_packages',
    name: 'Mėnesiniai paketai (kalendorinis mėnuo)',
    nameEn: 'Calendar-month packages',
    description:
      'Paketo pamokos galioja tik tą kalendorinį mėnesį, už kurį apmokėta. Jei paketas apmokėtas be iš anksto rezervuotų pamokų, jis galioja bent 1 mėnesį nuo apmokėjimo. Korepetitorius pamoką gali perkelti tik to paties mėnesio ribose; perkeltos pamokos pažymimos atskira spalva.',
    descriptionEn:
      'Package lessons are valid only for the calendar month they were paid for. If a package is paid with no pre-booked lessons, it stays valid for at least 1 month from payment. A tutor can reschedule a lesson only within the same month; moved lessons get a distinct color.',
    category: 'payments',
    defaultValue: false,
    pricingTier: 'premium',
  },

  flexible_invitations: {
    id: 'flexible_invitations',
    name: 'Lankstūs kvietimai (mokinys ir (arba) tėvas)',
    nameEn: 'Flexible invitations (student and/or parent)',
    description:
      'Galima pasirinkti pakviesti tik mokinį arba ir mokinį, ir tėvą. Registracijos forma orientuota į tėvą (klausiama vaiko gimimo datos). Priminimai apie pamokas siunčiami tiek mokiniui, tiek tėvui.',
    descriptionEn:
      'Choose to invite only the student or both the student and a parent. The registration form is parent-oriented (asks for the child\'s birth date). Lesson reminders are sent to both the student and the parent.',
    category: 'advanced',
    defaultValue: false,
    pricingTier: 'premium',
  },

  disable_student_reschedule_cancel: {
    id: 'disable_student_reschedule_cancel',
    name: 'Mokinys negali perkelti / atšaukti pamokų',
    nameEn: 'Students cannot reschedule / cancel lessons',
    description:
      'Mokinio ir tėvų portale paslepiami pamokų perkėlimo bei atšaukimo mygtukai, o serveris atmeta tokius bandymus. Pamokas perkelti ar atšaukti gali tik korepetitorius arba administracija.',
    descriptionEn:
      'Hides lesson reschedule/cancel actions in the student & parent portal and the server rejects such attempts. Only the tutor or the organization admin can move or cancel lessons.',
    category: 'advanced',
    defaultValue: false,
    pricingTier: 'premium',
  },

  tutor_lesson_status_confirmation: {
    id: 'tutor_lesson_status_confirmation',
    name: 'Korepetitorius privalo pažymėti pamokos statusą',
    nameEn: 'Tutor must confirm lesson status',
    description:
      'Pasibaigusios pamokos nebežymimos „įvykusiomis“ automatiškai. Korepetitorius po kiekvienos pamokos privalo nurodyti jos statusą (įvyko, įvyko bet vėlavo, mokinys neatvyko, atšaukta). Kol statusas nepažymėtas, pamoka rodoma kaip privalomas darbas ir korepetitoriui siunčiami priminimai.',
    descriptionEn:
      'Ended lessons are no longer auto-marked completed. After each lesson the tutor must set its status (happened, happened late, no-show, cancelled). Until confirmed, the lesson shows as a must-do task and the tutor keeps getting reminders.',
    category: 'advanced',
    defaultValue: false,
    pricingTier: 'premium',
  },

  disable_student_booking: {
    id: 'disable_student_booking',
    name: 'Mokinys negali rezervuoti pamokų',
    nameEn: 'Students cannot book lessons',
    description:
      'Mokinio ir tėvų portale paslepiama pamokų rezervavimo funkcija („Rezervuoti"), o serveris atmeta tokius bandymus. Pamokas kuria tik korepetitorius arba administracija.',
    descriptionEn:
      'Hides the lesson booking ("Book") function in the student & parent portal and the server rejects such attempts. Only the tutor or the organization admin creates lessons.',
    category: 'advanced',
    defaultValue: false,
    pricingTier: 'premium',
  },

  disable_waitlist: {
    id: 'disable_waitlist',
    name: 'Išjungti laukimo eilę',
    nameEn: 'Disable waitlist',
    description:
      'Organizacijoje visiškai paslepiama laukimo eilė (admin, korepetitorius, mokinys, tėvai) ir atšaukus pamoką neatliekamas automatinis eilės užpildymas.',
    descriptionEn:
      'Completely hides the waitlist across admin, tutor, student and parent portals, and skips waitlist auto-fill on cancellation.',
    category: 'advanced',
    defaultValue: false,
    pricingTier: 'premium',
  },

  auto_trial_first_lesson: {
    id: 'auto_trial_first_lesson',
    name: 'Pirmoji pamoka automatiškai bandomoji',
    nameEn: 'First lesson defaults to trial',
    description:
      'Tvarkaraštyje kuriant pamoką mokiniui, kuris dar neturi nė vienos pamokos, ji automatiškai pažymima kaip bandomoji su org. bandomosios pamokos tema, trukme ir kaina. Administratorius gali viską pakoreguoti prieš išsaugant.',
    descriptionEn:
      'When creating a lesson in the schedule for a student with no lessons yet, it is automatically marked as a trial with the org trial topic, duration and price. The admin can adjust everything before saving.',
    category: 'automation',
    defaultValue: false,
    pricingTier: 'premium',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Pro Klase feedback round (2026-07-17)
  // ─────────────────────────────────────────────────────────────────────

  student_availability_profile: {
    id: 'student_availability_profile',
    name: 'Mokinio laisvo laiko profilis',
    nameEn: 'Student availability profile',
    description:
      'Mokinio kortelėje galima pažymėti, kuriomis dienomis ir valandomis mokiniui tinka pamokos. Ieškant korepetitoriaus laisvo laiko šie langai užpildomi automatiškai.',
    descriptionEn:
      'The student card gets a weekly availability editor (days + hour ranges that suit the student). The free-time tutor search is prefilled from it automatically.',
    category: 'advanced',
    defaultValue: false,
    pricingTier: 'premium',
  },

  student_schedule_overview: {
    id: 'student_schedule_overview',
    name: 'Mokinio tvarkaraščio santrauka ir statistika',
    nameEn: 'Student schedule overview & stats',
    description:
      'Mokinio kortelėje rodomas pamokų tvarkaraštis (savaitės dienos, laikai, dalykai, korepetitoriai, kartai/sav.) ir skaitliukai, kiek pamokų perkėlė/atšaukė mokinys ir kiek – korepetitorius.',
    descriptionEn:
      'The student card shows the recurring lesson schedule (weekdays, times, subjects, tutors, times/week) and counters of lessons moved/cancelled by the student vs by the tutor.',
    category: 'analytics',
    defaultValue: false,
    pricingTier: 'premium',
  },

  hide_admin_lesson_prices: {
    id: 'hide_admin_lesson_prices',
    name: 'Slėpti kainas admin pamokų kūrime',
    nameEn: 'Hide prices in admin lesson creation',
    description:
      'Kuriant pamoką (tvarkaraštyje ar mokinio kortelėje) administratoriui nerodomos dalykų ir laikų kainos. Kainos vis tiek pritaikomos automatiškai pagal dinaminę kainodarą.',
    descriptionEn:
      'Hides subject/slot prices from the org admin in lesson-creation flows (schedule + student card). Prices are still applied automatically via dynamic pricing.',
    category: 'appearance',
    defaultValue: false,
    pricingTier: 'premium',
  },

  hide_trial_offer_button: {
    id: 'hide_trial_offer_button',
    name: 'Slėpti „Siūlyti bandomąją pamoką" mygtuką',
    nameEn: 'Hide "Offer trial lesson" button',
    description:
      'Mokinio kortelėje neberodomas „Siūlyti bandomąją pamoką" blokas – bandomosios pamokos kuriamos tiesiogiai per pamokų kūrimą.',
    descriptionEn:
      'Removes the "Offer trial lesson" block from the student card — trials are created directly through lesson creation instead.',
    category: 'appearance',
    defaultValue: false,
    pricingTier: 'premium',
  },

  full_student_edit: {
    id: 'full_student_edit',
    name: 'Pilnas mokinio duomenų redagavimas',
    nameEn: 'Full student data editing',
    description:
      'Org adminas gali redaguoti mokinio kontaktinius duomenis (el. paštą – kol mokinys dar neprisiregistravęs; telefoną ir kitus laukus – visada) ir iš naujo išsiųsti kvietimą.',
    descriptionEn:
      'Org admin can edit student contact data (email while the student has not registered yet; phone and other fields always) and re-send the invitation.',
    category: 'advanced',
    defaultValue: false,
    pricingTier: 'premium',
  },

  trial_creation_payment_email: {
    id: 'trial_creation_payment_email',
    name: 'Bandomosios pamokos apmokėjimo laiškas kuriant',
    nameEn: 'Trial payment email on creation',
    description:
      'Sukūrus bandomąją pamoką (tvarkaraštyje ar mokinio kortelėje) mokėtojui automatiškai išsiunčiamas vienkartinio apmokėjimo laiškas su nuoroda už tą pamoką.',
    descriptionEn:
      'When a trial lesson is created (schedule or student card), the payer automatically receives a one-time payment email with a pay link for that lesson.',
    category: 'payments',
    defaultValue: false,
    pricingTier: 'premium',
  },

  post_trial_auto_package: {
    id: 'post_trial_auto_package',
    name: 'Automatinis paketas po bandomosios',
    nameEn: 'Auto package after trial',
    description:
      'Po įvykusios bandomosios pamokos pagal mokinio pasikartojantį tvarkaraštį automatiškai suformuojamas mėnesinis paketas su dinamine kaina ir išsiunčiamas klientui. Administratorius mokinio kortelėje gali paketą anuliuoti, koreguoti ar išsiųsti iš naujo.',
    descriptionEn:
      'After a completed trial lesson, a monthly package is auto-built from the student\'s recurring schedule at dynamic pricing and emailed to the client. The admin can annul, edit or resend it from the student card.',
    category: 'automation',
    defaultValue: false,
    pricingTier: 'premium',
  },

  extra_lessons_billing: {
    id: 'extra_lessons_billing',
    name: 'Papildomų pamokų sąskaitos',
    nameEn: 'Extra lessons billing',
    description:
      'Mėnesio pabaigoje pamokos, nepatekusios į jokį paketą (padidintas dažnis, vienkartinės ar naujai pridėtas tvarkaraštis), automatiškai apmokestinamos vienetine kaina ir mokėtojui išsiunčiama atskira sąskaita. Nuo kito mėnesio nauji tvarkaraščiai įtraukiami į mėnesinį paketą.',
    descriptionEn:
      'At month end, lessons not covered by any package (increased frequency, one-offs, newly added schedules) are billed per-unit and the payer gets a separate invoice. From the next month new schedules fold into the monthly package.',
    category: 'payments',
    defaultValue: false,
    pricingTier: 'premium',
  },

  student_payments_page: {
    id: 'student_payments_page',
    name: 'Mokinio „Mokėjimai" puslapis',
    nameEn: 'Student "Payments" page',
    description:
      'Mokinio portale atsiranda „Mokėjimai" skiltis: neapmokėti paketai su apmokėjimo mygtuku ir mokėjimų istorija su sąskaitomis.',
    descriptionEn:
      'The student portal gets a "Payments" section: unpaid packages with a pay button and payment history with invoices.',
    category: 'payments',
    defaultValue: false,
    pricingTier: 'premium',
  },

  invoice_detailed_line_items: {
    id: 'invoice_detailed_line_items',
    name: 'Detalios sąskaitų eilutės (vaikas, kiekis, datos)',
    nameEn: 'Detailed invoice line items (child, qty, dates)',
    description:
      'Sąskaitos faktūros eilutėse nurodomas vaiko vardas, dalykas, kiekis ir pamokų datos (pvz. „Matematika – Jonas – 4 pam. (07-01, 07-08, ...)").',
    descriptionEn:
      'Invoice line items include the child\'s name, subject, quantity and lesson dates (e.g. "Matematika – Jonas – 4 pam. (07-01, 07-08, ...)").',
    category: 'payments',
    defaultValue: false,
    pricingTier: 'premium',
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
