# Tutlio 1,000-user capacity runbook

This runbook defines the release gate for **1,000 simultaneously active users**. It must be executed against an isolated staging deployment and Supabase branch. Never point the harness at the Tutlio production domains or the shared production database.

## What is hardened in this change

- Chat inboxes use private per-user Broadcast topics instead of subscribing every user to every chat table change. Message events contain only identifiers; clients fetch content through current chat RLS before rendering it.
- Open conversations load the latest 100 messages and page older history with a `(created_at, id)` cursor.
- Open-chat reconciliation runs once per minute instead of every 15 seconds.
- Session email runs scan only unsent reminders and stop after 100 delivery attempts.
- School reminder queues process bounded 3-day, 1-day, and overdue batches, with opt-outs and installment counts preloaded.
- Recurring schedules are materialized in a fair 100-template hourly batch. At 1,000 active templates, every template is refreshed within ten hours against a 60-day horizon.
- Hot scans and production advisor-reported foreign keys receive covering indexes.

## Required platform settings before the test

These are dashboard settings and are intentionally not changed by a repository migration:

1. In Supabase Realtime settings, set concurrent connections to at least **1,200** and leave at least 20% message-rate headroom above the expected peak. A 1,000-user test cannot pass a 500-connection quota.
2. Change Supabase Auth's database connection allocation from the fixed value `10` to a percentage-based allocation. Start at **20%**, then verify Postgres connection headroom during the test.
3. Confirm the Vercel staging project has Fluid Compute enabled and accepts the explicit 300-second limits for the three bounded jobs.
4. Pin the Vercel build and Functions runtime to Node.js 24.x. The repository rejects Node.js versions below 22.
5. Create a Supabase development branch or a separate staging project. Seed exactly 1,000 synthetic, non-deliverable accounts distributed across the expected role mix.
6. Route all staging email through a sink/test provider. Do not send load-test reminders to real addresses.

References: [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization), [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration), and [Vercel cron jobs](https://vercel.com/docs/cron-jobs).

## Safe release order

1. Take a staging database backup or branch snapshot.
2. Apply all capacity migrations in version order to the isolated database.
3. Deploy the matching frontend/API build to staging.
4. Smoke-test tutor, student, parent, organization-admin, and school-admin chat flows.
5. Run the targeted and full regression suites listed below.
6. Run the capacity test and observe Supabase/Vercel throughout the 15-minute plateau.
7. Promote only after every acceptance gate passes.

The old `supabase_realtime` publication entries remain for one rolling deployment. This lets already-open clients continue receiving Postgres Changes while new clients use targeted Broadcast topics. They can be removed in a later migration after the frontend rollout has fully aged out.

## Prepare load-test users

Copy `scripts/load/users.example.json` to the ignored file `scripts/load/users.staging.json`, then populate 1,000 unique synthetic accounts:

```json
[
  { "email": "...", "password": "...", "role": "tutor" },
  { "email": "...", "password": "...", "role": "student", "studentId": "..." },
  { "email": "...", "password": "...", "role": "parent", "studentId": "..." },
  { "email": "...", "password": "...", "role": "org_admin", "organizationId": "..." }
]
```

Supported roles are `tutor`, `student`, `parent`, `org_admin`, and `school_admin`. Use data that resembles the production distribution rather than 1,000 identical empty accounts.

## Run the 1,000-user test

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) outside this repository. Then run:

```bash
mkdir -p load-results

TARGET_ENV=staging \
APP_URL=https://your-isolated-staging-host.example \
SUPABASE_URL=https://your-branch-ref.supabase.co \
SUPABASE_ANON_KEY=your_branch_anon_key \
TARGET_VUS=1000 \
npm run load:test:capacity -- --summary-export=load-results/capacity-summary.json
```

The harness blocks `tutlio.lt`, `tutlio.pl`, `tutlio.com`, and the shared Supabase project by default. Do not bypass those guards for this release gate.

The scenario ramps to 250, 500, then 1,000 users; holds 1,000 for 15 minutes; and ramps down. Each virtual user signs in once, joins their permission-checked private inbox Realtime channel, keeps the socket alive, and reads the portal shell, profile, chat inbox, and a role-specific data set every five seconds.

## Acceptance gates

All gates must pass at the 1,000-user plateau:

| Area | Gate |
|---|---|
| HTTP reliability | Failed request rate below 1% |
| Auth latency | p95 below 1.5 seconds |
| App shell latency | p95 below 750 ms |
| Supabase read latency | p95 below 750 ms |
| Postgres connections | Sustained usage below 80% of `max_connections` |
| Database | No deadlocks, lock queue growth, or sustained CPU above 80% |
| Realtime | At least 1,000 stable connections; no authorization-error spike |
| Chat | A message and unread badge arrive for every portal role; history pagination has no gaps/duplicates |
| Cron queues | Each bounded queue shrinks on consecutive invocations; no function timeout |
| Error logs | No new repeated 5xx, RLS denial, rate-limit, or out-of-memory signature |

If a latency threshold fails while reliability remains green, save the slow-query and function-trace evidence before changing capacity. Do not hide a bottleneck by only raising timeouts.

## Regression commands

```bash
npm run lint
npm run lint:api
npm test -- tests/lib/chat-capacity.test.ts tests/lib/capacity-hardening.test.ts
npm test
npm run build
```

Manual smoke checks:

- Send, receive, read, and paginate chat as each portal role.
- Update per-conversation email preferences and confirm the unread badge refreshes.
- Create/edit/cancel individual and recurring lessons.
- Confirm session, payer, tutor, and school installment reminders in the email sink.
- Confirm Stripe/GoSign webhook endpoints remain responsive during the plateau; do not create real charges or signatures.

## Rollback

The migrations are additive and old chat clients remain compatible. If the application build must be rolled back, redeploy the previous build; the Broadcast triggers can remain in place harmlessly while the previous client uses Postgres Changes.

If Broadcast itself causes an incident, disable the two new chat triggers in a reviewed follow-up migration and keep the old publication entries active. Do not delete chat data, reminder flags, or `last_materialized_at` values during rollback.

## Remaining staged optimization

The production advisor also reports many overlapping permissive RLS policies. Consolidating them could reduce policy work further, but it changes the authorization surface and therefore requires a separate role-by-role RLS test matrix on a Supabase branch. It is deliberately not bulk-rewritten as part of this capacity patch.
