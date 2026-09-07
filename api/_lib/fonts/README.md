# Invoice PDF fonts (Noto Sans)

Used by `api/_lib/invoicePdf.ts` for Lithuanian diacritics in S.F. PDFs.

- `NotoSans-Regular.ttf`
- `NotoSans-Bold.ttf`

Source: [Google Noto Sans](https://github.com/googlefonts/noto-fonts) (SIL Open Font License 1.1).

**Deploy:** these files must be in git. `vercel.json` `includeFiles` copies them into the invoice serverless functions; runtime resolves via `process.cwd()/api/_lib/fonts/`.
