# Shared payment and invoice reliability review, 2026-10-02

The Pro Klasė payment-return fix exposed a shared race in other tutor organizations: the payment return could mark a package paid before its Stripe webhook arrived, and the webhook then skipped sales invoice creation. Direct lesson sales invoicing was also guarded by the Pro Klasė organization ID.

## Changes prepared

- Both successful payment confirmation endpoints and both successful Stripe webhook event types call `issuePaidSourceSalesInvoice`, including already-paid replays.
- The service-only `issue_paid_source_sales_invoice` database function derives the seller from the locked payment source. Invoice number allocation, invoice, lines and package link commit together or roll back together.
- A failed database operation returns a webhook error so Stripe can retry. Browser confirmation continues to report a successfully collected payment.
- Organization sales require that organization's complete invoice profile. A tutor's personal profile cannot substitute for it. The existing admin invoice settings warning remains available; missing settings are logged without endlessly retrying an unconfigured seller.
- The invoice uses the verified base payment, excluding the payer processing fee, and retains EUR/PLN currency in its metadata, PDF and organization invoice list.
- Existing customer invoices are reused. A partial payment cannot settle a larger combined invoice. Tutor remuneration invoices and other tenants' invoices are excluded.
- Pro Klasė's tax note stays scoped to its seller. Other organizations use their own seller identity and configured education invoice feature. School contract/monthly lesson billing and solo tutors' manual lesson invoicing retain their existing workflows; solo prepaid packages retain automatic personal sales invoicing.
- Shared pagination now continues until an empty page, so a response cap below the requested page size cannot silently truncate billing checks.
- Type declarations in today's tutor reminder and school attendance/invoice changes were corrected so the complete frontend and API type checks pass.

## Read-only production findings

The audit covered verified Stripe lesson/package payment records since 2026-09-01 and checked paid packages as an additional source. It checked customer invoices through explicit source IDs, package links and invoice lines, excluding tutor remuneration invoices.

- Pro Klasė's checked verified payment records have customer invoices after today's deployed repair.
- Mokslo vaisiai has no organization invoice profile. Nine lesson payment records and one package payment record have no customer sales invoice. Its invoice profile must be completed before those historical records can be reconciled. No invoices or customer records were changed for this organization during the review.
- A Pro Klasė package marked paid has neither a Stripe checkout nor payment ledger evidence. It was kept outside the verified Stripe payment findings; a stored payment-method label alone does not prove a collected Stripe charge.
- No additional missing linked Stripe package invoices were found for another company with a configured invoice profile in this period.
- All 75 checked company customer invoices had lines whose totals matched the invoice total.

## Validation and release

Regression coverage exercises other organizations and Pro Klasė, both callback orders, already-paid retries, transient failures, transaction rollback, two tenant invoice series, multiple subjects, changed package prices, missing profiles, zero-fee checkouts, PLN, partial invoices and tutor invoice privacy. Shared pagination is tested with response caps of 37, 137 and 500 rows.

Validation: 326 tests passed across 35 files, including the required API, database and client tutor invoice privacy regressions. The final payment run passed 75 tests, including two additional cancelled-package and linked-session retry cases (328 distinct passing tests overall). Frontend/API type checks and the production application build passed. A validation summary is saved locally in `tmp/universal-invoice-audit-20261002/verification-summary.json`.

The new migration only adds an internal function; it does not backfill any tenant's historical data. Apply it before releasing the API callers. Release must follow AGENTS.md section 8: approved commit on `simo-local`, clean checkout, push to `origin/simo-local`, then production deployment and smoke checks.
