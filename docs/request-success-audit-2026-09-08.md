# Request success investigation, 2026-09-08

The supplied screenshot shows 77,538 requests and 90.2% success. Its source, time window, filters and success definition are not yet known. The arithmetic difference is approximately 7,599 requests, but the displayed percentage is rounded. The findings below do not account for that entire difference.

## Evidence and limitations

Read-only Vercel production runtime logs were queried for the preceding 24 hours through the locally authenticated CLI, scoped to `alaniukas-projects/tutlio`, without branch filtering. The connected Vercel app belongs to a different team and could not read this project. Supabase lists the correct project but its available connector tools do not expose request logs.

The CLI repeated the same results when requesting larger limits. Counts below are deduplicated by request ID: 50 unique 4xx requests and 50 unique 5xx requests. These are bounded samples, not daily totals. Runtime logs are not a substitute for the screenshot's complete request metric. Production-environment logs include requests to deployment URLs used for QA; they do not all represent customer traffic on tutlio.lt.

Deduplicated evidence: `tmp/success-rate-deduplicated-20260908.json`.

## Findings, ordered by impact

1. **Subscription webhook crashes before updating the tutor profile.** A request on `www.tutlio.lt` at 2026-09-08 07:09:45 UTC returned 500 on deployment `dpl_CcEa7mUNKys5p6C112q8DX1QAJjV`: `RangeError: Invalid time value`, `api/stripe-webhook.ts:178`. The code converts the top-level `subscription.current_period_end` without validating it. The same unsafe conversion exists at lines 224, 241 and 381. This can leave subscription status/expiry stale. Stripe's Basil API moved billing periods to subscription items; an incoming event with that shape is a likely cause, but the actual event payload/version was not retrieved. The SDK's request API version does not establish the incoming webhook's version. Fix should support the observed event formats, validate dates, and cover subscription create/update/delete and checkout completion. Do not silently acknowledge failed profile synchronization.

   Official change: https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end

2. **Google Calendar synchronization fan-out.** 25 of the 50 recent 4xx requests were `/api/google-calendar-sync` returning 400; 24 occurred within 59 ms. `src/pages/company/orgAdminSessionCreate.ts:609` defines an unconditional per-session sync helper, called at lines 837 and 1016. The API returns 400 for disconnected/disabled sync, missing tokens, or per-session sync failures (`api/google-calendar-sync.ts:66-85`). The response bodies were not present in the retrieved logs, so the exact reason for this burst is unconfirmed. Check integration eligibility once before creating the sync work, batch/deduplicate work, and record a structured reason for actual failures. Saving lessons can succeed even when the subsequent sync fails.

3. **Branding absence generates repeated 404 requests.** 22 of the 50 recent 4xx requests were `/api/org-branding`. The endpoint deliberately returns 404 both for an unknown organization and for disabled branding (`api/org-branding.ts:47,53`). `src/contexts/OrgBrandingContext.tsx:200-214` returns early for non-OK responses and only caches successful branding. Consequently, an organization without branding can trigger another failed request on a later load. Response bodies were unavailable, so the sample cannot be split between those two reasons. Give disabled branding an explicit normal result and cache that state with bounded invalidation; preserve a real 404 for nonexistent organizations.

4. **Automatic blog generation uses an unavailable Gemini model.** At 2026-09-08 05:00:10 UTC, `/api/blog-auto-generate` returned 500 on `dpl_CcEa7mUNKys5p6C112q8DX1QAJjV`. All three attempts received a Gemini 404 stating that `gemini-2.5-pro` is unavailable to new users. `api/_lib/blogAiProvider.ts:265` defaults to that model and the retry loop retries permanent errors immediately. Select and verify an available configured model, and stop retrying permanent 4xx errors. This affects the publishing job; it does not establish a user-facing application outage.

## Historical / lower-confidence entries

- 47 of the 50 sampled 5xx requests were `/api/send-email` on the older QA deployment hostname `tutlio-gs2vhqxl1-alaniukas-projects.vercel.app`, deployment `dpl_AAiPMaVH3TeqhF6ysbPn5rEr1JqV`. The error was a missing ESM import extension for `familyCatalogTrialCopy`. The reviewed release snapshot and current checkout both use `.js`. No recurrence on the newer deployment was present in this sample. Do not count these as 47 currently failing customer emails.
- One further sampled Stripe 500 was on the earlier `dpl_14D37zu8a25Ywi8vNzNA5fzf2u7Q` deployment.
- Remaining sampled 4xx: one `/schools/blog` 404, one `/api/join-session` 405 and one `/api/create-package-checkout` 400 on a deployment hostname. No response details establish a defect for these.

## Next evidence needed

Obtain the screenshot's dashboard URL and selected period. Group that exact request population by service, HTTP status, route and deployment, then correlate dominant groups with response reasons. If it is a Supabase metric, inspect Supabase REST/Auth/Storage logs directly; Vercel runtime counts cannot explain it.

No application code, database records, configuration, commits or deployments were changed during this investigation. Tests were not run because this was a read-only investigation plus this report.

## Follow-up: local fixes requested and completed

The paragraph above describes the initial investigation. Following the user's request to fix these issues, the working tree now includes:

- A shared validated subscription-period parser for tutor and enterprise webhooks. It accepts both older root-level and Basil item-level periods, aligned with the first item used for plan/quantity selection. All four tutor subscription paths use it; database update failures in these paths now fail the webhook delivery instead of being acknowledged as successful.
- One Google Calendar eligibility check after an organization-admin save, with duplicate session IDs removed. Disabled integrations send no sync requests. Enabled integrations send sequential batches of up to ten IDs (24 lessons become three requests). The API validates every session's ownership before any batch write, retains the existing single-session contract, and reports upstream failure without continuing the batch. Existing post-save behavior remains best effort; no durable background queue is introduced.
- Existing organizations without custom branding return a cacheable `{ enabled: false }` for ID lookups. The portal caches this result for five minutes, scoped to the user and portal. Missing organizations and unbranded public login slugs retain 404 responses. Transient errors are not cached.
- The default blog model is `gemini-3.1-pro-preview`; explicit `GEMINI_MODEL` overrides remain respected. Permanent HTTP 4xx failures stop immediately, except transient 408/429 responses. Retriable failures have bounded exponential backoff and at most three attempts. `.env.example` documents the new default. Provider support was checked against Google's documentation: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-pro-preview . Live generation was not triggered.

Validation: **75 tests passed across 10 focused suites**, including webhook event branches, invalid dates and database failures, Google batching/authorization, disabled branding cache expiry/account changes, Gemini retry behavior, and API ESM import extensions. Frontend TypeScript, API TypeScript and the production frontend build passed. Build output included Tailwind sourcemap, Excalidraw import and chunk-size warnings.

No real payment, calendar write, email delivery or blog generation was performed by the tests. No production configuration/database change, commit or deployment was made. Existing unrelated working-tree changes were preserved. An explicit obsolete production `GEMINI_MODEL` override would need updating before release; changing the code default does not override a configured value. The effect on the screenshot's success percentage still requires the original metric source/time window and post-deployment measurement.
