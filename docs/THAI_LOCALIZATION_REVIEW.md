# Thai localization review

Reviewed 2026-08-31. Status: local translation draft for individual tutors and tutoring businesses; not a published or country-ready launch.

## Coverage

- Locale `th`, selector `TH` / `ไทย`, left-to-right layout.
- 5,051 explicit Thai dictionary overrides in `src/lib/i18n/th.ts`, including all 493 onboarding-assessment keys. Repeated English strings were reviewed in their individual UI contexts where the same wording represented different operations.
- Tutor and business scheduling, students, availability, waitlists, packages, payment interfaces, invoices, settings, related student/parent portals, email templates, support and marketing copy.
- 72 public-booking chrome strings, Thai short dates, public-page online labels, landing/pricing metadata, server navigation and localized demo family/city labels.
- Browser lazy loading, server email/SSR dictionaries and support follow-up handling include Thai.
- Thai date-fns day/month labels; Intl formatting uses `th-TH-u-ca-gregory`. Calendar years remain Gregorian, including the landing FAQ update date. This is an explicit compatibility choice, not a change to stored dates or account time zones.
- Registration defaults to Thailand `+66`, with local example `812345678`; other international numbers remain valid.

Dedicated `admin`, `school`, `schoolsLanding`, `perlasFinance`, `tos`, `priv` and `dpa` namespaces retain English. Shared company and assessment content may mention schools; that does not mean the separate school module or full legal policies have been translated. English and Lithuanian source dictionaries were not changed.

## Application of the supplied guides

Sources: `translation-guide.md` and `translation-evaluation-protocol.md`, supplied from the user's `noyellapp-main` project. Their translation-quality guidance was applied to Tutlio's dictionaries and UI. Instructions about delivering a bilingual Word document were not treated as a separate user request.

The draft prioritizes natural, concise Thai, source meaning, consistent terminology, and exact preservation of placeholders, markup, URLs, names, prices, deadlines and units. Context checks used the component/email caller and the Lithuanian source where English entries were incomplete. Corrections are listed below so they are not mistaken for literal English-source translations.

Automated checks cover every scoped key. Bilingual review focused on high-risk payment, cancellation, deletion, waitlist and unit wording, including a 72-key risk sample. This is not a complete independent native-speaker review. No whole-corpus 10/10 score or release certification is claimed. The protocol's severity distinctions guided correction priority; mechanical equality tests do not establish linguistic accuracy.

The dictionary contains 34,458 word-like segments using `Intl.Segmenter('th', { granularity: 'word' })`; Thai has no whitespace-based word-count equivalence. This count is informational, not a protocol score denominator or a claim that every sentence received independent review.

## Terminology

| Concept | Thai choice |
| --- | --- |
| Tutor / individual tutor | ติวเตอร์ / ติวเตอร์อิสระ |
| Tutoring business / organization | ธุรกิจติวเตอร์ / บริษัท / องค์กร, according to context |
| Student / parent / payer | นักเรียน / ผู้ปกครอง / ผู้ชำระเงิน |
| Lesson / trial / makeup | คาบเรียน / คาบทดลองเรียน / คาบเรียนชดเชย |
| Availability / free of charge | เวลาว่าง / ฟรี; not interchangeable |
| Waitlist | รายชื่อรอเรียน |
| Invoice | ใบแจ้งหนี้; no claim of a Thai tax invoice |
| Manual payment | การชำระเงินนอกระบบ |
| Tutor pay / commission | ค่าตอบแทนติวเตอร์ / ค่าคอมมิชชัน |
| Cancel / delete permanently | ยกเลิก / ลบอย่างถาวร, with irreversibility warning where applicable |
| Student no-show / tutor no-show | ไม่มาเรียน / ติวเตอร์ไม่มาสอน |

Brand and product names, fictional identities, URLs, email addresses, currency symbols and technical identifiers are retained. There are 48 source-identical entries consisting of intentional names, brands, numbers, parameters and example contact/technical values rather than untranslated English prose.

## Findings and corrections

| Area | Finding and disposition |
| --- | --- |
| Time units | An initial reminder draft used minutes where the source meant hours. Corrected to ชั่วโมง; a regression assertion guards this material error. |
| Tutor compensation | English `compSet.payDesc` was the stub “Pay.” The company-settings context and LT source describe company share as lesson price minus tutor pay, with per-tutor overrides; the Thai text now states that meaning. |
| Payment-reminder email | `em.payReminderDeadline` was the English stub “Price”; its actual row is the payment deadline. Thai uses กำหนดชำระเงิน. Before/after lesson wording and hour units are verified in mocked email output. |
| Booking restrictions | `stuSched.mustPayDesc`, `mustPayOverdue` and `mustPayQueue` now distinguish unpaid lessons, overdue invoices and the resulting booking/waitlist restriction. |
| Destructive actions | `studentSettings.confirmDeleteMsg` now carries the irreversible deletion warning from the actual flow/LT source. Cancellation wording distinguishes one lesson from future lessons in a series. |
| Incomplete source strings | Restored the intended meanings for invoice title, waitlist date/notes/help, compensation summary, company-controlled lesson prices, rescheduling notes and confirmation when a tutor has no availability. |
| Caller arguments | Six abbreviated English entries omit parameters their callers already supply. Thai restores `{count}` in `cal.massCancelChars`; `{fromDate}`, `{weekday}`, `{timeRange}` in `compSch.seriesSummaryHtml`; `{date}` in `companyWait.inQueueSince` and `studentWait.addedOn`; `{days}` in `invoice.emailNote`; and `{hours}`, `{timing}` in `em.payReminderTiming`. These are explicitly allowlisted in the structural test. |
| Phone examples | Six LT-only source phone instructions were adapted to `+66 81 234 5678`. These are the only numeric-token preservation exceptions; pricing and other quantities are unchanged. |
| Thai years | Browser inspection exposed the FAQ's direct Intl call displaying 2569. It now uses the locale format registry and displays สิงหาคม 2026; a render-level regression assertion verifies it. |
| Demo labels | Replaced hardcoded `Live` and `45 min` labels with existing translation keys for online status and minutes. The decorative `Auto` badge remains English: the existing “automatically filled” key would incorrectly imply a completed action. No source-dictionary keys were added. |
| Social proof | The standalone landing case study and testimonial blocks use fictional English fallback data. They are hidden for Thai rather than presented as translated, verified customer claims. Embedded product mockups and assessment claims still require the product review described below. |

HTML tags/attributes, URLs, emails, currency symbols/codes, line breaks, placeholders and numeric tokens pass corpus-wide preservation checks, subject only to the explicit argument/phone corrections above. Dynamic HTML interpolation remains escaped.

## Verification

- `npm run lint`: passed.
- `npm run lint:api`: passed.
- Production build into an isolated temporary directory: passed. Existing source-map/chunk-size and mixed import warnings remain; bundle optimization was outside this task.
- Eight selected suites: **222 tests passed**. They cover Thai corpus quality, mocked Thai emails, international locale registration, phone handling, support locales, SEO visibility/rendering and the language selector. Shared SEO expectations were aligned with already-present draft navigation labels for other locales; no other locale translations were changed.
- In-memory PostgreSQL-compatible PGlite check: the seven locale migrations dated 2026-08-31 apply in order; all 36 currently registered locale values and null are accepted, invalid values are rejected, and existing preferences are unchanged. Reapplying the Thai extension remains semantically safe. This does not substitute for testing against the approved staging database.
- Browser review used an isolated production-build preview, without an API server or account creation. Desktop Thai solo/business landing layouts, Gregorian FAQ date, `lang="th"`, `dir="ltr"`, noindex metadata and removal of the standalone English social-proof blocks were checked.
- At 390×844, registration displays legible Thai, selects `+66`, shows the local phone example and has no horizontal overflow. The assessment audience selection and initial individual-tutor/business steps render in Thai; selected mobile views were visually inspected. The landing viewport also reports no horizontal overflow.
- No form was submitted, no email sent, no checkout attempted and no live database preference saved. Email tests use mocked delivery.

## Persistence and publication

`supabase/migrations/20260831234518_add_thai_locale.sql` extends the existing `preferred_locale` checks on `profiles` and `organizations` without removing values introduced by preceding locale migrations. It changes no preference data, permissions, RLS, billing or currency behavior. It fails clearly if the expected existing checks are missing.

The migration was applied to production project `cuhciqwmqfuajeeqjjbm` on 2026-08-31 and both installed checks accept `th`. Authenticated save/reload QA remains pending; see [current release evidence](LOCALE_PRODUCTION_READINESS.md). The locale stays in `PENDING_TRANSLATION_LOCALES`; it is excluded from sitemap/hreflang/IndexNow publication. Blog content and slugs keep their existing English fallback; no Thai blog columns were created.

Nothing was committed, pushed or deployed as part of this task.

## Remaining release review

1. Have a Thai-speaking reviewer review the complete tutor/business journeys, terminology and long sentences in context. Authenticated calendars, real invoices/PDFs, payment configuration, parent/student notifications and production email-client typography have not been visually verified.
2. Check Thai font fallback, marks, wrapping and input behavior on real Android/iOS devices. The local desktop/mobile-width check does not cover every platform or component.
3. Review the known English surfaces: dedicated deferred namespaces, blog articles, raster calendar screenshots, the decorative `Auto` badge, preserved fictional names/contact examples, hardcoded accessibility labels such as “Select language” and “Country code,” and provider-hosted Stripe/auth screens.
4. Resolve source-product inconsistencies before marketing publication: pricing mentions a 3.5% + €0.25 student fee while a payment FAQ says no additional platform fees; some trial copy says no card while subscription onboarding requires card details; storage copy says no per-file limit while upload interfaces use 10 MB limits. Translations preserve the relevant source statements; no new commercial policy was invented.
5. Confirm assessment guarantees, numerical claims, embedded ratings and testimonials with the product owner. Preserved source claims, GDPR wording and translated marketing text are not legal or factual certification.
6. Separately validate Thailand payment/Connect eligibility, currencies/THB, tax invoices, legal terms, support capability and any Bangkok time-zone defaults. This work adds Thai language availability, not country-specific financial or regulatory support.

The existing published-language FAQ still lists the 13 published languages. Thai is a draft and has not been added to that publication claim.
