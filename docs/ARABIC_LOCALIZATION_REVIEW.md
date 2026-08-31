# Arabic localization review

Date: 2026-08-31. Locale: `ar`. Language: Modern Standard Arabic.

Status: **local tutor/business translation draft, ready for native-language and release QA**. Arabic remains unpublished for SEO purposes. This work did not deploy, commit, apply a database migration, send real emails, or process payments.

## Coverage

`src/lib/i18n/ar.ts` contains **5,051 explicit overrides** of the 5,573 English source keys. Coverage includes individual tutors and tutoring businesses, shared calendars and availability, student management, staff roles and permissions, finance, invoices, packages, messages, notifications, dictionary-based email templates, connected student/parent portals, onboarding, the product quiz, support, and marketing/feature pages.

The remaining **522 keys retain English intentionally**:

| Area | Keys | Reason |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school module |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full legal-policy bodies require separate translation and legal review |

Shared company/school components and school references within the product quiz are included through shared keys. This does not make the dedicated school product ready for Arabic markets. Internal tutor-policy copy is translated faithfully, but its operational/legal assumptions have not been adapted or certified.

Outside the dictionary, Arabic was added to all **72 public booking-page interface labels**, landing/pricing metadata, server navigation, the support follow-up question, and marketing demo labels. Existing demo identities, prices, contacts, numerical claims, and placeholder social-proof flags were preserved. User-written biographies, subject names, reviews, chat messages, and stored content are not automatically translated.

## Supplied translation guides

The supplied `translation-guide.md` and `translation-evaluation-protocol.md` were read and used for fidelity, terminology, structural preservation, and defect review. Their embedded other-app and Word-deliverable tasks were not treated as additional user requests.

The English and Lithuanian dictionaries remain unchanged. Every in-scope Arabic entry preserves the English key, interpolation parameters, HTML tags and attributes, numbers, URLs, email addresses, and line breaks. Proper names, identifiers, date-format tokens where still required by the source contract, and parameter-only values can deliberately remain identical to English.

Arabic uses professional, direct Modern Standard Arabic rather than a country-specific dialect. It does not assume that every Arabic-speaking user lives in Saudi Arabia or the UAE.

| Concept | Arabic |
| --- | --- |
| Tutor | المدرّس |
| Tutoring business / organization | مؤسسة الدروس الخصوصية / المؤسسة |
| Lesson / subject / topic | درس / مادة / موضوع |
| Availability / time slot | الأوقات المتاحة / فترة |
| Waitlist | قائمة الانتظار |
| Parent or guardian / payer | ولي الأمر أو الوصي / الدافع |
| Package / invoice | باقة / فاتورة |
| Cancel / delete / refund | إلغاء / حذف / استرداد المبلغ |

Review distinguished meaning defects from grammatical corrections and optional style. Identical English values were initially grouped for consistency, then reviewed by key where Arabic agreement or UI context differed.

Examples corrected during review:

- Invoice agreement: `invoices.statusPaid` uses `مدفوعة`; cancellation uses `ملغاة`.
- Recurring cancellation explains that it affects the same lesson series. Bulk-cancellation copy explains notifications and its bypass of ordinary cancellation-time restrictions.
- `studentSettings.confirmDeleteMsg` explicitly warns that deleting the account cannot be undone.
- `compSet.payDesc` and tutor-pay hints explain the difference between lesson price, tutor earnings, and the organization's share.
- Manual-payment hints distinguish off-platform instructions from Stripe payment links.
- Incomplete payment-reminder sentences now explain that the lesson has not been paid for.
- `studentWait.tooltip` and `stuSched.mustPayDesc` explain queue behavior and the restriction on new bookings while payment is outstanding.
- `dash.invoice`, `invoice.invoiceTitle`, and `compSch.seriesSummaryHtml` were source-format tokens used by callers as labels. Arabic uses the appropriate invoice label or recurring-series explanation.

Where English contained abbreviated implementation labels, existing Lithuanian copy and callers supplied context. The English placeholder and numeric contracts were not silently expanded; gaps requiring shared source changes are listed below.

**No final native-language score is certified.** These are an author review and technical checks, not an independent native-speaker assessment of every rendered flow. Passing integrity tests does not imply a 10/10 translation. For release evaluation, use the supplied protocol: list genuine remaining defects, classify critical/major/minor/micro severity, compute its deductions from 10 (floor 1), and apply the relevant severity cap. Report issue counts, raw score, cap, and final score together. Word counts or stylistic preferences must not be used as deductions.

## RTL and dates

- The existing document `lang="ar"` / `dir="rtl"` handling is retained.
- Tutor, business, and student calendars now receive RTL mode and an Arabic date-fns localizer. Existing non-Arabic calendar behavior is preserved.
- Shared Radix selects and tabs receive the current locale's direction, including portal content and keyboard navigation; explicit `dir` overrides still work.
- Select indicators/padding, dialog headings, table headings, and login text alignment use logical direction. Login back arrows mirror for RTL.
- Standard transactional-email, tutor-invitation, and enterprise-welcome wrappers set direction on both HTML and body.
- Intl formatting uses `ar-SA-u-ca-gregory` to explicitly keep displayed lesson dates Gregorian across runtimes. This does not change time zones, stored dates, currency, or the user's country. HTML language remains `ar`; Open Graph locale remains `ar_SA`.

This is foundational RTL support, not certification of every authenticated screen, drag interaction, third-party widget, PDF, or mail client.

## Verification

- **272 tests passed across 14 files** in the final run, covering Arabic key/integrity checks, browser/email/SSR dictionaries, HTML escaping, public booking labels, dates, RTL select direction and tab keyboard navigation, mock email rendering, existing international-locale behavior, Italian regression coverage, SEO visibility, authentication locale handling, support, and quiz logic.
- Payment-reminder dry-run output and standalone welcome/invitation tests use fake recipients and a mocked email provider. No messages were sent.
- `npm run lint`, `npm run lint:api`, production build, and `git diff --check` passed. Build output was placed under `/private/tmp` to avoid replacing the main task's build. Existing source-map, large-chunk and mixed-import warnings remain.
- Local browser checks confirmed the Arabic landing page, both tutor/business audience choices, tutor role selection and login form. Screenshots were inspected at 1280px desktop and 390px mobile widths. The checked screens did not overflow horizontally. No account was signed into or created.

## Release work still required

1. **Native review and authenticated QA.** Review all workflows with Arabic-speaking tutors and business administrators, especially cancellations, payment timing, invoices, permission labels, mixed Arabic/Latin values, grammatical number and gender, keyboard navigation, mobile layouts, calendar dragging, and overlays.
2. **Shared source defects.** `companyWait.inQueueSince` and `studentWait.addedOn` still contain date-format tokens even though callers supply dates as interpolation data. `compStu.cancellationInfo` lacks the English `{hours}` and `{percent}` parameters present in Lithuanian; `invoice.emailNote` lacks `{days}`. Repair source contracts and all translations together. Some fuller Lithuanian hints contain limits absent from English, such as the bulk-cancellation 90-day limit and reminder-disable value; Arabic does not invent those English numbers.
3. **Hard-coded text and assets.** Examples outside this dictionary pass include the language selector's English accessibility label, artwork alt text, demo `Auto` / `Live` / `min` labels, and a hard-coded tutor-status reminder inside `api/send-email.ts`. Product screenshots, PDFs, spreadsheets, external widgets, full public-profile content, and delivered email layouts need their own audit. Public-profile slugs still use the existing Latin-only contract.
4. **Market setup and legal review.** No local currency, pricing, VAT/invoice compliance, Stripe Connect eligibility, local payment method, country-specific phone default, or legal adaptation was introduced. Lithuanian legal entities and banking/contact details in source text remain unchanged. Arabic language availability is not country-market readiness.
5. **Marketing facts.** Existing trial, card-requirement, language-count, fee, savings, and testimonial claims were translated rather than reconciled. Review them before publication, including source inconsistencies between fee/trial messages. Do not present illustrative social proof as verified Arabic-market customers.
6. **Persistence and publication.** The shared locale-preference migrations were applied to production on 2026-08-31; see [current release evidence](LOCALE_PRODUCTION_READINESS.md). Authenticated save/reload QA for `ar` is still required. Keep `ar` in `PENDING_TRANSLATION_LOCALES` until launch review; no Arabic blog columns, sitemap/hreflang publication, or IndexNow changes were added here.

See [International locale scaffolding](INTERNATIONAL_LOCALES.md) for the shared registry and release procedure.
