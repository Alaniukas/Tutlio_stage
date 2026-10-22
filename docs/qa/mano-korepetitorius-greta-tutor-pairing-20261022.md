# Mano korepetitorius: archived duplicate blocks tutor assignment

Inspected on 2026-10-22 after the user supplied screenshots of Greta Bespalovaitė's student card and timetable. The screenshots are evidence of the incident, not authorization to change customer data, send messages, commit, or deploy.

Release reconciliation, 2026-10-22: the frontend correction below is already committed in `047dc1af` and is included in the user's now-authorized combined production release. A fresh read confirmed the existing parent pointers and matching portal links on Greta's live/archived cards and both of Goda's cards. The repair scripts are retained as incident records and were not rerun. The expanded release verification passed 201 tests across 19 files; deployment and live-QA receipts are in ignored `output/proklase-check-20261022/172814/release/`.

## Production observations

Project: `cuhciqwmqfuajeeqjjbm`. Organization: `2c4e4c2a-4e12-44ca-b327-d605bbb0d50b` (`mb-mano-korepetitorius`). Read-only queries found two student rows with the same organization, normalized child name, student email and child Auth account (`73d4b8b1-2ad8-4c8d-be65-c7ea7ff5c97c`):

| Row | Current state | Family links | Existing lessons |
| --- | --- | --- | --- |
| `ab86d501-2dc9-44fe-93d9-51f4d3e56fb5`, code `3UAZRA` | Active, Pijus Oželis | Payer contact is present; `parent_user_id` is null and no `parent_students` row exists | 6 |
| `c40d3ff1-12c1-470a-b473-bd39a8bab430`, code `U13M6P` | Archived (`detached_at = 2026-10-22T12:04:02.561Z`), no tutor | `parent_user_id = 7196537a-c7a0-49eb-ad77-0442ac631372`; linked parent profile `7e7c652c-d9fa-4280-8e37-f20b2d0052e3` | 7 |

Neither row has an active recurring series at inspection. The parent's Auth email matches the active row's payer contact; that parent has confirmed their email and previously signed in. These checks establish the exact existing family relationship. They do not authorize reactivating the archived row or changing Auth identities.

PostgreSQL logs in the inspected 11:50–13:00 UTC window contain the exact exception `Student assignments do not represent the same child`, including events at 12:00:23, 12:00:25, 12:01:17, 12:02:04 and 12:02:28 UTC. The live definition of `copy_student_parent_links_for_tutor_pairing` explicitly rejects an archived source or target. Its restriction is correct.

## Cause and local correction

Both the student-card Add Tutor action and timetable booking use `ensureStudentPairedWithTutor`. Its sibling queries previously included archived rows. Given the current data, it chooses the archived tutorless duplicate as a reusable assignment, then the family-link RPC rejects that target. This explains both screenshots without assuming two different children or an invalid student account.

All four candidate searches now require `detached_at IS NULL`: payer contact, student contact, child Auth account and the target-tutor contact fallback. Active tutorless rows remain reusable. Archived cards, their tutor instructions and their historical lessons do not enter the assignment operation. The source lookup now fails closed on a failed read, missing card or archived card. Claiming a tutorless card checks that it is still live and unassigned and requires a returned row; a concurrent archive/assignment stops the operation before moving lessons. No database migration or relaxation of family-link authorization is required for this frontend correction.

The frontend correction and recovery of missing family relationships are separate changes. After the user's explicit follow-up request to fix the incident and prevent recurrence, the data repairs below were authorized and applied. No new tutor, lesson date, payment allocation, or invoice change was inferred from the screenshots.

## Authorized data repairs and organization-wide audit

`scripts/sql/repair-mk-greta-parent-links-20261022.sql` restored the verified parent in both `students.parent_user_id` and `parent_students` on the active Greta card. It locks both cards, checks the exact organization and child Auth account, matching child name/email, the original guardian relationship, confirmed parent Auth email and payer match, and rejects conflicting current family links. It is atomic and idempotent. The archived card remains archived; lesson counts remain 6 and 7.

The expanded audit covered all **52 active student rows** in the organization. It looked for missing existing guardian relationships among same-organization, same-name rows with the same actual child Auth account, including archived donors. The wider archived-contact check also considered matching student email/name and exposed conflicting child accounts for review. It did not infer families from payer email alone.

Besides Greta, the broader active-pairing audit found one incomplete card for **Goda Mackevičiūtė**: target `b086aab1-901f-4ea5-aabc-3cf4d2e393d5` lacked the existing guardian relationship on active source `fbb7b3c9-c47a-43d4-94eb-d9b4987e5e9b`. Both share child Auth account `2954ceab-342c-4ebe-85f9-cff29dc8b11d`, name and student email. `scripts/sql/repair-mk-active-parent-pairings-20261022.sql` uses the existing guarded family-copy RPC under `authenticated` with an accepted, active organization owner and an existing valid session. It was first verified in a transaction ending in `ROLLBACK`, then committed. The existing parent profile is `77b18707-5cb0-4c73-b0f1-a50ef730a36b` / user `2b71af12-1270-4671-bd04-44783eec8067`. All 79 lessons remain in place.

After both repairs the same 52-row audit reports **0 cards missing a same-child donor's existing parent relationship**, and **0 parent pointers without the matching portal link**. This covers those specific consistency conditions, not every possible customer issue.

Read-only production RLS checks used `SET LOCAL ROLE authenticated` with each actual actor's existing valid session claims; no new sessions or login tokens were created. The parent, student, assigned tutor and all three active MK administrators can each read Greta's active card and its six lessons. Goda's parent can read both child cards and all 79 lessons. These checks prove the database read paths; the new frontend booking behavior still requires release and subsequent UI verification.

## Verification and release status

Four original regression cases initially failed with the same database exception. The expanded verification passes **145 tests across 14 files** (144 in the combined run, followed by a 16-test assignment run including one additional failed-source-read case), covering tutor assignment, student identity, lesson reassignment, recurring trial creation, student-card tutor removal, parent session access, archived parent/child handling, registration identity, admin permissions, active-session enforcement and the exact Greta repair. Cases include archived duplicates, a stale selected card, a missing card, concurrent archival/assignment, conflicting families and transactional rollback. Existing database authorization tests exercise permitted administrators and deny foreign organizations, different children/accounts, missing permissions, revoked memberships and anonymous calls.

`npm run lint` (`tsc --noEmit`), `npm run build` (including PWA generation) and `git diff --check` pass. The working directory already contained unrelated changes and continued to receive unrelated edits; they were preserved. Release verification must use the final intended release commit.

The initial investigation was read-only; only the two family-link repairs above were subsequently applied under the follow-up authorization. No schema/RLS policy changes, email, commit, push, or frontend deployment were performed. `AGENTS.md` now requires positive and negative role checks, actual authenticated access, archive/concurrency cases, affected-organization audits and an explicit distinction between local and production verification after access-related changes.

The user explicitly authorized including these previously untracked incident records after review. Production release follows AGENTS.md section 8: intended changes committed on `simo-local`, a clean release checkout and push to `origin/simo-local` before deployment. The historical local-versus-live descriptions above refer to the original investigation; the combined release status is recorded separately.
