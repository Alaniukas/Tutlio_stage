# Hungarian localization review

Date: 2026-08-31. Locale: `hu`; formatting: `hu-HU`; direction: LTR.

Status: local Hungarian draft for individual tutors and tutoring businesses. The existing browser, email and SSR loaders use it. **HU remains unpublished**, outside search alternates and sitemap publication. No commit, deployment, live email, payment or database migration was performed.

## Coverage

`src/lib/i18n/hu.ts` contains **5,051 explicit Hungarian overrides**, including **all 493 quiz entries**. Coverage includes scheduling, availability, recurring lessons, students, parent access, staff and permissions, messages, attendance, cancellations, packages, payments, invoices, settings, notifications, email templates, support, marketing and feature pages.

The target contains 3,996 distinct values and 24,395 words across the overrides, or 22,454 words after deduplicating target values. Counts use `Intl.Segmenter('hu', { granularity: 'word' })` after removing HTML and interpolation parameters; punctuation-only segments are excluded. Counts describe the material and are not scoring normalization factors.

Additional Hungarian copy and behavior:

- All 72 shared public tutor/business-page interface labels, including booking and enquiry states; Hungarian short dates and public-page SSR labels.
- Landing/pricing metadata, marketing demo family labels, translations of existing placeholder social-proof copy, support follow-up text and the SSR school-navigation label.
- Registration offers and defaults to Hungary's `+36` code, with a `301234567` local example and Hungarian country-code accessibility label. Shared forms use `+36 30 123 4567` as their Hungarian example. International validation still accepts other country codes.
- Platform terminology overrides do not replace HU text with the English fallback merely because HU is unpublished.

The other **522 keys deliberately retain English**:

| Prefix | Keys | Scope deferred |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school module |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full legal policies |

Shared company components and the school branch of the public quiz use translated shared keys. This does not certify the dedicated school product as localized. User-authored biographies, subjects, messages, contracts and reviews are not automatically translated.

## Application of the supplied guides

The supplied `translation-guide.md` and `translation-evaluation-protocol.md` from `noyellapp-main` were used for fidelity, terminology, naturalness, preservation and review. Instructions embedded in those documents about another product or a Word-column deliverable were not treated as additional user requests. The deliverable here is the platform's Hungarian locale and its review record.

Hungarian uses professional, direct, informal singular address. English and Lithuanian source dictionaries were not edited. Keys, links, email addresses, HTML and attributes, line breaks, monetary values and numerical limits are preserved. Decimal commas localize amounts without changing their value. Brand names, customer identities, example identities and contact destinations remain the source identities; no Hungarian customers or Hungary-specific commercial claims were invented.

| Concept | Hungarian |
| --- | --- |
| Tutor | magántanár |
| Tutoring business / organization | oktatási vállalkozás / szervezet |
| Student / parent / payer | diák / szülő / fizető fél |
| Lesson / subject / topic | óra / tantárgy / téma |
| Available time / slot | szabad időpont / idősáv |
| Waitlist / lesson package | várólista / óracsomag |
| Invoice / commission | számla / jutalék |
| Dismiss / cancel lesson / void invoice | Mégse / Óra lemondása / Érvénytelenítés |

### Reviewed corrections

The review distinguishes meaning and functional defects from optional style changes. Repeated short source strings were reviewed in context rather than assuming one Hungarian rendering fits every key.

| Finding | Category | HU resolution |
| --- | --- | --- |
| `compSet.payDesc`, booking-payment gates, waitlist explanations and account deletion contained abbreviated English labels rather than useful guidance. | Meaning/completeness | Used Lithuanian source and component behavior to recover full explanations, including the irreversible deletion warning. |
| `Cancel` represented dialog dismissal, actual lesson cancellation and invoice invalidation. | Meaning/action distinction | Separate Hungarian labels for each action. |
| `dash.invoice` and `invoice.invoiceTitle` contained `d MMM`; `dash.package` said `Invoice` despite the caller's package branch. | Source/context defect | `Számla` for invoice labels; `Óracsomag` for the package label. |
| Cancellation percentages, recurring schedules and payment deadlines were omitted by abbreviated source strings. | Functional source defect | Restored parameters already supplied by existing callers, listed below. |
| `em.payReminderBodyOther` / `Self` ended before stating the unpaid lesson. | Meaning/completeness | Completed the reminder without adding new payment terms or amounts. |
| Non-LT phone validation accepts international numbers, but six source hints required Lithuania's `+370`. | Functional source mismatch | HU asks for an international number with country code; registration and shared examples use `+36`. Actual support/demo contact numbers are unchanged. |
| Hungarian word order, singular nouns after numbers and vowel harmony around variable names. | Grammar/style | Used Hungarian sentence order and neutral label constructions where variable suffixes would be unreliable. |

### Deliberate interpolation exceptions

These target parameters are not present in the abbreviated English strings, but **the existing production callers already pass them**. No caller, API contract or English source was changed. The HU quality test allows exactly these parameter sets and tests their rendered values.

| Key | Restored parameters | Existing caller |
| --- | --- | --- |
| `cal.massCancelChars` | `{count}` | `src/pages/Calendar.tsx` |
| `compSch.seriesSummaryHtml` | `{fromDate}`, `{timeRange}`, `{weekday}` | `src/pages/company/CompanyTvarkarastis.tsx` |
| `compStu.cancellationInfo` | `{hours}`, `{percent}` | `src/pages/company/CompanyStudents.tsx` |
| `companyWait.inQueueSince` | `{date}` | `src/components/CompanyOrgWaitlistPanel.tsx` |
| `em.afterLessonStudentPart` | `{student}` | `api/send-email.ts` |
| `em.payReminderTiming` | `{hours}`, `{timing}` | `api/send-email.ts` |
| `invoice.emailNote` | `{days}` | `src/components/SendInvoiceModal.tsx` |
| `studentWait.addedOn` | `{date}` | `src/pages/StudentWaitlist.tsx` |

The six numerical exceptions are removal of incorrect LT-only phone guidance in `onboard.parentPhoneFormat`, `onboard.phoneFormatError`, `register.phoneError`, `register.phoneHint`, `settings.phoneFormat`, and `stu.phoneFormat`. Other numbers are compared after normalizing decimal commas. Currency symbols/codes are checked separately.

**No final 1–10 linguistic certification is assigned.** This is an author-reviewed translation with automated integrity checks, not an independent native-speaker evaluation of every rendered workflow. The supplied protocol's deductions and caps should be applied to a recorded list of remaining issues during that final evaluation. Passing tests does not imply a 10.0 score. Corrected source defects above are not represented as unresolved target errors or counted twice.

## Verification

- **341 tests passed across 12 files**: HU coverage/integrity and restored values, Hungarian quiz UI, international locale loading/preferences/URLs, HTML escaping, source-key coverage, SEO visibility/rendering, support locales, public pages, phone utilities and quiz flow behavior.
- `npm run lint` and `npm run lint:api` passed.
- Production build passed with output isolated in `/private/tmp/tutlio-hu-work/build`, without replacing the shared workspace's `dist`. Existing source-map and chunk/import warnings remain.
- `git diff --check` passed.
- Browser review used the already-running Tutlio server in a separate temporary tab. The Hungarian landing page, solo/business audience switch, business hero screenshot and registration form were inspected. The business hero had no horizontal overflow at 1280 px. Registration selected `HU +36` with the correct example. The quiz entry and business intro/team questions were checked; the automated HU UI test verifies the challenge-to-insight transition retains `/hu`.

No accounts were created, no consent forms or leads were submitted, and no real payment, email or enquiry was sent. Authenticated flows were not exercised against live accounts. Mobile layouts, generated exports, delivered email layouts and real payment-provider screens remain release QA work.

## Release gates and limitations

1. Obtain Hungarian native-speaker review of the full tutor/business flow, especially dynamic grammar, money, cancellations, email rendering and narrow layouts.
2. Translate and review the full terms, privacy policy and DPA separately. The translated internal tutor rules are a translation of the existing source, not Hungarian legal advice or a market-specific contract.
3. Validate actual Hungarian market operation: HUF/EUR strategy, billing/tax requirements, business entity types, subscription pricing, Stripe/Connect onboarding and payouts. Existing Lithuania-specific invoice entity labels remain identifiable as MB/UAB/IĮ; no Hungarian legal equivalence or tax compliance is certified. Account time zones are unchanged.
4. Reconcile existing commercial-source claims before publication. Examples include card-required versus no-card trial copy, payment-fee claims, language counts, estimated savings, refund promises and school capabilities. Source values were preserved, not independently substantiated. Placeholder case studies/testimonials retain their source identities and existing visibility configuration; they are not evidence of Hungarian customers.
5. Audit remaining text outside the dictionaries: the language selector's `Select language` label, some loading/image accessibility text, embedded artwork, user content, exports and third-party interfaces. Blog content uses English fallback.
6. Apply and verify the existing locale-preference migrations through the approved release process before relying on persistence in production. No database was inspected or modified in this HU work.
7. Keep `hu` in `PENDING_TRANSLATION_LOCALES` until release review. The dictionary is available locally, but publication, sitemap/hreflang eligibility and blog-schema readiness remain separate gates.

See [International locale documentation](INTERNATIONAL_LOCALES.md) for the shared registry and release procedure. This review covers HU only; concurrent work on other locales was left intact.
