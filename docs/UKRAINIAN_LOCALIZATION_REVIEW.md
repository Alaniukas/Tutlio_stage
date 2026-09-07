# Ukrainian localization review

Date: 2026-08-31. Language: Ukrainian. Selector label: **UA**. App/URL locale: **`uk`**. Formatting: **`uk-UA`**, left to right, Gregorian dates.

**Verdict: additional proofreading recommended; local draft, not a commercial launch.** No commit, deployment, customer email or live database migration was performed. Ukrainian remains pending/noindex and excluded from published hreflang, sitemap and blog-column sets.

## Scope and coverage

| Area | Coverage |
| --- | --- |
| Explicit dictionary entries | 5,051 of 5,573 English keys |
| Agreed tutor/business dictionary scope | 100% |
| Ukrainian dictionary words | 24,973 |
| Corresponding English words | 25,736 |
| Public booking labels | 72; 228 words |
| Public-page editor labels | 66; 215 words |
| Deliberately deferred dictionary entries | 522 |

Word counts split string values on whitespace, count repeated values at each key, and exclude code, keys, comments and English fallback. They describe corpus size and do not scale scoring deductions.

The draft includes individual tutors and tutoring businesses: registration, onboarding, calendars, availability, students, tutor management, lesson settings, attendance, packages, payments, invoices, subscriptions, messages and support. It also covers related student/parent accounts, transactional email dictionaries, marketing pages and all 493 onboarding-assessment keys, including the assessment's shared school branch.

Additional Ukrainian copy covers public booking, its dates and online-format label, the public-page editor, landing/pricing metadata, SSR navigation and public-page labels, support follow-up and existing fictional landing-demo labels. Names, contact identities, URLs and figures in examples remain unchanged. User-written biographies, subjects, reviews, images and blog articles are not automatically translated. Existing disabled placeholder social proof was not enabled or localized.

The separate `admin`, `school`, `schoolsLanding`, `perlasFinance`, `tos`, `priv` and `dpa` namespaces retain English fallback. The platform admin route retains its existing language behavior. Shared school references and the organization-tutor rules were translated faithfully; this does not localize the dedicated school module or adapt policies, invoices or contracts to Ukrainian law.

## Use of the supplied guides

Applied `translation-guide.md` and `translation-evaluation-protocol.md` from `/Users/simonasbukys/Desktop/PMC Baltic Apps/noyellapp-main/` to translation, issue classification, corrections and final checks. Their references to another app and a two-column Word document were treated as document-workflow context, not as instructions to change that app or create an additional deliverable. The requested artifact is the platform localization.

English is the primary source. Where English contains damaged labels or fragments, existing Lithuanian text and actual callers establish the intended meaning. Both English and Lithuanian source files remained byte-for-byte unchanged. This is an AI-authored translation and author review, not independent native-speaker certification.

Terminology: `репетитор` (tutor), `учень` (student), `платник` (payer), `заняття` (scheduled lesson), `вільний час` (availability), `безкоштовне` (no charge), `список очікування` (waitlist), `рахунок` (invoice), and `винагорода репетитора` (tutor pay). User-facing instructions use polite, direct `ви`. Brand names, legal entity abbreviations and URLs are preserved.

## Review and corrections

Seventy-three dictionary entries changed after the first complete draft. The review concentrated on payment obligations, before/after deadlines, cancellation/refund conditions, irreversible actions, tutor pay, invitations and incomplete source labels. It also corrected booking requests that must not imply an already confirmed lesson.

Meaningful corrections include:

- `status.complimentary`: changed `Вільно` (available) to `Безкоштовне` (no charge).
- `findLesson.reserveTrial`: explicitly sends a payment **link**, not money.
- `compSet.payDesc`: restored the business's retained amount as lesson price minus tutor pay; payment buttons with the same English source stay short.
- `stuSched.mustPay*`: restored the restrictions on booking and joining the waitlist until overdue amounts are paid.
- `studentSettings.confirmDeleteMsg`: restored irreversible account deletion, rather than merely asking to confirm an unspecified deletion.
- `em.payReminderBodyOther` and `em.payReminderBodySelf`: completed the unpaid-lesson sentences. `em.payReminderDeadline` now labels the deadline rather than another price.
- `dash.invoice` and `invoice.invoiceTitle`: replaced displayed date-format stubs with `Рахунок`.
- Restored contextual instructions for trial offers, package emails, availability, invitations and organization settings.
- Public-page slug guidance specifies lowercase Latin letters, matching the existing API validator; the allowed characters and length were not changed.

### Reproducible scoring sample

The following protocol score applies **only to three issue-selected strings**, not to the entire dictionary. Initial target word count: 5. Corrected target word count: 15. Selection is intentionally focused on defects and cannot estimate whole-corpus error density.

ISSUES FOUND:

| Tier | Key and initial wording | Evidence and correction |
| --- | --- | --- |
| Critical | `status.complimentary`: `Вільно` | English `Free` and Lithuanian `Nemokama` describe price, not available time. Corrected to `Безкоштовне`. |
| Critical | `em.payReminderTiming`: `Термін оплати` | The email caller supplies hours and before/after timing, but the fragment discards both. Corrected to `{hours} год {timing}`. |
| Critical | `studentSettings.confirmDeleteMsg`: `Підтвердіть видалення` | The Lithuanian source and account-deletion screen require the irreversible-action warning. Corrected to `Ви впевнені, що хочете видалити обліковий запис? Цю дію неможливо скасувати.` |

TALLY: Critical 3; Major 0; Minor 0; Micro 0.

RAW SCORE: `10 − 2.5 − 1.5 − 1.5 = 4.5`.

CAPS APPLIED: Any critical caps at 6.9; two or more critical errors cap at 4.9. The raw score is lower.

FINAL INITIAL SCORE: **4.5/10 for this sample**. These are separate meaning failures, not optional synonym choices, and each is counted once.

After correction, targeted rereading and interpolation checks found no remaining flagged issues in these three strings: the mechanical sample score is **10.0/10** (raw 10.0, no cap). This is **not an overall translation score**, a claim that a native editor would change nothing in the full corpus, or production certification. A complete independent native-language evaluation has not been performed, so no global score is asserted.

Optional choices intentionally preserved include the established terminology above and protected product/legal names. Natural sentences were not rewritten just to prefer a synonym. Existing marketing assertions were not strengthened or independently certified.

### Documented source exceptions

All original interpolation arguments, HTML tags/attributes, URLs, email addresses, line breaks and currency markers are preserved. Additional arguments are permitted only for these existing callers:

| Key | Restored arguments |
| --- | --- |
| `cal.massCancelChars` | `{count}`; existing five-character minimum written as a word |
| `compSch.seriesSummaryHtml` | `{fromDate}`, `{weekday}`, `{timeRange}` |
| `compStu.cancellationInfo` | `{hours}`, `{percent}` |
| `companyWait.inQueueSince` | `{date}` |
| `studentWait.addedOn` | `{date}` |
| `invoice.emailNote` | `{days}` |
| `em.payReminderTiming` | `{hours}`, `{timing}` |

The six numeric-copy exceptions are `onboard.parentPhoneFormat`, `onboard.phoneFormatError`, `register.phoneError`, `register.phoneHint`, `settings.phoneFormat` and `stu.phoneFormat`. Their Lithuania-only instructions now request international numbers with `+380 67 123 4567` as an example. The international validator is unchanged; Ukrainian is not restricted to Ukrainian telephone numbers.

## Integration and persistence

- Registered `uk` in locale metadata, browser lazy loading, email/server dictionaries, SSR dictionaries, support language configuration and native date-fns formatting.
- The selector displays `UA`; URL paths use `/uk`, `/uk/login`, `/uk/company/login`, etc. `UA` is a country label, not the language code. Existing `.pl` Polish-only behavior is unchanged.
- Registration offers Ukraine's `+380` code and selects it for Ukrainian. International phone validation and Lithuanian-specific rules remain unchanged.
- A Ukrainian guard prevents existing English platform-copy substitutions from replacing Ukrainian tutor/business labels.
- Public booking dates use `uk-UA`; this does not change stored dates or account time zones.

The local migration `supabase/migrations/20260831234502_add_ukrainian_locale.sql` extends the preceding Hebrew migration's preference checks to 33 allowed values, including `uk`, on `profiles` and `organizations`. NULL remains accepted. It changes no records, RLS policies, currencies or payment rules. Later locale migrations exist in the shared workspace; chronological application was checked to preserve Ukrainian. The full migration sequence was applied to production project `cuhciqwmqfuajeeqjjbm` on 2026-08-31 and both installed checks accept `uk`. Authenticated save/reload QA remains pending; see [current release evidence](LOCALE_PRODUCTION_READINESS.md).

## Verification and limits

- **235 tests passed across eight files** covering Ukrainian dictionary quality, both payment-reminder timing variants, shared locale URL/storage behavior, SEO visibility, support locales, phone validation and assessment-lead validation.
- A separate Ukrainian SSR test passed: Ukrainian language/direction, translated content and navigation, canonical URL, and pending/noindex behavior.
- All 5,051 overrides passed structural checks, including numeric/currency fidelity and the documented parameter/phone exceptions. All 72 public booking and 66 editor copy keys match their existing copy schemas.
- Native Ukrainian date formatting/parsing round trips passed across all twelve months. Email tests verify escaped names, payment links, amounts and deadlines, and assert that no email is sent.
- Final frontend and API TypeScript checks passed. An intermediate run encountered a concurrent Slovak date-locale error; it was resolved by the ongoing workspace work, without changes to that file in this task.
- The production Vite/PWA build passed with output in `/private/tmp/tutlio-uk-build`, leaving the project's `dist` untouched. Existing chunk-size and mixed-import warnings are outside this work.
- An isolated in-memory PostgreSQL-compatible check rejected `uk` before the migration, accepted it afterward alongside all prior values and NULL, rejected an invalid locale, and retained `uk` after subsequent locale migrations. No remote database was used.
- English/Lithuanian source hashes and whitespace checks passed.

The initial broader SSR suite had transient Croatian/Slovak expectations still assuming English school-navigation labels during concurrent work. The final full selected suite passed after that ongoing work updated them. No other locale implementation was changed in this task.

**Visual QA is not verified:** the sandbox rejected the separate local preview server with `listen EPERM`. No existing server was replaced. Authenticated tutor/business journeys, live email delivery, payment-provider onboarding and native-language mobile/calendar layouts are not claimed as tested.

## Release review still required

Have a Ukrainian-speaking tutor/business operator review the rendered flows, especially longer calendar/dialog labels, dynamic count/name agreement, financial terminology and complete recipient-language behavior. These are concrete risks in a large inflected-language dictionary that structural tests cannot resolve.

The source has product-copy inconsistencies that were not silently rewritten: card-required versus no-card trial claims; payment-fee statements; file-limit claims versus actual limits; and calendar sync descriptions in organization rules versus calendar UI. Verify the applicable claims before publishing this locale. Existing numeric claims, testimonials, currencies and legal/business references remain source content, not evidence of Ukrainian market readiness.

This work does not enable Ukrainian payment-provider onboarding/payouts, UAH pricing, Ukrainian tax/invoice compliance, local legal policies, Kyiv-specific time-zone behavior, school integrations or Ukrainian-speaking support staff. Keep `uk` unpublished until linguistic, operational and marketing/SEO requirements are approved.
