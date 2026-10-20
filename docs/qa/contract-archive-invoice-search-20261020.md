# Contract archive and invoice search

Implemented on 2026-10-20. Local changes only; no release, commits, production data updates or new account grants were made.

## Accountant access

- School portal: **Finansai → Sutarčių archyvas** (`/school/finance?tab=contract-archive`).
- Existing `finance.view` access is sufficient, including the accountant preset. `contracts.view` also authorizes the archive API. The role presets and database policies are unchanged.
- The archive lists archived family contracts, supports searches by contract number, student and payer, and provides original downloads plus a ZIP grouped by payer. Search and ZIP include matches across all archive pages.
- The API obtains the organization from the authenticated user's active membership. It excludes active contracts, teacher contracts and staff documents. Client-provided storage paths and organization IDs do not authorize downloads.
- Original files are preserved: reading or exporting the archive never regenerates a PDF or restores a contract. Downloads use signed URLs valid for 15 minutes; API responses are private and not cached.
- Laisvi vaikai has 102 archived family contracts. Contracts without a preserved file remain visible with a missing-file label.

## Invoice search

**Finansai → Sąskaitos** has an invoice-number search field. It accepts a number, a partial number or a series with the number; case, separators and leading zeroes are normalized. Existing status, period and buyer filters still apply. Downloads and selected rows follow the filtered results.

General invoices now load in pages through the existing `fetchAllRows` helper, rather than relying on Supabase's first response page. School payer invoices continue to use their existing paginated load.

## Why PAM-839 and PAM-840 are absent

Read-only production investigation, scoped to Laisvi vaikai (`2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17`):

1. Neither number exists in `invoices` or `school_monthly_invoices`, including cancelled records. No matching delivery record was found.
2. PAM-838 was saved on 2026-10-07 at 13:33:17 UTC. PAM-841 was saved at 13:53:46 UTC. The stored invoice PDFs in this interval correspond to existing numbered invoice rows; there is no intervening orphan PDF.
3. Production PostgreSQL logs contain two failed `school_monthly_invoices` inserts at **13:33:40.958 UTC** and **13:48:26.234 UTC** on 2026-10-07. Both are SQLSTATE **23505**, `duplicate key value violates unique constraint "idx_school_monthly_invoices_student_period"`, for the same student and `period_start = 2026-09-01`.
4. `school-monthly-invoice-admin.ts` allocates an invoice number before rendering the PDF and inserting the invoice. The number allocation is a separate RPC transaction, so a subsequent insert failure does not return the number.

These observations identify 839 and 840 as consumed numbers from the two failed duplicate creation attempts, rather than saved invoices hidden by the UI. The logs identify the failed student/period; the allocation-to-number mapping is inferred from the exact sequence gap and timing.

The student's saved September invoices are:

| Number | Created | Total | Current status |
| --- | --- | --- | --- |
| PAM-800 | 2026-10-04 | €96 | Paid |
| PAM-867 | 2026-10-16 | €160 | Pending, later supplemental invoice |

The current production student/period index is already non-unique, permitting supplemental invoices for previously unbilled lessons. The production migration history records `school_monthly_supplemental_invoices` as `20261016170250` (repository source: `20261016170000_school_monthly_supplemental_invoices.sql`). No billing migration or historical renumbering is part of this change.

## Verification

- Frontend and API TypeScript checks passed.
- Production Vite/PWA build passed. Existing Tailwind sourcemap, Excalidraw import and large-chunk warnings remain.
- All **76 tests in 10 focused suites passed**, covering archive permissions, organization isolation, staff/active-contract exclusion, preserved signatures, ZIP export, archive UI/search/pagination, invoice search, filtered selections, existing invoice editing/downloads, role presets and locale coverage.
- Authenticated Demo Mokykla API check: archive GET **200**, four archived contracts; original file GET **200**, `application/pdf`, 168,032 bytes; archive ZIP **200**, one file; foreign-organization contract **404**. The temporary QA session was signed out after the check.
- Browser: Demo Mokykla Finance archive loaded its four rows; search narrowed to one contract and its original downloaded successfully. Invoice searches `501` and `000501` both found `DMO-00501` and excluded `DMO-00502`.
- Screenshots: `output/qa/contract-archive/archive.png` and `output/qa/contract-archive/invoice-search.png` (ignored QA artifacts, synthetic Demo data).

No emails were sent and no real-organization records were changed.
