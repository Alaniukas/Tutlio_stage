# Pro Klasė invoice integrity browser regression

The real admin invoice page, number correction dialog and invoice preview use
synthetic authentication and database responses. Fixture saves persist only in
localStorage so reloads exercise the reported payment and numbering problems.
The test rejects external network requests. No production connection, write or
email is made. This separate Vite entry is excluded from the production build.

From the repository root, start the fixture:

```powershell
node node_modules/vite/bin/vite.js --config tests/browser/proklase-invoice-integrity/vite.config.ts
```

In another terminal, run the browser check (use `PLAYWRIGHT_MODULE` for an
available bundled runtime if Playwright is not installed locally):

```powershell
$env:BROWSER_CHANNEL = 'msedge'
node tests/browser/proklase-invoice-integrity/verify.mjs
```

At 1280 px and 390 px, the test verifies saved paid status and corrected tutor
numbers after reload, the corrected PDF filename, preview/submission containing
only unbilled lessons, previous calendar month defaults, unchanged student
payments and the visible error for a failed save. Screenshots and results go to
ignored `artifacts/invoice-integrity-qa`. Stop the fixture server after testing.
Run `tests/db/proklase-tutor-invoice-integrity.test.ts` and the invoice API/UI
regressions as well: the synthetic browser does not verify a live database
migration or production deployment.
