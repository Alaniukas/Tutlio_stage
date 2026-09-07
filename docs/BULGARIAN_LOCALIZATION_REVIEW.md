# Bulgarian localization review

Date: 2026-08-31. Locale: `bg`; formatting: `bg-BG`; direction: left to right.

Status: **local translation draft for individual tutors and tutoring businesses**. Bulgarian uses the existing locale loaders but remains unpublished and excluded from published sitemap/hreflang lists. This task does not commit, deploy, apply database migrations, or approve a Bulgarian commercial launch.

## Coverage

`src/lib/i18n/bg.ts` provides **5,051 explicit overrides**, including all **493 quiz keys**, covering tutor/business navigation, calendars, availability, student management, staff permissions, lessons, cancellations, payments, packages, invoices, messages, notifications, emails, support, marketing and feature pages, plus connected student/parent flows.

The draft contains over 4,000 distinct values and approximately 27,500 words across all overrides. Counts use Bulgarian `Intl.Segmenter` word segmentation after removing HTML tags and interpolation parameters. These are descriptive counts, not quality-score normalization factors.

Additional localized surfaces:

- All 72 public tutor/business page interface labels, including enquiry and booking states, and Bulgarian short dates (`22.08` for 22 August).
- Landing/pricing metadata, server-rendered blog/school navigation, and the support follow-up question.
- Marketing-demo family/city labels and existing fictional social-proof copy. Names, contact details, ratings, amounts and feature flags are preserved; these are not Bulgarian customer endorsements.
- Bulgarian `+359` phone examples, a Bulgaria option and default in registration, and a Bulgarian country-code accessibility label. The existing international phone formatter/validator is reused without narrowing it to Bulgarian numbers.

The remaining **522 source keys retain English**: `admin` (95), `school` (259), `schoolsLanding` (125), `perlasFinance` (34), and full `tos`/`priv`/`dpa` policy content (9). Shared company/school components can display Bulgarian through company keys; this does not mean that the dedicated school product is localized.

## Supplied translation guides

Applied `translation-guide.md` and `translation-evaluation-protocol.md` from the user-supplied `noyellapp-main` paths to the requested Tutlio app localization. Instructions for another product or a separate Word deliverable were not treated as additional user requests. Translation and review were performed without delegation.

The Bulgarian register is professional and direct, using plural/polite imperatives such as `Изберете` and lower-case `ви`/`ваш` consistently. Preferred terminology:

| English concept | Bulgarian |
| --- | --- |
| Tutor | преподавател |
| Tutoring business | учебен център / център |
| Organization | организация |
| Lesson / subject / topic | урок / предмет / тема |
| Availability / time slot | свободно време / времеви интервал |
| Waitlist | списък на чакащите |
| Lesson package / invoice | пакет уроци / фактура |
| Cancel lesson / dismiss / delete | отмяна / отказ / изтриване |
| Tutor pay / payer | възнаграждение / платец |

English and Lithuanian source dictionaries are unchanged. Keys, placeholders, HTML tags/attributes, URLs, email addresses and line breaks are preserved. Numerical values are preserved **except six obsolete Lithuanian-only phone hints**, listed below. Currencies, prices, percentages, deadlines, trial durations and product claims are unchanged.

### Contextual corrections

Review separated meaning errors, grammar/agreement issues and optional style changes using the supplied severity categories. Corrections included:

- `compSet.payDesc` explains the difference between lesson price and tutor remuneration; `stuSched.payBtn`, `studentDash.pay` and `subscribe.payBtn` say `Плащане`. Their shared English value, `Pay`, must not produce the same Bulgarian text in these different contexts.
- `em.payReminderBodyOther` and `em.payReminderBodySelf` complete the unfinished English reminder sentences without adding parameters or markup.
- `studentWait.tooltip`, `stuSched.mustPayDesc`, overdue-payment warnings, availability confirmations, deletion confirmation, and several business-setting explanations use the fuller meaning established by Lithuanian copy and their components instead of translating developer placeholders literally.
- `dash.invoice` and `invoice.invoiceTitle` use `Фактура`; the source mistakenly contains a date-format token where callers require an invoice label.
- Completed lessons use `Проведен`/`Проведени`, paid invoices use `Платена`, and recurring weekday phrases avoid gender agreement with a substituted weekday name.
- Cancellation-fee payment, lesson payment, account credit and refunds remain distinct. Manual-payment copy does not promise an automatic card refund.
- The public footer's company heading refers to Tutlio (`Компания`), not the customer's tutoring business (`учебен център`).

### Intentional phone-hint exception

`onboard.parentPhoneFormat`, `onboard.phoneFormatError`, `register.phoneError`, `register.phoneHint`, `settings.phoneFormat`, and `stu.phoneFormat` no longer demand `+370` or Lithuania's eight-digit local number length. Their active forms already use international validation. Bulgarian now requests a valid international number/country code; Bulgarian examples live in the phone helper and registration configuration. No payment amounts or unrelated numeric text are exempted from integrity checks.

**No final 1–10 linguistic certification is assigned.** This is an author-reviewed draft, not an independent native-speaker evaluation of every rendered flow. The supplied protocol's deductions and severity caps should be applied to recorded findings in the final native-language review. Passing integrity tests is not a 10.0 language score.

## Verification

- 270 tests passed across 11 focused files: Bulgarian integrity, international locale handling, metadata/visibility, phone utilities, support, source coverage, HTML escaping, public pages, quiz navigation and authentication locale handling.
- Two additional targeted SSR tests passed, including Bulgarian noindex output and localized metadata, plus two registration component tests: **274 passing tests total**. The broader concurrent SEO run had unrelated Croatian/Slovak navigation-expectation failures; those locales were not changed by this task.
- All requested keys are populated. Placeholder, HTML, URL, email and newline checks pass across the full draft. Numeric checks pass with only the six documented phone-hint exceptions.
- Frontend and API TypeScript checks passed. The production build passed into an isolated temporary output directory so the shared `dist` directory was not replaced. Existing source-map/chunk-size warnings remain.
- Browser review checked Bulgarian landing content, the business audience tab, the desktop hero layout and tutor login choices. A shared preview was found to serve an older compiled registration page, so it was not used as evidence for the new registration default. Starting an isolated preview was blocked by local port-binding permissions; no broader permissions were requested.
- Rendering the current registration component in tests confirms the Bulgarian `+359` default, translated country-code label, expected phone example, and changing to another country's code without creating an account. Current-build browser/mobile registration verification remains release work.

No real accounts were created or used, and no enquiries, emails or payments were submitted.

## Remaining release work

1. **Native-language and authenticated QA:** review complete tutor, business-admin, student and parent journeys, narrow screens, errors, variable substitution, delivered emails, PDFs/exports, scheduling, cancellation and payment behavior. A translated dictionary alone is not end-to-end verification.
2. **Source interpolation defects:** `companyWait.inQueueSince` and `studentWait.addedOn` contain date-format tokens instead of accepting the date passed by callers. `compStu.cancellationInfo` has blank hours/percentage text, and `invoice.emailNote` lacks the deadline parameter present in Lithuanian and passed by its caller. The English source contract and translations should be corrected together; this task did not invent replacement placeholders.
3. **Other hard-coded text/artwork:** the language selector's `Select language`, some image accessibility text, and demo `Auto`, `Live` and `45 min` labels still need a shared UI audit. Public biographies, subject names, reviews, screenshots and other user-authored/fixture content are not translated automatically.
4. **Product and marketing review:** existing language counts, trial/card requirements, commission claims, refund guarantees and estimated savings remain as in the source. Some source pages disagree on these topics. Demo claims such as a grade improving from 6 to 9 are preserved examples, not adapted Bulgarian grading claims. Do not present fictional social proof as verified customers.
5. **Legal and market setup:** full policy bodies remain English; the translated internal tutor rules still need legal/product review. Lithuanian legal-entity types remain Lithuanian forms, not Bulgarian equivalents. Currency selection, tax/invoice requirements, payment-provider eligibility, onboarding, payouts and account time zones were not changed or certified.
6. **Release gates:** retain pending/unpublished status until linguistic, functional, legal and market checks are approved. Validate locale persistence using the shared, prepared migration through the normal approved release process; this task applied no migration. No Bulgarian blog database columns or article translations were added.

See [International locales](INTERNATIONAL_LOCALES.md) for the shared registry and release procedure.
