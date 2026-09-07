# Brazilian Portuguese localization review

Date: 2026-08-31. Locale: `pt-br`; language/format tag: `pt-BR`.

**Status: local translation draft for individual tutors and tutoring businesses. Additional proofreading and release QA recommended.** The locale remains unpublished for search indexing. This task did not commit, deploy, apply database migrations, send messages, create accounts or process payments.

## Coverage

[`src/lib/i18n/pt-br.ts`](../src/lib/i18n/pt-br.ts) contains **5,051 explicit Brazilian Portuguese overrides** of the 5,573 English dictionary keys, including **all 493 onboarding quiz entries**. Coverage includes tutor/business navigation, calendars, availability, students, staff and permissions, attendance, lesson packages, payments, invoices, messages, support, email/push copy, marketing and feature pages. Connected student and parent flows are included.

The dictionary contains 4,019 distinct target values and approximately 29,062 words across all overrides (26,853 after deduplicating values). Counts use Portuguese word segmentation with HTML and interpolation parameters removed. Word counts are descriptive, not a scaling factor for quality scores.

Other localized surfaces:

- All 72 public tutor/business-page interface labels, including booking enquiries, loading/error states and Portuguese short-date formatting.
- Nine server-rendered public-page labels, landing/pricing metadata, school navigation text and the support follow-up question.
- Landing demo family/city labels and existing social-proof text. Names, organizations, contact details and the meaning of numerical claims were retained; no Brazilian customers were invented.
- Brazilian phone examples and a `+55` initial country selection on registration. Existing international validation remains unchanged and still accepts other country codes.

The remaining **522 keys intentionally use English fallback**:

| Prefix | Keys | Deferred scope |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school module |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full legal-policy bodies |

Shared company/school components and school references inside the common quiz are translated. This does not establish complete school-module localization. Existing tutor internal-rule text is translated faithfully, including its GDPR reference; it is not an adaptation to Brazilian law. Owner-written biographies, lesson descriptions, names, reviews, blog articles and image text are not automatically translated.

## Use of the supplied guides

References: the supplied `translation-guide.md` and `translation-evaluation-protocol.md` from the `noyellapp-main` project. Their fidelity, proofreading and QA criteria were applied to Tutlio. Embedded instructions for a separate Word document or another application's quiz were not treated as separate deliverables. Tutlio's own quiz is included in the dictionary.

The translation uses direct, professional Brazilian Portuguese, addressing the user as **você**. English and Lithuanian source dictionaries were left unchanged. Keys, existing interpolation parameters, HTML tags/attributes, URLs, email addresses and line breaks are preserved. Numeric amounts, currencies, limits and claims remain the same; static decimal separators use Portuguese commas.

Six phone-guidance entries intentionally remove the source's `+370`-only restriction, because the corresponding non-Lithuanian interfaces already use international validation: `onboard.parentPhoneFormat`, `onboard.phoneFormatError`, `register.phoneError`, `register.phoneHint`, `settings.phoneFormat`, `stu.phoneFormat`. They now explain the country-code requirement without inventing new validation rules. Tests distinguish these corrections from changes to prices or limits.

| Concept | Preferred Brazilian Portuguese |
| --- | --- |
| Tutor / individual tutor | professor particular / professor autônomo |
| Tutoring business | empresa de aulas particulares |
| Organization | organização |
| Lesson / subject / topic | aula / disciplina / tema |
| Availability / time slot | disponibilidade / horário |
| Waitlist | lista de espera |
| Parent or guardian | responsável |
| Payer | pagador |
| Invoice | fatura; not a claim of Brazilian nota fiscal support |
| Lesson package | pacote de aulas |
| Reschedule / cancel / delete | remarcar / cancelar / excluir |
| Credit / refund | crédito / reembolso |

## Review and corrections

The review distinguished meaning problems, grammar, small local errors and optional preferences using the supplied Critical/Major/Minor/Micro taxonomy. When English consisted of incomplete labels, the Lithuanian text and component usage supplied the missing context. Those source-repair cases are recorded separately from translation-created errors.

| Location | Finding | Resolution |
| --- | --- | --- |
| `invoices.statusPaid` | Required agreement correction: a fatura is feminine. | `Paga`; payment statuses such as `compStu.paid` retain `Pago`. |
| `auth.agreeWith` | The same prefix is joined to both a feminine policy title and plural masculine terms title. | Uses `Concordo com:` without an incompatible article. |
| Stripe connection messages | Article normalization introduced malformed words/prepositions and exposed inconsistent agreement. | Corrected the affected complete phrases and explicitly refers to `conta Stripe conectada` where needed; final scan found no such malformed replacements. |
| Pricing/subscription literals | English decimal points were inappropriate for Portuguese presentation. | Uses `3,5%`, `€0,25`, `€14,99`, `€19,99` and `€179,88`, preserving the numeric values. |
| `studentWait.tooltip`, `compSet.payDesc`, `stuSched.mustPayDesc`, cancellation hints | The abbreviated English source failed to explain behavior. | Restored explanations supported by the Lithuanian source and callers: waitlist behavior, company margin, payment blocks and late-cancellation fees. |
| `em.payReminderBodyOther`, `em.payReminderBodySelf` | Source sentences ended before stating that the lesson was unpaid. | Completed the reminder without adding parameters or altering HTML. The final email template uses these as standalone paragraphs. |
| `dash.invoice`, `invoice.invoiceTitle` | Source contained a date token in an invoice-label position. | Uses `Fatura`. |
| `em.payReminderDeadline` | Source said `Price`, but the email table uses it as the deadline heading. | Uses `Prazo de pagamento`. |
| `studentSettings.confirmDeleteMsg` | Source stub omitted the irreversible-action warning visible in Lithuanian. | Restored the account-deletion question and warning. |

Natural, accurate alternatives were not rewritten merely for stylistic preference. No marketing promises were strengthened, no BRL prices or Pix support were added, and no protected entity names were replaced with Brazilian legal forms.

**Initial and final whole-dictionary linguistic scores: not assigned.** This is an author review with automated integrity checks, not a completed independent, full-text scored evaluation. Passing tests is not a 10/10 language rating. A subsequent full evaluation should list remaining issues, tally the four tiers, calculate the raw deduction score and apply the protocol's severity caps; it must not normalize deductions by word count.

## Verification

- **309 tests passed across 13 files**, covering the new Portuguese quality suite, international locale loading, SSR, SEO visibility, support, public-page helpers, auth locale handling and quiz behavior. Italian and Mexican Spanish regression suites also passed.
- The Portuguese suite checks all 5,051 source keys, nonempty values, interpolation parameters, HTML tags/attributes, links, email addresses, line breaks, currencies and numeric values. The six documented phone corrections are the only numeric-value exceptions.
- Browser dictionary, email helper and SSR helper return Portuguese. Tests exercise HTML escaping, cancellation/deletion distinctions, invoice agreement, public booking copy, Brazilian date formatting and international phone handling.
- `npm run lint`, `npm run lint:api`, `npm run build` and `git diff --check` passed. The build still reports chunk-size/source-map warnings.
- **Visual browser QA was not completed:** starting an isolated local preview server was blocked by this session's permissions. The existing server belongs to a different project and was left untouched. No claim is made about desktop/mobile wrapping or complete live flows.

The quiz page tests cover navigation with mocked dependencies; they are not an authenticated or visual Portuguese end-to-end test. The email checks validate translated strings and interpolation, not delivered email layouts or a real send.

## Release blockers and follow-up

1. **Repair shared source contracts for missing dynamic values.** Some source keys lack parameters although callers supply them. Examples: `companyWait.inQueueSince` and `studentWait.addedOn` still contain date-format tokens instead of `{date}`; `compStu.cancellationInfo` has blank hours/percentage positions; `invoice.emailNote` omits the supplied deadline; `em.payReminderTiming` omits the supplied hours/timing. `compSch.seriesSummaryHtml` now has explanatory text, but the source contract still omits the caller's date/time parameters. The batch-cancellation character count also lacks a source `{count}` parameter. Fix these source contracts and affected dictionaries together before publishing. They were not silently changed across other locales in this task.
2. **Verify Portuguese money and scheduling flows in context.** Test tutor/business/student/parent roles, cancellation versus deletion, before/after-lesson deadlines, fees versus lesson payments, credits versus refunds, invoice generation, enrolment, invitations and emails. Current unit checks do not prove complete workflow correctness.
3. **Complete visual and native-language review.** Check long labels, tables, dialogs, narrow screens, full emails and exports. Pay particular attention to grammatical agreement when values are assembled from several keys. Existing hard-coded accessibility text, artwork and external widgets may still be English or Lithuanian.
4. **Review market and legal readiness separately.** Currencies, subscription prices, Stripe/Connect eligibility, payouts, taxation, billing documents, time zones and country-specific integrations were not changed. Full terms, privacy and DPA bodies remain English. Brazilian invoice/tax and privacy requirements require their own review; translated labels do not implement them.
5. **Validate existing marketing facts.** The source includes differing trial/card and payment-fee statements, `13 languages`, time-saving estimates and illustrative social proof. Their factual validity was not established by translation. Do not present the translated placeholder stories as verified Brazilian customer testimonials.
6. **Keep publication and persistence gates.** `pt-br` remains in `PENDING_TRANSLATION_LOCALES`, excluded from published sitemap/hreflang/IndexNow lists. Pending marketing routes retain noindex. Blog content uses English fallback. The shared locale-preference migrations were applied to production on 2026-08-31; authenticated save/reload QA remains pending. See [current release evidence](LOCALE_PRODUCTION_READINESS.md).

See [international locale documentation](INTERNATIONAL_LOCALES.md) for the registry, fallback behavior and release procedure.
