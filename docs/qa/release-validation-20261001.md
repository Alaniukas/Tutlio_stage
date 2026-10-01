# 2026-10-01 release validation

The user authorized committing all of today's work to `simo-local`, pushing that branch, and deploying production. The release includes school billing occurrence evidence, contract review and discounts, payer invoice review navigation, monthly invoice delivery and fee handling, student payment history, regression tests, and synthetic QA evidence.

## Checks before commit

- `npm run lint`: passed.
- `npm run lint:api`: passed.
- `npm run build`: passed (Vite build 71 seconds; existing chunk size, sourcemap, and Excalidraw import warnings).
- `node node_modules/vitest/vitest.mjs run --maxWorkers=4`: 7,840 passed, 31 failed, 1 skipped; 602 test files passed, 25 failed, 1 skipped. All failures are locale quality tests; none are in today's changed test files.
- The 25 failing test files were rerun against a clean archive of the prior commit `5e6de3e09d4506c2662dca34625e99e40baa6b6c`. That baseline produced the same 31 failing test names and 333 passing tests. Locale source and locale quality tests have no differences from that commit. The full suite therefore remains red from existing translation coverage and placeholder assertions.
- The school billing regression checks also detect deliberately restored old behavior: ignoring student join evidence, omitting the student join column from either API query, and showing the attendance warning for contract exclusions each cause test failures.
- Staged whitespace check and secret pattern scan passed. Environment files, temporary scripts, local test logs, the baseline archive, and credentials are excluded from Git. QA screenshots and PDF use synthetic data and are excluded from Vercel uploads by `.vercelignore`.

The UI/API regression tests mock external database, storage, email, and payment effects. They exercise the real invoice dialog and API handler, but they do not send production customer invoices. Deployment verification must check the pushed commit, clean checkout, Vercel production readiness, and `npm run seo:smoke` after publishing.
