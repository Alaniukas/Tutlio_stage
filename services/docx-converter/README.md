# Tutlio DOCX → PDF converter

Linux LibreOffice microservice used by Tutlio school-contract flows.

## API

- `GET /` — health (`{ ok, service, version }`)
- `POST /convert-docx-to-pdf` — body `{ fileBase64 }`, header `Authorization: Bearer <DOCX_CONVERTER_API_KEY>`, response `{ pdfBase64 }`

## Local

```bash
docker compose up --build docx-converter
```

In `.env`:

```
DOCX_CONVERTER_URL=http://localhost:8080
DOCX_CONVERTER_API_KEY=local-dev-key
```

## Railway (production fix)

The current `tutliostage-production.up.railway.app` deployment is broken (Windows LibreOffice path). Redeploy from this folder:

1. Railway → New/Existing service → Deploy from repo subdirectory `services/docx-converter`
2. Set env `DOCX_CONVERTER_API_KEY` to the same value as in Vercel
3. Keep public URL `https://tutliostage-production.up.railway.app/` (or update Vercel `DOCX_CONVERTER_URL`)

## Test

```bash
npx tsx scripts/_diag-contract-steps.ts <contract-id>
DOCX_CONVERTER_URL=http://localhost:8080 npx tsx scripts/_test-railway-converter.ts
```
