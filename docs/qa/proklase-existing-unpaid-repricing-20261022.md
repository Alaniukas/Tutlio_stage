# Pro Klasė: existing unpaid lesson prices, 2026-10-22

Release authorized by the user: commit and push to `simo-local`, apply this migration and deploy to production. The database migration was applied and its function/permission guards checked on 2026-10-22 at 18:06 Europe/Kyiv. No real customer records, payments, invoices or messages were changed by the investigation. Deployment and synthetic live-QA receipts are stored in ignored `output/proklase-check-20261022/172814/release/`.

## Request and evidence

The user asked to check the Pro Klasė administrator's voice note `WhatsApp Ptt 2026-10-22 at 17.28.14.ogg` against the recent fixes. The user explicitly authorized transferring this recording to OpenAI for transcription. The transcript is ignored at `output/proklase-check-20261022/172814/transcript.lt.txt`.

The administrator says the earlier full-price cases have been reviewed. The requested behavior is to choose the weekly lesson count while creating a student and, when that count is changed, to update existing unpaid lesson prices too. The recording is evidence of the desired behavior, not authorization for production writes or customer contact. This correction interprets existing lessons as including lessons that have already taken place.

The creation selector and manual-frequency propagation are already present in commit `047dc1af`. The automatic-mode display correction is in `c9987d87`. The student card calls `set_student_pricing_frequency` once for the child identity.

Read-only inspection confirmed the deployed RPC still contains `lesson_session.start_time > now()`. That condition skips every lesson that has already started, even when it is unpaid. This is a database behavior gap rather than another missing creation-form field.

The project was healthy when inspected. The scoped PostgreSQL log search found no entries mentioning this RPC or dynamic pricing between 13:00 and 15:00 UTC. Existing security and performance advisories were reviewed; the exposed-security-definer warning includes this existing public RPC. The correction retains its authenticated entry point, empty search path and explicit authorization, and adds a live-session check and target-organization membership validation. It creates no new public function or grants.

## Prepared correction

`20261022180618_proklase_reprice_existing_unpaid_lessons.sql` replaces the existing RPC. Historical repricing is limited to an active, accepted Pro Klasė or Pro Klasė QA administrator with the existing edit permissions, or its owner. Authorized tutor edits and other organizations keep their existing future-only date scope.

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

The 135 tests above are local function/component regressions. Live verification is recorded separately in the release receipts, so those tests alone are not evidence of a completed live-browser flow.

The fix was first committed and pushed as `be7789c3` on `simo-local` from a clean checkout. The CLI dry run found older remote/local migration-history differences, so only this exact migration was applied with the Supabase connector. Its recorded version is `20261022180618`; the local file and references were aligned to that version without modifying older migration history. The follow-up release commit contains this filename alignment and these release notes.

## Expanded release scope authorized by the user

The user subsequently requested review and release of all eleven earlier untracked files. They were restored with all eleven SHA-256 checks matching their original bytes. These files are three QA documents, five support/audit scripts and three regression suites; their associated application implementations were already committed on `simo-local`.

- MK parent/tutor assignment: the active-only candidate selection is in `047dc1af`. Read-only production checks confirmed the completed Greta and Goda parent repairs. Both guarded SQL scripts and the Greta regression are included as incident records.
- Pro Klasė pricing creation: implementation in `047dc1af` and automatic-mode display in `c9987d87`. The QA document's stale release wording was corrected.
- Gabija's paid trial and loading failures: card/calendar handling is in `9630d58c`. The applied package correction was checked again without rerunning it. Its guarded SQL, regression and QA document are included.
- Yohan September compensation: read-only inspection confirmed eight €6 credits, one correction audit and the existing €270 tutor invoice `SF-001`. The SQL and regression are historical support records and are not a migration to reapply.
- Laisvi lesson-outcome audit: complete as a read-only, date-bounded investigation script, with database reads and local report writes only. Its findings remain review items; including the script does not modify attendance, pay or invoices.

The expanded run passed 201 tests across 19 files, including all three restored regression suites, the actual repricing migration, active-session authorization, tutor/family isolation, assignment concurrency, request deadlines, card data errors, schedule loading and pricing form behavior. The release also passed frontend/API TypeScript checks and the production build. No application conflict or regression was found in these checks. The complete eleven-file set is included in the authorized release commit; the temporary preservation stash is no longer needed after that commit is verified.
