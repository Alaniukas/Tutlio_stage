# Indonesian localization review

Date: 2026-08-31. Locale: `id`; formatting tag: `id-ID`; writing direction: left to right.

Status: local translation draft prepared for individual tutors and tutoring businesses. Indonesian remains pending for search publication. Nothing was committed, deployed, sent to customers, or migrated in the database.

## Scope and coverage

| Item | Coverage |
| --- | --- |
| Explicit Indonesian dictionary entries | 5,051 of 5,573 English source keys |
| In-scope dictionary coverage | 100% |
| Indonesian dictionary word count | 26,763 |
| English source word count for the same keys | 25,736 |
| Public booking interface | 72 labels; 240 Indonesian words |
| Intentionally deferred dictionary entries | 522 |

Word counts split translated string values on whitespace, count repeated strings at each key, and exclude keys, comments and the English fallback. Public booking copy is counted separately. These counts are for audit context, not score normalization.

Translated areas include shared navigation, registration and onboarding, availability and scheduling, student management, tutor administration, lesson settings, attendance, packages, payments, invoices, subscriptions, messaging, the connected student/parent journeys, transactional email and push dictionaries, landing/feature copy, the assessment quiz, and support UI.

Additional Indonesian copy covers public booking labels and dates, landing/pricing metadata, public-page SSR labels, SSR school navigation, blog navigation labels, support follow-up, and existing landing demo content. Fictional identities, ratings and statistics were preserved; the disabled placeholder social-proof switch was not enabled. User-authored biographies, reviews, lesson titles and blog articles are not automatically translated.

Deferred namespaces are `admin`, `school`, `schoolsLanding`, `perlasFinance`, `tos`, `priv` and `dpa`. They retain English fallback. Shared company components and school references within shared marketing/quiz text are translated, but this is not localization of the separate school administration product or its full legal policies.

## Guides and language choices

Applied the supplied `translation-guide.md` and `translation-evaluation-protocol.md` from `/Users/simonasbukys/Desktop/PMC Baltic Apps/noyellapp-main/` to meaning, spelling, natural phrasing, terminology, source integrity, and issue classification. Their unrelated Word-document/right-column workflow was not treated as a request to edit another app or create a Word deliverable.

English is the primary source. Existing Lithuanian text and actual component usage resolve abbreviated or damaged English messages. English and Lithuanian dictionaries were left unchanged.

| Concept | Indonesian choice |
| --- | --- |
| Addressing the user | Anda; professional and neutral |
| Independent tutor | tutor mandiri |
| Private tutor | tutor privat |
| Tutoring business | lembaga bimbingan belajar / lembaga bimbel |
| Lesson | sesi les |
| Subject | mata pelajaran |
| Student / parent / guardian | siswa / orang tua / wali |
| Waitlist / queue | daftar tunggu / antrean |
| Availability | waktu tersedia |
| Invoice | faktur; does not imply a local tax invoice |
| Tutor pay / lesson price | honor tutor / harga sesi les |
| File | berkas |
| Delete / cancel | hapus / batal or batalkan, according to the action |

Brand names, legal entity names, existing prices, amounts, percentages, currencies, links, emails and phone examples in source copy were preserved. The shared phone-placeholder helper separately gained an Indonesian `+62` example. International phone validation still requires a country prefix and does not restrict Indonesian-language users to Indonesian phone numbers.

## Evaluation and corrections

This is an author review, not independent native-speaker certification. Every unique source string was translated; structural checks cover the complete in-scope dictionary. A subsequent review corrected 76 entries, using source comparisons, relevant component context, a distributed dictionary sample, and a repeated terminology check.

The following root causes were counted once each, as required by the evaluation protocol:

| Root cause in the first draft | Severity | Example and correction |
| --- | --- | --- |
| Abbreviated source messages reproduced as labels rather than explaining the user's next step or restriction | Major | `stuSched.mustPayDesc` now explains that unpaid lessons or overdue monthly invoices block new bookings and waitlist entry; cancellation and account-deletion warnings are explicit. |
| Source date-format stubs used as labels and omitted dynamic information | Major | Invoice labels now say `Faktur`; five messages restore already-supplied date, deadline, count and recurring-series values. |
| Student lesson pricing described as tutor remuneration | Major | `compTut.tutorPricing` now uses `Harga les tutor per mata pelajaran`; the description refers to the organization's default price, not tutor honor. |
| Inconsistent file terminology | Minor | Standardized `file` to `berkas` in 18 dictionary entries. |
| Attendance wording implied “not yet” rather than “did not” | Minor | `att.tutorMissing` changed from `Tutor belum bergabung` to `Tutor tidak bergabung`. |

For this 76-entry correction set only, the first draft contains 432 target words. The tally is 0 critical, 3 major, 2 minor and 0 micro issues. Its raw score is `10 − (3 × 0.9) − (2 × 0.3) = 6.7`; the multiple-major cap is 7.9, so the capped score remains **6.7/10**. Repeated occurrences are not penalized again.

The corrected set contains 1,104 target words, because the previously abbreviated explanations now convey their intended meaning. Targeted re-review found no remaining instances of the five recorded root causes in this set: its mechanical post-correction score is **10.0/10**, with no applicable severity cap. This narrow score is not a 10/10 rating of all 5,051 entries, the rendered application, or Indonesian market readiness. An independent native-speaker review of the full interface has not been completed.

### Recovered interpolation arguments

All existing English interpolation arguments are preserved. These five source messages were incomplete, so Indonesian additionally uses arguments already supplied by the corresponding component. No component, business rule, English string, or variable name was changed:

| Key | Existing caller | Restored arguments |
| --- | --- | --- |
| `cal.massCancelChars` | `Calendar.tsx` | `{count}` |
| `compSch.seriesSummaryHtml` | `CompanyTvarkarastis.tsx` | `{fromDate}`, `{weekday}`, `{timeRange}` |
| `companyWait.inQueueSince` | `CompanyOrgWaitlistPanel.tsx` | `{date}` |
| `invoice.emailNote` | `SendInvoiceModal.tsx` | `{days}` |
| `studentWait.addedOn` | `StudentWaitlist.tsx` | `{date}` |

Tests explicitly enumerate these recovered arguments. They do not broadly exempt those messages from HTML, numeric, URL, email or newline checks. Numeric tokens and currency markers match the English source throughout the dictionary; the existing five-character minimum is written as `lima` in the repaired counter message.

## Verification

- **220 tests passed across 9 focused test files**, including the Indonesian quality suite, locale routing/loading, browser/email/SSR dictionaries, HTML escaping, public-page copy, phone helpers, support locales and SEO visibility/rendering.
- Frontend TypeScript check: `npm run lint`.
- API TypeScript check: `npm run lint:api`.
- Production Vite/PWA build succeeded using an isolated temporary output directory, without replacing the project's `dist` directory.
- No duplicate Indonesian keys, missing in-scope keys, empty translations for nonempty source messages, or unexpected interpolation/HTML/numeric/link/email/newline differences.
- English source snapshot remained identical; currency markers were checked separately and matched.
- `git diff --check` passed.

Build warnings concern large chunks, Tailwind sourcemaps and the existing mixed Excalidraw import pattern. They were not changed as part of this localization.

Visual browser verification could not be completed: no local server was available, and starting a separate Vite server was denied by the environment (`listen EPERM`). No broader access was requested, and no browser screenshot, authenticated flow, payment, or email delivery is claimed as verified.

## Before Indonesian launch

1. Review the full Indonesian UI with a native-speaking tutor/business operator, including mobile layouts, long labels, booking confirmations, cancellations, invoices, parent invitations and email previews.
2. Test authenticated individual-tutor and organization-admin journeys in an approved preview environment. Test recipient locale selection as well as the translated email templates.
3. Confirm Indonesian payment onboarding and payout availability separately. The existing money model remains EUR/PLN; adding Indonesian language does not add IDR billing or certify a payment provider for Indonesian businesses.
4. Review billing identity fields, tax/invoice requirements, legal policies, privacy obligations and support coverage for the intended launch. Lithuanian legal forms and source phone examples in some existing copy remain as supplied; this translation does not convert them into Indonesian legal or operational requirements.
5. Review existing marketing assertions before publication, including the “13 languages” statement, trial/refund promises, automation descriptions and testimonial/estimate attribution. They were translated, not independently substantiated or rewritten.
6. Publish the locale to sitemap/hreflang/indexable public pages only after approval of translation and operational readiness. The locale remains pending/noindex now, and blog content retains the established English fallback.

Implementation entry points: `src/lib/i18n/id.ts`, `src/lib/publicPage.ts`, `src/lib/seoMeta.ts`, `src/lib/utils.ts`, relevant public/SSR/support label maps, and `tests/lib/i18n-id-quality.test.ts`.
