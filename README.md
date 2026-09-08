# Tutlio DOCX converter 2.2.0

Prepared from PDF-converteris revision 0ea41dc89353378ea0d2a682e86483f9c30d1744. The production branch has a root-level server.js; this directory contains the complete corresponding release, including its fonts and DOCX layout adjustments. Do not deploy the previous server.mjs implementation separately. server.mjs now forwards to server.js.

## Reliability changes

- Authentication and maximum three admitted HTTP requests before JSON decoding; 8 MB JSON limit.
- One active conversion and at most two waiting jobs. Waiting expires after 5 seconds; overload returns 503 and Retry-After.
- One LibreOffice invocation, isolated HOME/TMPDIR/profile, 12 second process deadline. Linux process-group SIGKILL removes wrapper descendants. tini reaps orphans.
- Resource exhaustion or timeout marks the worker unavailable and exits nonzero. Railway ON_FAILURE restarts the container, with a finite 10-restart cap to surface persistent faults.
- Startup and idle once-per-minute synthetic DOCX conversions validate the engine. GET /health is 503 until successful. It does not launch processes per HTTP health request.
- No retry with original DOCX after a layout-adjusted conversion fails: retries must not silently change contract layout.
- Tutlio uses an 18 second remote request abort and validates PDF header bytes.

## Test before release

From this directory:

    npm test
    docker build -t tutlio-converter-test .
    docker run --rm --memory=1g --pids-limit=256 tutlio-converter-test npm test

The Linux test runs 20 sequential real conversions followed by a 12-request burst and verifies recovery after overload. It skips explicitly when LibreOffice is unavailable. The nested .github/workflows/converter.yml belongs at the root of PDF-converteris when publishing this directory there; it is not an active workflow in the application branch.

Also compare anonymous annual and extra-lessons contract PDFs visually against the current approved layout before production promotion. Preserve the fontconfig file and bundled fonts.

## Deployment

No production deployment was performed by preparing these files. Publish the directory contents to PDF-converteris only after review; changing that branch may trigger Railway deployment. Keep DOCX_CONVERTER_API_KEY and the existing public URL. Apply railway.json and verify GET /health reports version 2.2.0 and an actual successful conversion. Deploy the Tutlio API changes separately.

Railway deployment healthchecks only gate startup, not ongoing health. The internal conversion probe and nonzero exit implement runtime recovery. Configure external outage notifications separately; none were created here.

References: https://docs.railway.com/deployments/healthchecks and https://docs.railway.com/deployments/restart-policy

## Scope and remaining limitations

The converter admission queue remains bounded in memory. Tutlio now persists final acceptance work separately in school_acceptance_jobs before requesting conversion. See docs/school-acceptance-queue.md in the application repository for deployment order and recovery semantics.

The Tutlio changes serve saved offer PDFs without conversion, prevent unsaved previews from replacing contract pointers, and store each generated PDF under its byte hash. New invitation emails are withheld if PDF generation/storage fails. Such contracts remain saved for retry through the existing resend action. Final acceptance freezes filled source bytes and choices in the durable DB job. A cron worker generates the PDF and atomically marks the contract signed only after storing it; converter failure schedules a retry.

Hash-named PDF objects preserve prior versions and consume storage; a future retention task must exclude all referenced/frozen documents. No existing PDFs or customer data are deleted or migrated.
