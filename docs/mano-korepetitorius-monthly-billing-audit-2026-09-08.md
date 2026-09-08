# Mano korepetitorius: monthly billing investigation

Production organization: `2c4e4c2a-4e12-44ca-b327-d605bbb0d50b` (`mb-mano-korepetitorius`). The similarly named `manokorepetitorius` slug belongs to DEMO and was not modified.

## Findings

- Organization already had `enable_per_lesson=false`, `enable_monthly_billing=true` (packages also enabled).
- All 18 student records had `payment_model=NULL` (inherit organization settings).
- Both payment reminder crons only checked explicit student models. With NULL, they ignored the organization/tutor per-lesson toggle and could send payment requests.
- Both per-session checkout endpoints had the same NULL-means-allowed defect.
- One of 15 tutor profiles still had per-lesson enabled and monthly billing disabled. The existing organization synchronization trigger runs when organization settings change; consumers must read the current organization rather than rely on profile copies.
- Among 383 sessions for these students, 3 had `payment_deadline_warning_sent=true`; none had `payment_batch_id`. This flag is evidence of the warning path, not independent proof of payer email delivery or a fiscal invoice being issued. No email delivery log was available in the inspected database tables.

## Production data mitigation applied and verified

- Updated exactly 18 students from NULL to `monthly_billing`.
- Corrected the two billing flags on exactly one mismatched tutor profile.
- Verification: 18/18 students monthly; 15/15 profiles monthly enabled and per-lesson disabled.
- Existing payments, invoices, lesson balances and organization package settings were not changed. No email was sent during investigation.
- Rollback of this mitigation, if intentionally requested: restore these student models to NULL. This would expose them to the old cron defect until code is deployed.

## Local code fix

- Shared billing eligibility: explicit student model takes precedence; otherwise current organization (or solo tutor) per-lesson toggle is required.
- Organization lookup failure blocks processing rather than falling back to stale tutor settings.
- Both before/after lesson reminder crons use the rule; skip lessons already assigned to a billing batch or package.
- Both checkout endpoints use the rule before creating/reusing a per-session checkout.
- Explicit per-lesson student exceptions and existing penalty checkout behavior are retained.

API TypeScript check and targeted regression tests passed. Code changes are not committed or deployed. New students with NULL payment models require deployment of the code fix for automatic inheritance in these endpoints; the production data mitigation protects the current 18 students.

## Follow-up: lessons previously sent a payment request

Verified both `CompanyFinance.handleInvoicePreview` and `create-monthly-invoice`: eligibility depends on unpaid, non-cancelled, non-complimentary lessons with no package/billing batch, within the selected period and after their start time. Neither a sent warning nor `payment_status=pending` excludes a lesson.

Production recheck: all 383 lessons meet the non-time eligibility conditions, all belong to students now on monthly billing, all tutors match the student organization, and all have a payer email. Five lessons have already started/completed; 378 are active, including seven scheduled today. All 383 have `paid=false`, `payment_status=pending`, no package, no billing batch, and no stored individual Stripe checkout ID. The three warned lessons are included in this eligible set. No session data rewrite is needed, and no payment should be marked paid/confirmed just to include it in monthly billing.

The monthly setting does not itself issue invoices: the organization selects the billing period and creates/sends the monthly invoice through Finance. Future lessons become selectable after their start time, provided they remain unpaid and are not cancelled or made complimentary.
