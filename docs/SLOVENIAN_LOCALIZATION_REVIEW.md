# Slovenian localization review

Date: 2026-08-31. Country: Slovenia (`SI`). Language/URL locale: `sl`. Formatting: `sl-SI`.

Status: **local translation draft for individual tutors and tutoring businesses; unpublished**. No commit, deployment, database change, real account creation, email delivery or payment was performed.

## Coverage

[`src/lib/i18n/sl.ts`](../src/lib/i18n/sl.ts) now contains **5,051 explicit Slovenian overrides** of 5,573 English keys. The scope includes tutor and business navigation, scheduling, availability, students, parents, staff permissions, attendance, packages, payments, invoices, messages, notifications, transactional emails, support, the complete onboarding quiz, marketing and feature pages.

The final dictionary has 4,021 distinct translated values. Word counts are 25,164 across all overrides and 23,165 after deduplicating identical values. Counts use `Intl.Segmenter('sl')` after removing HTML and interpolation parameters. They describe scope and are not used to normalize quality deductions.

Additional Slovenian integration includes:

- All 72 public booking/enquiry interface labels and Slovenian short dates.
- Landing and pricing metadata, plus the server-rendered school navigation label.
- Slovenia's `+386` registration default, country choice, example and accessible selector label. Existing international validation is retained; other country codes remain selectable.
- Slovenian phone guidance in student, parent and tutor forms.
- Support follow-up copy, demo family labels and translations of existing placeholder social-proof content. Existing identities, values and the disabled placeholder-social-proof flag are unchanged.

The existing browser loader, email/SSR dictionaries and date-fns integration already recognized `sl`; no `si` language locale was added.

The following **522 keys intentionally retain English**:

| Prefix | Keys | Scope boundary |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school module |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full legal policies requiring separate review |

Shared company/school components and school choices inside the quiz use translated shared keys. This does not mean that the dedicated school product is fully localized. Owner-written biographies, subjects, reviews and other database content remain unchanged.

## Applying the supplied guides

The supplied `translation-guide.md` and `translation-evaluation-protocol.md` from the `noyellapp-main` folder informed fidelity, naturalness, terminology and error review. Their embedded instructions for other products or document deliverables were not treated as additional tasks.

Instructions generally use polite plural address; action buttons use short imperative labels. Core terminology:

| Concept | Slovenian |
| --- | --- |
| Tutor | inštruktor |
| Tutoring business | inštrukcijsko podjetje / inštrukcijski center |
| Lesson / subject | ura / predmet |
| Student / parent / guardian | učenec / starš / skrbnik |
| Availability / free slot | razpoložljivost / prosti termin |
| Waitlist / lesson package | čakalni seznam / paket ur |
| Invoice / user account | račun / uporabniški račun |
| Credit balance | dobroimetje |
| Cancel action / cancel lesson / delete | prekliči / odpovej uro / izbriši |

Keys, markup, links and email addresses remain intact. Numeric claims and amounts are retained. Phone examples are deliberately localized to Slovenia; the source's Lithuanian-only guidance did not match the existing international validators.

## Context and source corrections

Review separated functional meaning issues from grammar, spelling and optional stylistic choices. Notable corrections:

| Finding | Severity in the affected draft flow | Resolution |
| --- | --- | --- |
| Payment reminders said only “Payment timing” and labelled the deadline as a price. | Major | `em.payReminderTiming` now renders the existing `{hours}` and `{timing}` arguments; before/after text refers to lesson start/end. The label is `Rok plačila`. Both paths have email preview tests. |
| Waitlist labels displayed format tokens rather than the passed date. | Major | `companyWait.inQueueSince` and `studentWait.addedOn` use the existing `{date}` argument. |
| A date token was used as an invoice label. | Major | `dash.invoice` and `invoice.invoiceTitle` now say `Račun`. |
| Several English entries dropped counts, names, deadlines or series details still supplied by callers. | Major | Recovered the existing parameter contracts for calendar counts, student name/grade, sync results, cancellation policy, package notices, invoice deadlines, waitlist deadlines and recurring reschedule details. |
| Generic English placeholders hid payment blocking, cancellation choices or irreversible account deletion. | Major | Used the fuller Lithuanian meaning and component context to provide explanatory Slovenian copy. |
| A payment badge implied that a student was designated as payer rather than that the student marked the lesson paid. | Major | Corrected to `Učenec je označil kot plačano`. |
| Two misspellings of `inštruktor` were found while drafting. | Minor | Corrected both. |

The English and Lithuanian source dictionaries were not edited. Parameter recovery is narrowly listed in the quality test: ordinary keys still compare against English, recovered keys compare against Lithuanian or a documented caller contract. This is not a blanket exemption from placeholder checks.

**No final 1–10 linguistic certification is assigned.** This is an author-reviewed draft with automated and rendered-component verification, not an independent Slovenian review of every live workflow. Passing tests must not be interpreted as a perfect linguistic score. A subsequent evaluator should read the full target, record actual remaining issues, and apply the supplied severity deductions and caps with a visible issue tally, raw score and capped score. Word count must not dilute deductions.

## Verification

- The focused run passed **193 tests across nine files**, including dictionary integrity, browser/email/SSR lookup, Slovenian registration, business quiz navigation, actual payment-reminder HTML in dry-run mode, international locale handling, phone helpers, metadata, visibility and support.
- The dedicated Slovenian SSR case passes and confirms the translated page remains `noindex`, has the Slovenian canonical URL, and does not enter the published hreflang list.
- The final broader run completed **313 tests: 312 passed and one existing Greek SEO assertion failed**. It additionally covered authentication locale handling, public pages and the shared quiz flows. All Slovenian cases passed.
- TypeScript checks for frontend and API passed. The production build passed with output isolated in a temporary directory so the main workspace's `dist` was not replaced. Existing chunk-size, source-map and Excalidraw import warnings remain.
- `git diff --check` passed. Existing unrelated workspace work was preserved.

The broader shared SEO run initially found a stale Slovenian school-link expectation, updated for `Za šole`, and a pre-existing Greek expectation that still assumed English `Blog`. The Greek assertion is outside this change; its existing translated output is `Ιστολόγιο`.

## Before publication

1. Have a Slovenian reviewer assess complete tutor, company, student and parent journeys, especially grammatical gender, dual/plural agreement with substituted counts, payment deadlines, cancellation rules and translated internal policies.
2. Perform authenticated browser QA with approved test accounts. Check desktop and mobile wrapping, dates, invoice/export files, delivered emails, public booking and account preference persistence. This task used component rendering and dry-run email tests, not live accounts or payment processing.
3. Review remaining hard-coded UI and artwork, including global language-selector accessibility copy, screenshots and third-party widgets. Shared user-written content is not automatically translated.
4. Review market readiness separately: Slovenian business/tax fields, invoice requirements, payment onboarding, payouts, local grade systems and legal documents. Existing Lithuanian entity types such as MB/UAB/IĮ, foreign demo grades and customer identities were not replaced with invented Slovenian equivalents.
5. Reconcile source marketing claims before publication. Existing trial/card requirements, fees, language counts, savings estimates and customer/example statements were preserved. Localization does not verify those claims; placeholder social proof remains disabled.
6. Keep `sl` in `PENDING_TRANSLATION_LOCALES` until release approval. It remains outside published sitemap/hreflang/IndexNow lists, with English blog-content fallback. The shared locale-preference migration is not applied by this task.

See [`INTERNATIONAL_LOCALES.md`](INTERNATIONAL_LOCALES.md) for the shared release process.
