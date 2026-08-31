# Greek localization review

Date: 2026-08-31. Language code: `el`. Formatting: `el-GR`. Country code: `GR`.

Status: local translation draft for individual tutors and tutoring businesses. Greek remains **unpublished**, with existing pending-locale SEO restrictions. No commit, deployment, database migration or external message was performed in this task.

## Scope

[`src/lib/i18n/el.ts`](../src/lib/i18n/el.ts) contains **5,051 explicit Greek overrides**, including all **493 onboarding questionnaire keys**. Coverage includes tutor/business navigation, calendars, availability, students, connected parent/student accounts, team permissions, messages, attendance, cancellation and rescheduling, lesson packages, payments, invoices, subscriptions, dictionary-based emails and push notifications, support, marketing and feature pages.

The remaining **522 keys** deliberately use English fallback:

| Prefix | Keys | Deferred scope |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school functionality |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full legal-policy bodies |

Shared company/school components and the questionnaire's school branch are translated where they belong to the common interface. This does not establish full Greek school-module support. The shared organization-tutor policy is translated as existing product copy, without changing its terms or asserting legal suitability for Greece.

Additional work outside the dictionary:

- All 72 public booking/interface labels, Greek short dates and the online-format label.
- Greek public-page editor copy, shared by individual tutors and businesses, including image/slug errors, publication controls and appearance settings. User-written biographies, names, languages and other page content remain untouched.
- Landing/pricing metadata, server-rendered navigation and public-page headings.
- Marketing demo family/location labels and the existing fictional social-proof copy. Identities, numbers, attribution and visibility flags were preserved; placeholder social proof remains disabled.
- Greek support follow-up text.
- Greece in the registration phone selector, the `+30` default and Greek examples. The existing international validator still accepts international numbers; this is not a new strict Greek number validator.

`el` was already registered in the browser loader, date library, email and SSR dictionaries. No `gr` language alias, new locale registration, payment market or database schema was introduced. Greek is left-to-right. Account time zones and payment currencies are unchanged.

## Applying the supplied guides

The supplied `translation-guide.md` and `translation-evaluation-protocol.md` from `noyellapp-main` informed terminology, fidelity, completeness and review. Their embedded instructions for a separate app or Word deliverable were not treated as additional user requests. No sub-agents were used.

Greek uses professional plural address: `Επιλέξτε`, `μπορείτε`, `ο λογαριασμός σας`. Wording follows the screen's purpose rather than literal English word order. Translation keys, interpolation parameters, HTML tags and attributes, URLs, email addresses and line breaks are preserved. All monetary values and other numeric source values are preserved, apart from seven explicitly identified legacy phone messages adapted to the existing international phone behavior.

| Concept | Greek wording |
| --- | --- |
| Individual tutor | ανεξάρτητος καθηγητής |
| Tutoring business | επιχείρηση ιδιαίτερων μαθημάτων |
| Organization | οργανισμός |
| Lesson / subject / topic | μάθημα / διδακτικό αντικείμενο / θέμα |
| Availability | διαθεσιμότητα |
| Free time / free of charge | διαθέσιμη ώρα / δωρεάν |
| Waitlist | λίστα αναμονής |
| Invoice / lesson package | τιμολόγιο / πακέτο μαθημάτων |
| Payment / tutor pay | πληρωμή / αμοιβή καθηγητή |
| Cancellation fee | χρέωση ακύρωσης |
| Refund / account credit | επιστροφή χρημάτων / πιστωτικό υπόλοιπο |
| Cancel / delete | ακύρωση / διαγραφή |
| Payer / guardian | πληρωτής / κηδεμόνας |

Review distinguishes meaning and functional defects from optional stylistic changes. For abbreviated or defective English source text, the Lithuanian dictionary and component usage provided context. English and Lithuanian dictionary content was not changed by this task.

Examples of substantive corrections:

| Keys / area | Finding and correction |
| --- | --- |
| `compSet.payDesc`, payment buttons | The same English `Pay` value served unrelated purposes. Buttons now say `Πληρωμή`; the business setting explains the difference between lesson price and tutor pay. |
| `compSch.confirmNoAvailability`, `confirmOutsideAvailability` | Replaced terse source labels with a clear warning and an explicit question about continuing. |
| `stuSched.mustPayDesc`, `mustPayOverdue`, `mustPayQueue` | Explained that unpaid lessons/invoices block further bookings or waitlist entry and how the user can pay. |
| `studentSettings.confirmDeleteMsg` | Restored a clear account-deletion question and irreversibility warning. |
| `em.payReminderBodyOther`, `em.payReminderBodySelf` | Completed incomplete source reminders so they actually state that the lesson remains unpaid, preserving parameters and markup. |
| `em.disputeNote`, role phrases | Removed a duplicated preposition/article when an interpolated Greek role phrase already includes them. |
| `dash.invoice`, `invoice.invoiceTitle` | Source contained `d MMM` although callers render an invoice label. Greek uses `Τιμολόγιο`. |
| `compSch.seriesSummaryHtml` | Source contained `HH:mm` in an explanatory email field. Greek describes the updated future lesson series. |
| Legacy phone messages | Removed Lithuania-only `+370` requirements where the code uses international validation. Greek examples use `+30`; no new payment or country restrictions were added. |
| Public-page editor | The previous locale fallback was Lithuanian. The shared editor now selects complete Greek interface copy for `el`. |

**No final 1–10 linguistic certification is assigned.** Author review and passing tests are not independent native-speaker proofreading of every rendered flow. A subsequent evaluator should follow the supplied protocol's issue deductions and severity caps and report both raw and capped scores. Key counts or successful tests must not be presented as a 10.0 quality score.

## Verification

- **152 tests passed across 9 files**, including Greek dictionary integrity, browser/email/SSR translation helpers, quiz audience choices and business-step navigation, registration's Greek phone defaults, the shared public-page editor, public booking labels, locale routes, phone behavior, existing quiz flows and SEO metadata.
- All 5,051 overrides match the expected scope; no source keys or interpolation variables were invented. All 493 questionnaire keys are explicitly covered.
- Whole-dictionary comparisons verify parameters, HTML tags/attributes, URLs, email addresses and line breaks. Numeric checks exempt only the seven documented phone messages; all remaining numeric values must match English.
- HTML interpolation escapes injected user content. Greek cancellation-fee and account-deletion meaning has focused assertions.
- `npm run lint` and `npm run lint:api` passed. The production build passed, using a separate temporary output directory to avoid interfering with other work. Existing chunk-size/source-map warnings remain.
- `git diff --check` passed for the edited tracked implementation files.
- React review: additions are static language dictionaries plus locale selection and a lazy initial phone default. No authentication, data-fetching, autosave, payment or permission logic was changed.

Visual browser QA was **not completed**: starting an isolated local server was blocked by local permissions, and the browser could not reach the existing local app. No permissions were expanded. The form and questionnaire checks above use rendered components with mocked services, not authenticated browser sessions.

No real accounts, payments, email sends, support enquiries, public-page publication or database writes were used for verification.

## Remaining release checks

1. Native Greek review of complete tutor, business, student and parent flows, especially grammar around names/counts and financial warnings. Review desktop/mobile wrapping, calendar navigation, error states, delivered emails and exports in a browser.
2. Keep legal/tax readiness separate. Full terms/privacy/DPA bodies remain English. Lithuanian entity types (`MB`, `UAB`, `IĮ`), invoice conventions, tax fields and example identities were not relabeled as Greek equivalents. Greek invoicing obligations, tax integrations and provider eligibility require separate assessment.
3. Resolve existing source-contract defects together across languages. `companyWait.inQueueSince` and `studentWait.addedOn` still contain date-format tokens instead of the date interpolation their callers supply. The Greek draft preserves that source contract rather than inventing parameters silently.
4. Audit residual hard-coded text, product artwork, public demo fixture content, PDFs, exports, third-party widgets and support-model responses. Translating interface labels does not translate user-authored content or existing demo biographies automatically.
5. Review existing marketing claims, pricing/trial text, language counts, guarantees and illustrative testimonials. They were translated, not verified or rewritten as Greek-market facts. Existing source inconsistencies need product review before publication.
6. Keep `el` in `PENDING_TRANSLATION_LOCALES` until approved release QA is complete. Pending marketing pages retain `noindex, follow`; Greek stays out of published sitemap/hreflang/IndexNow lists. Blog content still falls back to English. Validate the existing locale-preference migrations through the approved release process; this task did not apply them.

See [`INTERNATIONAL_LOCALES.md`](INTERNATIONAL_LOCALES.md) for registry and release behavior.
