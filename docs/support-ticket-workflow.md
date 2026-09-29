# Support tickets: Trello and Vercel log setup

This guide describes the server-side setup for the signed-in support agent. The Tutlio database stores each ticket and its user-visible status. The team manages status, deadline, and priority on the linked Trello card; a signed board webhook copies those changes into Tutlio and triggers the reporter's status email. The Tutlio admin panel can be used as a fallback.

## 1. Database

These migrations are applied in production:

1. `20260929203658_in_app_support_ticket_lifecycle.sql` — ticket statuses, deadline, delivery state, and Trello card reference.
2. `20260929203704_support_vercel_log_events.sql` — private, service-role-only correlated warning/error metadata.
3. `20260929203715_in_app_support_team_delivery.sql` — records whether the initial team email was delivered so retries cannot rewrite a ticket or resend completed notifications.
4. `20260929203732_in_app_support_trello_card_unique.sql` — ensures one Trello card cannot be linked to multiple tickets.

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
| `TRELLO_APPLICATION_SECRET` | Trello application secret used to verify webhook signatures; distinct from the user token |
| `TRELLO_WEBHOOK_CALLBACK_URL` | Exact public callback URL used when the webhook was registered: `https://www.tutlio.lt/api/trello-support-webhook` |
| `TRELLO_WEBHOOK_ID` | Optional registered webhook ID to pin inbound events |

The active board webhook is `6abbfb076c841b23bab5f1c6`. To recreate it, use Trello's webhooks API (`POST /1/webhooks`, `idModel` = `TRELLO_BOARD_ID`, `callbackURL` = `TRELLO_WEBHOOK_CALLBACK_URL`). Trello probes the callback with `HEAD`; it must return 200. Keep the callback URL identical in Trello and the environment variable, including its domain and path, because Trello's signature covers it. `TRELLO_WEBHOOK_ID` remains optional; the handler verifies the signature and board ID without it.

The server searches this board for the exact `SUP-…` reference before creating a card, then persists the returned card ID for subsequent updates. It sends the reference, a generic category and route, priority, status, and deadline. The user's free-form title, full conversation, reporter details, attachments, and private diagnostics stay in Tutlio. A failed card creation is recorded on the ticket for retry; incomplete Trello configuration does not reject the ticket.

Move a card among the three **Support /** lists to change the user's status. **Set a Trello due date before moving it to Support / Vykdoma**; a move without a due date leaves the Tutlio status unchanged and records a sync error for the team to fix. The card's due date is the user-visible deadline. For priority, edit the card title prefix to `[P0]`, `[P1]`, `[P2]`, or `[P3]` for urgent, high, medium, or low priority. This board does not yet have labels with those names. If the team creates them, assign exactly one matching priority label per card; labels take precedence over the prefix. The webhook accepts changes only for a card already linked to a Tutlio ticket by its card ID. Outbound updates carry a client identifier so their webhook echo does not create a loop.

## 3. Vercel Log Drain

`VERCEL_PROJECT_ID` and the generated `VERCEL_LOG_DRAIN_SECRET` are configured in Vercel production. The enabled JSON Log Drain `drn_xq8ovDtDSCpofjLB` sends this project's production function logs to `https://www.tutlio.lt/api/vercel-support-log-drain`. Its first sampling rule drops `/api/vercel-support-log-drain` to avoid a delivery loop; the second accepts other production paths. Vercel's filter does not restrict severity, so the endpoint discards lower-severity entries and stores only warning/error/fatal records. The endpoint verifies `x-vercel-signature` against the raw request body using HMAC-SHA1.

Only warning/error/fatal events for the configured project that include `proxy.vercelId` are stored. Each stored row contains bounded time, route, method, status, source, and sanitized message fields. The raw drain body and user-agent/IP fields are discarded; query strings and common IP/email patterns are removed, while structured or form-like message dumps are rejected. Application code should still avoid writing personal data or secrets into free-form error messages. The user-facing support agent receives only matched severity and HTTP status; the platform admin can inspect the stored row. The drain does not reconstruct clicks that made no Vercel request or requests with no matching warning/error event.

The log table is private to the service role. Do not expose the drain secret, Trello token, or correlated log messages in a public response. Without a configured drain, historical Vercel logs are not available through this table. Each accepted batch also removes events older than 14 days. Because the cutoff runs on ingestion, old rows can remain if the drain stops sending batches; remove them manually before archiving or retiring the drain.

## 4. Verification

In a non-production environment, submit one support ticket and confirm its reference, initial status, and single Trello card. Add a due date to that card, move it to Support / Vykdoma, set a `[P1]` title prefix, and check the Tutlio status view and reporter email. Move it to Support / Išspręsta and verify the final status and email. Send a signed JSON drain sample with a matching `projectId` and `proxy.vercelId`; verify that the admin support view shows its sanitized warning/error row. Retry the same ticket and log batch to check that no duplicate card, team email, or log row is created.

Production smoke checks on 2026-09-29 passed for both signed empty callbacks without a database write (`Trello: 200 ignored`, `Vercel: 200 accepted 0`). An unauthenticated ticket-list request returned 401. A full card/status/email flow requires a controlled signed-in test ticket and has not yet been run in production.
