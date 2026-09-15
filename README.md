# Tutlio DOCX → PDF converter

Linux LibreOffice microservice used by Tutlio school-contract flows (annual + extra-lessons DOCX templates).

Conversions are serialized inside each container. School contract templates can take 60–120s to convert.

v2.3.0 waits for `contract.pdf` **while LibreOffice is still running**, then fails in a few seconds if the process tree is dead instead of polling for two minutes. It also reaps leftover `soffice.bin` daemons after every job, aborts work when the caller disconnects, and uses a lightweight Railway liveness check so a failed conversion cannot take the container out of rotation.

## API

- `GET /` — liveness (`{ ok, service, version }`). Railway healthcheck.
- `GET /health` — liveness plus diagnostics (`ok`, `ready`, `lastSuccessfulConversion`, `lastError`)
- `POST /convert-docx-to-pdf` — body `{ fileBase64 }`, header `Authorization: Bearer <DOCX_CONVERTER_API_KEY>`, response `{ pdfBase64, meta? }`

## Local

```bash
docker compose up --build docx-converter
```

In `.env`:

```
DOCX_CONVERTER_URL=http://localhost:8080
DOCX_CONVERTER_API_KEY=local-dev-key
```

## Railway deployment

**Important:** Railway must deploy from subdirectory `services/docx-converter` (not the old root-level `PDF-converteris` branch layout).

Redeploy when the converter version changes. Version `2.3.0` is the reliability release: do not keep bumping wait timeouts as a substitute for killing leftover LibreOffice processes.

1. Railway → service → Settings → Root directory: `services/docx-converter`
2. Set env `DOCX_CONVERTER_API_KEY` to the same value as in Vercel
3. Optional tuning: `PDF_WAIT_MS=180000`, `LO_TIMEOUT_MS=180000`, `PDF_GRACE_MS=3000`
4. Public URL stays `https://tutliostage-production.up.railway.app/` (or update Vercel `DOCX_CONVERTER_URL`)
5. Keep the service in a region close to Vercel (EU). Southeast Asia adds latency on every 2–3 MB JSON body.

## Test

```bash
cd services/docx-converter && npm test
npx tsx scripts/_diag-contract-steps.ts <contract-id>
DOCX_CONVERTER_URL=http://localhost:8080 npx tsx scripts/_test-railway-converter.ts
```
