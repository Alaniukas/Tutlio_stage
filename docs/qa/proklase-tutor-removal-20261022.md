# Pro Klasė tutor removal, 2026-10-22

Status: the customer-data repair was applied and verified in production on 2026-10-22 after the administration's decision to cancel Lithuanian and keep only mathematics was supplied by the user. The general migration and frontend fix remain local and undeployed; their release requires the approval described in AGENTS.md section 8.

The WhatsApp video was transcribed with OpenAI `gpt-transcribe`. Raw transcript, frames and read-only production evidence are under ignored `output/proklase-video-20261022/`.

## Confirmed failure

Amanda has a mathematics assignment with Barbora and a Lithuanian assignment with Vakarė. Removal used separate requests to move active lessons, move packages, update the recurring template, then remove the assignment. It automatically chose the only remaining tutor as a transfer target.

Postgres recorded SQLSTATE `57014` on the recurring-template update at 07:10:57, 07:12:08 and 07:12:51 UTC on October 22. The permission path included `org_has_feature` and profile/parent/chat RLS helpers. Earlier lesson writes remained committed.

The 34 Lithuanian lessons therefore moved to Barbora's assignment, while their active template and Vakarė's assignment remained. The timetable filters on `sessions.tutor_id`, explaining the disappearance under Vakarė. A pending €87 consolidated October offer still includes one maths lesson and two Lithuanian lessons.

## Resulting behavior

- Removal uses one database transaction for guardian preservation, cancellation, template deactivation and clearing the tutor assignment. Any failure rolls everything back.
- It cancels future unpaid individual lessons and keeps historical, completed, past unconfirmed and school class-group lessons. It keeps the student row and paid package balances.
- It never infers a replacement tutor. The confirmation explains cancellation explicitly.
- Payment/package/invoice-linked future lessons and pending offers involving the tutor require billing review before removal.
- Both editing permissions are required; accepted owners are also allowed. The private transaction checks live membership, organization suspension and active login session. The public RPC is an invoker wrapper; anonymous and service roles cannot execute it.
- The stopped-template insert guard prevents a stale materializer from recreating future lessons.
- Successful removal refreshes the student card, schedule, dashboard and statistics caches and selects a remaining assigned tutor.

## Prepared one-off repair

`scripts/sql/repair-proklase-amanda-tutor-removal-20261022.sql` is a separate, guarded transaction. It:

1. Checks the exact organization, child account, two assignments, series, 34 untouched future lessons and pending unpaid offer. It refuses elapsed, paid, confirmed, invoiced or otherwise changed lessons and refuses a live Checkout Session.
2. Cancels the existing €87 offer using `cancel_pending_lesson_package`, preserving the immutable original quote.
3. Restores the 34 Lithuanian lessons to their original assignment, marks them cancelled and hides them from the calendar; stops the template and clears Vakarė's tutor assignment.
4. Creates a €29 offer for the one remaining October maths lesson using `create_org_student_package`.
5. Verifies that all 35 mathematics lessons are byte-for-byte unchanged. The paid trial and family records stay intact. Repeating a completed repair does not create another offer.

It sends no emails, creates no Checkout Session and modifies no paid invoice. Export the affected student rows, recurring templates, lessons, packages, package items and `pooled_package_quotes` to an ignored backup before running it. Run read-only verification afterwards and record the replacement package ID. Any guard failure requires a fresh review, not removal of the guard.

## Validation

The database tests execute real Postgres functions with PGlite. The repair tests load the actual existing package creation, cancellation, allocation and immutability functions. They verify rollback on a late replacement failure, payment/checkout/invoice drift, preservation of maths/history/paid credits and safe retries. Other tests cover the student-card confirmation and RPC payload, permissions, billing errors, guardian preservation, translations and existing Pro Klasė student flows.

Results: 162 distinct targeted tests passed across the final regression runs (11 files). Frontend TypeScript, API TypeScript and the production build passed. These checks preceded the separately approved customer-data correction below.

## Applied customer-data correction

Applied at approximately 13:20 Europe/Vilnius on 2026-10-22. The preflight still showed 34 future active, unpaid, unconfirmed Lithuanian lessons, the pending €87 offer, and no Checkout Session. A full local backup was verified before executing the guarded SQL transaction.

Post-write read-only verification confirmed all six checks: all 34 Lithuanian lessons cancelled and restored to their original assignment for history; the Lithuanian template inactive; Vakarė removed from the child assignment; all 35 mathematics lessons byte-for-byte unchanged; the paid trial and family links unchanged; old €87 quote cancelled and one new pending maths-only offer for €29.

Replacement package ID: `7e7e14ef-7a5f-4cf9-99bd-82b328522ed8`. It quotes the October 26 maths lesson only. No email or Checkout Session was created.

Backup: ignored `output/proklase-video-20261022/repair-20261022T101854Z-before.json` (69 lessons plus child, family, recurrence, package, item and quote records). Verification receipt: `repair-20261022T101854Z-after.json` in the same directory. The mathematics fingerprint remained `d2e0b631b6b5617d8b25e9ee6954ab52`; the paid-trial package fingerprint remained `f8c59b4281fe539b89c8ec204669e91b`.

Commands:

```text
npm run lint
npm run lint:api
npm run build
npm test -- tests/db/org-student-tutor-removal.test.ts tests/db/proklase-amanda-tutor-removal-repair.test.ts tests/db/tutor-pairing-parent-links.test.ts tests/lib/reassign-student-tutor-lessons.test.ts tests/lib/org-student-pairing-parent-links.test.ts tests/lib/i18n-coverage.test.ts tests/lib/school-terminology.test.ts tests/pages/company-students-tutor-removal.test.tsx tests/pages/company-students-proklase.test.tsx tests/pages/company-students-proklase-departure.test.tsx tests/pages/company-students-history.test.tsx
```

The initial sandboxed Vitest attempt failed before collecting tests because Vite could not rename its temporary files. The tests run successfully outside that filesystem sandbox. Build output includes existing Tailwind sourcemap, Excalidraw import and chunk-size warnings.

Production browser/RPC verification remains pending the authorized migration/frontend release. The automated UI tests use synthetic fixtures; no production customer actions were exercised.

## Release

Keep the customer repair separate from schema migration history; it is already applied and does not need to be rerun during release. Commit the intended release changes on `simo-local`, verify a clean checkout and push `origin/simo-local` before deployment, as required by AGENTS.md. The workspace already contains unrelated changes; review that release scope explicitly. Apply the general migration with the frontend release. No source commit, push, schema migration or application deployment was performed as part of the customer-data correction.
