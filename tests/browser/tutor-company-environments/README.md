# Company environment browser QA

Run from the repository root:

```powershell
node node_modules/vite/bin/vite.js --config tests/browser/tutor-company-environments/vite.config.ts
```

Open <http://127.0.0.1:3078/dashboard>. Both existing synthetic tutor accounts are
assigned automatically. Switch from the sidebar, collapsed chooser or mobile
header. Expected October tutor pay is **€34** for Pro Klasė QA and **€76** for
Mokslo vaisiai QA. Set invoice preview start to **2026-10-01**; the default end
**2026-10-08** includes every finalized October fixture lesson.

This fixture renders production pages and account-switching code. It uses no
production credentials, does not load `.env`, blocks external fetches and does
not send emails or persist business records. See
[`TUTOR_COMPANY_ENVIRONMENTS.md`](../../../docs/TUTOR_COMPANY_ENVIRONMENTS.md)
for the accounting matrix and release requirements.
