# Supabase Auth email templates

Production project: `cuhciqwmqfuajeeqjjbm`. The confirmation and recovery pairs below were installed and verified in the dashboard on 2026-08-31. This does not publish new website locales or deploy the prepared app/API changes.

| Template | Subject | Body |
| --- | --- | --- |
| Confirm signup | `confirm-signup.multilocale.subject.txt` | `confirm-signup.multilocale.html` |
| Reset password | `reset-password.multilocale.subject.txt` | `reset-password.multilocale.html` |

## Language and safety

- Body copy, button/title, HTML language and direction cover all 36 registered locales. Arabic/Hebrew use RTL. Missing `user_metadata.locale` retains Lithuanian; unknown values fall back to English.
- Hosted subject source has a **255-character limit**, including Go expressions. Subjects use Lithuanian for `lt`/missing metadata, Polish for `pl`, and English otherwise. Full native subjects for every locale require a separate email-sending implementation. Never interpolate an arbitrary user-supplied subject.
- The HTML source limit is **50,000 characters**. One shared layout keeps the generated bodies below 19 KB. Generation also checks the same UTF-8 byte budgets.
- The only action URL is Supabase's `{{ .ConfirmationURL }}`. No name, arbitrary HTML or other user metadata is interpolated into the body.

## Generation

Edit `src/lib/i18n/authEmailCopy.ts` and, for layout/branch changes, `api/_lib/authEmailTemplates.ts`. Do not hand-edit generated files.

```sh
npm run locales:auth-templates
npm run locales:auth-templates -- --check
```

The legacy single-language PL files are not the installed multi-locale templates.

## Application integration

The prepared signup code supplies the selected, validated locale through `options.data.locale`. Password recovery uses `/api/request-password-reset`, which updates locale metadata before sending and stops on update failure. Callback URLs carry `lang`; the callback preserves it on a fresh device. The `.pl` market remains Polish-only. These app/API changes still need an approved deployment.

## Hosted configuration and verification

The inspected production Site URL is `https://tutlio.lt`. The existing redirect allowlist has `/login` and `/**` entries for apex and `www` on `.lt`, `.pl` and `.com`. Custom SMTP is enabled. Neither URL settings nor SMTP settings were changed. No localhost or preview origin is currently allowlisted. `redirect-urls.txt` is an old reference list, not permission to overwrite the hosted configuration.

Before another installation, back up the actual hosted subject/body pairs and URL configuration. The verified pre-installation copies from this pass are in git-ignored `tmp/locale-production-backup-20260831/`; restore both subject and body together if needed. Do not push `supabase/config.toml` to production: its localhost/default settings are for local development.

Reopen each saved template and compare the complete HTML and subject. The dashboard preview does not execute Go conditionals; seeing branches in that preview is not a delivery test. Real signup/recovery emails, clean-browser callbacks, expired/reused links, mobile email clients and native language review still need controlled QA with explicit sending authorization.

See [production readiness](../../docs/LOCALE_PRODUCTION_READINESS.md), [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates), and [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).
