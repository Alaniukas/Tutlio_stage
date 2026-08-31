# Korean localization review

Date: 2026-08-31. Language locale: `ko`. Formatting locale: `ko-KR`. Country code: `KR`.

Status: **local translation draft for individual tutors and tutoring businesses**. The existing locale loader now serves Korean copy. This is not approval for publication, indexing, or Korean-market payment operations. No commit, deployment, account creation, email sending, payment, or database migration was performed in this task.

## Coverage

[`src/lib/i18n/ko.ts`](../src/lib/i18n/ko.ts) contains **5,051 explicit Korean overrides** of 5,573 English keys. Coverage includes tutor/business navigation, calendars, availability, student management, staff permissions, attendance, payments, invoices, packages, messaging, notifications, emails, connected student/parent flows, the onboarding assessment, support, marketing, and feature pages.

The draft contains 3,941 distinct values. Using `Intl.Segmenter('ko', { granularity: 'word' })` after removing HTML and interpolation variables, it contains 21,732 word-like segments across overrides, or 19,744 after deduplicating identical values. Korean spacing and segmentation differ from English; these are descriptive counts, not scoring denominators or a measure of translation quality.

Additional changes:

- 72 Korean public tutor/business-page interface labels and Korean short-date formatting. Biographies, names, offerings, reviews, and other owner-authored content remain unchanged.
- Korean landing/pricing metadata, server-rendered public-page labels, and navigation/footer labels.
- Korean demo family/city labels and translations of the existing social-proof copy. Names, organizations, results, ratings, photos, and feature flags remain unchanged; no Korean customers were invented.
- Korean support follow-up text.
- South Korea `+82` in the registration dialing-code list, selected by default for `ko`, with `1012345678` as the local-number example. Shared Korean phone placeholders use `+82 10 1234 5678`. Existing international validation remains unchanged and still allows other countries. These helpers do not validate whether a number is allocated or reachable, and do not convert a domestic leading zero automatically.

The remaining **522 keys retain English deliberately**:

| Prefix | Keys | Scope deferred |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school module |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full terms, privacy and DPA bodies |

Shared company/school components are translated where their keys belong to tutor/business flows. School-related branches in shared marketing and assessment copy were translated for completeness, but this does not localize or certify the separate school product.

## Supplied guides and language choices

The supplied `translation-guide.md` and `translation-evaluation-protocol.md` from the `noyellapp-main` project informed fidelity, terminology, grammar, punctuation, and review. Their embedded instructions concerning another app or a Word deliverable were not treated as separate user requests. No files in that project were modified.

Korean uses concise noun labels and polite, professional instructions. Meaning takes priority over literal English word order. Variables, HTML tags and attributes, URLs, email addresses, line breaks, amounts, and numerical claims are preserved. The two intentional numeric-token differences are month localization: `Feb 14` becomes `2월 14일`, and `March 10–14` becomes `3월 10–14일`; tests explicitly verify these conversions. The English and Lithuanian source dictionaries were not edited.

| Concept | Korean convention |
| --- | --- |
| Tutor / individual tutor | 튜터 / 개인 튜터 |
| Tutoring business / organization | 튜터링 기관 / 기관 |
| Lesson / subject / topic | 수업 / 과목 / 수업 주제 |
| Availability / slot | 수업 가능 시간 / 시간대 |
| Waitlist | 대기 목록 |
| Lesson package | 수업 패키지 |
| Invoice | 청구서, without implying a Korean statutory tax invoice |
| Parent / guardian / payer | 학부모 / 보호자 / 납부자 |
| Payment / tutor compensation | 결제 / 튜터 급여 |
| Cancel lesson / end subscription / delete | 수업 취소 / 구독 해지 / 삭제 |
| Refund / late-cancellation fee | 환불 / 취소 수수료 |

## Author review

The source and translation were reviewed during drafting, followed by checks of repeated English values, short source placeholders, composed email sentences, variable placement, and destructive/payment actions. Where English contained a terse placeholder rather than explanatory copy, existing Lithuanian text and the caller supplied the intended meaning. These are contextual repairs, not new product rules.

Examples of corrected findings, classified using the supplied severity concepts:

| Finding | Severity | Resolution |
| --- | --- | --- |
| Shared English `Pay` had produced compensation wording on payment buttons | Major meaning defect | `stuSched.payBtn`, `studentDash.pay`, and `subscribe.payBtn` use `결제`; compensation descriptions use `급여`. |
| `studentSettings.confirmDeleteMsg` was a literal placeholder | Major action-warning defect | Restored the account-deletion confirmation and irreversible-action warning from the existing context. |
| `dash.invoice` and `invoice.invoiceTitle` contained source date tokens | Major label defect | Use `청구서` where callers display an invoice label. |
| Payment-blocking and availability explanations were abbreviated source stubs | Major clarity defect | Restored the established restrictions and confirmation meaning for `stuSched.mustPay*`, `compSch.confirmNoAvailability`, and related descriptions. |
| Payment-reminder sentences stopped after “still” | Major omission | State that the lesson remains unpaid, retaining the existing student placeholder and HTML. |
| English count/label order was unnatural in Korean package emails | Minor grammar issue | Compose `수학 수업을 3회` and `수업 3회`, retaining all variables. |
| Variable amounts created unstable Korean particles | Minor grammar issue | Rephrased using fixed nouns such as `크레딧` and `취소 수수료`. |

This table records examples from author review, not a complete independent evaluator's issue tally. **No final 1–10 linguistic certification is assigned.** Passing integrity tests does not justify a 10.0 rating, and no native Korean reviewer was involved. A subsequent evaluator should read the complete rendered source/target flows, record remaining critical/major/minor/micro issues, and apply the supplied deductions and severity caps to report both raw and capped scores. Do not normalize deductions by the segment count above.

## Verification

- Full-dictionary tests verify exact in-scope key coverage, English fallback scope, interpolation variables, HTML tags/attributes, links, email addresses, line breaks, and numeric values with the two documented month conversions.
- Integration tests verify Korean browser/email/SSR translation helpers, Korean date formatting, HTML escaping, payment/deletion distinctions, public-page labels, support copy, and preserved demo identities/results.
- Existing international tests exercise locale preference/URL round trips, noindex behavior, and exclusion from published hreflang lists.
- Final focused run: **110 tests passed in 7 files**, covering Korean quality, public pages, authentication locale handling, the assessment, HTML escaping, and phone helpers. An earlier 6-file integration run passed all 194 tests. The expanded final 12-file run passed 294 of 295 tests; its sole failure was the concurrently added Filipino (`fil`) locale missing a date-fns mapping, outside this task.
- API TypeScript checks passed. Frontend TypeScript initially passed; the final run reported the same unrelated missing `fil` mapping in `src/lib/i18n/index.ts`. No Filipino files or mappings were changed here. A final production build passed into `/private/tmp/tutlio-ko-build-final`; existing chunk-size, mixed-import, and source-map warnings remain. `git diff --check` passed, and no English/Lithuanian source-dictionary diff was present.
- The isolated local preview server could not bind a port under the environment's permissions. No browser page or screenshot was inspected. No permission escalation or workaround server was attempted. Visual layout QA therefore remains outstanding.

This verification did not exercise authenticated business, tutor, student, or parent flows against a live database, delivered email layouts, real bookings, payments, or exports.

## Before release

1. **Review in context with Korean speakers.** Check narrow screens, calendars, long labels, confirmation dialogs, composed email messages, keyboard navigation, typography, invoice/PDF/export fonts, and student/parent terminology. Automated tests cannot establish naturalness across every rendered flow.
2. **Repair remaining source contracts together.** `companyWait.inQueueSince` (`yyyy-MM-dd HH:mm`), `studentWait.addedOn` (`d MMM`), and `compSch.seriesSummaryHtml` (`HH:mm`) are defective source strings whose callers supply date/schedule variables they do not contain. They are retained pending a coordinated source repair. `em.afterLessonStudentPart` similarly lacks the student-name parameter its caller supplies; Korean expresses a complete generic sentence but cannot display that name through the current source contract.
3. **Finish phone and account QA.** Registration now offers/defaults to `+82`, and shared non-Lithuanian validation accepts international numbers. Some legacy dictionary validation messages still describe `+370` or Lithuanian-only requirements because those are present in the source. Audit their active callers and replace stale source contracts consistently. Confirm handling of domestic `010…` input and saved locale preferences before release.
4. **Review policies and market operations.** Full terms/privacy/DPA bodies remain English. The translated organization-tutor internal policy is a faithful draft of existing text, not Korean legal advice or approval. Currency selection, EUR/PLN prices, taxes, invoice requirements, payment-provider eligibility, Connect onboarding, payouts, and time zones remain unchanged. A Korean UI does not establish Korean market readiness.
5. **Validate product claims.** Existing testimonials/case studies, percentages, language counts, trial terms, fee claims, and the assessment's refund guarantee are source content, not independently verified promises. Conflicting source claims, such as card-required versus no-card trial copy and fee statements, require product-owner review. Do not present placeholder social proof as verified Korean customer evidence.
6. **Audit remaining embedded content.** Screenshots, artwork, third-party widgets, hard-coded accessibility labels, exports, and owner-authored public profiles may remain in other languages. Blog bodies and slugs retain the existing English fallback; no Korean blog columns were added.
7. **Keep publication gates.** `ko` remains in `PENDING_TRANSLATION_LOCALES`, outside published sitemap/hreflang/IndexNow lists and under pending-route noindex behavior. The shared locale-preference migration was not applied by this task. Validate persistence and use the approved release process before deployment.

See [International locales](INTERNATIONAL_LOCALES.md) for the shared registry and release procedure.
