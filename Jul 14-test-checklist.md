# Test checklist — Jul 10–14 changes (commit `755fcbd`)

**Before testing:**
- [ ] `vercel deploy --prod` has been run (DB migrations are already applied; the frontend/cron code ships with the deploy). Until then only the recurring-lesson "frequency" fix is live.
- All Pro Klasė feature flags are already ON in prod: `disable_student_booking`, `disable_student_reschedule_cancel`, `tutor_lesson_status_confirmation`, `auto_trial_first_lesson`, dynamic pricing rules seeded.

---

## A. Org admin (Pro Klasė) — Tvarkaraštis / Students

### Recurring lessons
- [ ] Create a recurring lesson (kartojasi kas savaitę / kas 2 sav. / kas mėnesį, weekday chips) **without** an end date → saves with no "frequency column" error (this part is already live).
- [ ] Open-ended schedule materializes only a ~5-week window; new occurrences appear automatically each night (cron 00:15).
- [ ] "Kartotis iki" with an end date still creates the full range.

### Trial lesson (bandomoji pamoka)
- [ ] Create-lesson dialog has an amber **"Bandomoji pamoka"** toggle (hidden for group subjects).
- [ ] Toggle ON → price stays **editable**, prefilled with the org trial default, note "Numatytoji bandomosios pamokos kaina – galite koreguoti"; recurring section disappears.
- [ ] Save a trial with an edited price/topic/duration → the lesson keeps the edited values (price is no longer overridden back to the default).
- [ ] Created lesson shows the "Bandomoji" badge; marking it completed without a comment is blocked/warned.
- [ ] **Auto-trial:** pick a student with **zero** lessons → the trial toggle turns on by itself with the org's trial topic/duration/price prefilled + amber note "Pirmoji šio mokinio pamoka…". Pick a student with history → stays off.

### Dynamic pricing / lesson frequency
- [ ] Student card (Company → Students) has a frequency select (**Auto / 1–7 k./sav.**).
- [ ] Setting it manually reprices that student's **future unpaid** lessons to the matching tier (trial/group/individually-priced lessons untouched).
- [ ] One-at-a-time created lessons now follow the tier price when a manual frequency is set (previously always fell back to the manual price).
- [ ] A manually set frequency is **not** overwritten when recurring lessons are added/removed; switching back to **Auto** re-derives it from the active recurring schedule and reprices future unpaid lessons again.
- [ ] Grade must be set on the student for the tier to apply (amber hint shows when missing).

---

## B. Tutor (Pro Klasė)

### Language
- [ ] Log in as a Pro Klasė tutor on **tutlio.com** → dashboard is **Lithuanian** (was English). Greeting, nav, calendar all LT.
- [ ] Language survives refresh and navigation.

### Lesson status confirmation (new workflow)
- [ ] A lesson whose end time passes is **not** auto-marked "Įvykusi" — badge shows **"Pažymėkite statusą"**.
- [ ] Dashboard shows a non-dismissible amber panel **"Pažymėkite pamokų statusus"** listing ended unconfirmed lessons with 4 buttons: **Įvyko / Vėlavo / Neatvyko / Atšaukta**.
- [ ] Same 4-button block appears in the calendar lesson dialog for an ended lesson.
- [ ] Confirming **Įvyko** → lesson becomes completed. **Vėlavo** → completed (marked late internally). **Neatvyko** → no-show (parent gets the no-show email). **Atšaukta** → cancelled.
- [ ] Tutor receives a reminder email (~45 min after lesson end, then ~daily) until all statuses are confirmed; email lists the lessons and links to the dashboard.
- [ ] After confirming everything, panel disappears and no more nag emails arrive.

### Lesson Settings
- [ ] Tutor's **Pamokų nustatymai** page no longer shows org-managed internals: no cancellation policy / fee example (€22 → 50% = €11), no booking deadline, no break-between-lessons, no reminder settings. Subjects list still visible.

### Navigation
- [ ] Clicking the sidebar logo goes to **Dashboard**, not the marketing landing (desktop + mobile).

---

## C. Student (Pro Klasė)

- [ ] Bottom nav has **no "Rezervuoti"** and **no "Eilė"** tabs.
- [ ] Dashboard: no "Rezervuoti" quick-action tile; the "no lessons" empty-state card is not clickable and has no "tap to book" hint.
- [ ] Opening `/student/schedule` directly: own lessons still visible, but clicking free or occupied slots opens **no** booking/waitlist dialog (calendar is read-only; direct API booking inserts are rejected server-side too).
- [ ] Typing `/student/waitlist` directly redirects back to the student home.
- [ ] Lesson details (dashboard, Pamokos, calendar): **no** Perkelti/Atšaukti buttons — amber note "Dėl pamokos perkėlimo ar atšaukimo kreipkitės į administraciją" instead. No more mid-flow "Nepavyko perkelti" alert.
- [ ] Header logo click goes to student home, not the landing page.
- [ ] Lesson reminder emails: **no whiteboard link** (meeting link still present).

---

## D. Parent

- [ ] Complete parent activation/registration → **automatically signed in** and taken to the parent portal (no manual login step).
- [ ] Close and reopen the browser → still logged in (remember-me fix; checkbox now defaults on).
- [ ] Log in with "Prisiminti mane" **unchecked** → page refresh still keeps the session (this was the logout-on-refresh bug); closing the browser ends it.
- [ ] A browser that was previously hit by the refresh-logout bug: after this deploy, first load adopts the stranded session — user is signed in again without re-login.
- [ ] Pro Klasė child's lesson modal: no reschedule/cancel buttons (amber note instead); no booking entry points.
- [ ] Per-child buttons say **"Kalendorius"** instead of "Rezervuoti"; the child calendar is view-only (free slots don't open a booking dialog); "no upcoming lessons" card has no "tap to book" hint.
- [ ] Reminder emails to payer: no whiteboard link.

---

## E. Regression — marketplace (non-org) must be unchanged

- [ ] Solo tutor: ended lessons still auto-complete within ~5 min (no confirmation panel, no nag emails).
- [ ] Solo tutor: Lesson Settings still shows all sections (cancellation, registration, reminders) editable.
- [ ] Marketplace student: can still book, join waitlist, reschedule and cancel as before (booking flags are per-org; only Pro Klasė is seeded ON).
- [ ] Other orgs' admins (flag off): trial toggle does **not** auto-enable for a first lesson; toggling it manually prefills the org trial price into the (now editable) price field.
- [ ] Login "Prisiminti mane" default-checked applies to all roles — tutors/org admins also stay logged in across refresh regardless of checkbox state.
- [ ] Booking confirmation / reminder emails otherwise unchanged (dates, links, prices).

---

## F. Regression — school contracts (Laisvi vaikai)

- [ ] Contract creation → PDF renders with Times New Roman (not DejaVu) and the signing flow completes as before (a signing-status reconcile cron was added — no visible change expected).

---

*Everything above is committed on `Simo-local` (`755fcbd`); DB migrations through `20260714100000` are applied to prod. Batch-1 items 4–8 (parent editing of student info, admin-first onboarding revamp) are **not** in this release.*
