# School production readiness — approved follow-up

Date: 2026-09-08. This report supersedes the earlier local-only assessment.

## Production work completed

The user explicitly authorized the read-only Laisvi vaikai billing preview and requested migration application, controlled smoke tests, repository test repairs and database measurements.

All seven migrations were applied successfully to cuhciqwmqfuajeeqjjbm. Migration history matches the checked-in versions:

1. 20260908080306_school_reminder_recipient_parity
2. 20260908080341_school_member_schedule
3. 20260908081019_session_storage_lookup_index
4. 20260908083019_admin_provisioned_student_trigger
5. 20260908084926_atomic_school_group_save
6. 20260908085040_school_monthly_invoice_delivery
7. 20260908094256_school_session_billing_evidence_guard

The new group RPC and delivery table deny ordinary client access. The evidence guard prevents forged confirmation fields, preserves the assigned teacher's legitimate first Join click during the real join window, and replaces the browser timestamp with the database clock. Server confirmation and joining APIs remain supported.

## Controlled production smoke tests

- Real Demo Auth: independently provisioned parent and child, logged in with temporary passwords, changed passwords, logged in again, verified flags and links. Child profile has no teacher organization entitlement.
- This caught a real PostgREST behavior: a successful null-link update returned an empty representation. The endpoint now reads back the exact organization-scoped new account link before considering rollback. Regression tests reject a conflicting link.
- Real Demo confirmation: authenticated admin explicitly confirmed a finished disposable lesson; repeated confirmation preserved the original evidence and had no duplicate effects.
- All three disposable Auth users, the temporary lesson, parent links and student were cleaned up. No email was sent. Evidence: tmp/school-support-review/demo-account-smoke.json.
- Demo group transaction: saved two shared times and one pupil's subset; rejected an incompatible edit and verified rollback. Entire smoke transaction was rolled back.
- Demo reminders: pupil without email entered the parent queue; pupil with email and an already-sent reminder did not enter the parent queue. Entire smoke transaction was rolled back; no email delivery was invoked.
- Demo evidence guard: direct browser confirmation was denied; assigned teacher Join remained allowed and server-timestamped. Entire smoke transaction was rolled back.

## Billing preview and remaining factual reconciliation

The candidate billing handler ran locally with a network guard permitting only GET/HEAD requests to the production Supabase REST origin. It did not invoke the deployed billing cron. The September 1–7 result was:

- 13 proposed invoices, €78 total.
- 23 skipped agreements.
- 22 held agreements; zero processing failures, zero invoices written, zero emails sent.

The hold audit identified six group occurrences without teacher/administrator occurrence evidence, three ambiguous zero-price paid flags, and three individual scheduling/linkage cases. These are facts the school must reconcile, not safe values for software to invent. The new explicit confirmation flow enables authorized staff to attest a checked outcome. Existing real records were not changed.

See [the reconciliation report](laisvi-billing-reconciliation-2026-09-08.md) for exact record references and required decisions. Raw guarded preview: tmp/school-support-review/laisvi-billing-readonly.json.

## Repository verification

The full repository run passed 5,719 tests across 315 files with zero failures and one existing skipped test. Log: tmp/school-support-review/full-suite-release.json. The latest added confirmation readback case also passed its focused suite.

Localization repairs preserve lazy loading: send-email awaits only the recipient dictionary, and synchronous translator tests preload the server dictionary just as server renderers do. Existing translated marketing/payment sections are preserved; stale checks no longer require those translations to be English. Exact newly introduced organization/family workflow fallback keys remain enumerated for unpublished draft locales. Published Swedish/Dutch copy and four missing cancellation-label translations were repaired. Numeric assertions distinguish Japanese/Korean unit counters and Arabic/Hebrew dual forms from altered prices or quantities. Authentication email artifacts were regenerated locally from their source; hosted Auth email templates were not changed.

Final school release validation passed and is recorded in tmp/school-support-review/school-release-approved.log: 382 affected regression tests across 75 files, frontend/API TypeScript, five isolated SQL checks and Vite production build.

## Database measurements

The same read-only sessions.id::text lookup changed from a sequential scan of 3,096 rows, 115 buffer hits and 0.903 ms execution to use of sessions_storage_folder_lookup_idx, two index blocks and 0.133 ms execution. That is about 6.8× faster in these samples. A controlled authenticated Demo storage search completed in 314.527 ms without writes or disk spill.

At the baseline, the expensive storage.search role had 752 cumulative calls at 3,560 ms mean execution. Later it had 755 calls; the three intervening calls averaged approximately 461 ms. These calls can have different parameters and span the rollout, so they are supporting observations rather than a controlled before/after benchmark. Connections were 29/90 initially and 23/90 later, with two active in the later snapshot.

The index benefit is verified in production. These samples do not establish that every CPU/I/O/egress quota issue is eliminated. Existing Supabase advisor findings were not silently dismissed; the new private outbox intentionally has RLS without client policies.

## Release boundary

Production database migrations are applied. Candidate functions/UI/cron changes have not been deployed and no commit was created. The shared checkout includes other work, so application deployment must use the reviewed release scope. Automatic billing correctly holds ambiguous real records until the school resolves them; the preview is not approval to charge those records.
