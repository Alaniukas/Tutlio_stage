# Mexican Spanish localization review

Date: 2026-08-31. Locale: `es-mx`; formatting tag: `es-MX`.

Status: **local translation draft for individual tutors and tutoring businesses**. The existing browser, email and server-rendering loaders now receive Mexican Spanish copy. This task does not publish the locale, apply a database migration, commit, deploy, or establish Mexico-specific payment or tax support.

## Coverage

[`src/lib/i18n/es-mx.ts`](../src/lib/i18n/es-mx.ts) contains **5,051 explicit translated overrides** of the 5,573 English keys, including all **493 onboarding-quiz keys**. Scope includes tutor and business navigation, schedules, availability, students, parents, staff and permissions, payments, invoices, packages, messages, notifications, transactional emails, support, marketing and feature pages. The quiz's school branch is translated because it is reachable within the same public questionnaire; this does not localize the separate school product.

The dictionary contains 4,076 distinct values and 28,802 words across all overrides, or 26,743 after deduplicating identical values. Counts use Spanish word segmentation after removing HTML tags and interpolation parameters. They describe the reviewed artifact; they do not normalize quality deductions.

This is an independent dictionary with English fallback, not a runtime substitution of the Spain Spanish dictionary. English, Lithuanian, Spain Spanish, Italian and other locale dictionaries were not edited by this task.

Additional localized surfaces:

- 72 public booking/enquiry interface labels, plus short-date formatting and nine public-page server labels. Names, biographies, reviews and other user-authored page content are not translated.
- Landing and pricing metadata, the server-rendered school navigation label, and the default support follow-up question.
- Marketing demo family/city labels and the text of existing placeholder case studies/testimonials. Identities, photos, numerical claims and the disabled placeholder-social-proof flag are preserved.
- A Mexican phone placeholder and `+52` as the initial registration dialing code for `es-mx`. Users can still select another code. Existing validation rules are unchanged.

The remaining **522 keys keep English fallback**:

| Prefix | Keys | Reason |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school module |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full policy bodies require a separate translation and legal review |

Shared company/school component keys and organization-tutor rules are translated where they belong to the business flow. This is a translation of existing text, not legal validation of those rules.

## Use of the supplied guides

The supplied `translation-guide.md` and `translation-evaluation-protocol.md` come from the `noyellapp-main` project. Their meaning-preservation, technical-token, minimal-correction and severity rules were applied to Tutlio. Embedded instructions about another product or a Word deliverable were not treated as separate user requests.

The style uses professional Mexican Spanish, formal singular **usted**, and concise action labels, usually infinitives. Example glossary:

| Concept | Mexican Spanish |
| --- | --- |
| Tutor / independent tutor | profesor / profesor particular independiente |
| Tutoring business | empresa o centro de clases particulares |
| Student / school grade | alumno / grado escolar |
| Subject / topic | materia / tema, according to the actual field |
| Lesson / availability / time slot | clase / disponibilidad / horario |
| Waitlist | lista de espera |
| Lesson package / invoice | paquete de clases / factura |
| Cancel / delete | cancelar / eliminar |
| Legal guardian | tutor legal |
| Cost / computer / mobile phone | costo / computadora / celular |

The starting point was the existing Spanish dictionary, checked against English. Lithuanian copy and component usage supplied context when the English source was abbreviated or defective. Review combined automated integrity checks with author review of flagged strings, regional terms, onboarding, public copy, cancellation/payment statements and source omissions. It was not an independent native-speaker review of every rendered flow.

Selected resolved findings, using the supplied taxonomy:

| Keys / area | Severity | Correction |
| --- | --- | --- |
| All 493 `quiz.*` keys | Critical | The Spanish baseline omitted the entire quiz; added Mexican Spanish for every source key. |
| `settings.monthlyPlan` | Critical | The key name is misleading: English says annual billing at €14.99/month. Corrected the Spanish monthly label to `Anual (€14.99/mes)`. |
| Trial/cancellation and enterprise FAQ copy | Critical | Restored omitted cancellation availability, continued access, dedicated support and source qualifications. |
| Example email addresses and names | Critical | Restored the actual English-source examples instead of inventing localized identities or changing technical addresses. |
| Labels containing `AÃ±adir` | Minor | Removed broken character encoding and used Mexican `Agregar`. |
| Mixed informal/formal instructions | Major where jarring | Changed remaining direct informal instructions to the chosen formal address; normal third-person verbs and natural quoted conversation are not treated as register defects. |
| Regional vocabulary and grade labels | Minor | Used `materia`, `costo`, `computadora` and `grado`; preserved the source grade ranges rather than inventing Mexican education-level mappings. |

These are grouped examples of corrected findings, not an exhaustive scored issue tally. **No final 1–10 linguistic certification is assigned.** Passing integrity tests does not imply 10.0. A final evaluator should review the complete source and target, list each remaining issue once, apply the guide's deductions without word-count scaling, and report both raw and severity-capped scores.

## Deliberate source corrections and preserved contracts

Interpolation parameters, HTML tags and attributes, URLs, email addresses, line breaks, currency symbols/codes and numeric values are preserved, with one documented class of numeric exception: six phone messages incorrectly required Lithuanian `+370` numbers despite calling the existing international validator for non-Lithuanian locales.

Those six keys are `onboard.parentPhoneFormat`, `onboard.phoneFormatError`, `register.phoneError`, `register.phoneHint`, `settings.phoneFormat` and `stu.phoneFormat`. They now request an international country code beginning with `+`, without claiming that only Mexico is supported. `compStu.phoneFormat` and `studentSettings.phoneFormatError` also receive useful international guidance. Source dictionaries and validators are unchanged. The localized placeholder and registration default use Mexico's already-supported dialing code.

Other contextual corrections:

- `studentWait.tooltip`, `compSet.payDesc`, `stuSched.mustPayDesc` and `compSch.confirmNoAvailability` use the fuller meaning established by Lithuanian text and their callers, instead of literal labels such as “Tooltip,” “Pay” or “Must pay.”
- `em.payReminderBodyOther` and `em.payReminderBodySelf` complete source fragments to explain that a lesson remains unpaid. Existing HTML and interpolation parameters are unchanged.
- `dash.invoice` and `invoice.invoiceTitle` use `Factura`: their callers require invoice labels, although the sources contain a date-format token.
- `companyWait.inQueueSince` and `studentWait.addedOn` still retain the source tokens `yyyy-MM-dd HH:mm` and `d MMM`. Their callers pass `date`, but the source strings lack `{date}`. Fix that shared source contract and the translations together before release; this task does not silently add a parameter.

Currency amounts, fee percentages, billing periods, cancellation deadlines, legal entities and contact details have not been converted into Mexican market facts. EUR/PLN behavior, Stripe/Connect eligibility, payouts, time zones and tax logic remain unchanged. Translating “invoice” as `factura` does **not** provide SAT/CFDI support or certify the existing invoices for use in Mexico.

## Verification and remaining release work

Automated checks cover source-key completeness, the entire quiz, placeholders, HTML escaping, numeric/currency integrity, corrected phone guidance, browser/email/SSR dictionary agreement, public booking copy and dates, existing locale behavior, SEO noindex, metadata, support and quiz navigation. See [`tests/lib/i18n-es-mx-quality.test.ts`](../tests/lib/i18n-es-mx-quality.test.ts).

The regression run passed 295 tests across 12 files. Frontend and API TypeScript checks and the production build passed; the build continues to report chunk-size/source-map warnings. No live accounts, emails, enquiries or payments were used.

Browser verification was attempted but **not completed**: the sandbox blocked starting a local preview server on the loopback interface. No additional permissions were requested and no other task's server or browser tab was changed. This draft still needs visual checks for wrapping and mobile layouts, plus authenticated tutor/business/student/parent workflows, delivered emails, exports and complete public booking.

Before release:

1. Complete native Mexican Spanish review of the full source/target and the rendered critical flows. Review variables, grammatical agreement and narrow layouts in context.
2. Resolve the shared source date-label defects above. Audit hard-coded interface text, accessibility labels, image text, third-party widgets, invoice/export output and user-authored showcase content. Existing examples include registration's `Country code` and the language selector's `Select language` accessibility labels.
3. Validate source marketing and product claims. Demo testimonials are placeholders, not verified Mexican customers. Existing assertions about language counts, guarantees, recurring payments, waitlists and notifications were translated, not independently verified or approved for the Mexican market.
4. Translate/review policy bodies and complete Mexico-specific business readiness, including actual payment onboarding and invoicing requirements. This localization adds neither MXN pricing nor SAT/CFDI integration.
5. Keep existing release gates. `es-mx` remains in `PENDING_TRANSLATION_LOCALES`, excluded from published sitemap/hreflang/IndexNow lists, with noindex treatment on pending marketing routes. Blogs retain English fallback. The shared locale-preference migrations were applied to production on 2026-08-31; authenticated persistence still needs QA. See [current release evidence](LOCALE_PRODUCTION_READINESS.md).

See [`INTERNATIONAL_LOCALES.md`](INTERNATIONAL_LOCALES.md) for the shared registry and release procedure.
