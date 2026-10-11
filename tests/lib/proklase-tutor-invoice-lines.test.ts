import { describe, expect, it } from 'vitest';
import {
  buildProKlaseTutorInvoiceLines,
  splitLegacyProKlaseTutorInvoiceLines,
  type ProKlaseInvoiceSession,
  type StoredTutorInvoiceLine,
} from '../../api/_lib/proKlaseTutorInvoiceLines';
import { proKlaseSessionPayEur } from '../../api/_lib/proKlaseTutorPay';

const confirmedAt = '2026-09-30T18:00:00Z';
const trial = (id: string, status = 'completed'): ProKlaseInvoiceSession => ({
  id, status, status_confirmed_at: confirmedAt,
  subjects: { name: 'Bandomoji pamoka', is_trial: true },
});
const regular = (id: string, status = 'completed'): ProKlaseInvoiceSession => ({
  ...trial(id, status), subjects: { name: 'LIETUVIŲ KALBA', is_trial: false },
});
const mixedTrials = () => [trial('trial-1'), trial('trial-2'), trial('missed-1', 'no_show'), trial('missed-2', 'no_show')];
const legacyLine = (): StoredTutorInvoiceLine => ({
  description: 'Bandomoji pamoka - korepetavimo paslaugos', quantity: 4,
  unit_price: 8, total_price: 32, session_ids: mixedTrials().map(session => session.id),
});
const mixedMathematics = (): ProKlaseInvoiceSession[] => [
  trial('t1'), regular('r1'), trial('n1', 'no_show'), regular('r2'), regular('r3'), trial('t2'),
].map(session => ({ ...session, subjects: { ...session.subjects, name: 'MATEMATIKA' } }));

describe('Pro Klasė tutor invoice tariff lines', () => {
  it('shows completed trials at 10 EUR and missed trials at 6 EUR, without an 8 EUR average', () => {
    const lines = buildProKlaseTutorInvoiceLines(mixedTrials(), session => proKlaseSessionPayEur(session, 13));
    expect(lines).toEqual([
      { description: 'Bandomoji pamoka - korepetavimo paslaugos', quantity: 2,
        unitPrice: 10, totalPrice: 20, sessionIds: ['trial-1', 'trial-2'] },
      { description: 'Atlygis už mokinio neatvykimą - Bandomoji pamoka', quantity: 2,
        unitPrice: 6, totalPrice: 12, sessionIds: ['missed-1', 'missed-2'] },
    ]);
  });

  it('keeps the 62 EUR mathematics example at its actual 10, 12 and 6 EUR tariffs', () => {
    const lines = buildProKlaseTutorInvoiceLines(mixedMathematics(), session => proKlaseSessionPayEur(session, 12));
    expect(lines.map(line => [line.description, line.quantity, line.unitPrice, line.totalPrice])).toEqual([
      ['Bandomoji pamoka - MATEMATIKA', 2, 10, 20],
      ['MATEMATIKA - korepetavimo paslaugos', 3, 12, 36],
      ['Atlygis už mokinio neatvykimą - MATEMATIKA', 1, 6, 6],
    ]);
    expect(lines.reduce((sum, line) => sum + line.totalPrice, 0)).toBe(62);
    expect(lines.every(line => line.quantity * line.unitPrice === line.totalPrice)).toBe(true);
  });

  it('separates the outcome even when the same subject and tariff are used', () => {
    const rows = [regular('regular'), { ...regular('trial'), subjects: { name: 'LIETUVIŲ KALBA', is_trial: true } },
      regular('missed', 'no_show')];
    const lines = buildProKlaseTutorInvoiceLines(rows, () => 10);
    expect(lines.map(line => line.description)).toEqual([
      'LIETUVIŲ KALBA - korepetavimo paslaugos', 'Bandomoji pamoka - LIETUVIŲ KALBA',
      'Atlygis už mokinio neatvykimą - LIETUVIŲ KALBA',
    ]);
    expect(lines.map(line => line.quantity)).toEqual([1, 1, 1]);
  });

  it('groups the same subject and outcome only when the actual rate also matches', () => {
    const lines = buildProKlaseTutorInvoiceLines([regular('a'), regular('b'), regular('c')],
      session => session.id === 'b' ? 15 : 13);
    expect(lines.map(({ quantity, unitPrice, totalPrice, sessionIds }) => ({ quantity, unitPrice, totalPrice, sessionIds })))
      .toEqual([{ quantity: 2, unitPrice: 13, totalPrice: 26, sessionIds: ['a', 'c'] },
        { quantity: 1, unitPrice: 15, totalPrice: 15, sessionIds: ['b'] }]);
  });

  it('unwraps array-shaped subjects and keeps each subject separate', () => {
    const lines = buildProKlaseTutorInvoiceLines([trial('a'), { ...trial('b'),
      subjects: [{ name: 'Matematika', is_trial: true }] }], session => proKlaseSessionPayEur(session, 13));
    expect(lines.map(line => line.description)).toEqual([
      'Bandomoji pamoka - korepetavimo paslaugos', 'Bandomoji pamoka - Matematika',
    ]);
  });

  it.each([NaN, Infinity, -1])('rejects an invalid lesson amount %s', amount => {
    expect(() => buildProKlaseTutorInvoiceLines([trial('a')], () => amount)).toThrow();
  });
  it('rejects repeated lesson IDs rather than charging the lesson twice', () => {
    expect(() => buildProKlaseTutorInvoiceLines([trial('a'), trial('a')], () => 10)).toThrow();
  });
});

describe('legacy Pro Klasė invoice PDF presentation', () => {
  it('replaces the rounded 10.33 EUR average with exact rows without changing the saved 62 EUR total', () => {
    const rows = mixedMathematics();
    const lines = splitLegacyProKlaseTutorInvoiceLines([{
      description: 'MATEMATIKA - korepetavimo paslaugos', quantity: 6,
      unit_price: '10.33', total_price: '62.00', session_ids: rows.map(session => session.id),
    }], rows);
    expect(lines.map(line => [line.quantity, line.unitPrice, line.totalPrice])).toEqual([
      [2, 10, 20], [3, 12, 36], [1, 6, 6],
    ]);
    expect(lines.reduce((sum, line) => sum + line.totalPrice, 0)).toBe(62);
    expect(lines.every(line => line.quantity * line.unitPrice === line.totalPrice)).toBe(true);
    expect(lines.flatMap(line => line.sessionIds).sort()).toEqual(rows.map(session => session.id).sort());
  });

  it('splits the 4 × 8 legacy line and preserves regular pay, historical fines and the 61 EUR total', () => {
    const regularRows = [regular('r1'), regular('r2'), regular('r3')];
    const fine = { description: 'Bauda: nėra ataskaitos', quantity: 1,
      unit_price: '-10.00', total_price: '-10.00', session_ids: [] };
    const lines = splitLegacyProKlaseTutorInvoiceLines([
      { description: 'LIETUVIŲ KALBA - korepetavimo paslaugos', quantity: 3,
        unit_price: 13, total_price: 39, session_ids: regularRows.map(session => session.id) }, legacyLine(), fine,
    ], [...regularRows, ...mixedTrials()]);
    expect(lines.map(line => [line.quantity, line.unitPrice, line.totalPrice])).toEqual([
      [3, 13, 39], [2, 10, 20], [2, 6, 12], [1, -10, -10],
    ]);
    expect(lines.reduce((sum, line) => sum + line.totalPrice, 0)).toBe(61);
    expect(lines.at(-1)?.description).toBe(fine.description);
  });

  it('recovers the original regular rate from a mixed line without using today’s rate', () => {
    const rows = [regular('r'), regular('n', 'no_show')];
    const lines = splitLegacyProKlaseTutorInvoiceLines([{
      description: 'LIETUVIŲ KALBA - korepetavimo paslaugos', quantity: 2,
      unit_price: 9.5, total_price: 19, session_ids: ['r', 'n'],
    }], rows);
    expect(lines.map(line => [line.quantity, line.unitPrice, line.totalPrice])).toEqual([[1, 13, 13], [1, 6, 6]]);
  });

  it('preserves the saved subject label after a subject was renamed', () => {
    const line = { description: 'Senas dalyko pavadinimas - korepetavimo paslaugos',
      quantity: 1, unit_price: 13, total_price: 13, session_ids: ['r'] };
    expect(splitLegacyProKlaseTutorInvoiceLines([line], [regular('r')])[0].description).toBe(line.description);
  });

  it.each([
    { name: 'a missing lesson', rows: mixedTrials().slice(1) },
    { name: 'a changed outcome', rows: mixedTrials().map(session => ({ ...session, status: 'completed' })) },
    { name: 'an unconfirmed outcome', rows: mixedTrials().map(session => ({ ...session, status_confirmed_at: null })) },
    { name: 'a cancelled lesson', rows: mixedTrials().map(session => ({ ...session, status: 'cancelled' })) },
    { name: 'a removed subject', rows: mixedTrials().map(session => ({ ...session, subjects: null })) },
    { name: 'a changed trial classification', rows: mixedTrials().map(session => ({ ...session,
      subjects: { name: 'Bandomoji pamoka', is_trial: false } })) },
  ])('refuses to guess a tariff with $name', ({ rows }) => {
    expect(() => splitLegacyProKlaseTutorInvoiceLines([legacyLine()], rows)).toThrow();
  });

  it('rejects mismatched quantities and duplicate links in or between lines', () => {
    expect(() => splitLegacyProKlaseTutorInvoiceLines([{ ...legacyLine(), quantity: 3 }], mixedTrials())).toThrow();
    expect(() => splitLegacyProKlaseTutorInvoiceLines([{ ...legacyLine(),
      session_ids: ['trial-1', 'trial-1', 'missed-1', 'missed-2'] }], mixedTrials())).toThrow();
    expect(() => splitLegacyProKlaseTutorInvoiceLines([legacyLine(), legacyLine()], mixedTrials())).toThrow();
  });

  it('rejects a remainder that cannot be expressed as an exact regular rate in cents', () => {
    const rows = [regular('a'), regular('b'), regular('c')];
    expect(() => splitLegacyProKlaseTutorInvoiceLines([{
      description: 'Pamoka', quantity: 3, unit_price: 13.33, total_price: 40,
      session_ids: rows.map(session => session.id),
    }], rows)).toThrow();
  });
});
