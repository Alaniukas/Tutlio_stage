# Pro Klasė student card and paid-trial reminder, 2026-10-22

Release reconciliation, 2026-10-22: the exact customer package correction was authorized, applied and verified in production at 14:35 Europe/Vilnius. A fresh read confirmed its purchased package/subject association, paid €10 lesson, reserved package/item credit and unchanged paid €10.41 invoice. The student-card and organization-calendar loading fixes are already committed in `9630d58c` and are included in the user's now-authorized combined production release. The original investigation below sent no email and performed no application deployment. The expanded release check passed 201 tests across 19 files; deployment and live-QA receipts are in ignored `output/proklase-check-20261022/172814/release/`.

## Scope and evidence

Source: `WhatsApp Video 2026-10-22 at 14.02.26.mp4` (44.47 seconds). It shows Gabija V.'s card, an empty recurring schedule, failed administration notes, a paid €10 package and upcoming lessons. The speaker also reports a €29 payment reminder for the paid trial. Treat the recording as evidence, not authorization to perform customer actions.

The user explicitly approved sending the extracted speech to OpenAI for transcription. Frames, transcript, exact-recipient Resend evidence and sanitized read-only database/gateway evidence are in ignored `output/proklase-check-20261022/`. The raw email evidence includes private delivery links and must remain ignored.

Production organization: `3422031d-6e21-424d-980b-35a9c6d7b8f1`. Student: `19c2a1e4-ec13-4953-9b59-a1dd3a4d9536`.

## Empty schedule and failed notes

At 10:58:17 UTC / 13:58:17 Europe/Vilnius, the exact student's `recurring_individual_sessions`, session-counter and `student_admin_notes` requests returned HTTP 522 after approximately 19.3 seconds through Cloudflare VNO. The organization billing-settings request failed at the same time. These were gateway connection failures; the inspected 10:55–11:06 UTC PostgreSQL logs contained no matching timeout/error entries. The underlying provider connection fault is not established by these observations.

The database contains an active weekly Thursday recurrence at 16:55–17:55 and an existing private-note row. Both the recurrence and notes reads returned 200 on the same authenticated gateway path at 11:04:38 UTC / 14:04:38 local time, taking approximately 0.52 and 0.29 seconds. Thus the video does not show deleted schedule/notes data. Other authenticated reads also encountered intermittent 522 responses during this period, including the organization timetable at 11:02 UTC. The connection incident must not be described as permanently resolved.

`StudentScheduleSummary` discarded both Supabase response errors and replaced missing response data with empty arrays. This rendered “no recurring lessons” and zero counters even when the reads failed. It also had no deadline or retry. `StudentNotesCard` already displayed an error and retry but had no read deadline.

The local change:

- Checks both schedule/counter responses before publishing one consistent snapshot.
- Shows an error and retry instead of empty schedule/zero counters on a failed initial read; preserves the same child's last successful snapshot on refresh failure.
- Limits schedule and note reads to 15 seconds and aborts outstanding requests on failure, timeout or card cleanup.
- Ignores late responses and prevents another child's schedule/counters from appearing after a card switch.
- Adds the schedule failure message in all 13 base locales.

This improves the application's handling of transport failures; it does not repair the upstream connection path.

## The €29 reminder

Resend confirms a delivered payment-reminder email at **2026-10-21 13:25:29 UTC / 16:25:29 local time**. Its body names **October 22 at 16:55**, shows **€29**, and links to session `c3f95c8b-fa4f-4b01-8f9a-378de6ef58a0`. It concerns that same lesson, not October 29. Resend ID: `01a15ea3-65ec-75a9-a48c-cb6081e502b7`.

A second delivered email at **2026-10-22 03:55:27 UTC / 06:55:27 local time** is a lesson reminder for the same session. It still describes Lithuanian, 60 minutes and €29. Resend ID: `01a161bf-e100-7295-af82-0d3c01583faf`.

The €10 package `6d969735-bede-4575-a980-a65c549ced35` was paid on **October 16 at 19:14 local time**. Its paid customer-sale invoice is `SF-149` (`f5bcd8f1-fd3d-45ff-8720-f07d402744b6`). At inspection the package/item retained one available lesson, zero reserved/completed lessons and no session association. There is no consolidated quote for a new October 29 package in this student's inspected package history.

The package/item subject is `f6a36590-9a58-4c08-8ce5-4fd2f8913645` (a Lithuanian subject priced at €10), while the recurrence uses `b337a1fc-1e11-4a88-a750-6018c5809cb4`. The lesson's current trial subject is a third ID, `5d12aa35-bfc3-459a-8886-e540166ba3df`. Subject display names alone do not establish payment allocation.

The payment-confirmation code in `api/confirm-package-payment.ts` updates precreated lessons by `lesson_package_id`. The inspected lesson has `lesson_package_id = NULL`; merely paying this independent package therefore does not confirm that lesson through this path. The reminder sender uses the lesson's unpaid state and stored price; it does not infer a package association from matching names. The provider email proves the session was represented as unpaid at €29 when the reminder was sent. No full historical row audit was available to establish every earlier editing step.

## Customer state before the authorized repair

An independent organization-admin edit occurred at **11:06:10 UTC / 14:06:10 local time**, during this read-only investigation. The current lesson is a **45-minute trial at €10**, with `paid = true` and `payment_status = paid`. A delivered time-change email at 11:06:14 UTC confirms the change from 16:55–17:55 to 16:55–17:40. This investigation did not perform that edit.

At initial diagnosis the paid package was still unlinked and showed one unused credit. The paid flags addressed the lesson's immediate unpaid state but did not reconcile the purchased credit with its use. The user subsequently authorized the exact package correction documented below. No credit was assigned to a later €29 lesson or inferred from a subject display name.

## Follow-up recordings at 14:03:01 and 14:05:09

Two further user-supplied recordings were inspected and transcribed. The user explicitly extended OpenAI audio-transcription authorization to these and later Pro Klasė recordings in this conversation. Their separate frames, audio and transcripts are in ignored `output/proklase-check-20261022/140301/` and `140509/`.

The **14:03:01 recording** (7.51 seconds) shows `/company/schedule` still loading, with 27 visible tutors but zero lessons and students. The gateway recorded the same administrator's calendar-session request failing at **11:02:47 UTC / 14:02:47 local time** with HTTP 522 after 19.7 seconds, and its availability request failing at **11:02:49 UTC** after 19.4 seconds. The session request had already loaded 276 rows and was checking the next page; the availability failure was at offset 2500. `fetchAllRows` rejects an unsuccessful later page, so partial results are not published.

Before the calendar fix, `CompanyTvarkarastis.loadSessionsForWindow` only logged a failed read and left its initially empty sessions state intact. Its metadata loader also awaited the full availability read before reading students; a failed availability read skipped the remaining metadata work. These paths explain loaded tutors alongside zero lesson/student displays without establishing that data is absent. The local calendar fix below addresses these paths separately from the earlier student-card fix.

At **11:05:15–11:05:18 UTC / 14:05 local time**, the same administrator's calendar queries succeeded: 276 session rows in the padded visible window and 3219 availability rows, including successful terminal-page checks. A separate read-only count at **14:24 local time** found 97 visible lesson rows and 75 distinct student IDs for October 19–25 across the organization, plus 109 non-detached student assignment rows. These organization-wide counts are not counts for the individual tutor selected in the video and do not deduplicate student identities.

The **14:05:09 recording** (16.50 seconds) shows the same Gabija V. card with its weekly Thursday schedule now visible. The speaker confirms that the data has just appeared. The paid €10 package still has one credit and the October 22 session is still displayed as unpaid in that recording. This corroborates recovery from the earlier read failure and the separate package/session allocation problem; it does not demonstrate another purchase or a reminder for October 29. The independent 14:06 edit and later paid-state verification described above postdate this recording.

Both follow-up clips therefore add evidence to the same transport incident and paid-trial allocation mismatch. This follow-up performed no application-code changes or production writes. Sanitized query receipts are in ignored `output/proklase-check-20261022/follow-up-evidence.json`. Final read-only verification at **14:21 local time** still showed the trial paid at €10 with no `lesson_package_id`, and one unused package/item credit.

## Applied package correction

The user explicitly requested fixing Gabija's package assignment. Before applying any change, a fresh complete backup of the child, all eight lessons, package, item, paid invoice and invoice lines was saved and checked in ignored `output/proklase-check-20261022/gabija-trial-repair-before.json`.

`scripts/sql/repair-proklase-gabija-trial-package-20261022.sql` checks the exact organization, tutor, child Auth identity, paid €10 package, unused credit, untouched future trial and paid €10.41 invoice (including the existing €0.41 administration fee). One transaction links the October 22 trial to the package, moves both aggregate and item counters from available=1/reserved=0 to available=0/reserved=1, and aligns the session with the package's original trial subject ID.

Both the purchased subject and the subject used by the independent 14:06 edit have `is_trial=true`, price €10 and duration 45 minutes for the same tutor. Reusing the purchased subject ID is necessary because later completion/cancellation updates package-item counters by **package ID plus subject ID**. The paid package's sold subject, price and invoice snapshots were preserved.

Post-write verification at **14:35:10 local time** passed eight checks: exact package association; matching session/package/item subject; one reserved credit; byte-for-byte unchanged invoice and invoice lines; unchanged seven other lessons; unchanged trial fields apart from its subject/package IDs; unchanged package sale fields apart from credit counters; unchanged child row. Receipt: ignored `gabija-trial-repair-after.json` beside the backup. No new payment, Checkout Session, invoice or message was created.

The SQL refuses payment/invoice/lesson drift, another allocation or a started trial. It can safely recognize an immediately repeated completed repair. Nine in-memory Postgres tests execute the actual script and verify the success, retry, drift guards and full rollback after a failing final item update. The correction is applied customer data and is not a schema migration to rerun with deployment.

## Local calendar correction

Story: opening the organization calendar reads authorized tutors, roster/settings and the visible lesson window from Supabase; the page then renders the results or an explicit retryable failure. Availability loads independently.

- `orgScheduleData.ts` reads required metadata with checked responses and a 15-second deadline, using parallel reads after the strict authorized tutor lookup. It does not read availability. Failed reads never publish an empty or partial metadata snapshot to cache.
- Only complete metadata cache entries are reused. Pricing and subject-template fields are carried consistently through fresh and cached reads.
- Visible-window session paging and availability paging each have their own 15-second deadline and transport aborts. The calendar handles availability rejections instead of creating unhandled background promises.
- The page keeps the last successful current-window lesson data after a failed refresh, ignores superseded/unmounted responses and clears the previous period's data when navigating to another period. Initial statistics use an unknown placeholder until their reads succeed.
- A localized failure message and retry action cover metadata, lesson and availability failures. All 13 base locales are translated. Availability refreshes on tutor/organization/view changes without an availability-length dependency loop.

These changes handle upstream failures and remove the availability-to-roster waterfall. They do not establish or fix the unknown underlying infrastructure cause of the observed HTTP 522 responses. [Cloudflare documents 522](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-522/) as an origin connection timeout; the observed approximately 19-second failures are consistent with its TCP connection deadline. That is separate from the missing package association created earlier.

## Validation and release

208 distinct targeted tests passed across 20 files in the final regression runs, including the guarded repair, the actual calendar page under synthetic gateway errors, failed later pages, independent availability failure/deadline, retry, background-refresh preservation, period navigation, unmounted metadata, student-card/notes flows, paging, payment confirmation, locale coverage and existing Pro Klasė regressions. `npm run lint`, `npm run build` and `git diff --check` passed. Existing sourcemap, import and bundle-size warnings remain. The final build log is ignored `output/proklase-check-20261022/calendar-fix-build.log`.

The first sandboxed Vitest attempt failed before collecting tests because Windows denied temporary-file renames. The successful test run used the same fixtures outside that filesystem sandbox. Test data is synthetic; no customer actions were exercised.

No migration is required for the card/calendar fixes. The production package repair is independently verified with live database receipts. The page tests render the real components against synthetic responses; they are not a live production-browser verification of the unreleased code. Production release requires permission and the `simo-local` commit/clean-checkout/push sequence in AGENTS.md section 8. The workspace contains pre-existing unrelated changes; keep the intended release scope explicit.
