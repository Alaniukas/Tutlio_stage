# Tutlio DOCX Converter

Standalone microservice for converting `DOCX -> PDF` with LibreOffice.

## API

- `GET /health` -> `{ ok: true }`
- `POST /convert-docx-to-pdf`
  - body: `{ "fileBase64": "<docx_base64>" }`
  - optional header: `x-api-key: <DOCX_CONVERTER_API_KEY>`
  - response: `{ "pdfBase64": "<pdf_base64>" }`

## Local run

1. `npm install`
2. Copy `.env.example` -> `.env` and set vars.
3. `npm start`

## Deploy to Railway

1. Create new Git repo from this folder.
2. Push to GitHub.
3. In Railway: **New Project -> Deploy from GitHub Repo**.
4. Set environment variable `DOCX_CONVERTER_API_KEY` (recommended).
5. Deploy.

## Connect from main app

Main Tutlio app env (in `simono_school`) should use:

- `DOCX_CONVERTER_URL=https://<your-railway-domain>`
- `DOCX_CONVERTER_API_KEY=<same-key>`

Then main app can call this converter endpoint from its own API route.
