# Hong Kong localization review

Date: 2026-08-31. Status: **local draft, unpublished; native Hong Kong review required before release**.

App and URL locale: `zh-hk`. BCP 47 formatting tag: `zh-HK`. Native name: **繁體中文（香港）**. Direction: left to right. Calendar: Gregorian.

No commit, deployment, customer email or live database migration was performed.

## Scope and integration

The draft contains **5,051 explicit translations** out of 5,573 English dictionary keys, including all **493 assessment/quiz keys**. This is complete key coverage for the selected tutor/business scope, not a claim that every screen or service is ready for a Hong Kong launch.

Included: individual tutors, tutoring businesses, connected student and parent flows, scheduling, availability, attendance, tutor remuneration, packages, invoices, payments, subscription UI, messaging, support, transactional email dictionaries, marketing and assessment copy. Shared school references in the assessment are translated; the dedicated school product is not.

Another **72 public booking interface labels** are translated, alongside landing/pricing metadata, demo labels and personas, existing social-proof copy, support follow-up and shared SSR navigation. Names, organizations, contact identities and statistics in existing examples were preserved. No Hong Kong customer endorsement was invented.

The locale is registered in the frontend lazy loader, email and SSR dictionaries, support-language registry and date-fns mapping. Registration offers and defaults to **HK +852**, with `61234567` as the local example. Existing international phone validation is reused; Lithuania-specific validation is unchanged. Locale selection does not change account time zones, Stripe eligibility, settlement currencies or prices.

The **522 deferred keys** in `admin`, `school`, `schoolsLanding`, `perlasFinance`, `tos`, `priv` and `dpa` retain English fallback. Existing platform-specific forced-language behavior is unchanged. User-written profiles, reviews, subject names, articles and image text are not automatically translated.

`zh-hk` stays in `PENDING_TRANSLATION_LOCALES`: noindex, excluded from published sitemap/hreflang/blog fields. The existing published-language count in marketing copy is retained.

## Applying the supplied guides

Used the supplied `translation-guide.md` and `translation-evaluation-protocol.md` from the Noyell project as translation and review guidance. Instructions in those documents concerning a different app, Word documents or document-column layouts were not treated as additional user requests or permission to modify that project.

English is the primary source. Where source strings were abbreviated or damaged, the Lithuanian source and actual component/email callers were checked. This task did not edit the base English or Lithuanian dictionaries.

| Concept | Hong Kong wording |
| --- | --- |
| Tutor / student / parent / payer | 導師 / 學生 / 家長 / 付款人 |
| Tutoring business | 補習機構 |
| Lesson / subject | 課堂 / 科目 |
| Lesson package | 課堂套票 |
| Waitlist / availability | 候補名單 / 可預約時段 |
| Invoice / remuneration | 發票 / 導師薪酬 |
| Late cancellation fee | 逾時取消費 |
| Email / privacy / upload / file | 電郵 / 私隱 / 上載 / 檔案 |

Written Traditional Chinese uses direct, professional wording. Availability is distinguished from a free-of-charge lesson. Cancel, delete, remove, archive and annul remain distinct. Invoice terminology does not assert Hong Kong tax compliance. Existing organization rules and GDPR references are translated faithfully, not adapted to Hong Kong law.

### Corrections and issue ledger

| Finding | Correction |
| --- | --- |
| Simplified characters in two draft frequency/schedule strings | `频率` and `时间表` were corrected to `頻率` and `時間表`. |
| A generic “Pay” source used as an explanation of company earnings | `compSet.payDesc` now explains lesson price minus tutor remuneration, based on the Lithuanian source. Other Pay buttons remain short actions. |
| Date-format stubs used as invoice headings | `dash.invoice` and `invoice.invoiceTitle` now say `發票`. |
| Payment reminder’s deadline row labeled “Price” in both sources | Caller context confirms that the row contains timing, so `em.payReminderDeadline` now says `付款期限`. |
| Incomplete destructive and booking-restriction messages | Restored irreversible deletion and unpaid-booking restrictions using the fuller source and callers. |
| Brief headings reused as explanatory descriptions | Restored separate scope-specific descriptions for recurring changes, cancellation fees, template assignment, trials, invitations and package email delivery. |
| Lithuania-only telephone messages | Six messages now describe international numbers using +852 examples, without restricting users to Hong Kong numbers. |

Seven keys restore parameters already passed by their callers:

- `cal.massCancelChars`: `{count}`.
- `compSch.seriesSummaryHtml`: `{fromDate}`, `{weekday}`, `{timeRange}`.
- `companyWait.inQueueSince` and `studentWait.addedOn`: `{date}`.
- `compStu.cancellationInfo`: `{hours}`, `{percent}`.
- `invoice.emailNote`: `{days}`.
- `em.payReminderTiming`: `{timing}`, `{hours}`.

All other interpolation parameters, HTML tags/attributes, URLs, email addresses, currency symbols/codes and line breaks are preserved. Numeric exceptions are limited to the six documented phone corrections and five linguistic cases: “1st” → 首堂, “2-way” → 雙向, “B2B” → 企業客戶, and named February/March dates rendered with numeric Chinese months. Prices, limits and commercial claims are unchanged.

### Protocol evaluation boundary

A reproducible two-string author-review sample covers:

- `dynamicPricing.studentFrequency`: initial `約定频率：每週 {frequency} 次。`; final `約定頻率：每週 {frequency} 次。`.
- `dynamicPricing.frequencyAuto`: initial `自動－按重複时间表`; final `自動－按重複時間表`.

ISSUES FOUND: Minor, one shared root cause—mixed Simplified/Traditional characters. TALLY: Critical 0, Major 0, Minor 1, Micro 0. RAW SCORE: `10 − 0.3 = 9.7`. CAP: 9.7. Initial sample score: **9.7/10**. The corrected two-string sample has no remaining identified error, so its author-review score is **10/10**.

These scores apply only to those two fully compared strings. They are not an estimate of corpus quality, not native-speaker certification and not a launch approval. No overall 1–10 score is claimed for the full corpus. Automated coverage and token checks are not substitutes for the guide’s full native-language evaluation; deductions must not be normalized by corpus size.

## Verification

- Focused regression suite: **243 tests passed across 10 files**, covering dictionary coverage/fallback, interpolation and markup, numeric/currency fidelity, frontend/email/SSR consistency, phone handling, date-fns formatting/parsing, support, metadata, assessment flow and email escaping.
- Hong Kong payment reminder dry runs cover both before-lesson and after-lesson deadlines, parent/student phrasing, preserved links and HTML escaping. Email delivery and push are mocked; nothing is sent.
- Production Vite build and API TypeScript check pass.
- Browser review: desktop landing page, registration and initial tutor assessment transition/question render in Traditional Chinese. The landing page has `lang="zh-HK"`, `dir="ltr"`, `noindex`, and no horizontal overflow at the default 1280px viewport. Registration visibly selects HK +852.
- `git diff --check` passes.

The broader workspace frontend type check is blocked by an unrelated duplicated Ukrainian `+380` object key in Register. The all-locale SEO test also has an outdated allowlist for other concurrently added locales; `zh-HK` is included. These unrelated edits were left untouched.

## Preference migration and release gates

Local migration: `supabase/migrations/20260831234508_add_hong_kong_locale.sql`, created using the [Supabase migration CLI](https://supabase.com/docs/reference/cli/supabase-migration-new).

It reads the existing `preferred_locale` check expressions on `profiles` and `organizations`, then adds `OR preferred_locale = 'zh-hk'` within a transaction. This preserves existing locale and NULL acceptance, including additions from parallel work. A missing expected check fails closed. No records or RLS policies change.

The full migration sequence was applied to production project `cuhciqwmqfuajeeqjjbm` on 2026-08-31 and both installed checks accept `zh-hk`. Local filenames now match the recorded migration versions. See [current release evidence](LOCALE_PRODUCTION_READINESS.md).

Before publication:

1. Complete native Hong Kong proofreading, especially payments, destructive actions, tutor compensation and assessment consent.
2. Test actual save/reload behavior for authorized tutor and business QA accounts; production constraint acceptance is now verified.
3. Run authenticated end-to-end flows for tutor/business/student/parent accounts, real email-client rendering, mobile layouts and public booking. This task did not create accounts, make payments or send invitations.
4. Review existing source claims: inconsistent fee descriptions, trial/card requirements, money-back language, illustrative testimonials and savings percentages were not independently substantiated or redefined by translation.
5. Review HK payment eligibility, currencies, local business forms, invoicing, tax/legal documents, support capacity and account time zones separately.
6. Replace/localize remaining pre-existing hardcoded mockup text such as “Auto”, “Live”, “45 min”, country-code/language-switcher accessibility labels and source-language screenshots where required.
7. Finish publication/SEO/blog release review before promoting the locale.
