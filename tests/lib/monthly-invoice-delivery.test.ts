import { describe, expect, it } from 'vitest';
import { requireMonthlyInvoiceDelivery } from '../../src/lib/monthlyInvoiceDelivery';

describe('monthly invoice delivery UI result', () => {
  it('rejects an HTTP-ok partial send and retains the recovery message', () => {
    expect(() => requireMonthlyInvoiceDelivery({
      success: false, totalBatches: 1, error: 'Sąskaita sukurta, bet laiškas neišsiųstas.',
    }, 'Klaida')).toThrow('Sąskaita sukurta, bet laiškas neišsiųstas.');
  });

  it('never reports an empty delivery as success', () => {
    expect(() => requireMonthlyInvoiceDelivery({ success: true, totalBatches: 0 }, 'Klaida')).toThrow('Klaida');
  });

  it('returns the number of delivered payer emails', () => {
    expect(requireMonthlyInvoiceDelivery({ success: true, totalBatches: 2 }, 'Klaida')).toBe(2);
  });
});
