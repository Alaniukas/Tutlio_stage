# Turkish localization review

Date: 2026-08-31. Locale: `tr`; display name: `Türkçe`; formatting: `tr-TR`; direction: LTR.

**Status: translated local draft for individual tutors and tutoring businesses. Additional proofreading and rendered-flow QA are recommended before publication.** Turkish remains in `PENDING_TRANSLATION_LOCALES`. No commit, deployment, live preference update, or database migration was performed for this task.

## Coverage

[`tr.ts`](../src/lib/i18n/tr.ts) contains **5,051 explicit Turkish overrides** of 5,573 English keys, including **410 email entries** and **all 493 onboarding-quiz entries**. It covers tutor/business scheduling, availability, students, parents, staff, payments, invoices, packages, messaging, notifications, support, marketing, feature pages and the public-page editor.

Dictionary target word count: **23,210**, including **3,475 quiz words**. The count uses Unicode letter/number tokens, permits internal apostrophes, and excludes HTML tags and interpolation variables. It includes displayed numbers and names; it excludes English fallback and the separate public-page/social-proof records. Word count is informational and is not used to scale the protocol's deductions.

Additional Turkish copy and wiring include:

- Browser, email and SSR dictionary loading; route recognition and support-language naming.
- Turkish `date-fns` formatting/parsing, short booking dates, and all **72 public tutor/business-page interface labels**.
- Landing/pricing metadata, public-page/blog chrome, SSR navigation and the support follow-up question. Blog article bodies and user-written biographies are not translated.
- Registration default `+90`, a localized country-code accessibility label and international phone examples. The existing validator still accepts other countries' international numbers; this is not a new Turkey-specific phone validator.
- Localized demo family/city labels and existing fictional social-proof copy. Names, contact data, images, numerical claims and the disabled `SHOW_PLACEHOLDER_SOCIAL_PROOF` flag remain unchanged. These examples are not Turkish customer endorsements.

The remaining **522 dictionary keys intentionally retain English**:

| Prefix | Keys | Deferred scope |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school module |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full legal policies |

Shared company/school controls and school choices within the quiz are translated through shared keys; this does not make the dedicated school module fully Turkish. The translated tutor policy preserves the existing policy and is not a Turkish legal adaptation.

## Applying the supplied guides

References: the user-supplied `translation-guide.md` and `translation-evaluation-protocol.md` from `noyellapp-main`. Their rules for accuracy, terminology, naturalness, structural preservation, genuine defects versus optional preferences, and severity classification were applied to the platform translations. Embedded instructions about a two-column Word document were not treated as a separate deliverable. No translation or review work was delegated.

The English and Lithuanian source dictionaries were not edited. Turkish uses a professional, courteous `siz` voice in instructions, concise action labels, and subject-appropriate wording rather than literal English word order.

| Concept | Turkish convention |
| --- | --- |
| Tutor | öğretmen; özel ders öğretmeni where clarification is needed |
| Tutoring business / organization | özel ders kurumu / kurum |
| Student / parent | öğrenci / veli |
| Lesson / subject / topic | ders / branş / konu |
| Availability / time slot | müsaitlik / müsait zaman or saat |
| Waitlist | bekleme listesi |
| Lesson package / invoice | ders paketi / fatura |
| Tutor remuneration | öğretmen ücreti |
| Refund / account credit | ücret iadesi / bakiye |
| Cancel / delete | iptal et / sil |

### Concrete findings and corrections

The review corrected 83 keys using source context, followed by a final pass over 32 dictionary entries. These are changed-key counts, not error counts: one issue can span several composable keys. Source defects are distinguished from defects introduced by translation.

| Location / previous wording | Finding | Applied correction |
| --- | --- | --- |
| `settings.refreshSub`: `Aboneliği yenile` | Required, Critical: suggests renewing the subscription instead of refreshing its status. | `Abonelik bilgilerini yenile`; matching helper wording updated. |
| `em.payReminderTiming`, composed as `dersten önce 24 saat` | Required, Minor: unnatural placement of the duration in the complete reminder. | `Dersten {hours} saat {timing}`, composed with `önce` / `sonra`; both directions are tested. |
| Split hero/feature/integration headings, e.g. `Özel ders ekibinizi yönetin: tek sistemde` | Required, Minor: fragment order follows English and produces awkward Turkish when rendered together. | `Özel ders ekibinizi tek sistemden yönetin`; equivalent corrections retain the original claims and existing key boundaries. |
| Five price/fee strings, e.g. `€179.88`, `%3.5 + €0.25` | Required, Minor: decimal punctuation does not follow Turkish conventions. | `€179,88`, `%3,5 + €0,25`; tests compare numeric values and preserve the currencies. |
| `studentSettings.confirmDeleteMsg`, `compSch.confirmNoAvailability` | Required source-copy repair: English contains abbreviated labels instead of usable warnings. | Restored the irreversible-deletion warning and the question about scheduling outside availability using Lithuanian copy and callers. |
| `stuSched.mustPayDesc`, `mustPayOverdue`, `mustPayQueue` | Required source-copy repair: abbreviated English omits the payment restrictions and next action. | Explained the existing booking/waitlist block without changing payment behavior. |
| `compSet.payDesc`, `compTut.fixedPayDesc`, `orgFinance.summaryNote` | Required source-copy repair: pay/profit calculations are unclear in English shorthand. | Distinguished teacher remuneration from the institution's share using existing Lithuanian copy and UI context. |
| `dash.invoice`, `invoice.invoiceTitle`: English date-format tokens | Required source-copy repair: these keys render invoice labels, not dates. | `Fatura`; source dictionaries remain untouched. |
| `cal.massCancelChars`, `cal.massCancelDesc`, `compTut.studentReminderHint` | Required source-copy repair: English labels omit existing numerical limits. | Restored the five-character minimum, 90-day selection maximum and `0 = kapalı` from Lithuanian copy; numeric integrity checks use that explicit source. |
| `em.payReminderBodyOther`, `em.payReminderBodySelf`, `em.afterLessonBody` | Required source-copy repair: incomplete source clauses are not completed by the email caller. | Complete Turkish unpaid-lesson/completion messages, using only variables already supplied by the caller. |
| Six phone-instruction keys requiring `+370` | Required localization correction: Lithuania-only guidance contradicts existing international input behavior. | International guidance/Turkish examples; no new country restriction or validator behavior. |

Accepted editorial choices remain unchanged: `öğretmen` versus the more explicit `özel ders öğretmeni` depends on context; the plan name `Enterprise`, product/brand names, valid Turkish loanwords such as `Blog` and `Platform`, and fictional identities are retained. These are not untranslated English sentences or grounds for speculative rewriting.

**No whole-locale numerical linguistic certification is assigned.** An author review and passing integrity checks do not establish that every rendered flow deserves a 10/10 score. The supplied protocol requires a complete source/target issue ledger before a defensible overall number: first Critical −2.5, later Critical −1.5, Major −0.9, Minor −0.3 and Micro −0.1, with a 1.0 floor and the lowest applicable severity cap. The corrected examples above are not a complete scored evaluation of all 23,210 words, so neither a raw nor a final capped score is fabricated.

### Technical string contracts

Automated checks cover every in-scope dictionary key for missing/empty values, HTML tags and attributes, URLs, email addresses, line breaks, currencies, numerical values and interpolation variables. They preserve intentional English fallback. The 42 values identical to English are names/contact examples, brands, valid shared words, numeric or variable-only strings, punctuation, and one intentional empty value.

Ten incomplete English entries deliberately restore arguments already passed by their callers:

| Key | Restored arguments |
| --- | --- |
| `cal.massCancelChars` | `{count}` |
| `compSch.seriesSummaryHtml` | `{fromDate}`, `{timeRange}`, `{weekday}` |
| `compStu.cancellationInfo` | `{hours}`, `{percent}` |
| `companyWait.inQueueSince`, `studentWait.addedOn` | `{date}` |
| `invoice.emailNote` | `{days}` |
| `em.payReminderTiming` | `{hours}`, `{timing}` |
| `em.afterLessonStudentPart` | `{student}` |
| `em.payReminderBodyOther`, `em.payReminderBodySelf` | `{tutor}` |

These are explicit test exceptions tied to existing callers, not a blanket relaxation of placeholder preservation. Numeric exceptions are likewise limited to six phone keys, three Lithuanian-source repairs and five decimal-format adaptations.

## Verification and release limits

- The Turkish quality suite passes 14 tests covering the full dictionary, interpolation/escaping, browser/email/SSR loading, dates, phone input, public labels, unpublished routes and preference migration contents.
- The Turkish SSR page test passes with `lang="tr"`, Turkish copy, `noindex`, and no Turkish hreflang publication.
- API TypeScript and a production build to a temporary directory pass. Frontend TypeScript passed an earlier run; the final repeat encountered an unrelated concurrent error at `src/lib/i18n/skDateFns.ts:16` (`TS2345`, a number passed where a string is required). That file was not changed by this task. The build reports the existing large-chunk warning.
- A broader SSR run reported two unrelated failures: Croatian and Slovak footer assertions still expected English while those concurrent drafts supplied localized labels. Those changes were left untouched; this is not a claim that the entire repository test suite passes.
- Visual and authenticated end-to-end QA is **not verified**. The existing server on port 3000 belonged to another application, and this session could not bind a separate local port. No account, booking, payment or email was created or sent.

Before publication:

1. Review Turkish in the actual solo-tutor, business-admin, student and parent flows, particularly narrow layouts, split headings, cancellation/payment confirmations and composed emails with real names and quantities. Native review is needed to catch contextual word choice and grammatical attachment that token checks cannot assess.
2. Resolve inherited source contradictions. `cal.googleConnected` describes one-way Tutlio → Google synchronization, whereas `orgTutorPolicy.s2Calendar` claims two-way synchronization. The Turkish draft preserves the respective existing source context; it does not resolve that product/policy inconsistency. Verify static pricing claims against the intended launch offer as well.
3. The migration [`20260831234513_add_turkish_locale.sql`](../supabase/migrations/20260831234513_add_turkish_locale.sql) was applied to production project `cuhciqwmqfuajeeqjjbm` on 2026-08-31 in order with the other locale migrations. It updates only the two preferred-locale checks, retaining currently registered locales; it does not change saved preferences, billing, currency or RLS. Both installed checks accept `tr`; authenticated save/reload QA remains pending. See [current release evidence](LOCALE_PRODUCTION_READINESS.md).
4. Verify payment-provider eligibility, invoicing, tax/legal documents, support coverage and operational requirements separately for Turkey. Adding Turkish UI and `+90` does not enable Turkish merchant accounts, TRY billing or Turkish tax compliance. Existing money and account-time-zone behavior is unchanged.
5. Publish explicitly only after release review. Keep Turkish out of the sitemap, published hreflang set and blog database columns until then.

Verdict: **localized draft delivered; additional proofreading and release verification recommended for the concrete risks above.**
