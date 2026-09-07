# Slovak localization review

Date: 2026-08-31. Locale: `sk` (Slovenčina); formatting: `sk-SK`; direction: LTR; week starts Monday.

Status: **local translation draft for individual tutors and tutoring businesses**. The existing Slovak loaders now use translated copy. Slovak remains unpublished in `PENDING_TRANSLATION_LOCALES`; this work does not approve production release or search indexing. No commit, deployment, database change, email delivery, or real payment was performed.

## Coverage

`src/lib/i18n/sk.ts` contains **5,051 explicit overrides** of 5,573 English keys, including all **493 quiz keys**. Coverage includes tutor and business navigation, calendars, availability, students, staff, permissions, attendance, cancellations, packages, payments, invoicing, messaging, support, transactional emails, public marketing, and connected student/parent flows.

The overrides contain 4,015 distinct values and 24,387 word segments (22,406 after deduplicating identical values), counted with Slovak word segmentation after removing HTML and interpolation parameters. Counts describe the scope; they do not normalize quality deductions.

The remaining **522 keys retain English**: platform administration (`admin`, 95), dedicated school functionality (`school`, 259), school marketing (`schoolsLanding`, 125), Lithuania-specific PerlasFinance (34), and full terms/privacy/DPA bodies (9). Shared company/school components and the school branch of the shared quiz are included; the dedicated school product is not fully localized.

Additional localized surfaces:

- All 72 public booking interface labels, draft/error/enquiry states, short dates, and landing/pricing metadata. Owner-authored biographies, subjects, reviews and other database content are unchanged.
- Public-page server labels, the server footer's school link, and the support follow-up question.
- Demo family/city labels and existing placeholder social-proof copy. Identities, contacts, ratings, statistics and the disabled social-proof flag are preserved; no Slovak customer endorsements were invented.
- Slovak `+421` phone option, initial registration prefix, example number and accessible country-prefix label. International validation is reused; Lithuania-specific validation is unchanged.
- A Slovak-only date-fns adapter repairs the installed library's `sobota]` wide-weekday parsing typo. Other weekday matches, date formatting and other locales are unchanged; no dependency was upgraded.

## Supplied guides and language choices

Applied the translation and evaluation rules from the supplied `translation-guide.md` and `translation-evaluation-protocol.md` in the `noyellapp-main` project. Instructions embedded in those documents for a different product, a Word deliverable, or a claimed native-speaker identity were not treated as additional user requests.

The translation uses professional **vykanie**, clear action infinitives, consistent terms, and faithful source meaning. Source keys, HTML, links, email addresses, numeric values and line breaks are preserved, with the three explicitly documented source-contract repairs below. English and Lithuanian source dictionaries were not edited by this task. Currency amounts, policy claims, company types and business rules were not rewritten as Slovak market facts.

| Concept | Slovak usage |
| --- | --- |
| Tutor / tutoring business | doučovateľ / doučovacie centrum |
| Organization | organizácia |
| Student / parent / legal guardian | študent / rodič / zákonný zástupca |
| Payer / tutor pay | platiteľ / odmena doučovateľa |
| Lesson / subject / topic | hodina / predmet / téma |
| Availability / slot | dostupnosť / voľný termín |
| Waitlist | čakacia listina |
| Lesson package / invoice | balík hodín / faktúra |
| Cancel / delete | zrušiť / odstrániť |
| Paid / unpaid | uhradené / neuhradené |

Existing quantity selectors use categories such as 2–9 that do not match Slovak grammar. Count fragments use neutral units (`hod.`, `fakt.`) where necessary instead of changing shared business logic. Recurring weekday templates avoid gendered `každý` before an arbitrary weekday. Labels for subjects and people are distinguished even when their English values are both `Name`.

## Review findings and corrections

The guides' Critical/Major/Minor/Micro distinction was used to separate meaning defects from grammar and optional stylistic changes. The review prioritized payment conditions, destructive actions, parent consent, permission boundaries and dynamic message fragments.

| Area | Finding and correction |
| --- | --- |
| Payment reminders | The English sentences stop at “still”. Slovak explains the unpaid lesson and distinguishes the student from the payer. The deadline row now says `Lehota na úhradu`, not the repeated price label. |
| `em.payReminderTiming` — contract repair | English/Lithuanian contain only a label, but `paymentReminderEmail` passes `hours` and `timing`. Slovak uses `{hours} h {timing}`; before-start and after-end deadlines are verified through actual dry-run email rendering. The separate finance settings label remains a label. |
| `invoice.emailNote` — contract repair | English has only “Email note”. Lithuanian and `SendInvoiceModal` establish the message and `{days}` parameter. Slovak explains invoice/email delivery and retains the actual deadline. |
| `cal.massCancelChars` — contract repair | English has only “Mass cancel chars”. Lithuanian and the minimum-length validation establish `/5`; Slovak uses `/5 znakov`. |
| Tutor pay versus payment action | `compSet.payDesc` explains the center's remainder after tutor pay; payment buttons use `Zaplatiť`. The duplicated English “Pay” is not translated identically across these contexts. |
| Cancellation and deletion | Cancellation, deletion, late fees, package annulment and account removal retain distinct meanings. The account-deletion confirmation states that the action is irreversible. |
| Incomplete source explanations | Availability warnings, queue/payment restrictions, rescheduling confirmation, invoice/package notes and finance explanations use the meaning established by Lithuanian copy and their callers. |
| Invoice labels | `dash.invoice` and `invoice.invoiceTitle` incorrectly contain `d MMM` in source. Slovak uses `Faktúra` in these label contexts. |
| Calendar parsing | A round-trip test found that the installed date-fns Slovak matcher could not parse Saturday in full dates. The locale-only adapter delegates to the working abbreviated matcher while retaining the remaining input. |

The integrity tests use explicit reference contracts for the three named repairs; they do not skip placeholder or numeric checking across the dictionary.

**No final 1–10 linguistic certification is assigned.** An author review and automated checks are not an independent native Slovak review of all rendered flows. Passing tests does not imply a 10.0 score. For final evaluation, record remaining issues by the supplied severity rules, deduct 2.5 for the first Critical and 1.5 for subsequent Critical issues, 0.9 per Major, 0.3 per Minor and 0.1 per Micro, apply the 1.0 floor and the protocol's severity caps, and report both raw and capped scores. Do not normalize deductions by word count or count one repeated root cause multiple times.

## Verification

**325 tests passed across 14 files.** Frontend and API TypeScript checks passed; the isolated production build passed. The build retains the warnings described below.

- The focused regression set covers source-key completeness, every interpolation/HTML/numeric/URL/email/line-break contract, fallback scope, browser/email/SSR loading, safe HTML substitution, money-related wording, phone defaults and validation, public copy, metadata, pending SEO gates, and demo identity preservation.
- Dry-run payment reminder tests cover before-lesson and after-lesson deadlines and escaped recipient/student content. Email and push delivery are mocked; no messages are sent.
- Slovak quiz component tests cover the tutor/business choices and multi-select business challenge → insight navigation while retaining `/sk` routes. Shared quiz, public-page, auth-locale and lead-handler regressions also run with mocks.
- Date tests round-trip all months across short/medium/long/full and date-time formats, including Saturday, and check Monday-first weeks and `22. 8.` public short dates.
- Frontend/API TypeScript checks and a production build are checked. Build output is isolated under `/private/tmp/tutlio-sk-localization/build`, leaving the main thread's `dist` output untouched. Existing build warnings about source maps, mixed imports and large chunks are not localization failures.

These are local automated checks, not a live account or native visual QA sign-off. No authenticated tutor/business/student/parent flow, delivered email, invoice PDF/XLSX, payment-provider account or database persistence was exercised against a real service.

## Release limits

1. Have a native Slovak reviewer verify full flows, dynamic names/counts, formal address, narrow layouts and email appearance. Screenshots/artwork, third-party widgets, hard-coded strings outside the dictionaries, public profile fixtures and user-authored content can still contain other languages.
2. Fix remaining source contracts together with other locales: for example `companyWait.inQueueSince` and `studentWait.addedOn` contain date-format tokens although callers pass `{date}`. This draft leaves those existing contracts unchanged. A translated dictionary is not a complete audit of source functionality.
3. Review all marketing statements before publication. Existing trial/card requirements, fee claims, language counts, savings figures, testimonials and school references were translated rather than independently verified or reconciled. Disabled fictional social proof stays disabled.
4. Translate and legally review the full terms/privacy/DPA separately. Internal tutor rules are translated for the shared tutor flow, not certified for Slovak legal compliance. Lithuanian entity types and accounting conventions remain unchanged; translations do not make them Slovak equivalents.
5. Validate payment-provider eligibility, settlement, currencies, tax/invoice rules and support availability separately. This task changes language and phone examples, not market billing behavior.
6. Use the existing approved release process for any database locale-preference migration and persistence verification. This task does not add/apply a migration or promote `sk` into published locale, sitemap, hreflang, blog-column or IndexNow lists.

See [International locales](INTERNATIONAL_LOCALES.md) for the shared registry and release gates.
