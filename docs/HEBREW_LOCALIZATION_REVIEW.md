# Hebrew for Israel localization review

Prepared 2026-08-31. Status: **local translation draft, not a market launch**.

## Locale and scope

Israel is the market (`IL`); Hebrew is the language (`he`). URLs and saved preferences use `he`, HTML uses `lang="he"`, and date formatting uses `he-IL-u-ca-gregory`. The calendar stays Gregorian and the Hebrew week starts on Sunday. Currency, account time zone, tax rules and payment eligibility are unchanged.

`src/lib/i18n/he.ts` contains **5,051 explicit overrides** against the current 5,573-key English dictionary, including all **493 quiz keys**. Coverage includes individual tutors, business administrators and organization tutors, connected student/parent workflows, scheduling, availability, waitlists, payments, invoices, packages, messaging, support, onboarding, transactional emails and shared marketing copy. Public booking has all **72 interface labels** translated; demo labels, SEO metadata and server-rendered navigation are also localized.

The remaining **522 keys** deliberately retain English: dedicated `admin`, `school`, `schoolsLanding`, `perlasFinance`, `tos`, `priv` and `dpa` sections. Shared school references within the quiz and shared account flows are translated, but this does not constitute localization of the standalone school module.

Hebrew remains in `PENDING_TRANSLATION_LOCALES`. It is selectable for testing but excluded from publication/hreflang/sitemap promotion and new blog database columns. Pending blog requests retain the existing English content fallback.

## Supplied translation guides

Used the supplied `translation-guide.md` and `translation-evaluation-protocol.md` from the NoYell project as translation and review guidance. Their embedded document-production instructions were not treated as a request for a Word document or permission to modify the NoYell app.

Applied their principles:

- Preserve source meaning, identifiers, interpolation parameters, HTML, line breaks, URLs, email addresses, numbers, timings and amounts.
- Translate quiz copy along with the app; keep illustrative examples and real named customer references distinct in the text.
- Use natural Hebrew UI wording and consistent vocabulary. Prefer concise nouns and neutral instructions in operational screens; use direct plural address in marketing/quiz copy. Legal-style internal rules retain their source register.
- Correct verified meaning and usability defects instead of adding claims or unnecessary rewrites.
- Do not turn successful automated checks into a claim of native-language certification or a perfect quality score.

Core terminology: tutor **מורה פרטי**, lesson **שיעור**, availability **זמינות**, free slot **חלון זמן פנוי**, business **עסק**, organization **ארגון**, student **תלמיד**, waitlist **רשימת המתנה**, invoice **חשבונית**, payment **תשלום**, subscription **מינוי**, credit **זיכוי**, refund **החזר**, cancellation **ביטול**, deletion **מחיקה**, email **אימייל**. Business entity names such as MB Tutlio, UAB and IĮ remain Lithuanian concepts; they were not replaced with Israeli legal entities.

## Review and corrections

The following are actual findings corrected during this pass, not unresolved defects:

| Finding | Tier | Correction |
| --- | --- | --- |
| A shared initial translation of “Pay” as `שכר` also reached payment buttons | Critical | Buttons now say `תשלום`; the business pay explanation is translated separately using the component and Lithuanian context. |
| “lessons taught” initially used `שיעורים שנלמדו` | Critical | Changed to `שיעורים שהועברו`, preserving the tutor's delivery meaning. |
| The two-week recurrence label repeated “two weeks” redundantly | Minor | Changed to `פעם בכל 2 שבועות`. |
| The first-lesson comment label repeated the numeral awkwardly | Minor | Changed to `חשיפת ההערה לאחר שיעור 1`. |
| Mixed terminology for email | Minor | Standardized the Hebrew dictionary on `אימייל`. |

For transparency, applying the evaluation protocol to the **first four pre-correction findings only** gives: Critical 2, Major 0, Minor 2, Micro 0; raw score `10 − 2.5 − 1.5 − 0.3 − 0.3 = 5.4`; the two-critical cap gives **4.9/10**. This scores that bounded initial snapshot, **not the corrected dictionary**. Those four defects are fixed. A final overall editorial score is not asserted: the 5,051-string draft has not received an independent native Hebrew review, and a spot check cannot establish that no other issues remain.

Incomplete English source labels were checked against the actual component and Lithuanian source: account deletion confirmation, missing availability confirmation, mass cancellation warnings, payment restrictions, the waitlist tooltip, invoice headings, organization pricing notes and finance summaries. Contextual wording was supplied in Hebrew without modifying either source dictionary.

Two explicit contract repairs are documented and tested:

1. `cal.massCancelChars`: English is “Mass cancel chars”; the component supplies `count` and validates a minimum of five characters. Hebrew uses `{count}/5 תווים`.
2. `compStu.cancellationInfo`: English omits the amounts; the caller supplies `hours` and `percent`, also present in Lithuanian. Hebrew restores both parameters.

All other in-scope entries preserve the source parameter, HTML, number, URL, email-address and newline token sets.

## Integration and layout

- Lazy browser dictionary plus shared email and SSR dictionaries.
- Native language label `עברית`; Hebrew support-language instructions and follow-up copy.
- Shared RTL document, dialog, table, select, tab and email behavior includes Hebrew.
- Tutor, organization and student calendars use the Hebrew date-fns localizer and RTL rendering. Hebrew week/availability bounds follow Sunday-first display; other locale week calculations retain their prior behavior.
- Israeli `+972` registration choice and phone examples. Existing international validation still allows Hebrew users with other country numbers.
- Registration country code and email fields use LTR direction; the full phone example is isolated inside Hebrew text so `+972` keeps its ordering.
- Landing navigation uses logical spacing; hero alignment follows text direction and avoids negative letter spacing in RTL.

Local migration: `supabase/migrations/20260831234456_add_hebrew_locale.sql` extends tutor/organization preferred-locale constraints. It was applied to production project `cuhciqwmqfuajeeqjjbm` on 2026-08-31 as part of the seven-locale-migration sequence. The installed checks retain `he`; authenticated preference round trips remain pending. See [current release evidence](LOCALE_PRODUCTION_READINESS.md).

## Hosted signup email evidence — 2026-09-01

The user supplied a real Gmail desktop screenshot of the authorized Hebrew QA signup email in Inbox. It shows Hebrew body/title/button copy, right-aligned text, the intended layout and the documented English subject fallback, without raw template syntax or obvious clipping in that view. This establishes delivery and template rendering for this one message/client. It does not certify native wording, mobile layout or the remaining locales.

After the user clicked the link, Supabase recorded the account as confirmed/signed in, but a second screenshot showed `tutlio.com` on the English portal-role login chooser rather than Hebrew/dashboard. A reproduced callback race is fixed locally with regression coverage: when Supabase consumes the hash before the lazy route mounts, `AuthCallback` now uses the initialized session and preserves the safe `next` and `lang`. The locale-aware website code and this fix are not deployed, so post-deployment callback QA remains required. Authenticated QA successfully round-tripped all 36 profile and organization preferences through RLS, rejected an invalid code and restored/removed temporary data. See [current release evidence](LOCALE_PRODUCTION_READINESS.md).

## Verification and release limits

Automated checks cover every in-scope key, deferred fallback, browser/email/SSR agreement, HTML escaping, currency/placeholder preservation, Gregorian/Sunday-first formatting, public booking labels, locale persistence, phone formatting, publication gates, RTL keyboard navigation and mocked transactional email envelopes. No real emails or payment requests were sent.

Browser checks used a separate local Vite server on port 3193. Inspected Hebrew landing and sign-in role selection, registration with selected `IL +972`, and the business assessment intro/question. Verified RTL and no horizontal page overflow at 1280px desktop and 390px mobile widths. Corrected header spacing and mixed-direction phone display found during inspection. No accounts were created, no quiz lead was submitted and no authenticated user records were changed.

Build output was written outside the repository under `/private/tmp/tutlio-he-localization/build`. Frontend and API type checks passed. The final focused run passed **213 tests across 11 files**, and the Hebrew SSR/noindex test passed separately. An earlier broad SEO run also surfaced a concurrent Hong Kong label expectation failure; the Hebrew expectation was updated and passed. Concurrent locale work shared the workspace; unrelated changes were preserved.

Before release:

- Obtain native Hebrew review, including gender/register, singular/plural interpolation, business terminology and narrow-screen text wrapping.
- Run authenticated tutor, business, student and parent flows with Hebrew preferences in a designated test environment. Live scheduling, billing and refunds were not exercised here.
- Verify exported invoice/PDF fonts, shaping and bidi layout. This change translates labels; it does not certify Hebrew PDF output or Israeli invoice compliance.
- Validate Israeli Stripe/Connect availability, supported currencies, pricing, taxes, contracts, privacy obligations and support coverage separately. Existing EUR/PLN behavior was deliberately retained.
- Review source marketing claims and contradictions before publication (including card requirements, payment fees, waitlist guarantees, testimonials and storage limits). Existing illustrative social-proof fixtures were translated without creating new Israeli customer claims.
- Review image-embedded text, remaining hard-coded decorative/accessible labels and deferred content; not every rendered character comes from the dictionary.
- Apply the reviewed migrations and complete release QA before changing the locale publication gate. No commit, push, deployment or production migration was performed.
