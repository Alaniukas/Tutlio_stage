# Durable extra-lessons acceptance

The parent POST now freezes the filled DOCX bytes (or direct PDF for text templates), consent, original acceptance timestamp, hash, prices and notification inputs into `school_acceptance_jobs`. It returns 202 only after the DB write succeeds. It does not call LibreOffice. Repeated submissions return the existing job, including after an uncertain HTTP response.

The public page restores pending state on reload and polls a token-authorized status endpoint. It shows completion only after final PDF storage and DB finalization. Closing the page does not stop processing. The original submission timestamp remains the acceptance timestamp; retries do not restart the 14-day calculation.

## Deployment order

1. Apply `20260908230000_school_acceptance_jobs.sql` to the target database. This creates two service-role-only tables and three restricted RPCs; it does not enqueue or sign historical contracts.
2. Deploy the converter reliability release and verify real DOCX conversion and fonts using anonymous QA templates.
3. Deploy the API, frontend and `vercel.json` together. Confirm the existing `CRON_SECRET` is configured and `/api/process-school-acceptances` runs every minute. Its function budget is 120 seconds; one job is claimed per invocation (about 60 jobs/hour without additional authenticated invocations).
4. In Demo only, submit once while the converter is unavailable, reload the page, then restore the converter. Confirm exactly one job, the original timestamp/hash, one final contract, consumed token, and confirmation/invitation delivery. No real customer signatures should be created as a deployment test.

No migration or production deployment was executed as part of local implementation.

## Recovery and concurrency

- Unique contract ID + row locking makes enqueue idempotent. The stored snapshot is never overwritten by retry requests.
- `FOR UPDATE SKIP LOCKED` and a five-minute lease reserve work. A crashed invocation is reclaimed after lease expiry. A random lease ID fences obsolete workers.
- Failed jobs back off from 30 seconds to one hour, with no automatic deletion or retry-count cutoff. Attempt 10+ is surfaced as needing attention and logged with job ID, not the source document.
- PDF objects are byte-hash-named under the contract folder. Upload before a crash is safe to repeat.
- Finalization locks the job and contract; updates the signed contract, token, PDF pointer and finalized marker atomically. A retry after finalization resumes notification work without reconversion. A withdrawn/independently signed contract is not overwritten.
- Queue rows and frozen source contain personal data. RLS denies anon/authenticated direct access. Public status returns only lifecycle metadata after validating the contract token.

## Notifications

Confirmation and first-invitation provider payloads are persisted before sending. Retries use identical payloads and provider idempotency keys, so a changing nearest lesson or document URL cannot alter a retry payload. Successfully recorded deliveries are skipped permanently.

Resend deduplicates for 24 hours: https://resend.com/docs/dashboard/emails/idempotency-keys . If a delivery remains uncertain after 23 hours, automatic sending stops for that delivery and requires operator review rather than risking duplicate mail. The job remains retained/retryable and its signed PDF remains available; conversion retries themselves do not have this cutoff. Do not clear a delivery record or change its key without checking provider logs.

## Operator checks (read-only)

```sql
select id, contract_id, status, attempts, available_at, locked_until,
       finalized_at, confirmation_sent, invite_sent, last_error
from school_acceptance_jobs
where status <> 'completed'
order by created_at;
```

Investigate stuck jobs with `last_error`, converter `/health`, cron logs and provider delivery status. Permanent bad source documents or outages that never recover still require repair; durable storage prevents loss, not all possible service failures. There is no new external alert integration in this release.

Do not roll back to the synchronous acceptance API while pending jobs exist: it could bypass the queue's single-submission protection. Drain jobs first or retain the queue-aware API/worker during rollback. Do not delete queue tables on rollback. Existing email/contract workflows outside extra-lessons click-wrap are unchanged.

## Local verification

`tests/db/school-acceptance-jobs.mjs` runs the actual migration/RPCs in an isolated PGlite PostgreSQL engine. It checks immutable duplicate submission, exclusive leasing, expired-lease recovery, atomic/fenced finalization, notification-stage recovery and access restrictions. `PGLITE_MODULE` may point to an installed PGlite entry; no application DB credentials are read.

Vitest covers submission while conversion is down, DB failure, worker retries/resumption, mail deduplication and the parent pending-to-completed screen. The isolated browser fixture at `?view=acceptance` displays the actual page with test responses; its QA button simulates worker completion. This is not a production conversion test.
