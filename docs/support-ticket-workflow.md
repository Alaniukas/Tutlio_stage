# Support tickets: Trello and Vercel log setup

This guide describes the server-side setup for the signed-in support agent. The Tutlio database stores each ticket and its user-visible status. The team manages status, deadline, and priority on the linked Trello card; a signed board webhook copies those changes into Tutlio and triggers the reporter's status email. The Tutlio admin panel can be used as a fallback.

## 1. Database

These migrations are applied in production:

1. `20260929203658_in_app_support_ticket_lifecycle.sql` — ticket statuses, deadline, delivery state, and Trello card reference.
2. `20260929203704_support_vercel_log_events.sql` — private, service-role-only correlated warning/error metadata.
3. `20260929203715_in_app_support_team_delivery.sql` — records whether the initial team email was delivered so retries cannot rewrite a ticket or resend completed notifications.
4. `20260929203732_in_app_support_trello_card_unique.sql` — ensures one Trello card cannot be linked to multiple tickets.

The local changes also require `20260930120000_support_release_completion.sql` and `20260930190000_support_trello_sync_claims.sql` before publishing. These migrations have not been applied in production. The first adds release admission and recovery; the second prevents concurrent workers from creating duplicate Trello cards and is required by every outgoing ticket synchronization.

`VITE_IN_APP_SUPPORT_ENABLED=true` is configured for the production frontend build.
The ticket stores an allowlisted `https://tutlio.lt`, `https://tutlio.pl`, or `https://tutlio.com` origin from its first submission so confirmation and later status emails link back to the reporter's site.

## 2. Trello

The existing Tutlio board is https://trello.com/b/ezS7PzjV/tutlio. Three support lists have been created there in order: **Support / Užregistruota**, **Support / Vykdoma**, and **Support / Išspręsta**. The board is visible to its Trello workspace; its members can see ticket references and route/category metadata on support cards. The API key, read/write user token, and application secret are configured as server-only Vercel production variables:

| Variable | Value |
| --- | --- |
| `TRELLO_API_KEY` | Trello API key |
| `TRELLO_TOKEN` | Read/write user token; never use a `VITE_` variable |
| `TRELLO_BOARD_ID` | `69d27f54c9d3a097c43a44bd` |
| `TRELLO_LIST_NEW_ID` | `6abbe8bac47574f5288c3234` (Support / Užregistruota) |
| `TRELLO_LIST_IN_PROGRESS_ID` | `6abbe8bb0c22e155e02b2986` (Support / Vykdoma) |
| `TRELLO_LIST_RESOLVED_ID` | `6abbe8bdb07a00461c9ef3da` (Support / Išspręsta) |
| `TRELLO_FEATURE_LIST_NEW_ID` | Features / Užregistruota (create on the same board) |
| `TRELLO_FEATURE_LIST_IN_PROGRESS_ID` | Features / Vykdoma (create on the same board) |
| `TRELLO_FEATURE_LIST_RESOLVED_ID` | Features / Įgyvendinta (create on the same board) |
| `TRELLO_APPLICATION_SECRET` | Trello application secret used to verify webhook signatures; distinct from the user token |
| `TRELLO_WEBHOOK_CALLBACK_URL` | Exact public callback URL used when the webhook was registered: `https://www.tutlio.lt/api/trello-support-webhook` |
| `TRELLO_WEBHOOK_ID` | Optional registered webhook ID to pin inbound events |

The active board webhook is `6abbfb076c841b23bab5f1c6`. To recreate it, use Trello's webhooks API (`POST /1/webhooks`, `idModel` = `TRELLO_BOARD_ID`, `callbackURL` = `TRELLO_WEBHOOK_CALLBACK_URL`). Trello probes the callback with `HEAD`; it must return 200. Keep the callback URL identical in Trello and the environment variable, including its domain and path, because Trello's signature covers it. `TRELLO_WEBHOOK_ID` remains optional; the handler verifies the signature and board ID without it.

The server claims a short database lease, reads the current ticket, and searches this board for the exact `SUP-…` reference before creating a card. It persists the returned card ID for subsequent updates. Concurrent workers leave synchronization for retry instead of creating another card. An ambiguous POST result, including a timeout after creation, is recorded durably: retries search for the existing card and may update it, but do not issue another POST. If no matching card is found, or more than one exists, the team must review the board before retrying. It sends the reference, a generic category and route, priority, status, and deadline. The user's free-form title, full conversation, reporter details, attachments, and private diagnostics stay in Tutlio. A failed card creation is recorded on the ticket for retry; incomplete Trello configuration does not reject the ticket.

Move a card among the three **Support /** lists to change the user's status. **Set a Trello due date before moving it to Support / Vykdoma**; a move without a due date leaves the Tutlio status unchanged and records a sync error for the team to fix. The card's due date is the user-visible deadline. For priority, edit the card title prefix to `[P0]`, `[P1]`, `[P2]`, or `[P3]` for urgent, high, medium, or low priority. This board does not yet have labels with those names. If the team creates them, assign exactly one matching priority label per card; labels take precedence over the prefix. The webhook accepts changes only for a card already linked to a Tutlio ticket by its card ID. Outbound updates carry a client identifier so their webhook echo does not create a loop.

### Separate feature backlog

The admin panel's **Visos užklausos / Klaidos / Funkcijos** views separate the backlog by category while keeping the same editor, priority, deadline, and notification retries. Feature requests display **Įgyvendinta** when their stored status is `resolved` in both the admin and requester status views; bugs display **Išspręsta**. Refreshing the same ticket also refreshes its editor fields, so saving cannot silently restore a stale status after a Trello change.

To activate the separate Trello pipeline, create **Features / Užregistruota**, **Features / Vykdoma**, and **Features / Įgyvendinta** on `TRELLO_BOARD_ID`. Confirm all three lists belong to that board, then configure all three `TRELLO_FEATURE_LIST_*` variables for the deployment environment. Their IDs must be valid, distinct, and different from the Support list IDs. The existing board webhook handles both pipelines; no new board webhook is needed. Apply the pending synchronization migration above before publishing the new code. Card creation and updates use Trello's [Cards API](https://developer.atlassian.com/cloud/trello/rest/api-group-cards/).

With all feature-list variables blank, features continue to use the shared Support lists. Partial or invalid feature configuration records a feature synchronization error instead of placing cards in the wrong backlog; bug synchronization continues. Configure the three variables together before publishing the release. Production publishing still requires explicit approval and the repository's `simo-local` commit/push procedure.

Existing feature cards in the Support lists remain recognized after activation. Move those cards into the matching Features list. Future admin status or priority changes also synchronize the existing linked card into the feature pipeline; no second card is created. Feature cards may still use the old Support lists during this transition. A bug card placed in a Features list records a sync error and keeps its previous customer status.

For either pipeline, **Vykdoma requires a due date**. Moving a feature card into **Features / Įgyvendinta** sets `resolved` and automatically emails the requester that the feature is available. Registration and progress emails also use feature-specific wording and link to the requester's original Tutlio site and portal. Repeated callbacks and delivery retries reuse the existing notification signature and email idempotency key.

## 3. Vercel Log Drain

`VERCEL_PROJECT_ID` and the generated `VERCEL_LOG_DRAIN_SECRET` are configured in Vercel production. The enabled JSON Log Drain `drn_xq8ovDtDSCpofjLB` sends this project's production function logs to `https://www.tutlio.lt/api/vercel-support-log-drain`. Its first sampling rule drops `/api/vercel-support-log-drain` to avoid a delivery loop; the second accepts other production paths. Vercel's filter does not restrict severity, so the endpoint discards lower-severity entries and stores only warning/error/fatal records. The endpoint verifies `x-vercel-signature` against the raw request body using HMAC-SHA1.

Only warning/error/fatal events for the configured project that include `proxy.vercelId` are stored. Each stored row contains bounded time, route, method, status, source, and sanitized message fields. The raw drain body and user-agent/IP fields are discarded; query strings and common IP/email patterns are removed, while structured or form-like message dumps are rejected. Application code should still avoid writing personal data or secrets into free-form error messages. The user-facing support agent receives only matched severity and HTTP status; the platform admin can inspect the stored row. The drain does not reconstruct clicks that made no Vercel request or requests with no matching warning/error event.

The log table is private to the service role. Do not expose the drain secret, Trello token, or correlated log messages in a public response. Without a configured drain, historical Vercel logs are not available through this table. Each accepted batch also removes events older than 14 days. Because the cutoff runs on ingestion, old rows can remain if the drain stops sending batches; remove them manually before archiving or retiring the drain.

## 4. Verification

In a non-production environment, submit one support ticket and confirm its reference, initial status, and single Trello card. Add a due date to that card, move it to Support / Vykdoma, set a `[P1]` title prefix, and check the Tutlio status view and reporter email. Move it to Support / Išspręsta and verify the final status and email. Send a signed JSON drain sample with a matching `projectId` and `proxy.vercelId`; verify that the admin support view shows its sanitized warning/error row. Retry the same ticket and log batch to check that no duplicate card, team email, or log row is created.

Production smoke checks on 2026-09-29 passed for both signed empty callbacks without a database write (`Trello: 200 ignored`, `Vercel: 200 accepted 0`). An unauthenticated ticket-list request returned 401. A full card/status/email flow requires a controlled signed-in test ticket and has not yet been run in production.

The separate feature workflow was verified locally on 2026-09-30 with mocked external services. `tests/integration/support-feature-lifecycle.test.ts` exercises the real card sync, webhook state application, and reporter email helpers through registration, due-date validation, progress, completion, and callback redelivery. Targeted regression coverage also checks category isolation, legacy cards, incomplete configuration, requester links, delivery retries, and same-ticket admin refresh. This does not confirm live production email delivery or configure the new Trello lists.

## 5. Complete tickets when their release reaches production

The release hook is implemented locally and is **not enabled in production**. It accepts only signed `deployment.promoted` events at `/api/vercel-support-release`. It verifies the project and deployment through Vercel's API, requires the deployment to be the project's current production target and the runtime handling the callback, and checks that its Git branch is `simo-local`. Build-success, preview, failure, and rollback events are ignored, as are events for other projects or obsolete deployments. A replayed promotion cannot reapply a release selection already admitted to the ledger. See Vercel's [promotion events and signing rules](https://vercel.com/docs/webhooks/webhooks-api), [project API](https://vercel.com/docs/rest-api/projects/find-a-project-by-id-or-name), and [deployment API](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url).

### Prepare the ticket list before a release

The committed `api/_lib/supportReleaseManifest.ts` contains the exact ticket UUIDs for a release. It starts empty, so deploying this implementation alone completes no requests. The hook does not infer completion from commit-message references or accept a ticket list from a webhook payload.

On `simo-local`, prepare the manifest using the internal team email's **Request UUID**, the admin API response's **id**, or a new coding-agent prompt's **Ticket UUID for release selection**. Older prompts contain only a **Client request UUID**: that is `request_id`, not the ticket row ID, and must not be used here.

```powershell
npm.cmd run support:prepare-release -- --ticket 17ee7859-5c8a-4fba-9dbd-9259ccad28f4 --dry-run
npm.cmd run support:prepare-release -- --ticket 17ee7859-5c8a-4fba-9dbd-9259ccad28f4
```

The UUID above is an example; use real IDs only for requests fully implemented in this release. Repeat `--ticket` for each request, up to 20. Short `SUP-…` references are rejected because they are not unique full IDs. The command writes only the local manifest and performs no commit, deployment, API request, or email delivery. Each preparation creates a new release UUID; retain that UUID for retries and redeploys of the same release. Use `npm.cmd run support:prepare-release -- --clear` when the next release completes no tickets. Windows PowerShell uses `npm.cmd` here because its `npm.ps1` wrapper can consume forwarded flags; other shells can use `npm`.

Only **Vykdoma / in_progress** requests are eligible. Before adding a feature, verify it is enabled and available to its requester, including any organization feature flag. Preparing the manifest is an explicit release decision, not proof that the implementation works. Include this file with the intended changes in the approved `simo-local` commit, clean-checkout verification, and push before deploying. Existing repository approval rules still apply.

### Enable the hook

1. Apply both pending migrations listed in section 1 before enabling the hook. They add private service-role release and Trello synchronization ledgers and RPCs; they do not expose new customer data or change existing ticket permissions.
2. Enable Vercel system environment variables, including `VERCEL`, `VERCEL_PROJECT_ID`, and `VERCEL_DEPLOYMENT_ID`. The deployment API must have consistent Git branch and full commit SHA metadata. Missing or conflicting metadata fails closed.
3. Add the server-only `SUPPORT_RELEASE_VERCEL_TOKEN` with read access to the Tutlio project and its deployments. Set `SUPPORT_RELEASE_VERCEL_TEAM_ID` to its team ID when needed. These values never use the `VITE_` prefix.
4. Create a project-scoped Vercel account webhook for **Deployment Promoted** at the public production endpoint (for example, `https://www.tutlio.lt/api/vercel-support-release`). Store its generated signing secret as `SUPPORT_RELEASE_WEBHOOK_SECRET`; it is separate from the log-drain secret. Account webhooks require a Vercel Pro or Enterprise plan, as described in [Vercel's setup guide](https://vercel.com/docs/webhooks).
5. Ensure the existing Trello lists, Resend credentials, and `CRON_SECRET` are configured. Publish the approved release following the repository's deployment rules. Neither the webhook nor these secrets have been configured by this local implementation.

### Completion and recovery

One atomic database admission records the entire verified release selection, saves its release/deployment/commit identity, and changes included in-progress tickets to `resolved`. Completion clears the deadline consistently in admin updates, release admission, and incoming Trello updates. Later edits to a completed card cannot create another completion notification by clearing a stale deadline. Delivery then works from that trusted ledger, so a short callback budget or a later deployment cannot lose part of the selected list. The existing category-aware status notification sends the completion email and tracking link; the existing Trello synchronizer moves its linked card to the correct Done list. The separate legacy completion-email action is not called, so users receive one completion notification.

The private ledger prevents callback replay or redeploying the same manifest from closing a reopened request. Registered, already resolved, missing, and superseded requests are skipped for that release. Delivery uses short leases, the existing email signature/idempotency key, and repeated updates of the same linked Trello card. Every retry checks that the claimed resolved revision is still current before either external action. A later human change stops pending delivery for the stale revision; actions already delivered cannot be recalled.

Pending work returns a retryable response to Vercel. A `CRON_SECRET`-protected `/api/retry-support-releases` job runs every 15 minutes and recovers only claims already authorized by a verified promotion, including claims from an earlier deployment. It cannot resolve a new request. The batch limit is 20 and worker count is four; exhausted callback budgets leave work for retry. With `SUPPORT_RELEASE_WEBHOOK_SECRET` blank, the recovery job is disabled. Existing admin **retry notification / synchronize Trello** actions remain available for ticket-level delivery errors.

The customer tracking pages keep their existing status/deadline behavior. This release integration has no browser UI changes and does not make those pages subscribe to live Trello updates.

## 6. Verification on 2026-09-30

The final `npm.cmd test -- support` run passed all 464 tests in 40 files after the verification fixes. The production build, frontend TypeScript check, scoped support API TypeScript check, and final global API TypeScript check all passed. Browser verification of the local admin preview confirmed the separate feature backlog, the **Įgyvendinta** state after saving, and an empty disabled deadline field for completed requests, with no browser errors.

The full lifecycle integration uses the real Supabase and Resend SDKs, signed Trello and Vercel handlers, SQL migrations in embedded PostgreSQL, release engine, email and Trello helpers, and customer ticket API. A closed transport simulates provider responses and the supported PostgREST operations; it makes no external requests. It verifies required progress deadlines, completion of selected requests only, feature and bug lanes, authenticated reporter-only tracking, private-field exclusion, callback replay, email delivery failures, old-release cron recovery, and reopening protection. Database synchronization tests also verify actual service-role permissions, competing claims, lease expiry, delayed workers, ambiguous card-creation recovery, and microsecond revision changes.

Verification found and fixed two defects: inconsistent terminal deadlines could resend completion mail after a Trello edit, and simultaneous first deliveries could create duplicate cards. Terminal deadlines are now cleared consistently, and every outgoing card synchronization uses a database claim. When an uncertain POST has no visible matching card, automatic creation remains blocked. An operator can identify the existing card with the exact first description line `Tutlio support reference: SUP-…` on the configured board, then retry synchronization to recover and link it. If no card appears, confirm the provider outcome before creating a replacement; do not create another card or clear the uncertainty marker while an earlier POST might still complete.

Admin synchronization also reports a busy or unconfigured connection correctly: explicit retries return 503 with `Retry-After: 30`, while a saved status returns a warning that Trello synchronization remains pending.

A read-only production catalog query confirmed that the release ledger and its admission and claim RPCs are absent. This verification does not confirm production webhook registration, live credentials or feature-list IDs, real Trello writes, or inbox delivery. No production data was changed and no real emails were sent. A live test requires the pending migrations, configured providers and webhook, an approved deployment, and a controlled ticket with an explicitly chosen test recipient.
