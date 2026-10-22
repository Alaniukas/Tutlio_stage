# Pro Klasė: existing unpaid lesson prices, 2026-10-22

Status: prepared and tested locally. The migration has not been applied to production. No customer records, payments, invoices, messages, commits, pushes or deployments were changed by this investigation.

## Request and evidence

The user asked to check the Pro Klasė administrator's voice note `WhatsApp Ptt 2026-10-22 at 17.28.14.ogg` against the recent fixes. The user explicitly authorized transferring this recording to OpenAI for transcription. The transcript is ignored at `output/proklase-check-20261022/172814/transcript.lt.txt`.

The administrator says the earlier full-price cases have been reviewed. The requested behavior is to choose the weekly lesson count while creating a student and, when that count is changed, to update existing unpaid lesson prices too. The recording is evidence of the desired behavior, not authorization for production writes or customer contact. This correction interprets existing lessons as including lessons that have already taken place.

The creation selector and manual-frequency propagation are already present in commit `047dc1af`. The automatic-mode display correction is in `c9987d87`. The student card calls `set_student_pricing_frequency` once for the child identity.

Read-only inspection confirmed the deployed RPC still contains `lesson_session.start_time > now()`. That condition skips every lesson that has already started, even when it is unpaid. This is a database behavior gap rather than another missing creation-form field.

The project was healthy when inspected. The scoped PostgreSQL log search found no entries mentioning this RPC or dynamic pricing between 13:00 and 15:00 UTC. Existing security and performance advisories were reviewed; the exposed-security-definer warning includes this existing public RPC. The correction retains its authenticated entry point, empty search path and explicit authorization, and adds a live-session check and target-organization membership validation. It creates no new public function or grants.

## Prepared correction

`20261022144501_proklase_reprice_existing_unpaid_lessons.sql` replaces the existing RPC. Historical repricing is limited to an active, accepted Pro Klasė or Pro Klasė QA administrator with the existing edit permissions, or its owner. Authorized tutor edits and other organizations keep their existing future-only date scope.

The frequency and lesson updates remain one transaction. Manual choices update all tutor assignments of the same child; automatic mode recomputes the count from those assignments' recurring schedules. Siblings sharing a payer, archived assignments and other organizations are not merged.

Eligible lessons are unpaid regular individual lessons in active/completed/no-show status, with a matching grade/frequency tier. Unpaid `confirmed` monthly-billing lessons remain eligible when they have no financial snapshot. The correction preserves paid/refunded lessons, trial/group/individual prices, complimentary or cancelled lessons, class groups, attached packages, payment batches, Stripe checkouts and Perlas transactions.

Non-cancelled customer invoices linked by source session or line-item session IDs, and non-cancelled pooled package quotes, also preserve their agreed amounts. Their correction requires the existing explicit invoice/package workflow. A tutor-pay invoice does not freeze the client's lesson price and is never modified by this function.

Applying the migration does not reprice any records. Repricing happens only when the administrator calls the frequency RPC, including when selecting the same count again. No automatic customer backfill was prepared or performed.

## Verification

135 targeted tests passed across 10 files, plus `npm run lint` and `git diff --check`:

- 37 in-memory PostgreSQL tests execute the actual migration and identity/session helpers. They reproduce the old future-only behavior, then verify past/future correction, manual/automatic mode, permitted administrator roles, cross-child and cross-organization isolation, revoked/pending memberships, active-session checks, tutor restrictions, financial protections and transaction rollback.
- 69 tests cover the real student form, existing pricing logic and the three required organization tutor-invoice privacy suites.
- 29 tests cover Pro Klasė tutor-pay and invoice regressions.

An initial fixture run failed before the new tests executed because a SQL helper was loaded before its dependency. The dependency order was corrected and all 37 new tests then passed. Windows sandbox temporary-file restrictions required running the synthetic suites outside that filesystem sandbox.

A read-only production aggregate found three past lessons eligible under the prepared safeguards; none differed from its student's current tier. It also found 64 future lessons differing from the current tier. A current-tier comparison alone does not establish the agreed price at booking, the history of a frequency change, or a historical overcharge. No bulk repricing or client-level diagnosis is justified by that aggregate. The recording identifies no specific affected child.

These are local function/component regressions and production read-only observations. They are not a claim that the new database behavior has been released or verified in a live browser.

Production application requires explicit user authorization and the `simo-local` commit, clean-workspace and push sequence in AGENTS.md section 8. Pre-existing unrelated workspace files were preserved.
