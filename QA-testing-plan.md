# QA Testing Plan — Simo-local → main merge

**Scope:** All features/fixes on `Simo-local` that are not yet on `origin/main` (8 commits).

---

## 1. Whitelabel / Custom Branding

**Commits:** `3e90774`, `9357ec7`, `1d8fec0`

### 1.1 Login page with `?org=<slug>`
1. Navigate to `/login?org=<slug>` using a known org that has `custom_branding` enabled + `logo_url` set.
2. Verify the org logo appears (not Tutlio logo).
3. Verify "powered by Tutlio" text below the logo.
4. Verify background gradient uses org's `brand_color` / `brand_color_secondary`.
5. Test with invalid slug → standard Tutlio login renders (no crash).
6. Test with slug of org that has `custom_branding` disabled → standard Tutlio login.

### 1.2 Authenticated app branding
1. Log in as a tutor in a whitelabeled org.
2. Sidebar header → org logo + org name (desktop and mobile).
3. Log in as a student of that org → student header shows org logo.
4. Log in as a parent linked to a student in that org → parent header shows org logo.

### 1.3 Branding cache cleared on logout
1. Log in as user from org A (whitelabel on) → confirm branding.
2. Log out.
3. Log in as user from org B (different branding or no whitelabel) → confirm no org A branding leaks.
4. `sessionStorage.getItem('tutlio_org_branding')` should be `null` after logout.

### 1.4 Emails with org branding
1. Trigger a session reminder for a student in a whitelabeled org.
2. Email header shows org logo + "powered by Tutlio" (not "Tutlio 🎓").
3. Same email for non-whitelabel org → standard Tutlio header.

### 1.5 Admin panel settings
1. Platform admin → open org detail → enable `custom_branding`.
2. Whitelabel section appears: slug input, logo upload, color pickers.
3. Upload a logo (<2 MB, jpg/png/webp/svg) → URL saved.
4. Set slug → save → reload → persisted.
5. Change colors → save → visit `/login?org=<slug>` → gradient updated.

### 1.6 API endpoint `/api/org-branding`
1. `GET /api/org-branding?slug=valid` → 200 with `{ id, name, slug, logo_url, brand_color, brand_color_secondary, entity_type }`.
2. `GET /api/org-branding?slug=nonexistent` → 404.
3. `GET /api/org-branding?slug=` → 400.
4. Response header: `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.

---

## 2. Whiteboard (Collaborative)

**Commits:** `3e90774`, `102fde5`, `320303d`

### 2.1 Opening whiteboard
1. As a tutor, open a session → click the Whiteboard button.
2. Verify the whiteboard page loads without blank/white screen.
3. Verify the room ID is associated with the session.

### 2.2 Collaborative sync
1. Open the same session whiteboard in two browser tabs (or tutor + student).
2. Draw on one → verify strokes appear on the other in real-time.
3. Close one tab → verify no crash on the remaining tab.

### 2.3 Auth stability
1. Open whiteboard → wait 5+ minutes (token refresh cycle).
2. Verify no disconnect or auth error splash.
3. Reload the page → whiteboard reconnects and loads saved assets.

### 2.4 Student access
1. As a student, navigate to a session that has a whiteboard room.
2. Verify whiteboard loads and student can draw.

---

## 3. i18n / Locale Login Routes + SSR Pages

**Commit:** `3e90774`, `9357ec7`

### 3.1 Locale-specific login
1. Navigate to `/login` on `tutlio.lt` → Lithuanian UI by default.
2. Navigate to `/login` on `tutlio.com` → English UI by default.
3. Switch locale in the UI → verify login page updates language.

### 3.2 SSR landing pages
1. Visit `/` → verify SSR-rendered landing page loads (not blank).
2. Visit `/en`, `/lt`, `/pl`, `/lv`, etc. → correct locale rendered.
3. Visit `/pricing`, `/apie-mus`, `/kontaktai` → pages render via SSR.

### 3.3 Blog locale columns
1. Visit `/blog` and `/en/blog` → correct locale content.
2. Verify blog posts use the new locale columns (migration `20260506`).

---

## 4. Payment Fixes

**Commit:** `c09ad76`

### 4.1 Monthly-billed students skip instant payment
1. Create a student with payment model = `monthly_invoices`.
2. Complete a session with that student.
3. Verify NO instant Stripe Checkout link is generated/sent.
4. Verify the session is batched for the monthly invoice instead.

### 4.2 Non-monthly students still get instant payment
1. Student with `per_lesson` payment model → complete session → verify Stripe Checkout link is sent.

---

## 5. School Contract Additional Fee

**Commit:** `59a41f1`

### 5.1 Additional fee field
1. As org admin, open a school contract.
2. Verify an "Additional fee" field is available.
3. Set an additional fee amount → save.
4. Verify the contract total reflects base + additional fee.
5. Verify the installment breakdown includes the additional fee.

---

## 6. Session Files (Attachments)

**Commit:** `1d8fec0` (part of batch)

### 6.1 Upload and view
1. As a tutor, open a session → attach a file.
2. Verify the file uploads successfully and appears in the session.
3. As the student of that session → verify they can see/download the file.

---

## 7. Admin Statistics Panel

**Commit:** `1d8fec0` (new file)

### 7.1 Panel renders
1. Platform admin → admin panel → verify statistics tab/section visible.
2. Stats load: total orgs, tutors, students, sessions, revenue.

### 7.2 API
1. `GET /api/admin-statistics` with valid admin secret → 200.
2. Without secret → 401.

---

## 8. Analytics & UTM Tracking (migration `20260513`)

### 8.1 UTM capture
1. Visit `/register?utm_source=google&utm_medium=cpc&utm_campaign=test`.
2. Complete registration.
3. Verify `analytics_events` table records the UTM params.

### 8.2 No console errors
1. Navigate the app normally → verify no analytics-related errors in console.

---

## 9. Landing Page Public Stats (migration `20260512`)

### 9.1 Stats RPC
1. Call `public_landing_stats` RPC → returns aggregated numbers without auth.

### 9.2 Hero section
1. Visit landing page → social proof stats section renders real numbers.

---

## 10. Parent Lesson Reminder Toggle (migration `20260514`)

### 10.1 Toggle
1. Log in as parent → settings → verify "Lesson reminders" toggle visible.
2. Disable → trigger `/api/send-reminders` → parent does NOT receive email.
3. Re-enable → trigger again → parent DOES receive email.

---

## 11. Dashboard Performance (migration `20260515`)

### 11.1 Index applied
1. Run migration → open Dashboard as tutor with many sessions.
2. Verify no performance regression (should be faster).

---

## 12. Invoice Regeneration

### 12.1 Regenerate
1. `POST /api/regenerate-monthly-invoice` with valid invoice ID + admin auth → invoice regenerated.
2. Invalid ID → appropriate error.
3. No auth → 401.

---

## 13. Monthly Invoice Improvements

### 13.1 `create-monthly-invoice` changes
1. Generate a monthly invoice for a tutor with sessions in the billing period.
2. Verify invoice includes correct session count and amounts.
3. Verify auto-close billing batch logic works (if applicable).

---

## 14. Send Reminders Fixes

### 14.1 Reminder cron
1. Create upcoming sessions (within reminder window).
2. Trigger `GET /api/send-reminders`.
3. Verify tutor and student/parent receive reminder emails.
4. Verify no duplicate reminders on re-trigger.

---

## 15. Org Admin Login Hang Fix (migration `20260511120000`)

### 15.1 Org admin login
1. Log in as org admin → verify no hang/infinite loading.
2. Verify redirect to company dashboard works smoothly.

---

## Migrations to apply (in order)

1. `20260506000000_blog_posts_new_locale_columns.sql`
2. `20260510000000_org_whitelabel_branding.sql`
3. `20260511000000_session_whiteboard_room.sql`
4. `20260511120000_hotfix_org_admin_login_hang.sql`
5. `20260511133000_whiteboard_assets_support.sql`
6. `20260512000000_public_landing_stats_rpc.sql`
7. `20260513000000_analytics_events_and_utm.sql`
8. `20260514000000_parent_disable_lesson_reminders.sql`
9. `20260515000000_dashboard_sessions_covering_index.sql`
