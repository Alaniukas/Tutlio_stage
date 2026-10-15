# Admin usage analytics and proactive diagnostics

The platform admin panel has a **Klientų naudojimas** view. It shows organization and administrator activity, active days (7/30), last successful action, module visits and last use, first observed milestones, successful/failed workflow counters, grouped client failures and correlated Vercel logs. It supports organization search, pagination and optional Demo/QA inclusion. It sends no customer messages and creates no support tickets.

## Collection

The verified organization-admin provider starts one collector before mounting the protected company/school page, so initial request and render failures can be captured. `CompanyLayout` reuses that collector and records route changes. It reuses Supabase's existing session subscription, including refresh tokens, and makes no extra browser auth reads. Collection is enabled in production builds; local dev disables it. `/preview/admin-usage` is a DEV-only route with fictional data and no analytics API calls.

One observation is sent on entry, then pending observations and counters are batched approximately every five minutes. Pointer/keyboard/scroll activity and visible route changes qualify as human activity. Hidden tabs, polling, token refresh and background mutations do not qualify. There is no per-second heartbeat. Tabs share a heartbeat marker, and each tab reuses a small sessionStorage sequence cursor containing only opaque IDs/counters. Counters describe workflows, not the number of students, lessons or invoice rows created by a bulk request.

The Supabase custom fetch and scoped application fetch observer record failures and allowlisted manual mutations after a successful response. HTTP 200 responses with an explicit error/`ok:false`/`success:false` are failures. Preview/read-only commands are excluded. XLSX/ZIP exports are observed after generation/download initiation; their failures propagate to the original caller. React uncaught errors and unhandled JavaScript rejections are collected automatically. Diagnostics remain available when the in-app support widget is disabled.

Only static modules/actions, error codes, asset file/line/column frames and a few sanitized navigation/click/API breadcrumbs are sent. The pipeline does not send error messages, form values, student identities, request/response bodies, query strings, IPs, user agents or tokens. Server endpoints derive organization/user IDs and the last login timestamp from verified authentication. `VITE_APP_RELEASE` is a public build identifier (commit + build time), supplied by Vite without a new secret.

Telemetry is best-effort diagnostic data, not an audit or billing ledger. Counters can be incomplete when devices are offline, the collector is unavailable, or the volume caps are reached. It never retries business operations. Delivery retries reuse their sequence, stop after three attempts, and do not block the app. The parser bounds counters and error context, and PostgreSQL serializes updates per administrator. Ordinary ingestion is limited to one write batch per 15 seconds across tabs. A new error fingerprint may bypass that delay so a crash immediately after entry is retained. Per admin/day, at most 100 distinct error fingerprints are stored. At most 32 current tab cursors per admin are admitted within 48 hours.

## Storage and retention

All new tables use RLS with no browser policies, revoke PUBLIC/anon/authenticated access, and allow only the server service role. All RPCs are SECURITY INVOKER and revoke PUBLIC execution. Only `ADMIN_SECRET` callers can read the report or matched Vercel logs.

| Table | Bound |
| --- | --- |
| `org_admin_usage_state` | One row per admin/organization; first/last activity and bounded milestone/module maps |
| `org_admin_usage_daily` | One row per admin/organization/day; about 12 months |
| `org_admin_telemetry_cursors` | One row per active tab; removed after 48 hours |
| `org_admin_error_daily` | One row per admin/day/fingerprint; samples expire after 14 days, counters after 90 days |
| `org_admin_telemetry_config` | One row: collection start and last cleanup |

`GET /api/cleanup-admin-telemetry` requires `CRON_SECRET` and runs daily at 02:35 UTC. It also prunes existing `support_vercel_log_events` after 14 days. Cleanup does not depend on new log batches arriving. Read queries exclude expired samples/logs even before cleanup. Orphaned administrator state is removed; organization/account deletion cascades. Retention is enforced on the daily cron, so physical deletion can lag the cutoff by up to a day.

`/api/vercel-support-log-drain` continues accepting signed batches for the configured project, with duplicate log IDs ignored. It no longer makes an extra retention request on every ingestion. The platform log view excludes DEP0169 deprecation noise unless the request failed with 5xx, and labels uncorrelated server logs separately from organization diagnostics.

## Support signals

- Organization inactivity requires a previously observed timestamp and no active administrator seen for five days. The report also displays each administrator's last activity.
- Repeated errors require at least three occurrences of the same fingerprint today (UTC), rather than unrelated one-off errors.
- Usage decline compares successful actions over the previous seven complete UTC days against the seven days before them; weekdays match. It requires 14 days of observed coverage and at least five baseline actions. A drop of 50% is flagged.
- Onboarding flags apply only to organizations created within 30 days, observed for at least three days, with missing role/feature-appropriate first actions. Invoice sending also satisfies invoice onboarding; creating a group satisfies initial lesson scheduling.
- Demo/QA and suspended organizations receive no attention flags. Missing history is unknown, not proof of inactivity. History before the migration is not reconstructed.

## Weekly internal email (customer success)

`GET /api/admin-usage-weekly-report` requires `CRON_SECRET` and runs **every Monday at 06:00 UTC** (08:00/09:00 Vilnius). It sends one HTML digest to `INTERNAL_NOTIFY_EMAILS` (includes `alaniukasa@gmail.com`). The email does not contact customers.

| Section | Purpose |
| --- | --- |
| Kaip sekasi klientams | Active org count (7 d.), successful actions this week vs previous week, orgs with errors, top modules (30 d.) |
| Neaktyvūs administratoriai (≥7 d.) | No observed login or in-app activity for at least 7 days (`last_active_at` / `last_login_at` from telemetry) |
| Įspėjimas (≥14 d.) | Same list filtered to 14+ days (or no telemetry yet on older orgs) |
| Onboarding checklist | Orgs younger than 30 days missing first milestones (student, tutor, session, invoice, contract, group) |

Resend idempotency key: `admin-usage-weekly-YYYY-Www` (one send per ISO week). Requires the same telemetry migration and production collector as the admin panel.

### Metrics that matter for Tutlio-style SaaS

- **Activation:** first milestones per org (students, schedule, finance/contracts for schools).
- **Engagement:** active admin days per week, module visits (which areas they actually use).
- **Depth:** successful workflow actions (not page views alone), week-over-week trend.
- **Reliability:** grouped client errors and repeated fingerprints (support before churn).
- **Risk:** admin inactivity (7 d. ping internally, 14 d. escalate), usage drop ≥50% with baseline volume.

Page and feature use are captured as **modules** (route segments under `/company` and `/school`) and **actions** (successful mutations such as `student.create`, `invoice.send`). See `TELEMETRY_MODULES` and `TELEMETRY_ACTIONS` in `src/lib/orgAdminTelemetryShared.ts`.

## Release and verification

Apply `20261013170213_org_admin_usage_telemetry.sql` before deploying the frontend/API and the updated log drain together. It relies on the existing organization-admin permission schema and `support_vercel_log_events` migration. No new environment secret is required: existing Supabase service credentials, `ADMIN_SECRET`, `CRON_SECRET`, `VERCEL_PROJECT_ID`, and signed drain configuration are reused. Follow the repository's approved `simo-local` release procedure; creating these files does not apply the production migration or publish a release.

Local tests cover the full ingestion → embedded PostgreSQL RPC → protected report flow, access denial, cross-organization isolation, revocation, replay, throttling, background activity, grouping, retention, safe payloads, failed telemetry transport and panel behavior. Use `/preview/admin-usage` for read-only visual QA. A live smoke test after the approved release should use a Demo administrator: perform a successful action, produce one controlled failure, check the matching report and Vercel ID, and verify the cron's cleanup timestamp. Do not inject failures into real customer flows.
