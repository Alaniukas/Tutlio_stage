# Tutlio DOCX → PDF converter

Linux LibreOffice microservice used by Tutlio school-contract flows (annual + extra-lessons DOCX templates).

Conversions are serialized inside each container and use an isolated LibreOffice profile per request. School contract templates can take 60–120s to convert; v2.2.2 increases PDF wait and LibreOffice timeouts so large filled DOCX files no longer fail with HTTP 422 after ~96s.

## API

- `GET /` — lightweight health (`{ ok, service, version }`)
- `GET /health` — deep health (requires a recent successful probe conversion)
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

Redeploy when the converter version changes. Version `2.2.2` fixes large school contract conversions that failed after ~96s (`waitForPdf` was 45s × prepared+original retry).

1. Railway → service → Settings → Root directory: `services/docx-converter`
2. Set env `DOCX_CONVERTER_API_KEY` to the same value as in Vercel
3. Optional tuning: `PDF_WAIT_MS=120000`, `LO_TIMEOUT_MS=180000`
4. Public URL stays `https://tutliostage-production.up.railway.app/` (or update Vercel `DOCX_CONVERTER_URL`)

## Test

```bash
cd services/docx-converter && npm test
npx tsx scripts/_diag-contract-steps.ts <contract-id>
DOCX_CONVERTER_URL=http://localhost:8080 npx tsx scripts/_test-railway-converter.ts
```
