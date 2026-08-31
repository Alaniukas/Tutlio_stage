# Romanian localization review

Date: 2026-08-31. Locale: `ro`; formatting: `ro-RO`.

Status: local translation draft for individual tutors and tutoring businesses. The existing browser, email and SSR loaders use the Romanian dictionary. **Romanian remains unpublished and is not approved for indexing or a production launch.** No commit, deployment or database migration was performed for this task.

## Scope

[`src/lib/i18n/ro.ts`](../src/lib/i18n/ro.ts) contains **5,051 explicit Romanian overrides** out of 5,573 English keys. Coverage includes tutor and business navigation, scheduling, availability, students, parents, staff, permissions, attendance, payments, invoices, lesson packages, messaging, notifications, 410 email entries, all 493 onboarding-quiz entries, support, marketing and feature-page copy.

Outside the dictionary, the draft adds:

- All 72 public tutor/business-page interface labels and Romanian short dates. User-written biographies, offerings, names and reviews remain user content.
- Romanian landing/pricing metadata, the SSR school-navigation label and the support follow-up question.
- Romanian demo family/city labels and translations of existing placeholder social-proof text. Identities, figures, images and the disabled placeholder-social-proof flag remain unchanged; these are not Romanian customer endorsements.
- Romania (`+40`) in registration, a Romanian default country prefix and phone examples. The existing international validator remains unchanged and still accepts other countries' international numbers.

The remaining **522 dictionary keys deliberately retain English**:

| Prefix | Keys | Scope left for separate work |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school module |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full legal policies |

Shared company/school components and school choices within the onboarding quiz are translated through shared keys. This does not mean the dedicated school product is fully localized.

## Applying the supplied guides

References: `translation-guide.md` and `translation-evaluation-protocol.md`, supplied from the `noyellapp-main` project. Their meaning-preservation, natural-language, consistency and severity rules were applied to Tutlio. Embedded directions about another app or a Word-document deliverable were not treated as additional user requests.

Romanian uses a direct, professional singular `tu` voice. The English and Lithuanian dictionaries were not edited by this task. Keys, interpolation parameters, HTML tags and attributes, URLs, email addresses and line breaks are preserved. Monetary values, percentages, deadlines and other numerical contracts are unchanged. The only deliberate numerical adaptations are nine phone-instruction/example keys: the source's Lithuania-only wording contradicts the actual international validator, so Romanian uses `+40` examples without restricting users to Romania.

| Concept | Preferred Romanian |
| --- | --- |
| Tutor | profesor; profesor particular where context needs it |
| Tutoring company / agency | centru de meditații / centru |
| Organization | organizație |
| Lesson / subject / topic | lecție / materie / subiect |
| Availability / time slot | disponibilitate / interval |
| Waitlist | listă de așteptare |
| Lesson package | pachet de lecții |
| Invoice / payer | factură / plătitor |
| Legal guardian | reprezentant legal |
| Cancel / delete | anulează / șterge |
| No-show | nu s-a prezentat / absență |

The author review distinguished meaning defects from grammar issues and optional stylistic preferences. Specific corrections included:

| Keys | Finding and resolution |
| --- | --- |
| `compSch.confirmNoAvailability`, `studentSettings.confirmDeleteMsg` | Replaced abbreviated source labels with real confirmation questions, including the deletion warning. |
| `compSet.payDesc`, `orgFinance.summaryNote` | Explained the earnings calculation using Lithuanian source context and component usage; did not change its financial behavior. |
| `stuSched.mustPayDesc` | Explained that unpaid lessons or an overdue monthly invoice block new bookings and waitlist entries. |
| `cal.massCancelEmailNote`, `cal.massCancelNote` | Explained individual cancellation emails and the existing bulk-cancellation exception. |
| `em.payReminderBodyOther`, `em.payReminderBodySelf` | Completed source fragments into unpaid-lesson reminders after checking that the email caller does not append a missing sentence fragment. |
| `dash.invoice`, `invoice.invoiceTitle` | Replaced erroneous source date-format tokens with `Factură`, as required by their label usage. |
| `compStu.paid`, `invoices.statusPaid` | Used context-appropriate agreement: `Achitat` versus `Achitată`. |
| Phone validation messages | Removed false Lithuania-only restrictions; added Romanian examples consistent with existing international validation. |

**No final numerical linguistic certification is assigned.** Automated integrity tests and an author review do not constitute an independent native-speaker review of every rendered flow. The next evaluator should log concrete remaining defects and apply the supplied critical/major/minor/micro deductions and severity caps, reporting both the raw and capped score. Passing tests does not imply a 10.0 score.

## Verification

- **275 tests passed across 10 files** in the final regression run: Romanian coverage and integrity, browser/email/SSR dictionary consistency, international locale loading and preference round trips, source-key coverage, HTML escaping, public-page behavior, phone validation, support, auth locale handling, and quiz logic/components.
- The targeted Romanian SSR/noindex test also passed after updating its school-link expectation for the new translation.
- `npm run lint:api` passed.
- `npm run build -- --outDir /private/tmp/tutlio-ro-build` passed. Build output was isolated from the main task's `dist` directory. Existing chunk-size, source-map and duplicate-key warnings were reported.
- `git diff --check` passed during verification.
- `npm run lint` was blocked by a pre-existing duplicate `+380` key in `src/pages/Register.tsx`'s phone-example map. The duplicate was present before the Romanian edits and was left untouched to avoid modifying another locale's concurrent work.
- The broader SEO run also exposed unrelated Hong Kong failures: the hard-coded language-code allowlist and an English blog-link expectation. These do not involve Romanian and were left for the main task.

**Visual QA was not completed.** The existing server on port 3000 belonged to another app; its temporary tab was closed without interacting with the page. Starting an isolated Tutlio preview on port 4178 was denied by the local sandbox. No escalation, server replacement or browser workaround was attempted. No authenticated accounts were used, no messages or enquiries were sent, and no payments were processed.

## Remaining release work

1. **Native-language and visual review.** Check complete tutor/business/student/parent journeys, narrow layouts, dialogs, variable substitutions, singular/plural forms, invoice/export output and delivered email layouts with Romanian speakers. The dictionary checks do not verify every rendered state or third-party widget.
2. **Repair existing source contracts.** `companyWait.inQueueSince` remains `yyyy-MM-dd HH:mm` and `studentWait.addedOn` remains `d MMM`: their callers supply a date, but the source has no `{date}` placeholder. `cal.massCancelChars` likewise lacks the caller's `{count}` parameter, and English `invoice.emailNote` lacks the deadline parameter present in Lithuanian. These should be fixed across source dictionaries and locales together; this draft does not invent missing parameters.
3. **Audit hard-coded content.** Language-selector accessibility labels, artwork, product screenshots, export output, third-party components and showcase profiles may still contain English or Lithuanian. Public-page interface translation does not translate owner content.
4. **Validate existing product claims.** Language counts, trial/refund promises, fees, automation claims, numerical estimates and illustrative testimonials were translated from existing copy, not independently substantiated or reconciled. Do not treat them as newly verified Romanian market claims. Internal tutor-rule copy also needs product/legal review against actual payment settings.
5. **Prepare the Romanian market separately.** Currencies, subscription prices, Stripe/Connect eligibility, payouts, accounting requirements, tax treatment and legal policies are unchanged. Lithuanian MB/UAB/IĮ forms are described as their existing forms, not replaced with purported Romanian legal equivalents. A translated interface and a `+40` phone option do not establish Romanian billing or regulatory readiness.
6. **Retain publication gates.** `ro` remains in `PENDING_TRANSLATION_LOCALES`, with pending marketing pages set to `noindex` and excluded from published hreflang/sitemap/IndexNow lists. Blog content retains English fallback. Validate locale persistence through the approved migration/release process before launch; no database changes were applied here.

See [`INTERNATIONAL_LOCALES.md`](INTERNATIONAL_LOCALES.md) for the shared registry and release process.
