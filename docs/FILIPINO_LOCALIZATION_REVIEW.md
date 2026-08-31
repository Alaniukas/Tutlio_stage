# Filipino localization review

Date: 2026-08-31. Language: Filipino for the Philippines. App/URL locale: `fil`. Formatting tag: `fil-PH`. Direction: left to right.

Status: **local translation draft; additional proofreading recommended before publication**. No commit, deployment, customer email, or live database migration was performed. Filipino remains outside search indexing and the published blog locale set.

## Scope

| Item | Coverage |
| --- | --- |
| Explicit Filipino dictionary entries | 5,051 of 5,573 English keys |
| In-scope dictionary coverage | 100% |
| Target dictionary word count | 33,050 |
| English word count for those keys | 25,736 |
| Additional public booking labels | 72; 281 target words |
| Intentionally deferred dictionary entries | 522 |

Word counts split string values on whitespace, count repeated values at each key, and exclude comments, keys and English fallback. They describe the corpus; they do not scale the protocol's deductions.

The draft covers individual tutors and tutoring businesses: navigation, registration, onboarding, calendars, availability, students, tutor management, lesson settings, attendance, packages, invoices, payments, subscriptions, messaging and support. It also covers connected student/parent flows, transactional email dictionaries, public marketing copy and the entire onboarding assessment, including its shared school branch.

Public booking labels, landing/pricing metadata, support follow-up, existing landing demo labels and the shared SSR school-navigation label have Filipino copy. Existing fictional names, phone identities, brands, prices and statistics were preserved. User-authored biographies, lesson titles, reviews and blog articles are not automatically translated. The disabled placeholder social-proof content was not enabled or localized.

The separate `admin`, `school`, `schoolsLanding`, `perlasFinance`, `tos`, `priv` and `dpa` namespaces retain English dictionary fallback. The platform admin route retains its existing forced Lithuanian behavior. Translating shared company components and school references in the quiz does not constitute localization of the dedicated school product. The translated `orgTutorPolicy` preserves the existing organization rules and GDPR references; it is not an adaptation to Philippine law.

## Supplied guides and language choices

Applied `translation-guide.md` and `translation-evaluation-protocol.md` supplied from `/Users/simonasbukys/Desktop/PMC Baltic Apps/noyellapp-main/`. Their review, correction, fidelity and final-QA process was applied to this platform. Instructions about another app, a Word document and left/right document columns were treated as workflow context, not additional deliverables or permission to modify that app.

English is the primary source. Existing Lithuanian text and actual component/email usage resolve damaged or abbreviated English messages. Both source dictionaries remained byte-for-byte unchanged during this task. This is an author review, not independent native-speaker certification.

| Concept | Filipino choice |
| --- | --- |
| Addressing the user | Direct, friendly `ka` / `mo` / `iyong` |
| Individual tutor | indibidwal na tutor |
| Tutor / student / parent / payer | tutor / estudyante / magulang / tagabayad |
| Scheduled lesson | sesyon |
| Subject | asignatura |
| Availability | bakanteng oras; not `libre`, which can imply no charge |
| Waitlist | listahan ng naghihintay |
| Booking | pag-book |
| Invoice | invoice; no claim of Philippine tax-invoice compliance |
| Late cancellation | pagkansela lampas sa palugit |
| Data / permission | datos / pahintulot |

Common software borrowings such as `account`, `email`, `invoice`, `link`, `login`, `Stripe`, `Google Calendar` and `workspace` are intentional. Brand/legal names, URLs, email addresses, currencies, numeric claims, markup and line breaks were not freely rewritten. Filipino is a language choice; this work does not add Cebuano or every language used in the Philippines.

## Review and corrections

The guide's four stages were applied as initial evaluation, issue-specific recommendations, direct correction of the Filipino values, and final structural/contextual checks. Forty-two dictionary entries changed after the first translation pass. The audit focused especially on payments, cancellations, destructive actions, tutor remuneration, invitations, the onboarding assessment and date-dependent messages.

Substantial corrections:

- Replaced “last-minute cancellation” wording with cancellation after the allowed deadline, preserving the fee/refund distinction and all amounts.
- Explained unpaid-booking restrictions and irreversible account deletion using the existing Lithuanian source and component context.
- Restored the distinction between lesson price, tutor pay and the amount retained by the business.
- Repaired invoice/date-format stubs and restored arguments already supplied by their callers, as detailed below.
- Corrected Filipino person markers and coordinated permission verbs; standardized `datos` and the individual-tutor terminology.
- Corrected phone instructions that incorrectly required Lithuania's `+370`, without narrowing the existing international-number validator.

### Reproducible language review sample

The following score applies only to the **six strings in the final grammar/terminology pass**, after the earlier contextual repairs. That baseline has 68 target words; the corrected sample has 70. It is an issue-selected sample, not an estimate of error density or quality across all 33,050 words.

ISSUES FOUND:

| Tier | Location / wording before correction | Explanation and required correction |
| --- | --- | --- |
| Critical | `em.platformInvoiceSub`: `Tutlio invoice {number} ({period})` | The whole subject retained English word order unchanged where a Filipino subject was expected. Corrected to `Invoice ng Tutlio {number} ({period})`, preserving the brand and arguments. |
| Major | `em.payReminderBodyOther`: `ni estudyante <strong>{student}</strong>` | The person marker and noun construction are malformed. Corrected to `ng estudyanteng si <strong>{student}</strong>`. |
| Major | `stuSched.mustPayDesc`: `Hindi ka makakapag-book ... o sasali ...` | The coordinated verbs mix inability with a future action, weakening the restriction's clarity. Corrected to `Hindi ka makakapag-book ... o makakasali ...`. |
| Minor | `about.valueSecurityDesc`, `cal.syncSendFailed`, `compStats.dataEmpty`: `data` | A repeated terminology decision differed from `datos` elsewhere. Standardized to `datos`; counted once for the shared root cause, not three times. |

TALLY: Critical 1; Major 2; Minor 1; Micro 0.

RAW SCORE: `10 − 2.5 − (2 × 0.9) − 0.3 = 5.4`.

CAPS APPLIED: Any critical caps at 6.9; two majors cap at 7.9; a minor caps at 9.7. The lowest cap is 6.9, above the raw score.

FINAL BASELINE SCORE: **5.4/10** for this six-string sample.

JUSTIFICATION: The retained English subject and two grammatical constructions require correction, rather than optional stylistic substitution. The formula places this deliberately issue-selected sample in the poor band; no word-count adjustment or additional penalty was applied.

After correction, targeted re-reading found zero remaining critical, major, minor or micro issues in these six strings. The mechanical post-correction result is **10.0/10 for this sample only**: raw 10.0, no cap. This is not a 10/10 claim for the whole dictionary, a native-editor certification, or a production-readiness score. A full independent linguistic and rendered-interface review has not been completed.

Intentional borrowings and protected names listed above were left unchanged. No optional synonym swaps were applied merely to increase a score.

### Contextual source repairs

These are documented departures from incomplete English strings, not new product behavior. Existing source arguments remain intact. Only the following additional arguments are allowed by the quality tests:

| Key | Existing caller | Restored arguments / meaning |
| --- | --- | --- |
| `cal.massCancelChars` | `src/pages/Calendar.tsx` | `{count}`; the existing minimum of five characters is written as `lima` |
| `compSch.seriesSummaryHtml` | `src/pages/company/CompanyTvarkarastis.tsx` | `{fromDate}`, `{weekday}`, `{timeRange}` for the updated future series |
| `companyWait.inQueueSince` | `src/components/CompanyOrgWaitlistPanel.tsx` | `{date}`, replacing a displayed format stub |
| `studentWait.addedOn` | `src/pages/StudentWaitlist.tsx` | `{date}`, replacing a displayed format stub |
| `invoice.emailNote` | `src/components/SendInvoiceModal.tsx` | `{days}`; existing Lithuanian explanation of invoice emails and payment deadline |
| `em.payReminderTiming` | `api/send-email.ts` | `{hours}`, `{timing}` for the existing before/after-lesson deadline |

`em.payReminderDeadline` now labels a payment deadline rather than a second price. Its two incomplete reminder-body fragments now form complete unpaid-lesson sentences. `dash.invoice` and `invoice.invoiceTitle` now say `Invoice`, rather than the source's `d MMM` stub.

The six phone-copy exceptions are `onboard.parentPhoneFormat`, `onboard.phoneFormatError`, `register.phoneError`, `register.phoneHint`, `settings.phoneFormat` and `stu.phoneFormat`. They now request an international country code with the example `+63 917 123 4567`. Other numeric tokens and currency markers match the English source.

## Locale integration

- Added `fil` to the shared registry, language selector data, URL validation, lazy browser dictionary, server/email dictionary, SSR dictionary and support-language configuration.
- Added `fil-PH` formatting and a local date-fns locale, because the installed date-fns package has no Filipino locale. It includes month/day names, relative times and parsing; date/parse round trips were checked across all twelve months.
- Registration offers Philippines `+63` and selects it initially for Filipino. Existing international validation remains in place; other country codes still work. Lithuanian validation is unchanged.
- Lead-form validation and login theme matching now accept three-letter language codes. Consented `fil` quiz leads no longer fail the former two-letter format check.
- Filipino remains pending/noindex and excluded from sitemap, hreflang, IndexNow publication and new blog columns. Existing `.lt`/`.pl` market behavior remains unchanged.

The local migration `supabase/migrations/20260831234451_add_filipino_locale.sql` extends the preceding international-locale migration to 31 allowed `preferred_locale` values on profiles and organizations. It preserves all existing values and NULL, and changes no RLS policies, records, payment rules or currencies. It was applied to production project `cuhciqwmqfuajeeqjjbm` on 2026-08-31 and both installed checks accept `fil`. Authenticated save/reload QA remains pending; see [current release evidence](LOCALE_PRODUCTION_READINESS.md).

## Verification

- **254 tests passed across nine files**: Filipino dictionary quality, shared international locales, SEO visibility/rendering, quiz lead validation, Filipino payment-email previews, support locales, phone handling and the quiz flow regression suite.
- The dictionary checks cover all in-scope keys, nonempty copy, unchanged deferred values, parameters and the explicit restoration list, HTML, URLs, email addresses, numeric/currency tokens and line breaks.
- Email tests render both before-lesson and after-lesson reminders, verify the deadline, name escaping, payment URL and Filipino envelope, and assert that no email was sent.
- Frontend and API TypeScript checks passed: `npm run lint` and `npm run lint:api`.
- The production Vite/PWA build passed with an isolated temporary output directory; the project's `dist` was not replaced. Existing large-chunk, sourcemap and mixed-import warnings remain outside this change.
- An isolated in-memory PostgreSQL-compatible database verified that `fil` was rejected before the new migration and accepted afterward, all 31 valid values and NULL still worked, and an invalid value remained rejected on both tables. No remote database was contacted for this check.
- English and Lithuanian source hashes remained unchanged. Whitespace/diff checks passed.

Visual browser QA is **not verified**. The sandbox rejected a separate local preview server with `listen EPERM`; the existing server on port 3000 belonged to another app and was not changed. No browser screenshot, authenticated tutor/company journey, live payment or email delivery is claimed as tested.

## Release verdict and remaining work

**Additional proofreading recommended.** The concrete remaining risks are unreviewed native-language nuance across a large dictionary, long Filipino labels in mobile/calendar layouts, and the lack of authenticated workflow and recipient-language verification. Have a Filipino-speaking tutor/business operator review these flows in an approved preview before publication.

This change does not establish Philippine payment-provider onboarding or payouts, PHP pricing, tax/invoice compliance, local legal-policy coverage, school integrations, customer-support capacity or Asia/Manila time-zone behavior. Those require separate product and market checks. Existing euro/zloty prices, Lithuanian legal/business references and marketing assertions are preserved, not independently certified for the Philippines.

Keep Filipino unpublished until linguistic, operational and SEO/blog release requirements are satisfied. The locale is ready for local review; it is not declared ready for a Philippine commercial launch.
