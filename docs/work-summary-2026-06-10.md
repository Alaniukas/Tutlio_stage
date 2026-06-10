# Work summary — 2026-06-10 (Simo-local)

Verified before commit: `npm test` → 252 passed / 1 skipped, `npm run lint` (tsc) → clean.

## What was done

Committed earlier today: school-contract fixes ported from alano-local (`efb3e81`) and a PWA precache size fix (`0ee6aa7`). Everything below is the new work in this commit, grouped into five workstreams.

### 1. Enterprise self-serve license billing

Organizations buy tutor licenses through a Stripe subscription where **quantity = license count**; the webhook syncs quantity into `organizations.tutor_license_count`.

- Graduated monthly pricing on Stripe (1–10 → €10/license … 50+ → €5; €49/mo admin fee as first tier's `flat_amount`). Price read live via `GET /api/enterprise-license-pricing` (5 min cache); display math mirrored in `src/lib/enterprisePricing.ts`.
- `POST /api/create-enterprise-checkout` — two modes: anonymous **new company** (requires company name) and logged-in **existing org admin**. 409 if org already has an active license subscription.
- Webhook (`api/_lib/enterpriseLicenseWebhook.ts`): for new companies auto-creates auth user + organization + admin row and sends a localized welcome email with a password-setup link; falls back to `enterprise_contacts` + internal alert if auto-provisioning is unsafe. Subscription create/update/delete keeps status, period end, and license count in sync (cancel → 0 licenses at period end).
- `POST /api/org-license-portal` — Stripe Billing Portal (auto-provisioned config) with quantity updates, used by "Manage licenses" on `/company/tutors`; "Buy licenses" dialog for orgs without a subscription.
- UI: `EnterprisePlanCard` with license slider on `/pricing` (above self-serve cap → "Contact us"), `/enterprise/success` page (`flow=new|org`).
- Subscription checkout change: **7-day trial is now the default** for all plans (skipped silently if `trial_used`); legacy TRIAL7D/TRIAL/BANDYMAS codes retired, trial banner removed from Pricing/TutorSubscribe.
- Migration `20260611000000_enterprise_license_billing.sql`: `organizations.stripe_customer_id`, `license_subscription_id`, `license_subscription_status`, `license_subscription_period_end` + partial indexes.

### 2. Billing receipts & accounting (B2B invoices, B2C report)

Accounting persistence + itemized receipts for the accountant.

- **`platform_fee_ledger`** — one row per Stripe B2C payment (session / package / billing_batch / penalty) with base / fee / gross, written idempotently from both webhook and confirm endpoints. All checkout creators now set `tutlio_base_eur` metadata and Lithuanian line-item descriptions ("Mokymo paslaugos. Paslaugos teikėjas: …" / platform fee from MB „Tutlio"). Perlas fees stay in `perlas_ledger`.
- **Receipt emails** (`payment_success`, `monthly_invoice_paid`, `prepaid_package_success`) show a 3-row breakdown — teaching service (org/tutor name), platform fee (MB „Tutlio"), total — whenever the payer paid a surcharge; single row when fees are absorbed.
- **B2B platform invoices**: `payout_fee_records` written per SEPA payout batch; `POST /api/admin-b2b-invoices` generates monthly invoices (`TUT-00001` numbering via DB sequence) for companies with `platform_monthly_fee_eur` set — subscription + payout fees, `amount_due` = subscription only (fees already deducted from payouts). PDF stored in `invoices` bucket, emailed via new `platform_invoice` email type.
- **B2C report**: `GET /api/admin-b2c-report?month=YYYY-MM&format=pdf|csv` — monthly platform-fee summary across Stripe + Perlas for accounting.
- UI: Admin Panel → **"Buhalterija"** (`AdminBillingPanel`): B2C PDF/CSV download, B2B invoice generation + issued list; org detail gets "Mėnesio platformos mokestis (€)" field. Company side: Finances → **"Tutlio invoices"** (`CompanyPlatformInvoices`, non-school orgs) with PDF download via `GET /api/platform-invoice-pdf?id=…`.
- Migration `20260610000000_billing_receipts_automation.sql`: 3 tables, invoice number sequence + RPC, `organizations.platform_monthly_fee_eur`, RLS.

### 3. Session join tracking & attendance

Records when each side actually joins an online lesson; attendance derived at read time (no cron).

- HMAC-signed tracked links (`api/_lib/joinLink.ts`): `/api/join-session?sid&role&t` validates the token, records **first click only** within the window (start − 30 min → end), then 302s to the meeting link. Tutor clicks fill all parallel group-lesson rows.
- Tracked links injected into emails (`booking_confirmation`, `session_reminder`, `lesson_confirmed_tutor` — via `sessionId` in payloads) and tutor Google Calendar event descriptions. In-app join buttons record via `src/lib/joinTracking.ts` on all tutor/student/parent pages.
- Attendance (`src/lib/attendance.ts`): joined ≤ start + 10 min = on time; late / missing otherwise; session "flagged" if either side isn't `joined`. `AttendanceBadge` shows on tutor Dashboard/Students and CompanySessions.
- Admin Panel → **"Lankomumas"** (`AdminAttendancePanel`) backed by `GET /api/admin-attendance?from&to&only=flagged|all`.
- Tutors can save a reusable **personal meeting link** in Lesson Settings (`profiles.personal_meeting_link`).
- Migration `20260612000000_session_join_tracking.sql`: `sessions.tutor_joined_at`, `sessions.student_joined_at`, index on `start_time`.

### 4. Security hardening

- **Cron auth** (`api/_lib/cronAuth.ts`): all 8 cron/maintenance endpoints now require `Authorization: Bearer $CRON_SECRET` (timing-safe). **Fail-closed**: on Vercel (`VERCEL_ENV` set) a missing `CRON_SECRET` returns 500; locally without the secret they still run for manual testing.
- **Redirect allowlist** (`isAllowedRedirectUrl` in `public-origin.ts`): `request-password-reset` rejects `redirectTo` outside tutlio.lt/.com/.pl, `APP_URL`, request origin, or localhost — blocks `javascript:`/`data:`/lookalike domains.
- **Markdown XSS** (`src/lib/markdown.ts`): text escaped before inline markdown, `safeUrl()` restricts link/image schemes; applied to blog SSR too.
- **`tHtml()`** (`i18n/core.ts`): HTML-escapes interpolated params for `dangerouslySetInnerHTML` sinks; adopted in LessonSettings, StudentSchedule, StudentSessions, ParentCalendar.
- `send-email`: browser JWTs limited to `USER_TRIGGERABLE_EMAIL_TYPES`; internal/cron auth via shared `isInternalRequest` + `isCronAuthorized`.
- `vercel.json`: HSTS header added (`max-age=63072000; includeSubDomains`).

### 5. SEO, feature pages & i18n

- Six localized marketing pages under `/features/*` (calendar, waitlist, payments, reminders, cancellation, comments): shared config `src/lib/featurePages.ts`, SPA `FeaturePage.tsx`, bot SSR via `api/feature-render.ts` (WebPage + FAQ JSON-LD), linked in landing footer, included in sitemap for all locales.
- `/about` and `/contacts` aliases for `/apie-mus` / `/kontaktai` (routes + middleware).
- hreflang fixed to ISO 639-1 (`ee→et`, `se→sv`, `dk→da`) across SSR renderers + sitemap; `Content-Language` headers; bot UA list expanded with AI crawlers (GPTBot/OAI, Claude, CCBot, Mistral, Kagi, …).
- OG image switched to `og-image.jpg` (smaller, height 800) in index.html + SSR shells.
- Locale files (12 languages): trial copy overhaul, enterprise checkout/success/welcome-email keys, platform-invoice + fee-breakdown keys, personal-meeting-link keys, attendance keys.
- `resendConfig.ts` centralizes `INTERNAL_NOTIFY_EMAILS` + `getFromEmail()`.

## How to test everything

### 0. Automated (do this first)

```bash
npm test        # 252 tests; 12 new test files cover all workstreams
npm run lint    # tsc --noEmit
```

New test files: `tests/api/` create-enterprise-checkout, create-subscription-checkout, cron-auth, redirect-allowlist, send-email-receipt-rows; `tests/lib/` enterprise-pricing, billing-receipts, attendance, join-link, markdown-sanitize, i18n-thtml, seo-visibility.

### 1. One-time setup before manual testing

1. Apply migrations: `npm run supabase:push` (adds the three `202606100000…/11/12` migrations).
2. Env vars (see `.env.example`):
   - `STRIPE_ENTERPRISE_PRICE_ID` — **required** for enterprise (test-mode graduated price mirroring prod).
   - `CRON_SECRET` — **now mandatory on Vercel** (auto-set in prod; verify it exists in preview env too, otherwise crons return 500).
   - `JOIN_LINK_SECRET` — optional (falls back to service-role key).
   - Optional B2B PDF seller fields: `TUTLIO_COMPANY_CODE`, `TUTLIO_VAT_CODE`, `TUTLIO_COMPANY_ADDRESS`, `TUTLIO_COMPANY_EMAIL`.
3. Stripe test webhook → `/api/stripe-webhook` with `checkout.session.completed`, `customer.subscription.created/updated/deleted`.
4. Run the app: `npm run dev` (Vite :3000 + API :3002).

### 2. Enterprise licenses

1. **New company**: logged out → `/pricing` → pick license count on the enterprise card → Buy now → enter company name → pay `4242 4242 4242 4242` → land on `/enterprise/success?flow=new` → welcome email arrives → set password → `/company/tutors` shows licenses.
2. **Existing org**: as org admin without a subscription → `/company/tutors` → Buy licenses → pay → license count updates (webhook).
3. **Manage**: `/company/tutors` → Manage licenses → change quantity in Stripe portal → count syncs back.
4. **Edge cases**: slider above 200 → "Contact us"; second checkout while active → 409; cancel subscription → licenses drop to 0 at period end; checkout email that already has an account → no auto-org, internal alert + `enterprise_contacts` row.
5. **Default trial**: new tutor subscribe (any plan) → Stripe checkout shows 7-day trial; account with `trial_used` → no trial.

### 3. Receipts & accounting

1. Pay a lesson via Stripe where the payer pays a surcharge → `platform_fee_ledger` gets one row (re-confirming doesn't duplicate) → payer email shows 3-row breakdown. School-absorbed payment → no ledger row, single-row email.
2. Generate a Perlas SEPA payout batch with a payout fee → `payout_fee_records` rows appear (deleted if batch cancelled).
3. Admin Panel → Buhalterija → pick month → "Generuoti sąskaitas agentūroms" (org needs `entity_type=company` + monthly fee set in org detail) → invoice TUT-XXXXX created, PDF in `invoices` bucket, email sent; rerun → skipped `already_invoiced`.
4. As that org's admin → Finances → Tutlio invoices → download PDF.
5. B2C: Buhalterija → download month PDF/CSV; cross-check against ledger rows. API equivalents:

```bash
curl -H "x-admin-secret: $ADMIN_SECRET" "http://localhost:3002/api/admin-b2c-report?month=2026-05&format=csv"
curl -X POST -H "x-admin-secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
  -d '{"month":"2026-05"}' http://localhost:3002/api/admin-b2b-invoices
```

### 4. Join tracking & attendance

1. Create a session with a meeting link starting within 30 min.
2. Click the join button in-app (tutor and student sides) → `sessions.tutor_joined_at` / `student_joined_at` set once (first click wins).
3. Open the tracked link from a reminder/booking email (or build `/api/join-session?sid=…&role=…&t=…`) → 302 to the meeting, timestamp recorded; outside the window (− 30 min → end) it redirects without recording.
4. 10+ min after start: `AttendanceBadge` appears on Dashboard / Students / CompanySessions (green both joined, amber/red flagged).
5. Admin Panel → Lankomumas → flagged-only and all views for a date range.
6. Group lesson: one tutor click marks all parallel rows. Tutor Google Calendar event description contains the tracked link.
7. Lesson Settings → save a personal meeting link → it pre-fills new lessons.

### 5. Security

```bash
# Local with CRON_SECRET set: 401 without bearer, 200 with it
curl -i http://localhost:3002/api/auto-complete-sessions
curl -i -H "Authorization: Bearer $CRON_SECRET" http://localhost:3002/api/auto-complete-sessions

# Redirect allowlist: 400 for foreign hosts
curl -i -X POST http://localhost:3002/api/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{"email":"x@x.lt","redirectTo":"https://evil.com/phish"}'
```

- Blog/markdown: publish a post containing `<script>`, `javascript:` links, `data:` images → all neutralized in SPA and bot SSR output.
- Verify prod responses include the `Strict-Transport-Security` header after deploy.

### 6. SEO & feature pages

1. Human: open `/features/calendar`, `/en/features/payments`, etc. → SPA page with hero/details/FAQ; invalid slug redirects home. Footer "Solutions" links work. `/about`, `/contacts` aliases render.
2. Bot SSR: `curl -A "GPTBot" http://localhost:3000/features/calendar` → full HTML with FAQ JSON-LD and `Content-Language`.
3. `curl http://localhost:3000/api/sitemap` → contains `/features/*` for every locale; hreflang uses `et`/`sv`/`da`.
4. Share a link in a social-preview debugger → `og-image.jpg` renders.
5. Spot-check locales (LT + one other) on pricing, enterprise dialogs, receipts emails, attendance badges for raw `{param}` or missing keys.

### Known caveat to verify in QA

- Schools-audience enterprise checkout builds its success URL as `/schools[/locale]/enterprise/success`, but only `/enterprise/success` and `/:locale/enterprise/success` are registered in `App.tsx`. Verify the redirect if enterprise checkout is ever launched from the schools platform.
