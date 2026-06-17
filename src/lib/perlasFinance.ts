/**
 * Global kill-switch for PerlasFinance bank payments (client-side).
 *
 * When `false`, PerlasFinance is fully removed from the product surface:
 * payer-facing "pay via bank" buttons and the tutor/org payout sections are
 * hidden, and the payment init endpoint rejects requests (see
 * `api/perlas-payment-init.ts`, which mirrors this flag server-side).
 *
 * All underlying infrastructure (API routes, DB tables, admin payout tooling,
 * i18n) is intentionally left intact so the feature can be re-enabled later by
 * flipping this flag back to `true`.
 */
export const PERLAS_FINANCE_ENABLED = false;
