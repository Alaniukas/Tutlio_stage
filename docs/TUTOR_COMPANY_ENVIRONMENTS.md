# Tutor company environments

Tutlio assigns access between the same person's existing tutor logins. After
sign-in, the tutor immediately sees a company selector. Tutors do not enter
another account's password or link/unlink companies themselves.

## Assigning and choosing companies

1. In the platform admin panel, open an organization's tutor list and select
   **Prieiga prie organizacijų** on the tutor's row.
2. Select the other organization and that person's existing tutor account.
   Confirm the accounts belong to the same person before assigning access.
3. The tutor's sidebar and mobile dashboard show the assigned companies. The
   collapsed sidebar opens a read-only chooser. A tutor with one company sees
   no selector.
4. Choosing a company activates that company's original tutor Auth identity
   and reloads the dashboard, with its own lessons, students, pay, invoice
   history, settings, permissions and branding. The active session remembers
   the selection on reload.
5. Platform admins can remove an assignment. Both original accounts and all
   business records remain available through their original sign-ins.

Assignment combines existing account groups atomically. Names, phone numbers,
profile emails and invitation emails alone never grant access. This matters
when an invitation was sent to one email and accepted under another login.

## Access model

- `tutor_environment_accounts` stores identity groups and each account's
  organization when assigned. Browser roles cannot read/write this table or
  execute the assignment/removal RPCs.
- `/api/admin-tutor-environments` requires the platform admin secret. GET
  lists access; POST assigns; DELETE removes. PostgreSQL audits mutations in
  the same transaction. Company admins and tutor Bearer tokens cannot assign
  access.
- `/api/tutor-environments` lists assigned environments and accepts only
  `action=switch`. Tutor self-service linking/removal is rejected.
- Switching checks group membership, current organization binding, account
  confirmation, bans, active tutor status and administration roles before
  consuming a one-use Auth token on the server. No email is sent.
- Accounts with verified MFA factors must sign in separately; this endpoint
  cannot issue a session that bypasses their second factor.
- The selected session uses the organization's original `auth.uid()`, so
  existing RLS and API tenant boundaries still apply. No lessons, students,
  rates, invoices or ownership records are merged or transferred.
- Archiving/reassigning an account invalidates its saved organization binding.
  A platform admin must verify and assign the new binding.
- Identity changes hide the previous account's UI, clear data/branding caches
  and reload tutor tabs at the dashboard. Other portals reload their current
  route. Auth changes in other tabs use the same reset. Late profile responses
  from the previous identity are discarded.

## Financial regression checks

Synthetic accounts in `tests/fixtures/tutor-environment-finance.ts` have different
rates, customer prices and invoice histories. Expected October amounts are
independent constants:

| Environment | Pay calculation | Total |
|---|---|---|
| Pro Klasė QA | 2 × €14 + €10 trial + €6 student no-show − €10 adjustment | €34 |
| Mokslo vaisiai QA | €22 historical snapshot + 3 × €18 (regular, trial, no-show) | €76 |

Both include an unpaid completed lesson; customer payment does not change tutor
pay. Cancelled, future and September lessons are excluded from October. Pro
Klasė's unconfirmed lesson is excluded. Another tutor's €999 adjustment must
never enter the total. Each company has three completed lessons and one no-show;
the UI labels these separately.

Checks found and corrected these discrepancies:

- Generic company summaries used completed-count × current rate, omitting
  no-show pay and historical snapshots. They now share the lesson pay helper
  used by invoice generation.
- Pro Klasė invoice previews omitted adjustments. They now include and display
  adjustments without adding fake session IDs. Missing adjustment data blocks
  preview/generation instead of producing an overstated invoice.
- Explicitly selected future/out-of-period lesson IDs could reach generic
  tutor-pay invoices. All organization tutor invoices now enforce finalized
  lesson status, period, end time and tutor ownership. Unpaid lessons remain
  eligible for tutor pay.
- Invalid date ranges hide the previous pay total instead of leaving a stale
  amount on screen. PDF generation receives the same totals and company buyer
  as the preview and saved invoice.

## Local verification and release

`tests/browser/tutor-company-environments/` renders the real Dashboard, Calendar,
Students, Finance and Settings pages with the real UserProvider, Layout, branding,
company policy, caches and switching hook. Only backend/auth and push permissions
are replaced. The fixed clock is 8 October 2026. There are no production keys,
and the fixture blocks external fetches. This entry is excluded from the app's
production build.

Run from the repository root:

```powershell
node node_modules/vite/bin/vite.js --config tests/browser/tutor-company-environments/vite.config.ts
```

Open `http://127.0.0.1:3078/dashboard`. Browser QA covers both environments,
switching back, persisted reloads, a collapsed sidebar and a 390 px phone
viewport. Students (3 vs 2), upcoming calendar events (12:00 vs 14:00), profile
emails, company branding, pay (€34 vs €76), invoice buyers, historical €22 pay,
and separate invoice history were checked. A second open finance tab also
reloads at the new company's dashboard and then shows its own pay/invoices.
The phone layout has no horizontal
overflow. The tutor chooser has no link/password/remove controls.

API tests separately execute the real invoice and environment handlers against
the same synthetic rows. PGlite tests execute the actual migration, including
service-only grants, RLS isolation, group merging, reassignment, audits and
removal. Component/hook/context tests cover administrator assignment, forged
targets, failed queries, MFA/bans, cross-tab identity changes and stale responses.
Browser QA uses synthetic Auth; real Supabase token issuance is covered by API
mocks and still requires a staging/release smoke check.

Before release, apply `20261008123306_tutor_environment_accounts.sql`. Then
release API/frontend and assign the verified accounts through platform admin.
Production deployment requires the user's approval, then the repository's
commit/push process on `simo-local`. No live assignments, production migrations,
fake business data, commits, pushes or deployment were performed for this QA.

UI copy is translated in the 13 baseline locales, using the existing English
fallback for other released locales.
