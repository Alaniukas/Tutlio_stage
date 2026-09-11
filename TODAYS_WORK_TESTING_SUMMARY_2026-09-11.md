# Tutlio testing summary - 2026-09-11

## Release snapshot

- Branch: `simo-local`
- Purpose: co-founder staging QA before any production push
- Production deployment: **not performed**
- Test only with Demo / stage data. Do not change real school organizations.
- Detailed existing school checklist: [`test_school.md`](./test_school.md)

## What changed today

1. Stripe Connect payments now use direct charges on the tutor or organization account. Tutlio collects an application fee; Stripe processing fees are deducted from the connected account.
2. School and Pro Klasė attendance now treats missing Tutlio join clicks as a review signal, not proof of a no-show. Tutors/admins can explicitly confirm or correct attended/no-show outcomes.
3. Private school lesson recordings are available through a protected Tutlio streaming proxy backed by one private Google Drive folder per class group.
4. Mano Korepetitorius lesson comments can be published and emailed to parents independently of student visibility.
5. Mokslo vaisiai admins can create several children for one parent in one flow, provision separate student accounts, and schedule lessons before activation.
6. Organization schedule loading now paginates the complete result set; editors can hard-delete individual lessons but not class-group/group lessons.
7. Mokslo vaisiai calendar colors distinguish trial lessons and completed/ended lessons.
8. The public school homework page opens recent lessons first and has separate Recent / Upcoming tabs.
9. Pricing and package copy now describes only Tutlio's platform fee to the payer; Stripe processing is no longer shown as a payer surcharge.
10. New attendance, parent-comment, recording, and family-account strings were added across the locale system.

## Required stage setup

Complete these before testing the affected flows:

- [ ] Run with `.env.local` pointing to stage Supabase `cuhciqwmqfuajeeqjjbm`, not the retired project.
- [ ] Apply `20260911150000_school_recording_drive_folders.sql` to the stage database.
- [ ] Apply `20260911173000_session_parent_comment_visibility.sql` to the stage database.
- [ ] For recordings, set server-only `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64`.
- [ ] For recordings, set a strong server-only `SCHOOL_RECORDING_STREAM_SECRET`.
- [ ] Optionally set `SCHOOL_RECORDING_RETENTION_DAYS`; default is 30, allowed range is 1-365.
- [ ] Share each test Drive folder with the service-account email as Viewer. Do not make the folder public.
- [ ] Enable `school_lesson_recordings` only on the Demo school used for recording QA; leave it disabled elsewhere.
- [ ] In Stripe test mode, configure the connected-accounts webhook on `/api/stripe-webhook` with `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`, and `account.updated`.
- [ ] Confirm `STRIPE_CONNECT_WEBHOOK_SECRET` is the signing secret of that connected-accounts webhook.

## P0 - payment QA

Use Stripe test mode only.

### Individual tutor / organization lesson payment

- [ ] Create a €20 lesson and open its card payment checkout.
- [ ] Expected: payer total is €20.40 for the standard 2% Tutlio fee; no separate Stripe processing surcharge is shown.
- [ ] Expected: Checkout belongs to the connected Stripe account and contains the service amount plus the Tutlio platform-fee breakdown.
- [ ] Pay with a Stripe test card and return through the success page.
- [ ] Expected: the lesson is confirmed paid once; refreshing the success page does not duplicate accounting or package side effects.
- [ ] Re-open an unpaid checkout without changing the price.
- [ ] Expected: the still-open matching checkout is reused.
- [ ] Change the lesson price, then open payment again.
- [ ] Expected: the stale checkout is expired and a new checkout uses the current price.

### Package and monthly payment

- [ ] Create and pay a normal package.
- [ ] Create and pay a pooled package containing at least two tutor/subject items.
- [ ] Expected: one direct-charge checkout contains the item breakdown and one payment activates the package once.
- [ ] Edit an unpaid pending package after opening Checkout.
- [ ] Expected: the old connected-account Checkout is expired and the resent link uses the new values.
- [ ] Pay a monthly invoice and verify its success page.
- [ ] Expected: the server rejects a copied `session_id` if the supplied Stripe account does not own that payment.

### School installment and school monthly invoice

- [ ] With a €20 school amount, open the payment link.
- [ ] Expected: payer total is €20.20 (school amount plus 1% Tutlio fee).
- [ ] Complete a school installment and a school monthly invoice.
- [ ] Expected: both are direct charges on the school's connected account, both return successfully, and both rows become paid once.
- [ ] Reopen an already-paid link.
- [ ] Expected: no second charge is created.
- [ ] In Stripe, verify the connected account bears Stripe processing fees and Tutlio receives the application fee.
- [ ] Test a cancellation refund for a direct-charge lesson.
- [ ] Expected: the refund is created on the same connected account and the applicable Tutlio application fee is refunded.

## P0 - attendance and outcome QA

### School individual and group lessons

- [ ] Use an ended online lesson where the tutor clicked Join but the student did not use Tutlio's tracked link.
- [ ] Run the school join/no-show cron or call the stage endpoint with cron authorization.
- [ ] Expected: the lesson remains awaiting human review; the cron reports `updated: 0` and does not finalize a no-show.
- [ ] Expected: the UI shows an amber unconfirmed-attendance state, not a final no-show.
- [ ] As the assigned school teacher, mark the participant **Student attended**.
- [ ] Expected: status becomes completed and receives a confirmation timestamp.
- [ ] Change the same participant to **Student did not show**, then correct it back to attended.
- [ ] Expected: correction works without consuming package credit twice; the generated no-show audit line is removed while unrelated tutor comments remain.
- [ ] As a school admin with `sessions.edit`, repeat the attended/no-show correction.
- [ ] As a view-only admin or unrelated tutor/admin, try the same API/UI action.
- [ ] Expected: the action is hidden or rejected.
- [ ] For a group with one attended child and one no-show child, open the merged calendar card.
- [ ] Expected: the class is shown as conducted/completed; each participant retains an independent attendance outcome.
- [ ] Confirm a manual no-show and verify the normal manual no-show notification behavior.
- [ ] Expected: the missing-click cron itself sends no parent/payer notification.

### Pro Klasė

- [ ] Open an ended active, completed, and no-show lesson as a Pro Klasė admin.
- [ ] Expected: both **Student attended** and **Student did not show** controls are available where applicable.
- [ ] Correct no-show to attended and attended to no-show.
- [ ] Expected: the outcome changes once, stats use explicit outcomes, and package counters are not duplicated.
- [ ] Check an older unstamped no-show and correct it.
- [ ] Expected: the legacy package transition is repaired exactly once.
- [ ] Repeat the correction in an ordinary company organization.
- [ ] Expected: correction is rejected because the special policy is school/Pro Klasė only.

### Tracked late join compatibility

- [ ] Use a legacy automatic `missed_join` no-show with no human confirmation, then click the tracked student Join link during the lesson.
- [ ] Expected: it reopens to active and clears only the generated no-show fields/comment line.
- [ ] Repeat with a human-confirmed no-show.
- [ ] Expected: the confirmed outcome is not overwritten.

## P0 - private school recordings QA

- [ ] With the feature disabled, confirm **Recordings / Įrašai** is absent for school admin, teacher, student, and parent.
- [ ] Enable `school_lesson_recordings` on the Demo school.
- [ ] As an admin with edit permission, open `/school/recordings` and assign a shared private Drive folder to a class group using either the folder URL or ID.
- [ ] Expected: the folder name appears; a non-folder URL, inaccessible folder, or duplicate folder assignment is rejected.
- [ ] Add a downloadable video created within the retention window and refresh.
- [ ] Expected: the video appears with name/date/duration/size and plays/seeks through Tutlio.
- [ ] Inspect the page/API response.
- [ ] Expected: no service-account credential or direct/private Drive link is exposed; playback uses `/api/school-lesson-recording-stream`.
- [ ] As the assigned teacher, a member student, and that student's parent, open their respective Recordings pages.
- [ ] Expected: each sees only the groups they currently belong to.
- [ ] In the parent portal, switch children.
- [ ] Expected: recordings are restricted to the selected linked child.
- [ ] Copy a playback URL into a signed-out/private browser.
- [ ] Expected: playback is rejected because the matching signed HttpOnly viewer session is missing.
- [ ] Remove a student/teacher from the group, disable the feature, disconnect the folder, or move the file outside the assigned folder; retry playback.
- [ ] Expected: the next byte-range request is denied.
- [ ] Add a video older than the retention limit.
- [ ] Expected: it is not listed or playable.

## P1 - Mano Korepetitorius parent comments

- [ ] Apply the parent-comment migration, then create or edit a lesson in Mano Korepetitorius.
- [ ] Select **Show to parents** without selecting student visibility.
- [ ] Expected: the comment appears in the parent lesson list/detail and email goes to payer and secondary-parent addresses, deduplicated.
- [ ] Save an unchanged student-visible comment and later add parent visibility.
- [ ] Expected: parents receive the new notification; the student is not emailed again.
- [ ] Edit the text while both audiences are enabled.
- [ ] Expected: all selected audiences receive one notification each.
- [ ] Use a student/parent with no matching email.
- [ ] Expected: the comment still saves and the UI reports that selected recipients have no email.
- [ ] Check an older comment that was visible to the student before this migration.
- [ ] Expected: it remains visible in the parent portal for backward compatibility.
- [ ] In other organizations, confirm the parent-specific checkbox is not exposed.

## P1 - Mokslo vaisiai family and calendar QA

- [ ] In the Mokslo vaisiai admin student-create flow, select immediate account provisioning and add two or more children for one parent.
- [ ] Give each child a different name, optional email/phone/grade, and different tutor selections.
- [ ] Expected: one parent account links to every child; every child has a separate student account and appears under the assigned tutors.
- [ ] Leave one child's email blank.
- [ ] Expected: the parent receives that child's login details.
- [ ] Reuse the same email for two children, reuse the parent email as a child login, or use an organization tutor's email.
- [ ] Expected: validation blocks the save with a clear error.
- [ ] Use an already-existing parent or student account.
- [ ] Expected: the credentials result does not falsely claim that a new activation email was sent.
- [ ] While creating an unactivated student, choose lesson slots; also schedule recurring lessons from an unactivated student's card.
- [ ] Expected: scheduling works before activation and does not depend on the Pro Klasė flag.
- [ ] In Mokslo vaisiai tutor and admin calendars, inspect trial and ended/completed lessons.
- [ ] Expected: trial is light gray with dark text; ended/completed is yellow with dark text; other organizations retain their existing palette.

## P1 - schedule, deletion, homework, and regression QA

- [ ] Load an organization schedule with more rows than one Supabase page.
- [ ] Expected: all rows appear once in stable start-time/ID order.
- [ ] As an admin with `sessions.edit`, hard-delete an individual lesson in both Schedule and Lessons views, including a finalized lesson.
- [ ] Expected: the individual row is deleted.
- [ ] Try to hard-delete a class-group or legacy group lesson, and repeat as a read-only admin.
- [ ] Expected: hard deletion is unavailable/rejected.
- [ ] Check two class groups at the same time and a 1:1 school lesson for a student with a grade.
- [ ] Expected: group cards remain separate; the 1:1 title includes the grade.
- [ ] Open a public `/school-homework?student=...&t=...` link with past and upcoming lessons.
- [ ] Expected: Recent opens first, the counts are correct, and Upcoming can be selected; if one section is empty, the available section opens automatically.
- [ ] Smoke-test tutor, student, parent, company, and school navigation after the new Recordings routes.
- [ ] Check LT and EN pricing/package screens.
- [ ] Expected: copy says platform fee only and the displayed total matches Checkout.

## Automated verification

| Check | Result |
|---|---|
| Frontend TypeScript (`npm run lint`) | Passed |
| API TypeScript (`npm run lint:api`) | Passed |
| Focused i18n regression suite | 30 files / 466 tests passed |
| Full Vitest suite | 380 files / 6,023 tests passed; 1 intentional skip |
| Production build (`npm run build`) | Passed |

The first full run found only missing locale-contract registration for the new multi-child strings (27 assertions). That was corrected before the final rerun; no product/API test failed in that run. The production build completed with the repository's existing sourcemap, mixed static/dynamic import, and large-chunk warnings; there was no build error.

## Release sign-off

- [ ] P0 payment checks passed in Stripe test mode.
- [ ] P0 attendance corrections passed for teacher/admin authorization and package idempotency.
- [ ] P0 recording access passed for all four roles and the negative security cases.
- [ ] Both database migrations were applied before enabling their UI.
- [ ] Connected-account Stripe webhook received test events successfully.
- [ ] No real organization data was changed during QA.
- [ ] Co-founder approved production push.
