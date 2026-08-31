# European Portuguese localization review

Date: 2026-08-31. Locale: `pt`; regional formatting: `pt-PT` (Portugal).

**Status: local translation draft for individual tutors and tutoring businesses.** PT remains unpublished for search indexing. Native-language proofreading and visual workflow QA are still required. This task did not commit, deploy, apply migrations, send messages, create accounts or process payments. Brazilian Portuguese (`pt-br`) remains separate.

## Coverage

[`src/lib/i18n/pt.ts`](../src/lib/i18n/pt.ts) provides **5,051 explicit overrides** of 5,573 English keys, including **all 493 onboarding quiz entries**. It covers tutor/business navigation, calendars, availability, students, staff and permissions, attendance, packages, payments, invoices, messages, support, email/push copy, marketing and feature pages. Connected student and parent flows are included.

The dictionary has 4,020 distinct target values and approximately 29,580 words across the overrides (27,302 after deduplicating values). Counts use Portuguese word segmentation with HTML and interpolation parameters removed. They describe the volume; they are not a scaling factor for quality scores.

Other localized surfaces:

- All 72 public booking-page labels and Portuguese short-date formatting.
- All 66 public-page editor labels, messages, hints and appearance options, for both tutors and businesses. PT previously fell back to Lithuanian in this editor.
- Nine server-rendered public-page labels, landing/pricing metadata, school navigation text and support follow-up copy.
- Landing demo family/city labels and existing illustrative social-proof copy. Names, organizations, phone numbers and numerical claims remain unchanged in meaning. The fictional social-proof visibility flag remains disabled.
- Portuguese phone examples (`+351 912 345 678`) and the initial `+351` selection on registration. International validation is unchanged and continues to accept other countries' numbers.

The remaining **522 keys intentionally retain English fallback**:

| Prefix | Keys | Deferred scope |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school module |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full legal-policy bodies |

School references inside shared company components and the common quiz are translated; this is not complete school-module localization. Tutor internal rules are translated without adapting the policy to Portuguese law. User-authored biographies, lesson descriptions, names, reviews, blog content and text embedded in artwork are not automatically translated. External widgets and generated documents need separate review.

## Supplied guides and editorial choices

The supplied `translation-guide.md` and `translation-evaluation-protocol.md` from `noyellapp-main` were used for fidelity, terminology, proofreading and evaluation criteria. Their embedded Word-document workflow was not treated as an additional deliverable: the requested deliverable here is Tutlio localization, including Tutlio's quiz.

The existing Brazilian Portuguese draft was used as a starting point, then adapted for European Portuguese against the English source, Lithuanian context and component usage. This included systematic terminology changes and targeted full-sentence corrections; it is not an independent native-speaker review of every string. English and Lithuanian dictionaries were left unchanged.

The tone is direct and professional, normally omitting the subject pronoun and using standard European Portuguese constructions. Natural shared Portuguese wording was retained instead of rewriting it for stylistic novelty.

| Concept | Preferred European Portuguese |
| --- | --- |
| Tutor / individual tutor | explicador / explicador independente |
| Tutoring business | centro de explicações / empresa de explicações, according to context |
| Lesson / subject | aula / disciplina |
| Parent or guardian | encarregado de educação |
| School grade | ano escolar; recurring lesson and invoice series remain `série` |
| Subscription / signature | subscrição / assinatura |
| Password / file / mobile phone / screen | palavra-passe / ficheiro / telemóvel / ecrã |
| Register / save / manage / delete | registar / guardar / gerir / eliminar |
| Invoice / refund / credit | fatura / reembolso / crédito |
| Settings / team / share | definições / equipa / partilhar |

Keys, HTML tags and attributes, URLs, email addresses, line breaks and currency tokens are preserved. Decimal commas and ordinal punctuation follow Portuguese conventions without changing numeric values. Existing names and factual marketing claims are not replaced with invented Portuguese customers or new promises.

Six phone-guidance strings remove the source's LT-only `+370` instruction because the corresponding non-LT interfaces already validate international numbers: `onboard.parentPhoneFormat`, `onboard.phoneFormatError`, `register.phoneError`, `register.phoneHint`, `settings.phoneFormat`, `stu.phoneFormat`. The Portuguese copy explains the country-code requirement. These six documented cases are the only numeric-integrity exceptions.

## Review findings and corrections

Required corrections were distinguished from optional preferences using the supplied Critical/Major/Minor/Micro taxonomy. Source defects are recorded separately from errors introduced while adapting the Portuguese draft.

| Location | Required correction | Result |
| --- | --- | --- |
| Calendar, student and pricing grade fields | Brazilian `série` labels were unsuitable for Portuguese school years. | Uses `ano escolar`, including `10.º ano`; invoice and recurring series are unchanged. |
| Subscription settings and enterprise welcome email | `assinatura` could be confused with signing a document. | Uses `subscrição`; contract and email signatures retain `assinatura`. |
| App, feature and invoice wording | Regional terminology changes exposed grammatical agreement problems. | Corrected complete sentences, including `aplicação web progressiva`, feminine feature agreement and `fatura paga`. |
| `chat.you`, `orgTeam.you` | Removing an unnecessary subject pronoun also removed standalone self labels. | Restored explicit `Eu` labels; nonempty-value checks cover the entire scope. |
| `compSet.payDesc`, `stuSched.creditWillApply` | Sentence capitalization and payment explanations needed checking after adaptation. | Clear company-margin wording and the distinction between credit and the remaining amount. |
| Account deletion and cancellation messages | Abbreviated source labels do not fully state the consequences. | Retains the Lithuanian-supported irreversible-deletion warning and late-cancellation/payment obligations. |
| `dash.invoice`, `invoice.invoiceTitle` | Source used a date-format token in an invoice-label position. | `Fatura`. |
| Payment reminder body/deadline labels | Abbreviated English did not fully explain an unpaid lesson or deadline. | Explicit unpaid-lesson wording and `Prazo de pagamento`. |

Seven PT strings restore parameters that existing callers already supply but the abbreviated English source omits. No shared source dictionary or runtime behavior was changed:

| Key | Restored parameters | Existing caller |
| --- | --- | --- |
| `cal.massCancelChars` | `{count}` | `Calendar.tsx` |
| `compSch.seriesSummaryHtml` | `{fromDate}`, `{weekday}`, `{timeRange}` | `CompanyTvarkarastis.tsx` |
| `compStu.cancellationInfo` | `{hours}`, `{percent}` | `CompanyStudents.tsx` |
| `companyWait.inQueueSince` | `{date}` | `CompanyOrgWaitlistPanel.tsx` |
| `em.payReminderTiming` | `{hours}`, `{timing}` | `api/send-email.ts` |
| `invoice.emailNote` | `{days}` | `SendInvoiceModal.tsx` |
| `studentWait.addedOn` | `{date}` | `StudentWaitlist.tsx` |

The quality suite allows only these exact parameter restorations and verifies rendered examples. Before/after lesson reminders remain distinct (`24 h antes da aula` versus `2 h depois da aula`). HTML escaping of interpolated user content remains intact.

**Initial and final whole-dictionary linguistic scores: not assigned.** Automated integrity checks and this author review do not constitute a full, independently scored linguistic evaluation. A subsequent full evaluation should enumerate outstanding issues, tally severity, apply the protocol's deductions and severity caps, and avoid normalizing the score by word count. Passing tests is not a 10/10 language rating.

## Verification

- All 16 PT quality tests pass. They check complete scope/quiz coverage, nonempty strings, source integrity, browser/email/SSR dictionary loading, interpolation, escaping, payment and cancellation distinctions, regional terminology, public booking labels, phone examples, date formatting and unpublished status.
- The wider 13-file run recorded 325 passing tests and one unrelated failure: `tests/lib/seo-visibility.test.ts` has a language-code allowlist missing newly registered Hebrew/Ukrainian codes. The PT entry is already present. This task leaves other locale work untouched.
- `npm run lint:api` passes. The frontend `npm run lint` is blocked by a duplicate `+380` property in the shared registration phone-example map (`Register.tsx`), unrelated to the PT `+351` default.
- A Vite/PWA production build to `/private/tmp/tutlio-pt-build` passes, with existing source-map/chunk-size warnings and the duplicate-key warning. Building into a temporary directory avoids replacing the shared project's `dist` output.
- The 66 public-editor strings have matching source key structure and numeric values. The React review found no new effects, fetches, dependency changes or render-state changes: the component edits add static copy selection and the PT registration default.
- `git diff --check` passes for the affected tracked files. The PT dictionary also parses and loads successfully in the test and build paths.
- No authenticated browser, mobile layout, live payment, email-delivery or export verification was performed. Existing quiz page tests use mocks and are not a Portuguese end-to-end run.

## Release follow-up

1. Complete native European Portuguese proofreading and visual QA for tutor, business, student and parent flows, especially narrow tables/dialogs, concatenated labels, plural forms, emails and exports.
2. Verify payments, credits/refunds, cancellation deadlines, account deletion, enrolment and invitation flows in context. This translation does not change currencies, prices, payment eligibility or time zones.
3. Review Portugal-specific business, tax and policy readiness separately. The label `fatura` does not establish certified Portuguese invoicing, tax reporting or compliance. Full legal policies remain English.
4. Validate existing marketing statements, trial/card rules, fee descriptions, language counts and quoted statistics. Translation preserves their meaning; it does not verify the underlying claims. Do not enable fictional testimonials as customer evidence.
5. Repair shared English source contracts and other affected dictionaries in a separate focused task; PT's seven documented restorations do not repair those locales.
6. Resolve the shared typecheck/SEO-test failures before release. They arose in other ongoing locale changes and were not modified here.
7. Keep PT in `PENDING_TRANSLATION_LOCALES` until release review. It remains excluded from published sitemap/hreflang/IndexNow lists, pending marketing pages remain noindex, and blog content retains English fallback. Locale-preference persistence still depends on the existing prepared migrations being applied through the approved release process; this task did not apply them.

See [international locale documentation](INTERNATIONAL_LOCALES.md) for registry and release details.
