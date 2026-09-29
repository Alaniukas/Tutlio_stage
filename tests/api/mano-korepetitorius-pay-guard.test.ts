import { describe, expect, it } from 'vitest';
import { findUnpricedManoTutorSessions } from '../../api/_lib/manoKorepetitoriusPayGuard';
import { MANO_KOREPETITORIUS_ORG_ID } from '../../src/lib/marketMoney';

describe('Mano korepetitorius tutor invoice pay guard', () => {
  it('accepts positive historical snapshots and subject overrides even when the base rate reset', () => {
    const missing = findUnpricedManoTutorSessions(
      [
        { id: 'historic', subject_id: 'math', tutor_pay_eur_snapshot: 18 },
        { id: 'override', subject_id: 'english', tutor_pay_eur_snapshot: null },
      ],
      MANO_KOREPETITORIUS_ORG_ID,
      0,
      { english: 22 },
    );
    expect(missing).toEqual([]);
  });

  it('blocks unresolved zero pay rather than using the client lesson price', () => {
    const missing = findUnpricedManoTutorSessions(
      [
        { id: 'new', subject_id: 'math', price: 40, tutor_pay_eur_snapshot: null },
        { id: 'zero-snapshot', subject_id: 'english', price: 45, tutor_pay_eur_snapshot: 0 },
      ],
      MANO_KOREPETITORIUS_ORG_ID,
      0,
      { english: 22 },
    );
    expect(missing).toEqual(['new', 'zero-snapshot']);
  });
});
