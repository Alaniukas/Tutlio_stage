# Tutlio DOCX → PDF converter

Linux LibreOffice microservice used by Tutlio school-contract flows.

Conversions are serialized inside each container and use an isolated LibreOffice profile per request. This prevents concurrent contract previews from sharing a locked profile or exhausting the container's process/thread allowance.

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

## Railway deployment

Redeploy from this folder when the converter version changes. Version `2.1.0` serializes conversions and isolates each LibreOffice profile to avoid the `osl::Thread::create failed` resource/profile failure seen in the previous deployment.

1. Railway → New/Existing service → Deploy from repo subdirectory `services/docx-converter`
2. Set env `DOCX_CONVERTER_API_KEY` to the same value as in Vercel
3. Keep public URL `https://tutliostage-production.up.railway.app/` (or update Vercel `DOCX_CONVERTER_URL`)

## Test

```bash
npx tsx scripts/_diag-contract-steps.ts <contract-id>
DOCX_CONVERTER_URL=http://localhost:8080 npx tsx scripts/_test-railway-converter.ts
```
