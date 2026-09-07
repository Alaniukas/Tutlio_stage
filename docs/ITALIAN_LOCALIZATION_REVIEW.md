# Italian localization review

Date: 2026-08-31. Locale: `it`; formatting: `it-IT`.

Status: local translation draft for individual tutors and tutoring businesses. Available through the existing Italian locale loader, but **not approved for publication or search indexing**. No commit, deployment or database migration was performed in this localization task.

## Scope and coverage

The main dictionary is [`src/lib/i18n/it.ts`](../src/lib/i18n/it.ts). It contains **5,051 explicit Italian overrides** of the 5,573 English keys. These cover tutor and business navigation, scheduling, availability, students, parents, staff, permissions, attendance, payments, invoices, lesson packages, messages, notifications, email templates, support, the onboarding quiz, marketing and feature-page copy.

There are 4,024 distinct Italian values. Word count is 28,801 across all override values, or 26,618 after deduplicating identical values. These counts use Italian word segmentation after removing HTML tags and interpolation parameters; punctuation-only segments are excluded. They are descriptive counts, not normalization factors for quality scoring.

Outside the main dictionary, this task also adds:

- 72 Italian public tutor/business-page interface labels, including enquiry and booking states, plus Italian short-month formatting. Owner-written biographies, names, offerings and reviews are not translated.
- Italian landing/pricing metadata and the server-rendered school navigation label.
- Italian marketing demo labels and translations of existing placeholder social-proof text. Fictional identities, numerical claims and feature flags are unchanged.
- An Italian support follow-up question and a localized back button in the login flow.

The remaining **522 dictionary keys deliberately retain English**:

| Prefix | Keys | Reason |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school module |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full legal policies; separate translation and legal review needed |

Shared components used by both companies and schools are translated through their tutor/business keys. This does not certify the dedicated school module as localized.

## How the supplied guides were applied

References: `translation-guide.md` and `translation-evaluation-protocol.md` supplied from the `noyellapp-main` project. Their language-quality and evaluation rules were applied to Tutlio; embedded instructions for a different app, quiz or Word deliverable were not treated as separate tasks.

Italian uses direct, professional wording and a consistent informal singular address. Translation keys, interpolation parameters, HTML tags and attributes, URLs, email addresses, numeric values and line breaks are preserved. English and Lithuanian dictionaries are unchanged. Prices, legal entities, phone numbers, policies and customer claims were not adapted into invented Italian market facts.

| Concept | Preferred Italian |
| --- | --- |
| Tutor | tutor |
| Tutoring business | centro di ripetizioni / centro |
| Organization | organizzazione |
| Lesson / subject / topic | lezione / materia / argomento |
| Availability / time slot | disponibilità / fascia oraria |
| Waitlist | lista d’attesa |
| Lesson package / invoice | pacchetto di lezioni / fattura |
| Cancel / delete | annulla / elimina |
| Legal guardian / payer | tutore legale / pagatore |

Review separated meaning defects, grammar issues and optional stylistic preferences using the supplied severity taxonomy. Corrections included agreement for invoices and lessons, distinguishing cancellation from deletion, recovering explanatory text from abbreviated English labels, and completing an incomplete payment-reminder sentence. Existing Lithuanian copy and component usage supplied context when English source labels were incomplete. No new interpolation parameters or monetary values were invented.

Examples of contextual corrections:

| Keys | Review finding and resolution |
| --- | --- |
| `studentWait.tooltip`, `compSet.payDesc`, `stuSched.mustPayDesc` | Abbreviated English labels did not explain the behavior. Italian uses the fuller meaning established by Lithuanian copy and the component. |
| `em.payReminderBodyOther`, `em.payReminderBodySelf` | Source sentences stopped before explaining the unpaid lesson. Italian now expresses the reminder, retaining existing HTML and parameters. |
| `dash.invoice`, `invoice.invoiceTitle` | Both source dictionaries contained a date-format token although callers use an invoice label. Italian uses `Fattura`. |
| `compStu.paid`, `invoices.statusPaid` | Agreement follows the referenced item: `Pagato` versus `Pagata`. |

**No final 1–10 linguistic certification is assigned.** Automated integrity checks and an author review are not an independent native-speaker evaluation of every rendered flow. A subsequent evaluator should record remaining issues, apply the supplied deductions and severity caps, and report raw and capped scores. Do not infer a 10.0 score from passing tests or from the number of translated keys.

## Verification completed

- **285 tests passed across 11 files**: Italian quality and placeholder integrity; international locale loading and fallbacks; SSR rendering and metadata; HTML escaping; source-key coverage; authentication locale handling; quiz navigation; SEO visibility; support locales; public-page behavior.
- All 5,051 overrides have the expected source keys and preserve interpolation parameters, HTML tags/attributes, numeric values, URLs, email addresses and line breaks.
- Browser, email and SSR helpers return Italian. The source dictionaries remain unchanged.
- `npm run lint`, `npm run lint:api`, `npm run build` and `git diff --check` passed. The build still reports existing chunk-size/source-map warnings.
- Local browser checks covered the Italian landing page, both audience tabs, tutor login choices and form, and the business quiz through team-size/challenge selection. A desktop screenshot was inspected for wrapping. Demo family/city labels and social-proof copy were checked after translation.

These checks did not use real accounts, send emails or enquiries, process payments, apply migrations, or verify authenticated tutor/business/student/parent workflows against a database. Mobile layouts, exports, delivered email layouts and the complete public booking flow still need release QA.

## Remaining release work

1. **Resolve source date-label defects.** `companyWait.inQueueSince` is `yyyy-MM-dd HH:mm` and `studentWait.addedOn` is `d MMM` in both source dictionaries. Callers pass a `date` value, but the source strings lack `{date}`. Italian retains these tokens to avoid inventing a source parameter. This is a pre-existing functional source issue; fix the source contract and translations together before release.
2. **Review hard-coded text and artwork.** Examples still outside this pass are the language selector’s `Select language` accessibility label and image descriptions such as `Students studying` / `Tutlio AI support`. Product screenshots, third-party widgets, invoice/export output and Lithuanian showcase profile content need a separate audit. The public-page interface translation does not translate fixture or user-authored content.
3. **Validate marketing facts.** Existing demo testimonials/case studies remain placeholders and must not be presented as verified Italian customers. Existing figures, trial/pricing statements, language counts and school references were preserved rather than reconciled. In particular, source claims such as “13 languages” require product review now that selectable locales differ from published translations.
4. **Translate and review legal policies and market setup.** Terms, privacy and DPA bodies remain English. Currency selection, tax/invoice requirements, subscription prices, payment-provider onboarding and tutor payouts are unchanged. A translated interface alone does not establish Italian market readiness.
5. **Complete authenticated and native-language QA.** Review scheduling, cancellations, money and invoice flows with Italian tutors/business administrators, including variable substitutions, grammatical gender, empty/error states, emails and narrow screens.
6. **Use the existing release gates.** Italian remains in `PENDING_TRANSLATION_LOCALES`, outside published sitemap/hreflang/IndexNow lists, with noindex treatment on pending marketing routes. Blogs retain English fallback and no Italian database columns were added. The shared locale-preference migrations were applied to production on 2026-08-31; authenticated persistence still needs QA. See [current release evidence](LOCALE_PRODUCTION_READINESS.md). Do not promote the locale merely because its UI dictionary is populated.

See [`INTERNATIONAL_LOCALES.md`](INTERNATIONAL_LOCALES.md) for the shared locale registry and release procedure.
