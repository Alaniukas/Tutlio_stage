import { describe, expect, it } from 'vitest';
import {
  EXTRA_LESSONS_DEFAULT_BODY,
  EXTRA_LESSONS_DOCX_PLACEHOLDERS,
  START_WITHIN_14_CHECKBOX_TEXT,
  buildExtraLessonsOrderSnapshot,
  canonicalExtraLessonsPayload,
  canClickWrapAccept,
  extraLessonsEndKind,
  extraLessonsServiceStartYmd,
  firstLessonOnOrAfter,
  freezeDocumentSource,
  indicativeMonthlyPrice,
  isWithinWithdrawalWindow,
  isExtraLessonsContractKind,
  mergeExtraLessonsOrderPatch,
  resolveStartWithin14Status,
  sha256Hex,
  startWithin14Applies,
  usesBundledExtraLessonsDocx,
  validateExtraLessonsOffer,
  validateExtraLessonsOrder,
} from '../../src/lib/extraLessonsContract';

describe('extraLessonsContract', () => {
  it('builds snapshot and indicative monthly price from base lessons × unit price', () => {
    const order = buildExtraLessonsOrderSnapshot({
      service_name: 'Matematika LT 2kl',
      service_type: 'group',
      duration_minutes: 45,
      start_date: '2026-09-01',
      end_date: '2027-06-15',
      unit_price_eur: 12,
      base_lessons_per_month: 8,
      schedule_slots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
      school_email: 'info@laisvivaikai.lt',
    });
    expect(order.indicative_monthly_eur).toBe(96);
    expect(indicativeMonthlyPrice(8, 12)).toBe(96);
    expect(validateExtraLessonsOrder(order)).toEqual([]);
    expect(order.individual_cancel_terms).toBe('netaikoma');
  });

  it('requires terms checkbox for click-wrap', () => {
    expect(canClickWrapAccept({
      accepted_terms: false,
      start_within_14_days: true,
      recording_consent: true,
    })).toBe(false);
    expect(canClickWrapAccept({
      accepted_terms: true,
      start_within_14_days: false,
      recording_consent: null,
    })).toBe(true);
  });

  it('freezes SHA-256 identically for the same acceptance payload', async () => {
    const order = buildExtraLessonsOrderSnapshot({
      service_name: 'X',
      service_type: 'individual',
      duration_minutes: 60,
      start_date: '2026-09-01',
      end_date: '2026-12-31',
      unit_price_eur: 20,
      base_lessons_per_month: 4,
    });
    const source = freezeDocumentSource({
      payload: { sutarties_nr: 'PP-1', paslaugos_pavadinimas: order.service_name },
      filled_body: 'BODY',
      acceptance: {
        accepted_terms: true,
        start_within_14_days: true,
        start_within_14_status: 'yes',
        start_within_14_shown_text: START_WITHIN_14_CHECKBOX_TEXT,
        recording_consent: false,
      },
    });
    expect(source).toContain(START_WITHIN_14_CHECKBOX_TEXT);
    expect(source).toContain('"start_within_14_status":"yes"');
    const a = await sha256Hex(source);
    const b = await sha256Hex(source);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    const noEarly = freezeDocumentSource({
      payload: { sutarties_nr: 'PP-1', paslaugos_pavadinimas: order.service_name },
      filled_body: 'BODY',
      acceptance: {
        accepted_terms: true,
        start_within_14_days: false,
        start_within_14_status: 'no',
        start_within_14_shown_text: START_WITHIN_14_CHECKBOX_TEXT,
        recording_consent: false,
      },
    });
    expect(await sha256Hex(noEarly)).not.toBe(a);
  });

  it('detects 14-day withdrawal window', () => {
    const accepted = new Date('2026-08-01T10:00:00Z').toISOString();
    expect(isWithinWithdrawalWindow(accepted, new Date('2026-08-10T10:00:00Z'))).toBe(true);
    expect(isWithinWithdrawalWindow(accepted, new Date('2026-08-20T10:00:00Z'))).toBe(false);
  });

  it('computes first lesson from weekly slots', () => {
    expect(firstLessonOnOrAfter('2026-09-01', [{ weekday: 2, start_time: '16:00' }])).toBe('2026-09-01');
    expect(firstLessonOnOrAfter('2026-09-01', [{ weekday: 4, start_time: '16:00' }])).toBe('2026-09-03');
    expect(firstLessonOnOrAfter('2026-09-01', [])).toBe('2026-09-01');
  });

  it('shows 14-day checkbox only when first lesson is within 14 calendar days', () => {
    const soon = buildExtraLessonsOrderSnapshot({
      service_name: 'X',
      service_type: 'group',
      duration_minutes: 45,
      start_date: '2026-09-05',
      end_date: '2027-06-15',
      unit_price_eur: 10,
      base_lessons_per_month: 4,
      schedule_slots: [{ weekday: 6, start_time: '10:00' }],
    });
    const later = buildExtraLessonsOrderSnapshot({
      ...soon,
      start_date: '2026-10-01',
      schedule_slots: [{ weekday: 4, start_time: '10:00' }],
    });
    const accepted = new Date('2026-08-27T12:00:00+03:00');
    expect(startWithin14Applies(firstLessonOnOrAfter(soon.start_date, soon.schedule_slots), accepted)).toBe(true);
    const late = resolveStartWithin14Status({ order: later, acceptedAt: accepted, parentChecked: true });
    expect(late.status).toBe('na');
    expect(late.shownText).toBeNull();
    const early = resolveStartWithin14Status({ order: soon, acceptedAt: accepted, parentChecked: false });
    expect(early.status).toBe('no');
    expect(early.shownText).toBe(START_WITHIN_14_CHECKBOX_TEXT);
    const yes = resolveStartWithin14Status({ order: soon, acceptedAt: accepted, parentChecked: true });
    expect(yes.status).toBe('yes');
  });

  it('ignores a checked 14-day box when first lesson is after the window', () => {
    const order = buildExtraLessonsOrderSnapshot({
      service_name: 'X',
      service_type: 'individual',
      duration_minutes: 60,
      start_date: '2026-12-01',
      end_date: '2027-06-15',
      unit_price_eur: 20,
      base_lessons_per_month: 4,
    });
    const resolved = resolveStartWithin14Status({
      order,
      acceptedAt: new Date('2026-08-27T10:00:00Z'),
      parentChecked: true,
    });
    expect(resolved.status).toBe('na');
  });

  it('delays service start when parent did not request early start', () => {
    const order = buildExtraLessonsOrderSnapshot({
      service_name: 'X',
      service_type: 'group',
      duration_minutes: 45,
      start_date: '2026-08-28',
      end_date: '2027-06-15',
      unit_price_eur: 10,
      base_lessons_per_month: 4,
    });
    const start = extraLessonsServiceStartYmd({
      status: 'no',
      acceptedAtIso: '2026-08-27T09:00:00.000Z',
      order,
    });
    expect(start >= '2026-09-10').toBe(true);
  });

  it('splits withdrawal vs termination by calendar window', () => {
    const accepted = '2026-08-01T10:00:00.000Z';
    expect(extraLessonsEndKind(accepted, new Date('2026-08-10T10:00:00Z'))).toBe('withdrawal');
    expect(extraLessonsEndKind(accepted, new Date('2026-08-20T10:00:00Z'))).toBe('termination');
  });

  it('merges parent-filled order fields without dropping school-set price', () => {
    const base = buildExtraLessonsOrderSnapshot({
      service_name: '',
      service_type: 'group',
      duration_minutes: 45,
      start_date: '',
      end_date: '',
      unit_price_eur: 18,
      base_lessons_per_month: 8,
    });
    const merged = mergeExtraLessonsOrderPatch(base, {
      service_name: 'QA Matematika',
      start_date: '2026-09-01',
      end_date: '2027-06-13',
    });
    expect(merged.unit_price_eur).toBe(18);
    expect(merged.base_lessons_per_month).toBe(8);
    expect(merged.service_name).toBe('QA Matematika');
    expect(merged.start_date).toBe('2026-09-01');
  });

  it('lets the school send a sparse offer; parents must finish type and quantities', () => {
    const sparse = buildExtraLessonsOrderSnapshot({
      service_name: '',
      service_type: '',
      duration_minutes: 0,
      start_date: '',
      end_date: '',
      unit_price_eur: 18,
      base_lessons_per_month: 0,
      platform: '',
    });
    expect(sparse.service_type).toBe('');
    expect(sparse.duration_minutes).toBe(0);
    expect(sparse.platform).toBe('');
    expect(validateExtraLessonsOffer(sparse)).toEqual([]);
    expect(validateExtraLessonsOrder(sparse)).toEqual(expect.arrayContaining([
      'service_name',
      'service_type',
      'platform',
      'duration_minutes',
      'base_lessons_per_month',
      'start_date',
      'end_date',
      'schedule_label',
    ]));
    const finished = mergeExtraLessonsOrderPatch(sparse, {
      service_name: 'Matematika',
      service_type: 'group',
      platform: 'Google Meet',
      duration_minutes: 45,
      start_date: '2026-09-01',
      end_date: '2027-06-13',
      base_lessons_per_month: 8,
      schedule_slots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
      schedule_label: 'antradienis 16:00–16:45',
    });
    expect(validateExtraLessonsOrder(finished)).toEqual([]);
    expect(finished.service_type).toBe('group');
    expect(finished.individual_cancel_terms).toBe('netaikoma');
  });

  it('maps every DOCX placeholder used by the Laisvi vaikai template', () => {
    const order = buildExtraLessonsOrderSnapshot({
      service_name: 'Matematika LT 2kl',
      service_type: 'group',
      duration_minutes: 45,
      start_date: '2026-09-01',
      end_date: '2027-06-15',
      unit_price_eur: 12,
      base_lessons_per_month: 8,
      school_email: 'info@laisvivaikai.lt',
    });
    const payload = canonicalExtraLessonsPayload({
      contract_number: 'PP-1',
      order,
      parent_name: 'Tėvas Pavyzdys',
      parent_email: 'tevas@example.com',
      parent_phone: '+37060000000',
      student_name: 'Vaikas Pavyzdys',
      student_grade: '2 klasė',
      user_id: 'user-1',
      school_name: 'VšĮ Laisvi vaikai',
    });
    for (const key of EXTRA_LESSONS_DOCX_PLACEHOLDERS) {
      expect(payload).toHaveProperty(key);
    }
    expect(payload).not.toHaveProperty('TAIP / NE / NETAIKOMA');
    expect(EXTRA_LESSONS_DEFAULT_BODY).toContain('1 PRIEDAS');
    expect(EXTRA_LESSONS_DEFAULT_BODY).toContain('{{dokumento_sha256}}');
    expect(EXTRA_LESSONS_DEFAULT_BODY).not.toContain('{{TAIP / NE / NETAIKOMA}}');
    expect(START_WITHIN_14_CHECKBOX_TEXT).toContain('Prašau pradėti teikti paslaugas');
    expect(usesBundledExtraLessonsDocx('c3a00000-7e57-4000-8000-000000000001')).toBe(true);
    expect(usesBundledExtraLessonsDocx('2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17')).toBe(true);
    expect(usesBundledExtraLessonsDocx('org-other')).toBe(false);
  });

  it('treats extra_lessons kind separately from annual school contracts', () => {
    expect(isExtraLessonsContractKind('extra_lessons')).toBe(true);
    expect(isExtraLessonsContractKind('annual')).toBe(false);
    expect(isExtraLessonsContractKind(null)).toBe(false);
  });
});
