# Locale production release checklist

> **Update 2026-09-05.** All 23 newer locales are now published to search on the marketing, schools and public-page surfaces (`SEO_LOCALES_BY_SURFACE` in `src/lib/i18n/localeRelease.ts`). The decision was based on `scripts/seo-locale-readiness.ts`: every one of them renders fully localized titles, descriptions, H1s and copy on all 12 marketing pages and both schools pages, with no dictionary-key leaks. Legal pages and the blog stay on the legacy 13 because they still serve English text or have no database columns. `tests/api/seo-locale-parity.test.ts` and the per-locale block in `scripts/seo-smoke.mjs` hold the new locales to the English contract. Locales whose market has no supported local currency (`USD_LOCALES` in `src/lib/localeCurrency.ts`) see and pay subscription prices in USD; euro-area newcomers stay on EUR. The sections below describe the earlier gated state.

Updated 2026-09-01. The production preference migrations and hosted signup/recovery templates are installed on `cuhciqwmqfuajeeqjjbm`. Authorized delivery and authenticated preference smoke tests have run; they exposed a production callback race that is fixed and regression-tested locally. The prepared release candidate now exposes all 36 locales in production UI selectors on `.lt` and `.com`; `.pl` remains the existing Polish-only market. Search publication and the deployed website remain unchanged. Historical verification sections below describe earlier preparation passes; the installation and smoke-test sections record the current state.

## Current release boundary

The registry contains 36 locales. `UI_RELEASED_LOCALES` now contains all 36, so the next website deployment will show every registered locale in the public language selector and organization language settings on `.lt` and `.com`. The current deployed website still shows the previous 13 until this code is deployed. The `.pl` domain remains Polish-only by its existing market rule.

The 23 additions are `it pt ro cs el hu bg hr sk sl hi ko ja id ar pt-br es-mx fil he uk zh-hk tr th`. They have tutor/business translation drafts and will be user-selectable after deployment. They remain excluded from search publication, dedicated school/admin modules and full legal policies can still fall back to English, and native review remains required. UI availability is not a claim of country, payment, tax, legal or support eligibility.

`cs` now has a Czech tutor/business translation draft, including auth email copy. It is available in development selectors and direct review URLs, but remains excluded from production selectors and search publication. See [Czech localization review](CZECH_LOCALIZATION_REVIEW.md); native review and release gates still apply.

Drafts retain English for dedicated school/admin modules and full legal policies. Each `*_LOCALIZATION_REVIEW.md` records the translation scope and language-specific limitations. Language support does not establish country, currency, tax, payment-provider or support eligibility.

## Code prepared

The single release-control module is `src/lib/i18n/localeRelease.ts`:

| Control | What it enables | Required evidence |
| --- | --- | --- |
| `UI_RELEASED_LOCALES` | Navbar and organization-settings options in production | Preference DB checks, hosted auth templates, native review and core-flow QA |
| `SEO_LOCALES_BY_SURFACE.marketing` | Marketing sitemap entries, reciprocal hreflang and indexing | Reviewed landing, pricing, about, contact and feature pages, metadata and screenshots |
| `.schools`, `.legal`, `.publicPage` | Their respective search surfaces | Complete reviewed content for that surface; public pages also keep their existing quality gates |
| `.blog` | Blog search publication | Database columns plus reviewed post translations; intersected with `BLOG_SCHEMA_LOCALES` |
| `BLOG_SCHEMA_LOCALES` | Blog SELECT columns, slug lookups and admin editor fields | Matching `title`, `excerpt`, `content`, `slug` columns actually present in the database |
| `LOCALIZED_ASSET_LOCALES` | Locale-specific screenshots | Every referenced localized asset present |
| `PLATFORM_COPY_LOCALES` | Dedicated schools/platform overrides | Reviewed platform copy |

The arrays are independent. The UI release list contains all 36, while SEO, blog-schema, localized-asset and platform-copy lists retain their reviewed surface-specific cohorts. Releasing the UI does not index English fallback policies, add blog column queries, or request nonexistent images. `LEGACY_LOCALES` and the deprecated `TRANSLATED_LOCALES` alias remain historical baselines, not launch switches.

Account preference saves now surface returned database errors, serialize rapid changes, and discard queued changes after an account switch. A valid URL choice made before login is saved when the profile becomes available. Blocked browser storage does not prevent in-memory language selection.

Signup and password-reset requests carry the selected language in metadata and callback URLs. Callback navigation preserves that language on a fresh browser. The `.pl` market remains Polish-only. Recovery does not send if the metadata update fails. No credentials, auth tokens, or email HTML are included in locale error logs.

Auth confirmation/recovery copy is defined in `src/lib/i18n/authEmailCopy.ts`. `api/_lib/authEmailTemplates.ts` generates one shared HTML layout with 36-language body copy, Arabic/Hebrew direction and native in-body titles. Missing metadata retains the legacy Lithuanian default; unknown values fall back to English. Buttons use Supabase's `ConfirmationURL`. Other metadata is never inserted into HTML. Hosted subject source is limited to 255 characters: subjects use Lithuanian for `lt`/missing metadata, Polish for `pl`, and English otherwise. Fully localized subjects remain a separate delivery-implementation requirement.

Server-generated notifications that omit a top-level locale now use a single recipient's `profiles.preferred_locale`, then the organization default, then Lithuanian. Explicit caller locales and dedicated school templates retain their existing rules. Multi-recipient messages require an explicit shared language; unknown recipients without a profile rely on the organization/default. The student-assignment and lesson-status reminder templates now use explicit copy for all 36 locales in `api/_lib/tutorNotificationCopy.ts`, together with translated greetings, contact labels and attendance statuses. Manual-payment instructions now use the existing locale dictionary instead of selecting Lithuanian for all non-English recipients. Status and manual-payment portal links retain `lang`. Email HTML uses standard language tags (`et`, `sv`, `da` for the legacy internal codes) and Arabic/Hebrew direction. This covers these templates; it is not a claim that every operational or school email is fully localized.

Tutor subscription checkout (including legacy yearly payment) and enterprise checkout now map known UI codes through `api/_lib/stripeLocale.ts`, without changing price IDs, quantities, currencies or billing. Regional mappings include `pt-br` → `pt-BR`, `es-mx` → `es-419`, and `zh-hk` → `zh-HK`. Arabic, Hebrew, Hindi and Ukrainian use English because they are absent from [Stripe Checkout's supported locale list](https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-locale). Czech now maps to the supported `cs` Checkout presentation locale. No live Checkout session or charge was created for verification.

## Shared readiness fixes and review tools

The shared follow-up repairs six existing message contracts across all 36 dictionaries: `companyWait.inQueueSince`, `studentWait.addedOn`, `compStu.cancellationInfo`, `invoice.emailNote`, `em.payReminderTiming` and `cal.massCancelChars`. Supplied dates, cancellation hours/percentages, payment deadlines and character counts now appear instead of format masks or abbreviated labels. The organization waitlist formats its timestamp with the selected date locale. Source EN/LT entries and language-specific quality expectations were corrected together.

Browser, email and SSR interpolation now substitute source placeholders once, preserve literal dollar signs and placeholder-looking user text, and retain the existing HTML-escaping boundary. The language selector has translated accessible labels and restores focus when selecting or pressing Escape. One additional dictionary key (`common.selectLanguage`) brings the new-locale tutor/business override count from 5,051 to 5,052. Earlier individual language reviews describe their original snapshots; the shared fixes above supersede their notes about these six defective entries.

- `npm run locales:preview-emails` creates **288 synthetic previews** (eight notification/payment/invoice flows for all 36 locales). Default directory: `/tmp/tutlio-locale-email-previews`; open its `index.html` through a local static server. The script uses dummy credentials, internal dry-run rendering and disabled network access. It never loads environment files or sends email. The gallery includes a 390px preview frame for review.
- `npm run locales:audit -- docs/LOCALE_ARGUMENT_AUDIT.md` scans literal translation calls against their supplied arguments. The current [audit report](LOCALE_ARGUMENT_AUDIT.md) checks 363 distinct keys and has **zero unreviewed missing arguments** after reviewing all 61 original candidates. CI fails on new omissions. One explicit variation allows the package-success lesson noun to be embedded directly in 32 languages; count and subject are still required. Unused arguments were removed only after checking the caller, and raw backend error details are not exposed to satisfy argument parity. Dynamic keys/parameter objects and aliases are outside this static scan.
- The new runtime-contract tests check caller values in all browser/email/SSR dictionaries, including literal user text and HTML safety. Notification dry runs cover every locale, parent/student manual-payment links, contacts present/absent, counts 1/2/5, invalid counts, and no network/email/push side effects.

Native review must include the newly added notification copy. No release arrays, migrations, hosted templates, currencies or payment-provider eligibility changed in this follow-up.

## Database gate — installed, authenticated round trips passed

The initial read-only audit of production project `cuhciqwmqfuajeeqjjbm` found both preference constraints accepting only the original 13 codes. Following the user's instruction to proceed, the seven locale migrations below were applied individually on 2026-08-31. The postflight reports `ready=true` for both tables, no missing locale codes and no missing legacy blog columns. Evaluating the installed CHECK expressions against 36 supported codes, NULL and four invalid values passed all 41 cases per table without writing user records.

Recorded migration versions (local filenames were aligned with the versions assigned by Supabase so they do not appear pending again):

1. `20260831234119_add_international_locale_scaffolding.sql`
2. `20260831234451_add_filipino_locale.sql`
3. `20260831234456_add_hebrew_locale.sql`
4. `20260831234502_add_ukrainian_locale.sql`
5. `20260831234508_add_hong_kong_locale.sql`
6. `20260831234513_add_turkish_locale.sql`
7. `20260831234518_add_thai_locale.sql`

These expand `profiles.preferred_locale` and `organizations.preferred_locale` checks without rewriting user records, changing RLS, or changing payments. Each uses a three-second lock timeout and 30-second statement timeout. Existing definitions and migration history were checked first; no unrelated pending migrations or configuration were pushed. For other environments, inspect history and concurrently added locale codes before applying the chain.

Keep using `scripts/check-locale-database.sql` before and after releases. The authorized smoke test below exercised all 36 values, invalid-value rejection and restoration through normal authenticated profile and organization-admin RLS paths. These direct Auth/RLS round trips still do not replace a post-deployment browser save/reload test. Test browser-visible save failures with mocks rather than breaking production constraints.

## Hosted auth email gate — installed, authorized delivery smoke completed

Both matched pairs below were saved in the production Supabase dashboard and verified after reopening each page. Complete preview HTML matched the generated files after removing only Supabase's injected preview style block; subjects matched excluding the file's final newline. The previous three-language pairs and URL configuration are backed up in git-ignored `tmp/locale-production-backup-20260831/`. No SMTP credential, auth token or user record is in that backup.

| Auth template | Body | Subject |
| --- | --- | --- |
| Confirm signup | `supabase/email-templates/confirm-signup.multilocale.html` | `confirm-signup.multilocale.subject.txt` |
| Reset password | `supabase/email-templates/reset-password.multilocale.html` | `reset-password.multilocale.subject.txt` |

The dashboard rejected the original generated source because subjects exceeded **255 characters** and bodies exceeded **50,000 characters**. Neither rejected pair was saved. The generator now shares the HTML frame and checks the stricter equivalent UTF-8 byte budget, with regression coverage. Confirmation body/subject: **18,285 / 221 bytes**; recovery: **17,748 / 196 bytes**. All 36 bodies remain localized; subjects retain LT/PL with English fallback. Do not add arbitrary user-metadata subject interpolation to bypass the limit.

Run `npm run locales:auth-templates -- --check` before future installation. Update copy in the TypeScript source and regenerate; do not hand-edit generated HTML. CI checks generated-file drift and hosted size limits.

The production Site URL is `https://tutlio.lt`. Its 12 existing redirects include `/login` and `/**` for apex and `www` hosts of `.lt`, `.pl` and `.com`; those patterns cover the app's callback paths and queries. Custom SMTP is enabled. These settings were preserved, not broadened. No localhost or preview origin is currently allowlisted; use a separately approved QA origin/environment if needed. Lithuanian recovery and Hebrew confirmation delivery were verified through an authorized inbox. Confirmation succeeded, but the deployed callback lost its destination/language as recorded below; retest that result after the prepared website fix is deployed.

Before releasing a language, send its confirmation and recovery variants to controlled QA inboxes. Verify the documented subject fallback, native body/button copy, wrapping and direction in desktop/mobile email clients. Open each link in a clean browser and confirm the destination language. Repeat recovery on `.pl` with a different requested language to verify Polish-only behavior. Test expired, reused and malformed links. The authorized smoke below covers one Hebrew confirmation and one Lithuanian recovery in Gmail desktop; it is not the full language/client matrix. The prepared app/API changes that pass selected locale metadata and callback queries have not been deployed.

Supabase references: [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Required release QA

For each language, record reviewer, date, build URL and results in its localization review:

- Native reviewer checks terminology, grammar, onboarding quiz, validation messages and new auth email copy. Automated key/placeholder coverage is not linguistic approval.
- Desktop and 390px mobile: landing, pricing, registration, login, password recovery, quiz, tutor calendar/student management, company settings, student/parent flows and public booking. Check keyboard navigation, wrapping, dialogs, dropdown scrolling and no missing glyphs/translation keys.
- Save preference, reload, sign out/in, change account and use a clean browser. Confirm URL/query precedence and `.pl` behavior. Organization preferences must survive reload too.
- Arabic/Hebrew: all dialogs, tables, menus, date pickers and calendar navigation in RTL; mixed phone/email/number text remains readable. Hebrew weeks begin Sunday; Gregorian years remain correct for Hebrew/Thai/Arabic. Check translated weekday parsing and locale-specific phone defaults.
- Approved sandbox booking/payment flow: amounts and currencies unchanged, existing Stripe checkout available only where supported, successful/cancelled returns, invoice formatting and email links retain language. Do not perform real charges or assume locale implies a new supported market.
- Crawler requests: 200 for intended pages, self canonical, reciprocal supported `hreflang`, correct `lang`/`dir`, draft/fallback surfaces `noindex, follow`, no new blog-column errors and no missing screenshot assets. Confirm sitemap and RSS with the deployed candidate. See [Google localized versions guidance](https://developers.google.com/search/docs/specialty/international/localized-versions).

Run locally against the final combined working tree:

```sh
npm run locales:check
npm run lint
npm run lint:api
npm test
npm run build
```

`locales:check` covers dictionary quality, auth templates/callbacks, persistence, language navigation and publication boundaries. Tests use mocks; they send no real email and change no production data. A Vite preview validates browser assets, but does not execute Vercel middleware/serverless endpoints.

Verification performed on 2026-08-31:

- Automated validation: `npm test -- --maxWorkers=2` passed 1,662 tests (one skipped); `npm run locales:check -- --maxWorkers=2` passed 735 checks. Both TypeScript configurations and the final production build passed. A heavily parallel test/build run hit cold-import timeouts; the final suites ran with two workers and no timeout changes.
- Local production preview: 13 selector options; switching English → Dutch preserved `audience=agency#plans`; direct Hebrew login and recovery controls rendered in RTL at 390px with no horizontal overflow and `noindex, follow`.
- The local pricing API was unavailable in Vite preview, so pricing displayed its fallback values; this was a selector/layout check, not live pricing or checkout verification.
- Standalone recovery-email previews: Hebrew, Arabic and Japanese rendered at 390px without horizontal overflow; Hebrew received a visual screenshot inspection. These are browser previews, not email-client delivery tests.
- Read-only database preflight: both preference checks reported `ready=false`, missing all 23 new codes. All expected legacy blog columns were present.
- Native review, real confirmation/recovery delivery, authenticated preference persistence against the expanded schema, sandbox payment completion and deployed Vercel smoke tests remain release gates. The build emits large-chunk warnings; dictionary chunks remain lazy-loaded. Do not treat a passing build as a performance audit.

## Follow-up verification — 2026-08-31

- Full suite after the shared fixes: **2,002 tests passed, one skipped**. Locale suite: **1,065 checks passed**. Frontend/API type checks and the final production build passed; the existing chunk-size warnings remain. These counts are separate, overlapping suites, not additive.
- Built-site browser checks opened tutor login for **all 23 new locales** at `/[locale]/login?portal=tutor`. Every page rendered the credential controls, matching standard HTML language/direction, `noindex, follow`, and no horizontal overflow at the 1280px desktop viewport. No credentials were entered and no authentication request was submitted.
- The built production selector still offered only the original 13 languages. Switching English to Dutch preserved `audience=agency#plans`, closed the dropdown, and left keyboard focus on the now-Dutch language button. The local pricing display used its existing fallback because Vite preview does not run the API; no checkout was attempted.
- Hebrew student-assignment, Arabic lesson-status and Japanese manual-payment email examples were visually inspected in the gallery’s **390px frame**. Names and contact numbers remained readable, the Arabic status list and action rendered in RTL, and the Japanese deadline displayed its hours. This is a limited browser layout check, not native approval, complete mobile flow coverage, real email-client rendering or delivery verification.
- The synthetic preview generator completed all **108 previews** with network access disabled. At that stage, the runtime-argument audit produced **61 review candidates**. These were subsequently reviewed and repaired as described below.
- React review found no new data-fetching effects or business-state changes. New notification translations remain server-only; language dictionaries keep their existing loading strategy.

The database/auth installation gates, authenticated application flows, native terminology/grammar review, sandbox checkout completion, PDF/XLSX validation, market/legal review and approved deployment remain outstanding. Public release lists are unchanged.

## Runtime-data hardening — 2026-08-31

All 61 original audit candidates were reviewed against their UI/email callers. The statically covered calls now have zero unreviewed omissions; this is not a claim that every dynamically selected message is correct.

Final validation for this pass: **2,295 full-suite tests passed, one skipped**; **1,358 locale checks passed**. Frontend/API type checks, generated auth-template verification, the production build and `git diff --check` passed. These suites overlap and their counts must not be added. Existing bundle-size warnings remain. No test sends real email or initiates a payment.

- Restored student names/grades, selected and cancelled counts, waitlist totals, invoice recipients, package fee amounts, cancellation windows, payment and booking deadlines, and trial expiry/next-payment details across all 36 dictionaries. Weekly availability now identifies the recurring weekday. Organization-locked settings explain who manages them.
- Repaired incomplete payment-reminder sentences and parent email fragments. Reminders explicitly identify the tutor; organization warnings include the payment deadline. Missing contact details no longer produce `undefined` or broken mail links. Available contact values are isolated left-to-right, and the affected portal links retain the language.
- Email money and the affected package/subscription displays use each locale's number format. Existing EUR/PLN selection, amounts, fee calculations, price IDs and payment rules are unchanged. The package fee breakdown opens with a button, supports touch/keyboard use, closes with Escape and restores focus.
- The strict audit is included in both GitHub Actions and `locales:check`. A fixture test proves that a dropped argument or a new unsupported parameter fails the gate; the linguistic exception cannot hide an unrelated missing value. Runtime contracts exercise the actual values through browser, email and SSR translation functions. No blanket parity exceptions were added.
- Regenerated 288 synthetic email previews with all network access disabled. Visual spot checks in the gallery's 390px frame covered Hindi after-lesson payment, Arabic organization deadline warning, Hebrew invoice and Japanese package offer. The Arabic recheck confirmed native number formatting and removal of the missing-contact artifact. These are limited browser inspections, not native certification or real email-client delivery checks.

Native reviewers must review the newly restored full sentences and surrounding number/name placement as well as the original drafts. Authenticated preference persistence, hosted confirmation/recovery execution, sandbox checkout, and PDF/XLSX output remain unverified release gates. No production language, schema, hosted template or deployment was changed by this pass.

## Loading and navigation regression hardening — 2026-08-31

- Fixed stale `?lang=` values undoing a switch to a domain's default language. The selected query value changes while other parameters and fragments survive; URLs without a language query retain their original query encoding.
- Draft `noindex` handling preserves existing `nofollow`, `noarchive`, `none` and other restrictions. Cleanup does not overwrite a later page-owned metadata change. Cold draft loading/error screens also remain unindexed before the router mounts.
- The initial language now loads behind visible, localized recovery UI. A slow dictionary download no longer leaves an empty React root that the six-second stale-shell watchdog could mistake for a failed boot. The application mounts only after the first dictionary is ready.
- During subsequent changes, the current dictionary, direction and mounted form remain active until the requested language loads. Obsolete requests cannot replace a newer choice; returning to an already loaded language cancels the pending selection. Route/profile synchronization distinguishes the requested language from the currently displayed one. Existing preference-save ordering and error reporting remain intact; requesting a language still records the preference even if its download subsequently fails.
- Failed dictionary imports are caught in the main provider, static admin provider and quiz fallback. They show retry controls and an explicit page-reload option. Browsers can cache a failed module import, so retry alone is not always sufficient. Reload is user initiated; when application state may exist, the UI warns about unsaved changes and requires confirmation. Dictionary failures no longer trigger the automatic stale-shell refresh; unrelated route/script errors retain their existing recovery. The matcher is checked against the current build's locale filenames and excludes similarly named vendor assets.
- The small standalone recovery-copy module contains no full dictionary imports. Tests keep it aligned with all 36 dictionaries. Two common keys, `common.reloadPage` and `common.reloadPageWarning`, bring each new-locale override set to **5,054**; these added translations also need native review.

Regression tests first reproduced the stale-query, robots-policy, cold-load and failed-switch issues. Coverage now includes failed/retried loads, out-of-order completion, navigation cancellation, unsaved input preservation, reload cancellation, static-provider isolation, legacy quiz fallback, profile synchronization and dictionary-versus-route error handling. The new tests are included in `locales:check` and the full CI suite.

Final automated validation: **2,387 full-suite tests passed, one skipped**; **1,450 locale checks passed**. Frontend/API TypeScript checks, generated auth-template drift checks, the strict runtime-argument audit, the production build and `git diff --check` passed. The suites overlap and must not be added together. All 36 generated dictionary assets match the recovery handler's filename pattern. These checks found no regressions within their tested scope; they do not certify the untested release gates below.

Production-build browser verification:

- All **36 locale login pages** rendered email/password controls with the expected HTML language and direction, no horizontal overflow at the 1280px desktop viewport, and login indexing restrictions intact. Only empty email values were entered to wait for the controls; no credentials or authentication requests were submitted.
- The production selector still showed the original **13 options**. An English-to-Lithuanian switch produced `/pricing?lang=lt&audience=agency#plans`, retaining the audience and fragment while fixing the old query.
- A loopback-only server delayed the first Hebrew dictionary download by eight seconds, then returned an error. The page displayed Hebrew loading/error copy without reloading automatically. A separate missing-asset check confirmed that the explicit reload recovered the Hebrew login after the asset was restored. The recovery screen retained RTL and noindex.
- A deliberately missing Danish dictionary during an English pricing-page switch retained the English page, LTR direction and changed license count of seven. Returning to English cleared the error without reloading or losing the count. Pricing used the preview's fallback data; no Checkout request was made.
- Hebrew and Arabic login forms received a visual check in **390px frames**. This is limited mobile/RTL evidence, not a complete authenticated-flow audit or native-language approval.

The fault server disabled service-worker registration to isolate module-download behavior. Existing cached-PWA upgrades and full offline sessions still need deployment-candidate QA. Build warnings about large chunks remain; this pass is not a performance certification.

That loading-hardening pass changed no release arrays, production schema, hosted templates, currency rules or payment eligibility. All temporarily withheld build assets were restored. The later database/Auth installation is recorded above. Native review, authenticated preference persistence, real auth delivery, complete mobile/RTL flows, sandbox payment completion, PDF/XLSX review and approved deployment remain outstanding.

## Database/Auth installation verification — 2026-08-31

- Full suite: **2,388 tests passed, one skipped** (210 files passed, one skipped). Focused auth/migration-reference suite: **128 passed**. These suites overlap.
- Frontend/API TypeScript checks, generated-template drift checks, production build and `git diff --check` passed. Existing bundle-size warnings remain.
- Both saved hosted template pairs matched the generated files after reopening. Site URL and all 12 redirect entries were rechecked and remained unchanged. Custom SMTP was inspected as enabled; credentials were neither read nor changed.
- Both installed preference constraints are validated. Read-only evaluation passed 41 cases per constraint, including all original/new locale codes, NULL and rejection of invalid/incorrectly cased codes. The existing blog-column preflight passed.
- The seven local SQL filenames now match the actual Supabase migration versions; only those migrations were applied. Backup files include the verified previous templates, prior constraints/redirect settings, migration mapping and installed-template hashes.
- No real auth email, temporary account or authenticated preference write was used in this verification. Hosted Go execution, inbox delivery, fresh-browser callbacks and actual account persistence remain unverified. Full native subjects beyond LT/PL require a separate delivery implementation because of Supabase's subject-source limit.
- Website code and public locale flags were not deployed or enabled. The prepared app/API still needs approved deployment and subsequent end-to-end checks; the original 13 public languages remain the rollout boundary.

## Authorized hosted email smoke test — 2026-08-31 / 2026-09-01

The user authorized a personal QA inbox. A read-only lookup found an existing confirmed account, so its password, locale metadata and profile were left unchanged. Two requests were made through the public Supabase Auth SDK:

- One password-recovery request for the existing account, exercising the missing-metadata Lithuanian fallback. Supabase accepted the request and recorded `recovery_sent_at` at 23:59:20 Europe/Vilnius on 2026-08-31.
- One Hebrew signup using an isolated Gmail `+` alias delivered to the same authorized inbox. Supabase accepted it and recorded `confirmation_sent_at` at 23:59:39. At send time, the account had `locale=he`, remained unconfirmed and returned no authenticated session. No existing user/student/profile matched the alias before creation; the normal signup trigger created its separate QA profile. No organization, payment, subscription or legal-consent timestamp was supplied.

This verifies that the hosted Auth endpoints accepted both real send requests and recorded their timestamps. On 2026-09-01 the user supplied a Gmail desktop screenshot showing the Hebrew signup message in **Inbox**, from Tutlio, with the expected English subject fallback. Gmail identifies the body as Hebrew. The native heading, right-aligned body, action button and footer are visible, with no raw Go expressions or obvious clipping in the captured desktop view. This is evidence of real delivery and Hebrew template execution/rendering in Gmail, not native-language certification or a mobile/email-client matrix.

A subsequent read-only check found the QA account confirmed and signed in at 00:04:21 Europe/Vilnius on 2026-09-01. The user reported that the Lithuanian recovery email arrived and supplied a second screenshot after clicking Hebrew confirmation. It shows `tutlio.com` serving the English portal-role login chooser, not Hebrew or the requested dashboard. This establishes confirmation and callback-origin success, but the end-to-end locale/destination result failed.

The callback failure exposed a race in `AuthCallback`: the global Supabase client can initialize first, consume the implicit-flow hash and persist the session before the lazy callback route mounts. The callback then saw no hash and timed out to `/login`, ignoring the valid session and safe `next`. A regression test reproduced `/login` instead of `/dashboard`. The callback now reads the already-initialized session and applies the safe destination plus `lang`; the regression and focused auth suites pass. The screenshot also confirms the locale-aware app code is not deployed, so production still defaults `.com` to English. Deployment and post-deployment retesting remain required.

Using the confirmed isolated account, normal public Auth and RLS paths saved/read every one of the 36 locales on its profile, rejected `xx`, and restored the original NULL value. A short-lived organization and admin membership then exercised the same 36 values through normal organization-admin RLS, rejected `xx`, restored NULL, and were deleted immediately. Postflight confirmed the temporary organization/membership were gone and the profile was restored. The stale documented Demo Mokykla credential failed before reading or changing that organization; it was not used further.

These checks are not a test of every email body, mobile clients, the deployed website form or the prepared recovery API. No existing password was reset. Sending/callback/persistence evidence and the two user screenshots are kept in the ignored backup directory; the temporary account's generated password is held privately outside the repository and must never be committed or printed.

Final validation after the callback fix, before the all-locale UI release switch: **2,389 full-suite tests passed, one skipped** across 210 passed files and one skipped file; **1,452 locale checks passed**. Frontend and API TypeScript checks, generated auth-template drift checks, the production build and `git diff --check` passed. The suites overlap and must not be added. The existing build chunk-size and outdated-Browserslist warnings remain. Production confirmation must be repeated after an approved deployment.

## All-locale UI release preparation — 2026-09-01

Following the user's release instruction, `UI_RELEASED_LOCALES` now mirrors all 36 `SUPPORTED_LOCALES`. Production selectors on `.lt` and `.com` and organization language settings therefore include every registered locale in the next build. `.pl` retains its existing Polish-only market behavior. `DRAFT_UI_LOCALES` is empty. The 23 additions remain outside every SEO surface, blog schema, localized-asset cohort and dedicated platform-copy cohort, so UI release does not publish English fallback school/legal pages or query nonexistent blog columns.

The landing-page language badge and FAQ use the UI release array as their source of truth. All 36 dictionaries now interpolate the released count and an `Intl.ListFormat` list of the 36 native language names; the client FAQ, server-rendered HTML and FAQ structured data receive the same parameters. The static LLM product description no longer claims 13 languages.

Release-switch validation:

- Full suite: **2,427 tests passed, one skipped** across 210 passed files and one skipped file.
- Locale suite: **1,490 checks passed** across 66 files. It includes all 36 production selector options, all 36 rendered count/list variants and the server-rendered HTML/FAQ structured-data contract. The suites overlap and must not be added.
- Frontend and API TypeScript checks, generated auth-template drift checks, runtime-argument audit, production build and `git diff --check` passed. Existing chunk-size, mixed Excalidraw import, Tailwind sourcemap and outdated-Browserslist warnings remain.
- A fresh production-build preview showed exactly 36 language options. Selecting Hebrew navigated to `/he/pricing`, set `lang=he` and `dir=rtl`, and had no horizontal overflow at the 1280px viewport. The Hebrew landing page showed the `36`-language badge and an expanded FAQ containing the first and last released native names with no unresolved placeholders.

No commit, push or website deployment was performed. The deployed website remains on the earlier selector until an approved deployment; post-deployment smoke testing is still required.

## Enable and rollback

`UI_RELEASED_LOCALES` is prepared with all 36 registered locales. The public language count and FAQ are derived from that array, so they now report and enumerate 36 without a separate hardcoded count. Do not reduce this array during deployment. Add search surfaces separately when their content is approved; keep school/legal fallback surfaces unpublished until their content is complete.

Build and verify the candidate, then obtain explicit commit/deployment approval under `AGENTS.md`. After the approved deployment, smoke-test `.lt`, `.pl` and `.com`; check locale-save errors, dictionary-chunk failures, reset errors and 5xx responses. Never log reset tokens or sensitive account data to diagnose locale issues.

Rollback by removing the affected language from UI/SEO release arrays and deploying the reviewed rollback, or restoring the last approved deployment. Restore hosted templates from the backup if necessary. Leave expanded preference constraints in place: tightening them can reject legitimate preferences already saved by users. Browser-local choices/direct URLs may still select drafts; removing them from selectors is not a hard locale-disable switch.

Production changes in the installation pass were limited to seven preference migrations and the two hosted email body/subject pairs. The subsequent authorized smoke test sent two auth emails and created one isolated QA signup/profile. Profile/organization preference tests were reversible; the temporary organization was removed and the QA profile restored. The existing account's password, language and profile were not changed. No payment, commit, push or website deployment was performed. The current deployed selector still exposes the original 13; the prepared website candidate will expose all 36 after deployment.
