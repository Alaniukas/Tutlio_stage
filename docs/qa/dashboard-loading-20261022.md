# Company dashboard loading, 2026-10-22

Status: fixed and tested locally with the existing Pro Klasė QA Demo account. No commit, push, production deployment, migration, customer-data edit, or outgoing email was performed. Release still follows AGENTS.md section 8.

## Findings

The dashboard preloader wrote `earningsTotal: 0` and empty activity/payment arrays into `company_dashboard`. The page treated any cache entry as complete. A late preload could also overwrite a complete snapshot after its initial cache check. This produced the observed €0 and empty-list flash.

Initial sign-in latency came mainly after authentication. In an instrumented baseline, the password request completed in 416 ms, but the dashboard appeared 41.1 seconds after submission. The route, membership provider, preloader, and dashboard repeated organization reads; several individually took about two seconds. Joined session, package, and unrelated school-installment requests then took roughly eight seconds and returned HTTP 500. The page swallowed several read errors as empty data and waited for all optional sections before clearing its spinner. This baseline reproduced a worse case than the earlier live inspection.

The trace establishes the slow request sequence and failed HTTP responses. It does not establish an underlying Supabase infrastructure fault or a permanent provider-side resolution.

## Changes

- Partial dashboard preloads are explicitly incomplete and omit unknown totals/lists. They cannot overwrite a complete snapshot that finishes while the preload is in flight.
- The dashboard accepts only complete snapshots for its organization and finance access. Failed refreshes preserve the last complete snapshot.
- `companyDashboardData.ts` separates the main overview, attention/follow-up data, and recent payments. The main overview renders without waiting for the two optional sections, which load independently.
- Unknown optional sections show a loading state. Failed reads show localized retry controls instead of a successful zero/empty result. Each stage has a 15-second deadline, and superseded/unmounted results cannot publish state or cache.
- Main dashboard data reuses organization metadata already fetched by the live membership check. Company login reuses its freshly read seat for portal routing; the protected-route membership check remains independent and live.
- The layout prioritizes the overview at sign-in instead of concurrently preloading every other page. Later navigation can still warm the other pages.
- Dashboard session/payment labels are loaded through separate, authorized ID reads instead of repeated nested relations. Company dashboards skip the school-installment query; school queries are organization-scoped.
- Error copy is present in all 13 base locales. Existing lesson/payment calculations and status actions remain in place.

## Verification

The same existing QA account was used throughout: 18 clients and 6 tutors, backed by the configured production Supabase project. This is QA data, not a verified full copy of a client's complete dataset.

Observed local results after the change:

| Check | Result |
| --- | --- |
| Fresh sign-in to populated main dashboard | 2.93 s |
| Return from Students to dashboard | 0.21 s; €553 and five attention entries already present |
| Optional requests deliberately delayed by 6 s | Main totals and upcoming lessons rendered; optional sections showed loading and subsequently populated |
| €0 dashboard render in the saved fixed/slow traces | None |
| Failed HTTP responses in the saved fixed sign-in window | None |

These are individual observations, not a controlled performance benchmark; backend response times varied. Intermittent provider failures remain possible and now produce bounded, retryable error states.

All 57 tests in 12 files passed. Coverage includes incomplete-cache rejection, a late-preload race, cache preservation, required-read retry, 15-second required/optional deadlines, ignored late results, organization isolation, existing students loading, tutor visibility, dashboard metrics, auth-session/account-switch regressions, and localization coverage. Frontend TypeScript, the production build, and `git diff --check` passed. Existing build bundle/sourcemap warnings remain.

Temporary browser timing instrumentation lives only in ignored `tmp/dashboard-loading-qa/`. It is not product code or part of the production build. Sanitized evidence, screenshots, and validation logs are in ignored `output/qa/dashboard-loading-fix-20261022/`, including `summary.json`, `baseline.json`, `fixed-sign-in.json`, `slow-sections.json`, `tests.log`, and `build.log`. No credentials or bearer tokens are recorded in those traces.
