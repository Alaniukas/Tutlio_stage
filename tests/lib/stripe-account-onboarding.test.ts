import { describe, it, expect } from 'vitest';
import { summarizeStripeOnboarding } from '../../api/_lib/stripeAccountOnboarding.js';

describe('summarizeStripeOnboarding', () => {
  it('is complete when charges + payouts enabled and nothing due', () => {
    const s = summarizeStripeOnboarding({
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: true,
      capabilities: { transfers: 'active' },
      requirements: { currently_due: [], past_due: [], pending_verification: [], disabled_reason: null },
    });
    expect(s.complete).toBe(true);
    expect(s.pendingVerification).toBe(false);
  });

  it('is complete when payouts lag but transfers are active', () => {
    const s = summarizeStripeOnboarding({
      details_submitted: true,
      charges_enabled: true,
      payouts_enabled: false,
      capabilities: { transfers: 'active' },
      requirements: { currently_due: [], past_due: [] },
    });
    expect(s.complete).toBe(true);
    expect(s.pendingVerification).toBe(false);
  });

  it('flags pendingVerification when documents are under review (the "Laisvi vaikai" case)', () => {
    const s = summarizeStripeOnboarding({
      details_submitted: true,
      charges_enabled: false,
      payouts_enabled: false,
      capabilities: { transfers: 'pending' },
      requirements: {
        currently_due: [],
        past_due: [],
        pending_verification: ['company.verification.document'],
        disabled_reason: 'requirements.pending_verification',
      },
    });
    expect(s.complete).toBe(false);
    expect(s.pendingVerification).toBe(true);
  });

  it('flags pendingVerification from disabled_reason alone', () => {
    const s = summarizeStripeOnboarding({
      details_submitted: true,
      charges_enabled: false,
      payouts_enabled: false,
      requirements: { currently_due: [], past_due: [], disabled_reason: 'requirements.pending_verification' },
    });
    expect(s.pendingVerification).toBe(true);
  });

  it('is neither complete nor pending when the user still has requirements due', () => {
    const s = summarizeStripeOnboarding({
      details_submitted: false,
      charges_enabled: false,
      payouts_enabled: false,
      requirements: {
        currently_due: ['individual.id_number'],
        past_due: [],
        pending_verification: [],
      },
    });
    expect(s.complete).toBe(false);
    expect(s.pendingVerification).toBe(false);
  });

  it('does not treat pending_verification as "pending" when something is also currently due', () => {
    const s = summarizeStripeOnboarding({
      details_submitted: true,
      charges_enabled: false,
      payouts_enabled: false,
      requirements: {
        currently_due: ['company.tax_id'],
        past_due: [],
        pending_verification: ['company.verification.document'],
      },
    });
    expect(s.complete).toBe(false);
    expect(s.pendingVerification).toBe(false);
  });

  it('handles an empty / missing account safely', () => {
    const s = summarizeStripeOnboarding({});
    expect(s.complete).toBe(false);
    expect(s.pendingVerification).toBe(false);
    expect(s.currentlyDue).toEqual([]);
    expect(s.transfers).toBeNull();
  });
});
