# Session deletion migration: live verification

Verified on 2026-09-28 at 09:43 UTC. The user explicitly authorized applying this migration and testing the workflow.

## Exact migration

- Project: `cuhciqwmqfuajeeqjjbm` (active production project).
- Source: `supabase/migrations/20260928140000_session_deletion_recurrence_exclusions.sql`.
- Version: `20260928140000`.
- Name: `session_deletion_recurrence_exclusions`.
- SHA256: `8e30c3cb6936d02220f69fd497c4d8cdc68b676331410d099b16efaec842331c`.

Supabase CLI 2.116.0 authenticated successfully. Read-only preflight confirmed the target, PostgreSQL 17.6, every required table/column/role, schema CREATE permission, and migration-ledger INSERT permission. This version and its objects were absent before application.

The original SQL first passed a live transaction ending with `ROLLBACK`. It was then applied through `supabase db query --linked --project-ref cuhciqwmqfuajeeqjjbm --file <temporary-wrapper.sql>`. The wrapper used `BEGIN`/`COMMIT`, a 10-second lock timeout, a 90-second statement timeout, and a version-specific advisory lock. It inserted the original SQL, version, and name into `supabase_migrations.schema_migrations` in the same transaction and notified PostgREST to reload its schema. No broad `db push` was used.

## Verified results

| Check | Live result |
| --- | --- |
| Migration ledger | Exactly this version exists; name matches; one statements entry contains the original SQL; database SHA256 matches the source SHA256 above. |
| Exclusion table | `public.session_recurrence_exclusions` exists with all seven expected columns and four indexes, including its primary key and unique occurrence index. |
| RLS and table grants | RLS enabled. `anon` SELECT denied. `authenticated` SELECT/INSERT/UPDATE/DELETE denied. `service_role` SELECT/INSERT/UPDATE/DELETE allowed. |
| Deletion RPC | `delete_sessions_with_recurrence(uuid[],jsonb,uuid[],boolean,boolean,uuid[],uuid)` exists, owned by `postgres`, with `SECURITY DEFINER` and `search_path=public`. |
| RPC grants | EXECUTE allowed for `service_role`; denied for PUBLIC, `anon`, and `authenticated`. |
| Recurrence guard | Enabled `sessions_skip_deleted_recurring_occurrence` BEFORE INSERT trigger exists on `public.sessions`, for each row, calling `skip_deleted_recurring_occurrence()`. |
| Trigger function | `SECURITY DEFINER`, `search_path=public`; direct EXECUTE denied for PUBLIC, `anon`, and `authenticated`. |
| REST schema | Service-role OpenAPI exposes both `/session_recurrence_exclusions` and `/rpc/delete_sessions_with_recurrence` after the reload. |

Only the authorized schema migration and its migration-ledger registration were applied. No organization/session business records were changed by this verification, no other migrations ran, and no application commit or deployment was made. Demo workflow verification is recorded separately. No migration blockers remain.

## Live recurrence guard after visual deletion

PASS on 2026-09-28 at 10:11 UTC, after the Demo admin deleted one occurrence through the calendar's single-occurrence dialog.

- Deleted fixture: `c3a09280-7e57-4000-8000-000000000204`.
- Template: `c3a09280-7e57-4000-8000-000000000102`.
- Start: `2026-10-01T10:00:00+03:00` (Europe/Vilnius).

The independent SQL probe verified Demo actor/template ownership, absence of the deleted fixture, and the matching persisted `single` exclusion. Inside `BEGIN`/`ROLLBACK`, it attempted an active lesson INSERT for the same student/template/start using the fixture snapshot and a fresh UUID. The INSERT failed with the exact trigger message `This recurring lesson was deleted`. Active occurrence rows before and after the attempt were both zero, and the probe UUID did not exist.

A separate read after rollback confirmed the deleted fixture remained absent, the excluded occurrence had zero active rows, the other two lessons in this template remained, and the single exclusion was preserved. No probe row or test changes persisted.
