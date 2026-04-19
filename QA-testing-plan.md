# QA Testing Plan – 7 Tasks + Privacy Policy Update

## Task 1: Google Calendar Auto-Sync on Status/Payment Changes

### 1.1 Auto-complete → GCal update
1. Create a session with a start/end time in the near past (or wait for one to pass).
2. Trigger the cron `GET /api/auto-complete-sessions` (or wait for it).
3. Open Google Calendar → verify the event summary now shows **"Įvykusi ✓"** (if paid) or **"Įvykusi (neapmokėta)"** (if unpaid).
4. Verify the event color changed (green/sage for paid-completed, tangerine for unpaid-completed).

### 1.2 Stripe payment → GCal update
1. Create an unpaid session → check GCal shows **"Laukiama apmokėjimo"** (yellow/banana color).
2. Complete a Stripe payment for that session (per-lesson, package, or monthly invoice).
3. Verify GCal event updates to **"Apmokėta"** (blue/blueberry color).

### 1.3 Manual payment confirmation → GCal update
1. Create a lesson package with `payment_method = 'manual'` that has pre-created sessions.
2. As org admin, confirm manual payment via the UI.
3. Verify the associated sessions' GCal events update to show paid status.

### 1.4 No-show → GCal update
1. Mark an active session as **no_show** from the tutor calendar.
2. Trigger `POST /api/notify-session-no-show`.
3. Verify GCal event summary shows **"Neatvyko"** and the color is dark red (tomato).

### 1.5 Cancellation → GCal deletion
1. Cancel an active session from the tutor calendar (provide a reason).
2. Verify the GCal event is **deleted** (not updated — cancelled sessions are removed from GCal).

### 1.6 Tutor without GCal connected
1. Repeat any of the above with a tutor that has **not** connected Google Calendar.
2. Verify no errors occur — sync is silently skipped.

---

## Task 2: Solo Tutor Finance Report

### 2.1 Visibility
1. Log in as a **solo tutor** with Stripe onboarding complete.
2. Navigate to **Finance** page.
3. Verify the **"Finansinė ataskaita"** card appears above the Stripe account section.

### 2.2 Not visible for org tutors
1. Log in as an **org tutor**.
2. Navigate to Finance page → verify you see `OrgTutorFinanceSummary`, NOT the new report.

### 2.3 Not visible before Stripe onboarding
1. Log in as a solo tutor whose `stripe_onboarding_complete = false`.
2. Verify the finance report does NOT appear.

### 2.4 Month picker
1. Select different months using the month picker.
2. Verify session counts and earnings update accordingly.
3. Verify the month label formats correctly (e.g., "balandis 2026").

### 2.5 Date range picker
1. Switch to **"Datos intervalas"** mode.
2. Set a valid range → verify data loads.
3. Set start > end → verify amber error message appears.
4. Set a range longer than 90 days → verify the "too long" error appears.

### 2.6 Stats accuracy
1. For a known period, manually count: completed, active, cancelled, no-show sessions.
2. Verify the 4 stat cards match.
3. Verify "Earned" = sum of prices of paid completed+active sessions.
4. Verify "Outstanding" = sum of prices of unpaid completed+active sessions.

---

## Task 3: Cancel/Delete Completed Lessons

### 3.1 Cancel a completed lesson
1. Open a **completed** session in the tutor calendar event modal.
2. Verify the **"Atšaukti įvykusią"** button is visible.
3. Click it → verify the cancellation reason textarea appears.
4. Enter a reason (min 5 chars) → click **"Patvirtinti atšaukimą"**.
5. Verify the session status changes to **cancelled**.
6. Verify the student receives a cancellation email.

### 3.2 Delete a completed lesson
1. Open a completed session in the event modal.
2. Click the **trash icon** (delete button).
3. Confirm deletion → verify the session is removed from the calendar.
4. If the session used a lesson package, verify credits are returned.

### 3.3 Edit button NOT shown for completed
1. Open a completed session → verify the **Edit** (pencil) button is NOT visible.
2. Open an active session → verify the Edit button IS visible.

### 3.4 Recurring completed session
1. Open a completed session that belongs to a recurring series.
2. Click cancel → verify you're asked "single or all future".
3. Pick "single" → only that one session is cancelled.

---

## Task 4: Multi-Day Recurring Lessons

### 4.1 Weekday picker visibility
1. Open the create lesson modal → toggle **"Pasikartojanti"** ON.
2. Verify the weekday picker appears (Mon–Sun buttons).
3. Switch frequency to **"Kas mėnesį"** → verify weekday picker **hides**.
4. Switch back to **"Kas savaitę"** → verify weekday picker **reappears**.

### 4.2 Default weekday selection
1. Click on a **Wednesday** cell to open create modal.
2. Toggle recurring ON → verify **Wednesday** is pre-selected in the picker.

### 4.3 Multi-day selection
1. Select Mon, Wed, Fri in the weekday picker.
2. Set an end date 4 weeks out.
3. Verify the preview shows `≈12 pamokos (3 d/sav × ≈4)`.
4. Create the lessons → verify 3 separate recurring templates are created (one per day).
5. Check the calendar — sessions should appear on all three weekdays.

### 4.4 Empty weekday validation
1. Toggle recurring ON, deselect all weekdays.
2. Verify the amber warning **"Pasirinkite bent vieną dieną"** appears.
3. Verify the **Create** button is disabled.

### 4.5 Biweekly multi-day
1. Select frequency **"Kas 2 savaites"** + select Tue, Thu.
2. Create lessons → verify sessions appear every other week on Tue and Thu.

---

## Task 5: Contact Visibility Bug Fix

### 5.1 Org setting: hide tutor email
1. As org admin, go to **Company Settings** → set **student sees tutor email = hide**.
2. Log in as a **company student** linked to a tutor in that org.
3. Open **Student Dashboard** → verify tutor email is **NOT** shown (no mailto link).
4. Open **Student Sessions** page → verify tutor email is NOT shown.
5. Click tutor name in header → open tutor info modal → verify email is NOT shown.

### 5.2 Org setting: show tutor email
1. Change setting back to **show**.
2. Repeat steps 3–5 → verify tutor email IS visible everywhere.

### 5.3 Solo student (no org)
1. Log in as a student of a **solo tutor** (not in any organization).
2. Verify tutor email is visible in all locations (default = show).

### 5.4 Multiple student profiles
1. If a student has profiles under multiple tutors (one org with hidden contacts, one solo), switch between profiles.
2. Verify the contact visibility updates correctly per profile.

---

## Task 6: Missing Cancellation Email Fix

### 6.1 Student cancels → tutor gets email
1. Log in as a student and cancel an upcoming session (provide reason).
2. Check the **tutor's** inbox → verify they receive a `session_cancelled` email.

### 6.2 Student cancels → student gets email
1. After the same cancellation, check the **student's** inbox → verify they receive a cancellation confirmation email.

### 6.3 Tutor cancels → student gets email
1. Log in as a tutor and cancel a session.
2. Check the **student's** inbox → verify they receive a cancellation email.

### 6.4 Payer email (parent)
1. Set up a student with a different `payer_email`.
2. Student cancels a session → verify BOTH the student email and payer email receive notifications.

### 6.5 Missing client-side email fallback
1. (Advanced) Temporarily break the client-side email passing (e.g., pass `null` for `tutorEmail` in the API call).
2. Cancel a session → verify the email still sends because the server fetches it from the DB.

---

## Task 7: Create Recurring Lesson from Availability Slot

### 7.1 Button visibility
1. Open the tutor calendar → click on a **recurring** availability slot (green block).
2. In the slot edit modal, verify the **"Sukurti pasikartojančią pamoką"** button appears.

### 7.2 Button NOT shown for one-time slots
1. Click on a **specific-date** (non-recurring) availability slot.
2. Verify the "Create recurring lesson" button is **NOT** shown.

### 7.3 Pre-fill behavior
1. Click "Sukurti pasikartojančią pamoką" on a recurring slot that runs **14:00–16:00 on Tuesdays**.
2. Verify the create lesson modal opens with:
   - Start time = the clicked date at **14:00**
   - End time = the clicked date at **15:00** (capped to 60 min)
   - Recurring = **ON**
   - Frequency = **weekly**
   - Weekday = **Tuesday** pre-selected
   - End date = **empty** (user must fill in)
   - Meeting link = pre-filled if the slot had one

### 7.4 Full creation flow
1. After pre-fill, select a student, set an end date, and create.
2. Verify recurring sessions are created on the correct weekday.

### 7.5 Stale state check
1. Open a create modal normally, set a recurring end date, then close it.
2. Now click "Create recurring lesson" from a slot.
3. Verify the end date field is **empty** (not carrying over the old value).

---

## Task 8: Privacy Policy – Google API Section

### 8.1 New section presence (LT)
1. Switch language to **Lithuanian**.
2. Navigate to `/privacy`.
3. Verify section **"4. Google API duomenų naudojimas (Google API Limited Use Policy)"** exists.
4. Verify it contains 3 paragraphs: data access, data usage, and compliance.
5. Verify the compliance paragraph contains a **clickable link** to Google API Services User Data Policy.

### 8.2 New section presence (EN)
1. Switch language to **English**.
2. Navigate to `/privacy`.
3. Verify section **"4. Google API Data Usage (Google API Limited Use Policy)"** exists.
4. Verify the link to Google's policy page works.

### 8.3 Section numbering
1. Verify the full section order is:
   - 1. General provisions
   - 2. Data controllers and roles (2.1, 2.2)
   - 3. What data we collect
   - **4. Google API Data Usage** ← new
   - 5. Purposes and legal bases
   - 6. Data storage and security (6.1)
   - 7. Your rights (7.1)
   - 8. Cookies and analytics
   - 9. Changes

### 8.4 Updated date
1. Verify the subtitle shows **"2026 m. balandžio 19 d."** (LT) / **"April 19, 2026"** (EN).

### 8.5 Compliance statement exact wording
1. Verify the English version contains exactly: *"Tutlio's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements."*
