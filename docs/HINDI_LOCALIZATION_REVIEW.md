# Hindi localization review

Date: 2026-08-31. Locale: `hi`; formatting: `hi-IN`; direction: left to right.

Status: **local Hindi translation draft for individual tutors and tutoring businesses**. The existing locale loaders serve the draft in the browser, email helpers and server rendering. Hindi remains unpublished for search indexing. No commit, deployment, migration, real message or payment was performed by this localization task.

## Coverage

[`src/lib/i18n/hi.ts`](../src/lib/i18n/hi.ts) contains **5,051 explicit overrides** of the 5,573 English dictionary keys. Coverage includes tutor/company navigation, schedules, availability, students, parents, team permissions, attendance, finance, payments, invoices, packages, messaging, notifications, email templates, support, marketing, feature pages and all onboarding-quiz copy, including shared audience choices.

The dictionary contains 3,962 distinct Hindi values. Word segmentation with `Intl.Segmenter('hi')`, after removing HTML and interpolation parameters, gives 31,580 words across the overrides and 28,941 after deduplicating identical values. Counts describe scope; they are not quality scores or scoring multipliers.

Other Hindi additions:

- 72 public tutor/business page labels, including booking requests, success/error states and short-date formatting.
- Landing/pricing metadata, the server-rendered school navigation label and support follow-up text.
- Marketing demo family/location labels and translations of the existing placeholder social-proof copy. Names, identities, statistics and visibility controls are unchanged; these are not new Indian customer claims.
- Protection against pending-locale English platform overrides replacing Hindi navigation.

The remaining **522 keys intentionally use English**:

| Prefix | Keys | Deferred scope |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school module |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full legal policy bodies |

Shared company/school components and the organization tutor rules are covered where they belong to the tutor/business dictionary. This does not establish that the school product or legal policies are Hindi-ready. User-authored biographies, names, reviews, messages and blog articles are not translated.

## Supplied translation guides

The user supplied `translation-guide.md` and `translation-evaluation-protocol.md` from the separate `noyellapp-main` project. Their translation and review criteria were applied to Tutlio. Embedded instructions about another app or a Word deliverable were not treated as additional user requests.

Hindi uses respectful **आप**, Devanagari text and familiar software terminology. Keys, interpolation parameters, HTML tags and attributes, numeric values, URLs, email addresses and line breaks are preserved. English and Lithuanian source dictionaries were not changed by this task. Existing prices, currencies, legal entities, phone requirements, feature claims and customer identities were translated faithfully rather than replaced with invented India-specific facts.

| Concept | Hindi convention |
| --- | --- |
| Tutor / tutoring business | ट्यूटर / ट्यूशन संस्था |
| Organization | संस्था |
| Student / parent / payer | विद्यार्थी / अभिभावक / भुगतानकर्ता |
| Lesson / school grade | क्लास / कक्षा |
| Subject / topic | विषय / टॉपिक |
| Availability / waitlist | उपलब्धता / प्रतीक्षा सूची |
| Invoice / tutor pay | इनवॉइस / पारिश्रमिक |
| Cancel / delete / remove | रद्द करें / मिटाएँ / हटाएँ |
| Reschedule | समय बदलें |
| Free of charge / free time | मुफ़्त / खाली समय |

Review distinguished meaning errors from grammar issues and optional stylistic preferences. Repeated terminology problems were treated as one root cause, rather than counted separately for every occurrence. Context was checked against Lithuanian copy and actual callers where English was abbreviated or defective.

| Reviewed issue | Severity and correction |
| --- | --- |
| `compSet.payDesc`, `stuSched.mustPayDesc`, `stuSched.mustPayOverdue`, `stuSched.mustPayQueue` | Critical meaning omissions in a literal rendering of abbreviated English: restored the context-supported explanation of tutor pay or the booking/payment restriction. |
| `studentSettings.confirmDeleteMsg` | Critical warning omission: restored the account-deletion confirmation and irreversibility warning from the source context. |
| `compSch.confirmNoAvailability`, `compSch.confirmOutsideAvailability` | Critical action/context omission: explain the availability conflict and explicitly ask whether to continue. |
| `studentWait.tooltip`, `studentWait.emptyHint`, `cal.massCancelEmailNote`, `lessonSet.orgPriceNote`, `orgFinance.summaryNote`, `stuSess.rescheduleNote`, `stuSess.rescheduledSuccessDesc` | Context-dependent meaning omissions: restored the explanatory wording from the fuller Lithuanian source and caller context. |
| `dash.invoice`, `invoice.invoiceTitle`, `compSch.seriesSummaryHtml` | Critical source-label mismatch: callers use these as copy, not date formatters. Hindi uses the invoice label or recurring-series explanation instead of the erroneous English format token. Missing dynamic series details still require a source-contract fix below. |
| Email student/recipient fragments | Major grammar issue: reordered the Hindi sentence and supplied fragment spacing so student and payer variants compose naturally. `em.withStudent`/`em.withTutor` fit the surrounding contact sentence. |
| Count-bearing recurring, digest and package-confirmation emails | Major number-agreement risk: use count labels that work with both one and multiple items without adding pluralization parameters. |
| `compSet.commentVisibility` | Major ordinal issue: replaced the unnatural numeric ordinal with `क्लास 1`. |

These entries record corrected issues, not a tally of defects remaining in the final draft. **No final 1–10 linguistic certification is assigned.** Author review and automated checks do not establish that every rendered flow is idiomatic. For the release evaluation, inspect the complete rendered source/target, list remaining issues, tally them by the supplied severity tiers, calculate the raw deductions, apply the strictest cap, and report the final score with its justification. Do not infer 10.0 from passing integrity tests.

## Verification

- Focused suite: 279 tests passed across 11 files on the final run, including Hindi integrity and runtime composition, international locale loading, SSR/noindex, HTML escaping, source-key coverage, auth locale handling, quiz navigation, public-page behavior and support locales.
- All 5,051 in-scope keys preserve interpolation parameters, HTML, numbers, URLs, email addresses and line breaks; every in-scope key is explicitly represented.
- Hindi is returned by browser, email and SSR helpers. Public-page copy uses Hindi, and short dates use `hi-IN`.
- Frontend and API TypeScript checks passed. Production build passed with existing source-map/dynamic-import/large-chunk warnings; the Hindi chunk is approximately 585 kB before compression. Build output was directed to a temporary directory, leaving the shared `dist` directory alone.
- Local browser review verified the Hindi landing page, solo/business audience switching, Hindi navigation, tutor login choices and sign-in form, and the business onboarding quiz through audience, introduction and team-size selection. A desktop screenshot was inspected: Devanagari renders, but headline wrapping/spacing and mobile layouts still need native-language visual review.

No authenticated account flows, delivered emails, actual booking requests, refunds, provider onboarding, exports or database writes were exercised. These remain release QA work.

## Remaining release work

1. **Native Hindi review and full workflow QA.** Review individual tutors, business administrators, students and parents; include cancellations, money, error states, one/many values, narrow screens, conjunct shaping and line wrapping. Dedicated school interfaces and full legal policies remain English.
2. **Source text contracts.** `companyWait.inQueueSince` and `studentWait.addedOn` still contain format tokens instead of a `{date}` placeholder. `cal.massCancelChars` receives a count that the source string does not expose. `em.afterLessonStudentPart` and `em.packageReqStudentPart` receive a student name absent from their source strings, so Hindi remains generic. The recurring-series summary caller supplies `fromDate`, `timeRange` and `weekday`, but the source lacks those parameters. Fix source contracts and all translations together; no parameters were invented in Hindi.
3. **Text outside dictionaries and artwork.** Browser review found `Select language`, `Students studying`, `Tutlio AI support`, and demo badges such as `Auto`, `Live` and `45 min`. Product screenshots, quiz artwork, third-party widgets and invoice/export output need a separate audit. Owner-authored public profile data remains in its original language.
4. **India-specific setup.** Hindi does not cover every Indian language or establish India market readiness. Currency, prices, taxes, invoice rules, payment-provider/Connect eligibility, payouts, time zones and phone behavior are unchanged. Legacy source prompts still mention `+370`; confirm every registration and payer flow accepts the intended Indian numbers before launch. Do not infer provider support from translated payment copy.
5. **Marketing and policy review.** Source testimonials, illustrative workflows, savings percentages, language counts and trial/refund claims were preserved, not independently verified. Existing source copy contains differing card-required and fee statements. Reconcile those claims and review the organization tutor rules and legal policies before publication.
6. **Publication and persistence gates.** Keep `hi` in `PENDING_TRANSLATION_LOCALES` until release review. It remains outside published sitemap/hreflang/IndexNow entries; pending marketing routes remain noindex. Blog content uses English fields; no Hindi blog columns were added. Any locale-preference migration prepared by the broader internationalization work must go through its approved release process before relying on database persistence.

See [International locales](INTERNATIONAL_LOCALES.md) for the shared release procedure.
