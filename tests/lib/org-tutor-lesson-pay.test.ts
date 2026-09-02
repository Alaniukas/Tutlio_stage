import { describe, expect, it } from 'vitest';
import {
  compactTutorPayBySubject,
  orgTutorLessonPayEur,
  orgTutorSessionPayEur,
  parseTutorPayBySubject,
  resolveOrgTutorLessonPayEur,
  sumOrgTutorLessonsPayEur,
} from '@/lib/orgTutorLessonPay';
import { MANO_KOREPETITORIUS_ORG_ID, PRO_KLASE_ORG_ID } from '@/lib/marketMoney';

describe('parseTutorPayBySubject', () => {
  it('keeps positive rates and drops empty or invalid values', () => {
    expect(
      parseTutorPayBySubject({
        math: 18,
        lit: '22.5',
        skip: 0,
        blank: '',
        bad: 'x',
      }),
    ).toEqual({ math: 18, lit: 22.5 });
  });
});

describe('resolveOrgTutorLessonPayEur', () => {
  it('uses the subject override when present', () => {
    expect(
      resolveOrgTutorLessonPayEur({
        defaultRate: 15,
        bySubject: { 'sub-a': 22 },
        subjectId: 'sub-a',
        sessionPrice: 40,
      }),
    ).toBe(22);
  });

  it('falls back to the default tutor rate', () => {
    expect(
      resolveOrgTutorLessonPayEur({
        defaultRate: 15,
        bySubject: { 'sub-a': 22 },
        subjectId: 'sub-b',
        sessionPrice: 40,
      }),
    ).toBe(15);
  });

  it('falls back to session price when no tutor rate is set', () => {
    expect(
      resolveOrgTutorLessonPayEur({
        defaultRate: 0,
        bySubject: {},
        subjectId: 'sub-b',
        sessionPrice: 40,
      }),
    ).toBe(40);
    expect(orgTutorLessonPayEur(0, 40)).toBe(40);
  });
});

describe('orgTutorSessionPayEur', () => {
  it('uses subject rates only for Mano korepetitorius', () => {
    expect(
      orgTutorSessionPayEur({
        organizationId: MANO_KOREPETITORIUS_ORG_ID,
        defaultRate: 15,
        bySubject: { 'sub-a': 22 },
        subjectId: 'sub-a',
        sessionPrice: 40,
      }),
    ).toBe(22);
  });

  it('ignores subject rates for Pro Klasė and other orgs', () => {
    expect(
      orgTutorSessionPayEur({
        organizationId: PRO_KLASE_ORG_ID,
        defaultRate: 15,
        bySubject: { 'sub-a': 22 },
        subjectId: 'sub-a',
        sessionPrice: 40,
      }),
    ).toBe(15);
  });
});

describe('sumOrgTutorLessonsPayEur', () => {
  it('sums mixed default and subject rates for Mano korepetitorius', () => {
    const total = sumOrgTutorLessonsPayEur(
      [
        { subject_id: 'a', price: 40 },
        { subject_id: 'b', price: 40 },
        { subject_id: 'c', price: 40 },
      ],
      12,
      { a: 10, b: 20 },
      MANO_KOREPETITORIUS_ORG_ID,
    );
    expect(total).toBe(10 + 20 + 12);
  });
});

describe('compactTutorPayBySubject', () => {
  it('stores only filled rates from the tutor modal', () => {
    expect(
      compactTutorPayBySubject({
        a: '15',
        b: '',
        c: '0',
      }),
    ).toEqual({ a: 15 });
  });
});
