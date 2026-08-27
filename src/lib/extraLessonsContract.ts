/**
 * Extra-lessons (papildomos pamokos) school contract: order snapshot,
 * placeholders, freeze/hash, click-wrap acceptance rules.
 * Pure — no React / Supabase / DOM.
 */

export const EXTRA_LESSONS_CONTRACT_KIND = 'extra_lessons' as const;
export const ANNUAL_CONTRACT_KIND = 'annual' as const;
export type SchoolContractKind = typeof ANNUAL_CONTRACT_KIND | typeof EXTRA_LESSONS_CONTRACT_KIND;

export const EXTRA_LESSONS_REVISION_LABEL = '2026-08-19';

export type ExtraLessonsServiceType = 'group' | 'individual';

export type ExtraLessonsScheduleSlot = {
  weekday: number;
  start_time: string;
  end_time?: string | null;
};

export type ExtraLessonsOrderSnapshot = {
  revision_label: string;
  service_name: string;
  service_type: ExtraLessonsServiceType;
  platform: string;
  duration_minutes: number;
  schedule_slots: ExtraLessonsScheduleSlot[];
  schedule_label: string;
  start_date: string;
  end_date: string;
  unit_price_eur: number;
  vat_status: string;
  base_lessons_per_month: number;
  indicative_monthly_eur: number;
  individual_cancel_terms: string;
  school_email: string;
  school_phone: string;
  data_protection_contact: string;
  group_id?: string | null;
  group_name?: string | null;
};

export const START_WITHIN_14_CHECKBOX_TEXT =
  'Noriu, kad vaikas galėtų pradėti lankyti pamokas iš karto. Suprantu, kad per pirmąsias 14 dienų atsisakęs Sutarties turėsiu sumokėti už iki Sutarties atsisakymo jau suteiktas pamokas.';

export const EXTRA_LESSONS_TERMS_CHECKBOX_TEXT =
  'Perskaičiau Sutartį, susipažinau su jos priedais ir privatumo pranešimu, pateikti duomenys yra teisingi ir sutinku su Sutarties sąlygomis.';

export type StartWithin14Status = 'yes' | 'no' | 'na';

export type ExtraLessonsAcceptanceFlags = {
  accepted_terms: boolean;
  start_within_14_days: boolean;
  recording_consent: boolean | null;
  start_within_14_status?: StartWithin14Status;
  start_within_14_shown_text?: string | null;
};

const WEEKDAY_LT = ['sekmadienis', 'pirmadienis', 'antradienis', 'trečiadienis', 'ketvirtadienis', 'penktadienis', 'šeštadienis'];

export function formatScheduleLabel(slots: ExtraLessonsScheduleSlot[]): string {
  if (!slots.length) return '';
  return slots
    .map((slot) => {
      const day = WEEKDAY_LT[slot.weekday] || String(slot.weekday);
      const end = slot.end_time ? `–${slot.end_time}` : '';
      return `${day} ${slot.start_time}${end}`;
    })
    .join(', ');
}

export function indicativeMonthlyPrice(baseLessonsPerMonth: number, unitPriceEur: number): number {
  const n = Number(baseLessonsPerMonth) || 0;
  const p = Number(unitPriceEur) || 0;
  return Math.round(n * p * 100) / 100;
}

export function buildExtraLessonsOrderSnapshot(input: {
  service_name: string;
  service_type: ExtraLessonsServiceType;
  platform?: string;
  duration_minutes: number;
  schedule_slots?: ExtraLessonsScheduleSlot[];
  schedule_label?: string;
  start_date: string;
  end_date: string;
  unit_price_eur: number;
  vat_status?: string;
  base_lessons_per_month: number;
  school_email?: string;
  school_phone?: string;
  data_protection_contact?: string;
  group_id?: string | null;
  group_name?: string | null;
  individual_cancel_terms?: string;
  revision_label?: string;
}): ExtraLessonsOrderSnapshot {
  const slots = input.schedule_slots || [];
  const unit = Math.round(Number(input.unit_price_eur) * 100) / 100;
  const base = Math.max(0, Math.round(Number(input.base_lessons_per_month) || 0));
  const type = input.service_type === 'individual' ? 'individual' : 'group';
  return {
    revision_label: input.revision_label || EXTRA_LESSONS_REVISION_LABEL,
    service_name: String(input.service_name || '').trim(),
    service_type: type,
    platform: String(input.platform || 'Google Meet').trim() || 'Google Meet',
    duration_minutes: Math.max(1, Math.round(Number(input.duration_minutes) || 45)),
    schedule_slots: slots,
    schedule_label: String(input.schedule_label || formatScheduleLabel(slots)).trim(),
    start_date: String(input.start_date || '').trim(),
    end_date: String(input.end_date || '').trim(),
    unit_price_eur: unit,
    vat_status: String(input.vat_status || 'PVM neapmokestinama pagal LR PVMĮ 22 str.').trim(),
    base_lessons_per_month: base,
    indicative_monthly_eur: indicativeMonthlyPrice(base, unit),
    individual_cancel_terms:
      type === 'individual'
        ? String(input.individual_cancel_terms || 'Individuali pamoka atšaukiama ne vėliau kaip 24 val. iki pradžios; vėliau pamoka apmokama.').trim()
        : 'netaikoma',
    school_email: String(input.school_email || '').trim(),
    school_phone: String(input.school_phone || '').trim(),
    data_protection_contact: String(input.data_protection_contact || input.school_email || '').trim(),
    group_id: input.group_id || null,
    group_name: input.group_name || null,
  };
}

/** Admin offer: price + student-side fields can be sparse; parents finish on accept. */
export function validateExtraLessonsOffer(order: ExtraLessonsOrderSnapshot): string[] {
  const errors: string[] = [];
  if (!order.service_name && !order.group_name) errors.push('service_name');
  if (!(order.unit_price_eur > 0)) errors.push('unit_price_eur');
  if (!(order.duration_minutes > 0)) errors.push('duration_minutes');
  return errors;
}

/** Before click-wrap accept — all contract order fields must be present. */
export function validateExtraLessonsOrder(order: ExtraLessonsOrderSnapshot): string[] {
  const errors: string[] = [];
  if (!order.service_name) errors.push('service_name');
  if (!order.start_date) errors.push('start_date');
  if (!order.end_date) errors.push('end_date');
  if (!order.schedule_label && !(order.schedule_slots || []).length) errors.push('schedule_label');
  if (!(order.unit_price_eur > 0)) errors.push('unit_price_eur');
  if (!(order.base_lessons_per_month > 0)) errors.push('base_lessons_per_month');
  if (!(order.duration_minutes > 0)) errors.push('duration_minutes');
  return errors;
}

export function mergeExtraLessonsOrderPatch(
  base: ExtraLessonsOrderSnapshot,
  patch: Partial<ExtraLessonsOrderSnapshot>,
): ExtraLessonsOrderSnapshot {
  return buildExtraLessonsOrderSnapshot({
    ...base,
    ...patch,
    schedule_slots: patch.schedule_slots ?? base.schedule_slots,
    schedule_label: patch.schedule_label ?? base.schedule_label,
    service_name: patch.service_name ?? base.service_name,
    service_type: patch.service_type ?? base.service_type,
    platform: patch.platform ?? base.platform,
    duration_minutes: patch.duration_minutes ?? base.duration_minutes,
    start_date: patch.start_date ?? base.start_date,
    end_date: patch.end_date ?? base.end_date,
    unit_price_eur: patch.unit_price_eur ?? base.unit_price_eur,
    base_lessons_per_month: patch.base_lessons_per_month ?? base.base_lessons_per_month,
    group_id: patch.group_id !== undefined ? patch.group_id : base.group_id,
    group_name: patch.group_name !== undefined ? patch.group_name : base.group_name,
  });
}

/** Stable JSON used for SHA-256 freeze — field order is fixed. */
export function canonicalExtraLessonsPayload(input: {
  contract_number: string;
  order: ExtraLessonsOrderSnapshot;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  student_name: string;
  student_grade: string;
  user_id: string;
  school_name: string;
}): Record<string, string> {
  const o = input.order;
  return {
    sutarties_nr: input.contract_number,
    contract_number: input.contract_number,
    redakcijos_ID: o.revision_label,
    revision_label: o.revision_label,
    paslaugos_pavadinimas: o.service_name,
    grupine_ar_individuali: o.service_type === 'group' ? 'grupinė' : 'individuali',
    platforma: o.platform,
    pamokos_trukme_min: String(o.duration_minutes),
    savaites_dienos_ir_laikas: o.schedule_label,
    pradzios_data: o.start_date,
    pabaigos_data_ar_mokslo_metu_pabaiga: o.end_date,
    kaina: o.unit_price_eur.toFixed(2),
    PVM_statusas: o.vat_status,
    orientacine_menesio_kaina: o.indicative_monthly_eur.toFixed(2),
    individualios_pamokos_atšaukimo_sąlygos: o.individual_cancel_terms,
    tevo_globejo_vardas_pavarde: input.parent_name,
    tevo_el_pastas: input.parent_email,
    tevo_telefonas: input.parent_phone,
    vaiko_vardas_pavarde: input.student_name,
    klase: input.student_grade,
    naudotojo_ID: input.user_id,
    mokyklos_el_pastas: o.school_email,
    mokyklos_telefonas: o.school_phone,
    duomenu_apsaugos_kontaktas: o.data_protection_contact,
    school_name: input.school_name,
  };
}

export function freezeDocumentSource(params: {
  payload: Record<string, string>;
  filled_body: string;
  acceptance: ExtraLessonsAcceptanceFlags;
}): string {
  const status = params.acceptance.start_within_14_status
    || (params.acceptance.start_within_14_days ? 'yes' : 'no');
  return JSON.stringify({
    payload: params.payload,
    filled_body: params.filled_body,
    accepted_terms: params.acceptance.accepted_terms,
    start_within_14_days: params.acceptance.start_within_14_days,
    start_within_14_status: status,
    start_within_14_shown_text: params.acceptance.start_within_14_shown_text ?? null,
    recording_consent: params.acceptance.recording_consent,
  });
}

export async function sha256Hex(source: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const bytes = new TextEncoder().encode(source);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

export function canClickWrapAccept(flags: ExtraLessonsAcceptanceFlags): boolean {
  return flags.accepted_terms === true;
}

export function recordingConsentLabel(value: boolean | null): 'TAIP' | 'NE' | 'NETAIKOMA' {
  if (value === true) return 'TAIP';
  if (value === false) return 'NE';
  return 'NETAIKOMA';
}

export function startWithin14Label(value: boolean | StartWithin14Status): 'TAIP' | 'NE' | 'NETAIKOMA' {
  if (value === 'na' || value === 'yes' || value === 'no') {
    if (value === 'yes') return 'TAIP';
    if (value === 'no') return 'NE';
    return 'NETAIKOMA';
  }
  return value ? 'TAIP' : 'NE';
}

export function vilniusYmd(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function addCalendarDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** First scheduled lesson date on/after start_date (YYYY-MM-DD). No slots → start_date. */
export function firstLessonOnOrAfter(
  startDate: string,
  slots: ExtraLessonsScheduleSlot[] | null | undefined,
  endDate?: string | null,
): string {
  const start = String(startDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return '';
  const list = Array.isArray(slots) ? slots : [];
  if (!list.length) return start;
  const weekdays = [...new Set(list.map((s) => Number(s.weekday)).filter((n) => n >= 0 && n <= 6))];
  if (!weekdays.length) return start;
  const [y, m, d] = start.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  const limit = endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate.slice(0, 10))
    ? endDate.slice(0, 10)
    : addCalendarDaysYmd(start, 366);
  for (let i = 0; i < 400; i++) {
    const ymd = cursor.toISOString().slice(0, 10);
    if (ymd > limit) break;
    if (weekdays.includes(cursor.getUTCDay())) return ymd;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return start;
}

/** True when first lesson falls on/before accepted date + 14 calendar days (Vilnius). */
export function startWithin14Applies(firstLessonYmd: string, acceptedAt: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstLessonYmd)) return false;
  const acceptedYmd = vilniusYmd(acceptedAt);
  const windowEnd = addCalendarDaysYmd(acceptedYmd, 14);
  return firstLessonYmd <= windowEnd;
}

export function resolveStartWithin14Status(input: {
  order: ExtraLessonsOrderSnapshot;
  acceptedAt?: Date;
  parentChecked?: boolean;
}): { status: StartWithin14Status; shownText: string | null; applies: boolean; firstLessonYmd: string } {
  const firstLessonYmd = firstLessonOnOrAfter(
    input.order.start_date,
    input.order.schedule_slots,
    input.order.end_date,
  );
  const applies = startWithin14Applies(firstLessonYmd, input.acceptedAt || new Date());
  if (!applies) {
    return { status: 'na', shownText: null, applies: false, firstLessonYmd };
  }
  return {
    status: input.parentChecked === true ? 'yes' : 'no',
    shownText: START_WITHIN_14_CHECKBOX_TEXT,
    applies: true,
    firstLessonYmd,
  };
}

/** Earliest calendar day services may be delivered. */
export function extraLessonsServiceStartYmd(input: {
  status: StartWithin14Status | null | undefined;
  acceptedAtIso: string;
  order: ExtraLessonsOrderSnapshot;
}): string {
  const first = firstLessonOnOrAfter(input.order.start_date, input.order.schedule_slots, input.order.end_date);
  const acceptedYmd = vilniusYmd(new Date(input.acceptedAtIso));
  if (input.status === 'no') {
    const afterWindow = addCalendarDaysYmd(acceptedYmd, 14);
    return first && first > afterWindow ? first : afterWindow;
  }
  return first || acceptedYmd;
}

export function withdrawalDeadlineIso(acceptedAtIso: string, days = 14): string {
  const t = Date.parse(acceptedAtIso);
  if (!Number.isFinite(t)) return '';
  const acceptedYmd = vilniusYmd(new Date(t));
  const endYmd = addCalendarDaysYmd(acceptedYmd, days);
  return `${endYmd}T20:59:59.000Z`;
}

export function isWithinWithdrawalWindow(acceptedAtIso: string, now = new Date(), days = 14): boolean {
  const t = Date.parse(acceptedAtIso);
  if (!Number.isFinite(t)) return false;
  const acceptedYmd = vilniusYmd(new Date(t));
  const endYmd = addCalendarDaysYmd(acceptedYmd, days);
  return vilniusYmd(now) <= endYmd;
}

export type ExtraLessonsEndKind = 'withdrawal' | 'termination';

export function extraLessonsEndKind(acceptedAtIso: string, now = new Date()): ExtraLessonsEndKind {
  return isWithinWithdrawalWindow(acceptedAtIso, now) ? 'withdrawal' : 'termination';
}

export function isExtraLessonsContract(row: { kind?: string | null } | null | undefined): boolean {
  return row?.kind === EXTRA_LESSONS_CONTRACT_KIND;
}

/** Default LT body shown before accept when the school has not uploaded a DOCX. */
export const EXTRA_LESSONS_DEFAULT_BODY = `NUOTOLINIŲ PAPILDOMŲ PAMOKŲ (UGDOMŲJŲ VEIKLŲ) PASLAUGŲ SUTARTIS

1. SUTARTIES ŠALYS IR UŽSAKYMO DUOMENYS
Sutarties numeris {{sutarties_nr}}
Sutarties sudarymo data ir laikas {{data_laikas_Europe_Vilnius}}
Paslaugų teikėjas {{school_name}}
Kontaktai {{mokyklos_el_pastas}}, {{mokyklos_telefonas}}
Paslaugų gavėjas {{tevo_globejo_vardas_pavarde}}
Paskyros identifikatorius {{naudotojo_ID}}
El. paštas / telefonas {{tevo_el_pastas}} / {{tevo_telefonas}}
Vaikas {{vaiko_vardas_pavarde}}, klasė {{klase}}

2. SUTARTIES DALYKAS
Pamokos / veiklos pavadinimas {{paslaugos_pavadinimas}}
Paslaugos tipas {{grupine_ar_individuali}}
Platforma {{platforma}}
Pamokos trukmė {{pamokos_trukme_min}} min.
Grafikas {{savaites_dienos_ir_laikas}}
Paslaugų teikimo pradžia {{pradzios_data}}
Numatoma pabaiga {{pabaigos_data_ar_mokslo_metu_pabaiga}}
Vienos pamokos kaina {{kaina}} Eur ({{PVM_statusas}})
Numatoma mėnesio kaina {{orientacine_menesio_kaina}} Eur
Individualių pamokų atšaukimas {{individualios_pamokos_atšaukimo_sąlygos}}

3. SUTARTIES SUDARYMAS ELEKTRONINIU BŪDU
Sutartis laikoma sudaryta, kai Paslaugų gavėjas Tutlio paskyroje peržiūri visą tekstą ir užsakymo santrauką, atskiru laukeliu patvirtina sąlygas ir paspaudžia „Užsakymas su prievole sumokėti“.

4. LANKYMAS
Grupinė pamoka pagal tvarkaraštį apmokama ir tada, kai vaikas joje nedalyvavo, jeigu vieta buvo rezervuota. Jeigu pamoka neįvyksta dėl mokytojo, mokestis netaikomas.

5. KAINA IR SĄSKAITOS
Kiekvieną mėnesį suteikiami baziniai kreditai pagal šioje Sutartyje nurodytą pamokų skaičių. Papildomai prisijungtos pamokos pridedamos mėnesio pabaigoje. Sąskaita pateikiama pasibaigus kalendoriniam mėnesiui ir apmokama per 5 darbo dienas.

6. TEISĖ PER 14 DIENŲ ATSISAKYTI
Paslaugų gavėjas turi teisę per 14 dienų nuo sudarymo atsisakyti šios nuotolinės Sutarties Tutlio paskyroje.

ELEKTRONINIO SUDARYMO ĮRAŠAS
Sutarties redakcija {{redakcijos_ID}}
Dokumento kontrolinė suma {{SHA-256_ar_kitas_integralumo_ID}}
Naudotojo paskyra {{naudotojo_ID}}
Sutikimo su sąlygomis būsena {{TAIP}}
Prašymas pradėti paslaugas per 14 dienų {{start_within_14_label}}
Atskiras sutikimas dėl įrašymo {{recording_consent_label}}
`;
