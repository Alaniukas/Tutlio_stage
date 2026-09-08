# School support release verification

**Superseded by [the approved production follow-up](school-production-readiness-2026-09-08.md): migrations and Demo smoke tests are now complete, the full test suite is green, and the real billing preview has run. The local-only findings below are historical.**

Date: 2026-09-08. Production changes, commits, real account creation and email sending have not been performed.

## Verified locally

Run `node scripts/verify-school-release.mjs` after `npm ci`. The runner executes the affected school, scheduling, reminder, authentication and billing tests, both TypeScript checks, four isolated PostgreSQL migration checks and a production build. It exits on any failure. PostgreSQL tests use the pinned development dependency @electric-sql/pglite, not a manually installed temporary runtime.

The final run passed 74 suites / 371 tests, both type checks, all four SQL checks and the production build, including the duplicate-occurrence billing regression. The verification log is tmp/school-support-review/school-release-final.log.

Browser verification used real React components with synthetic HTTP/Auth/email fixtures: independent parent/student setup, required password change, invalid password confirmation, individual subject selection and per-student group schedule. Screenshots are in tmp/school-support-review/. Live Auth and delivered email remain post-migration smoke checks; only the production Supabase project is available.

## Additional defects corrected

- Admin Auth creation no longer races the existing email-link trigger. Student profiles do not get teacher organization membership; the organization remains on the student record. Rollback only deletes the newly created Auth user.
- Switching pupil cards while account creation is in flight cannot reveal the previous pupil's returned credential on the new card.
- Group fields, times and members are written in one database transaction. Failed slot/member writes roll back the save. View-only administrators and students cannot edit groups. Student group responses omit other pupils' contact details.
- Contract start-gate reads are paginated and fail closed. Ended agreements do not cause future group lessons to be recreated; a replacement active agreement takes priority.
- Individual contract list rows show the subject, teacher and indicative monthly amount, with matching search. The legacy contract integration test now exercises the actual completion-page and payment endpoints.
- Canonical school billing follows the frozen agreement's actual-payable lessons, including cancellation and termination rules. Custom templates retain their previous model. Missing or ambiguous evidence holds the invoice for review; existing invoices are not silently recalculated. See the billing audit for details.
- Invoice emails have a private durable send record, frozen rendered payload, provider deduplication and hourly retries. Uncertain legacy sends and expired retry windows are held for reconciliation.
- Duplicate payable session rows for the same pupil/service/time hold the invoice for review instead of allowing a double charge. The cron-authenticated dryRun preview supports a single elapsed month interval and never writes invoices or sends emails, including for existing invoices.
- Two extensionless imports that could break Vercel cold starts were repaired. Compatible Browserslist and XML serializer security patches were applied in the lockfile.

## Required migrations, in order

These are local and unapplied to production:

1. 20260908080306_school_reminder_recipient_parity.sql
2. 20260908080341_school_member_schedule.sql
3. 20260908081019_session_storage_lookup_index.sql
4. 20260908083019_admin_provisioned_student_trigger.sql
5. 20260908084926_atomic_school_group_save.sql
6. 20260908085040_school_monthly_invoice_delivery.sql

The existing monthly-invoice payment migration is a prerequisite; production was checked for created_at and invoice_email_sent_at. Apply the six reviewed migrations before the matching application release. The outbox migration deliberately marks uncertain historical sends for review.

Vercel configuration adds hourly delivery retry at minute 17 with a 90-second duration. Invoice generation has a 300-second duration, a bounded 240-second processing window and retries hourly 04:00–23:00 UTC on the first day of the month. Review deferred/held responses rather than interpreting HTTP 409/503 as a completed billing cycle.

## Limits of the release assessment

This is verification of the school corrections, not certification of every unrelated change in the shared working tree. The full repository run still finds failures in draft-locale translation/email checks and unrelated in-progress work. Logs are in tmp/school-support-review/full-suite-final.log. The school regression runner is intentionally explicit about its scope; it does not hide or skip failing tests within that scope.

The production storage index benefit must be measured after migration. An isolated query plan does not establish that every database quota issue is resolved. Existing Supabase advisor warnings need separate review; the new RPC and outbox privileges are explicitly covered by the isolated SQL tests.

The production dependency audit after compatible patches reported no critical, high or moderate advisories. One low-severity Windows esbuild development-server advisory remains; no breaking dependency upgrade was attempted.

Read-only metadata checks identified 58 accepted Laisvi vaikai contracts: 57 current canonical editions and one legitimate older group-only edition, now covered by the model detector. A proposed local preview of the real September 1–7 records was rejected by automatic approval review because using the service credential against real organization data conflicts with the repository's Demo-only local QA rule. Explicit user approval for that exception is pending. The preview was not executed by an alternate route.

Before rollout: isolate the reviewed application changes from unrelated work, apply the migrations, deploy the matching functions/UI/cron configuration, then run controlled Demo-school Auth, group-save and reminder smoke checks. Real client data must not be used for test mutations. Production deployment still requires the user's explicit authorization under AGENTS.md.
