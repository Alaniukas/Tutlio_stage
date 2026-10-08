# Tutor invoice confidentiality visual regression

This isolated Vite entry renders the production `OrgTutorFinanceSummary`,
`CreateInvoiceModal`, and legacy `InvoicesPage` redirect with real Lithuanian
translations, styles, and date/dialog controls. Authentication, organization
hooks, and backend responses are synthetic. No production connection or write
is made, and the browser test rejects external requests. Invoice settings and
the unused legacy page layout are stubbed; they are outside this check.

The deliberately polluted invoice response includes a customer invoice issued
under the tutor's ID, the tutor's remuneration invoice, and another tutor's
remuneration invoice. The browser must show only the tutor's own invoice.
The test covers Pro Klasė QA, a generic company, and a school with every feature
flag off, at 1280 px and 390 px widths. It checks the legacy route redirect,
own PDF download action, the correct organization as invoice buyer, preview
and submission without customer invoice interference, empty lists containing
only private invoices, and blocking a genuine own duplicate. School regeneration
also checks the native confirmation: cancellation submits nothing, while approval
includes the previous invoice and all current lessons. Screenshots and
machine-readable results are saved under ignored `artifacts/invoice-privacy-qa`.
The PDF response is a synthetic download fixture; actual PDF authorization is
covered by the API and PostgreSQL tests below.

Start from the repository root in one terminal:

```powershell
node node_modules/vite/bin/vite.js --config tests/browser/org-tutor-invoice-privacy/vite.config.ts
```

In another terminal, use an installed Playwright package or set
`PLAYWRIGHT_MODULE` to the absolute directory of an available Playwright runtime:

```powershell
$env:BROWSER_CHANNEL = 'msedge'
node tests/browser/org-tutor-invoice-privacy/verify.mjs
```

`INVOICE_QA_URL` can override the local origin. The clock is fixed to 2026-10-01
so the sample September lessons remain reproducible. Close the local Vite
server after testing. The application's production Vite config only builds its
normal `index.html`; this test entry is not exposed as an application route.

Run the backend confidentiality regression as well:

```powershell
node node_modules/vitest/vitest.mjs run invoice tests/components/school-tutor-finance.test.tsx
```

`tests/api/org-tutor-invoice-access.test.ts` checks the actual invoice list,
PDF, deletion, and generation handlers across organizations.
`tests/db/org-tutor-invoice-privacy.test.ts` applies the real migration to
PostgreSQL (PGlite) and tests RLS on invoices, line items, and Storage objects,
including access through accidental future permissive policies. Passing this
local fixture does not confirm that the migration or application was deployed
to production.
