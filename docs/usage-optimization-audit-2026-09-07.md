# Usage optimization audit — 2026-09-07

## Changes and evidence

- **Invoice filtering:** keep organization/tutor metadata in a promise scoped to the mounted page. Changing status made **zero additional metadata queries**, verified in the real React browser workflow (7 reads before and after). Previously every filter change repeated these queries and two tutor RPCs. Saving invoice settings invalidates that metadata. Failed requests remain retryable; obsolete filter responses cannot overwrite newer results.
- **Invoice payloads:** select only list/accounting fields, apply date ranges in PostgreSQL, and retain stable pagination so a CSV includes invoices beyond the 1,000-row PostgREST cap. Invoice settings load only when opened. Large all-time exports still retrieve all matching invoices; server-side export streaming remains a future option at much larger volumes.
- **Dashboard reconciliation:** hidden tabs send no payment polling queries, slow requests cannot overlap, visibility restoration refreshes immediately, and the eight-attempt bound remains. Unit tests cover visibility, overlap, cleanup and the request budget. Previously a hidden dashboard could perform eight rounds, up to 24 payment-list requests for a solo tutor.
- **Trial invoice processing:** load PDF/font libraries only when a PDF needs creating; retries reuse stored PDF bytes and avoid rewriting an already-saved storage path. Payment functions explicitly include font assets in Vercel. Atomic SQL issuance and email idempotency remain intact.
- **Database indexes:** production lacked an index on `sessions.lesson_package_id`; add a partial index for payment/package reconciliation. Add `(organization_id, created_at DESC, id DESC)` for ordered invoice pagination. Both indexes and the trial invoice uniqueness index are valid in production. Local PostgreSQL plans confirm the query shapes can use them; this is not a production throughput benchmark.

## Broader findings

Read-only production statistics showed session lists, school contract lists and organization reads among the highest cumulative query costs. Existing feature/auth deduplication, chat visibility guards, bounded cron batches and the recently deployed session-file optimization were reviewed and retained. Access-control policy rewrites and cron-frequency changes were not justified without a representative workload. No user-capacity multiplier or compute-cost percentage is claimed.

## Regression checks

- Exact isolated release: frontend TypeScript and API TypeScript passed; production frontend build passed.
- 13 focused suites / **52 tests passed**, covering PRO pricing, individual prices, shared student data, tutor search, trial invoice payment/retry/storage, invoice exports including 1,001 rows, visible polling and school homework compatibility.
- Local PostgreSQL executes the migrations; repeated issuance produces one invoice/line/number; public roles cannot issue invoices; both new query shapes support indexes.
- Full initial suite: **5,453 passed, 126 failed, 1 skipped**. The 46 failing suites were rerun against the actual deployed source: 113 assertion failures reproduced. The 13 newly failing translation assertions were corrected by adding CSV labels to the published locales. Final coverage/import rerun: **97 passed, 2 failed**; both remaining assertions are the same pre-existing Dutch/Swedish English-copy failures. The broader baseline also contains missing test imports/environment fixtures and pending-locale/email failures. The full suite is therefore not claimed green.
- Real React invoice workflow verified at mobile width: status filter and separate CSV counts remain correct; changing status performs no metadata reload. Earlier QA covered student frequency, shared comments, tutor visibility and desktop/mobile teaching information.
- External payment/email calls were mocked. No real customer was charged and no test email was sent. CSV blob content was verified; the automated browser cancelled the physical file-download step.

## Release isolation

Live baseline: `dpl_14D37zu8a25Ywi8vNzNA5fzf2u7Q` (`tutlio-ifl3m77ae-alaniukas-projects.vercel.app`). Its Git metadata referenced an unavailable dirty checkout. Vercel's actual source hashes were compared against local HEAD. Three source differences (school contracts, Lithuanian and English dictionaries) were fetched and preserved in `tmp/proklase-release`. No commit was created.

The user additionally requested today's completed school work from **Atnaujinti užsakymo peržiūrą** (task `01a07cdb-98e6-7db3-b492-daad8687383b`). The combined release includes its centered email contact text, centered order heading, removed asterisk, default recording consent, payment-obligation button, and individual-session deletion from both calendar and group views. All 31 school-focused tests passed; both TypeScript checks passed again. The real mobile form showed the correct defaults and required unchecked terms checkbox with no horizontal overflow. Uploaded source hashes for all four affected school files, preserved contracts/translations and PRO optimization files match the reviewed release exactly.

Applied migrations, with local filenames matching Supabase's recorded versions:

- `20260907215717_proklase_paid_trial_invoice.sql`
- `20260907215738_payment_invoice_query_indexes.sql`

Deployment is built with production environment settings and `--skip-domain`, then checked before promotion. The release snapshot and logs are in `tmp/`; deploy from the reviewed snapshot, since the working checkout still differs from the live school-contract source.

**Final release:** `dpl_CcEa7mUNKys5p6C112q8DX1QAJjV`, `https://tutlio-a4vazrzm5-alaniukas-projects.vercel.app`, promoted successfully. Live `tutlio.lt` resolves to this READY deployment. The final release contains both today's school work and the PRO/capacity changes; the intermediate PRO-only release was superseded. Login smoke checks succeeded. Invalid payment requests on the intermediate build returned expected 400/405 responses without payment writes or email delivery; those payment files are byte-identical in the final build.
