# Japanese localization review

Date: 2026-08-31. Language/URL locale: `ja`. Regional formatting: `ja-JP`.

Status: **local translation draft for individual tutors and tutoring businesses**. Japanese is loaded through the existing browser, email and server-rendering dictionaries. It is not approved for publication or search indexing. This task did not commit, deploy, apply a database migration, send messages, create accounts or process payments.

## Coverage

[`src/lib/i18n/ja.ts`](../src/lib/i18n/ja.ts) contains **5,051 explicit Japanese overrides** of the 5,573 English keys. They cover tutor/business navigation, scheduling, availability, students, parent accounts, staff permissions, attendance, payment and invoice interfaces, lesson packages, chat, notifications, email templates, support, the onboarding assessment, marketing and feature pages.

There are 3,919 distinct Japanese values. Using `Intl.Segmenter('ja', { granularity: 'word' })` after removing HTML and interpolation parameters gives 37,348 word-like segments across overrides, or 34,443 after deduplication. These are Japanese segmentation counts, not English-style whitespace word counts, and do not normalize evaluation deductions.

Supporting changes include all 72 public tutor/business-page interface labels and Japanese short dates; landing/pricing metadata; server-rendered blog and school navigation labels; demo family/city labels; translations of existing placeholder social-proof copy; and the support follow-up question. Existing customer identities, figures, URLs, contacts and placeholder status are retained. User-written biographies, offerings, reviews, files and blog articles are not automatically translated.

The remaining **522 keys deliberately use English fallback**:

| Prefix | Keys | Deferred scope |
| --- | ---: | --- |
| `admin` | 95 | Platform administration |
| `school` | 259 | Dedicated school module |
| `schoolsLanding` | 125 | Dedicated school marketing |
| `perlasFinance` | 34 | Lithuania-specific payment integration |
| `tos`, `priv`, `dpa` | 9 | Full legal-policy bodies |

Shared business/school components and school options in the assessment use their translated shared keys. This does not make the dedicated school product fully Japanese.

## Use of the supplied guides

The supplied `translation-guide.md` and `translation-evaluation-protocol.md` from `noyellapp-main` were used for fidelity, natural language, consistency, proofreading and severity-based review. Embedded directions about a different app or a Word deliverable were treated as reference material, not separate user requests.

Japanese explanations use clear, professional です・ます language. Actions are concise. Unnecessary personal pronouns are avoided. Terminology distinguishes lesson cancellation from deletion, subject from lesson topic, tuition payment from tutor remuneration, and an enquiry from a confirmed booking.

| Concept | Japanese |
| --- | --- |
| Tutor | 講師 |
| Student | 受講者 |
| Tutoring business / organization | 事業者 / 組織 |
| Lesson / subject / topic | レッスン / 科目 / 学習内容 |
| Parent or guardian / payer | 保護者 / 支払者 |
| Availability / time slot | 空き時間 / 時間枠 |
| Waitlist | キャンセル待ち |
| Lesson package / invoice | レッスンパッケージ / 請求書 |
| Cancel / delete | キャンセル / 削除 |
| Tutor remuneration | 講師報酬 |

Source keys, interpolation parameters, HTML tags and attributes, URLs, email addresses and line breaks are preserved. Numeric values are preserved; the only numeric-token exceptions are the natural Japanese month forms `Feb 14` → `2月14日` and `March 10–14` → `3月10–14日`, explicitly checked in tests. Currency values are not converted to yen. Lithuanian legal entities and identifiers are not renamed as Japanese legal forms. English and Lithuanian dictionaries are unchanged by this task.

Contextual review used the Lithuanian source and component usage where English text was abbreviated or defective. Corrections include:

| Keys / area | Resolution |
| --- | --- |
| `compSet.payDesc`, payment buttons | Separated the explanation of business margin from the action “Pay”. |
| `compSet.noTutorTemplate` | Means a template with no tutor assigned, not a missing tutor template. |
| `stuSched.mustPay*`, `studentWait.tooltip` | Restored the actual payment restriction and waitlist explanation instead of translating placeholder-like labels. |
| `em.payReminderBodyOther`, `em.payReminderBodySelf` | Completed incomplete reminder sentences, preserving existing parameters and markup. |
| `em.payReminderDeadline` | Uses 支払期限 because its email-table value is the payment deadline, despite the source label “Price”. |
| `dash.invoice`, `invoice.invoiceTitle` | Uses 請求書 where callers require an invoice heading despite the source `d MMM` token. |
| `em.afterLessonStudentPart`, `em.withStudent`, `em.withTutor` | Split sentence fragments from contact-role labels so assembled Japanese does not contain dangling colons. |
| Trial, invitation, manual-payment and calendar help | Restored explanatory meaning from the fuller Lithuanian copy. |

Review distinguishes meaning errors from grammar and optional style preferences. **No independent native-speaker review or final 1–10 certification is claimed.** Passing tests is not a 10.0 linguistic score. A release evaluator should review the complete rendered material, record remaining Critical/Major/Minor/Micro issues, avoid double-counting root causes, and apply the supplied deductions and caps without word-count normalization.

## Verification

- 317 targeted tests passed across 12 files, covering Japanese integrity, locale loading/persistence paths, server rendering, SEO metadata/visibility, public-page helpers, support, HTML escaping, source-key coverage, authentication locale handling and assessment navigation.
- All 5,051 Japanese overrides preserve the source contracts checked above. The Japanese-specific suite passes after the final contextual corrections.
- Frontend and API TypeScript checks pass. An initial shared-workspace failure for the separately added Filipino date locale disappeared after that separate work supplied its mapping; this task did not modify it.
- Vite production build passes, including the Japanese locale chunk. Build output was directed to a temporary directory to avoid replacing the main task's preview build. Existing source-map and large-chunk warnings remain.
- `git diff --check` passes.
- **Rendered visual QA was not completed.** Port 3000 belonged to another project and was left untouched. A separate Tutlio preview refused the browser connection; starting an isolated preview was blocked by the sandbox. No permission or network configuration was changed. Do not treat the attempted browser check as a successful layout review.

No authenticated business/tutor/student/parent flow, delivered email, invoice PDF, external checkout, mobile layout or native Japanese user session was exercised.

## Before a Japan launch

1. **Complete native Japanese and visual review.** Check desktop/mobile wrapping, CJK fonts, date/time presentation, full names, concatenated email fragments, populated placeholders and all consequential cancellation/payment messages. Review authenticated flows and PDF/XLSX output, including Japanese glyph support.
2. **Validate market behavior separately.** This translation does not add JPY pricing, Japanese tax/invoice compliance, payment-provider eligibility, tutor payouts, Japan-specific terms, local support hours or Japanese school-grade conversion. Source `+370` requirements and foreign address/phone examples remain where supplied; audit validation and defaults before enabling Japanese onboarding commercially.
3. **Resolve source defects together with their contracts.** `companyWait.inQueueSince` and `studentWait.addedOn` remain date-format tokens even though callers pass a date. `compSch.seriesSummaryHtml` remains `HH:mm`. The after-lesson student fragment has no student-name parameter. Fix source keys and callers together rather than inventing Japanese-only parameters.
4. **Reconcile product claims.** Source copy contains conflicting card-required/free-trial statements, commission descriptions, language counts and Google Calendar synchronization claims. Existing assessment savings figures, guarantees, testimonials and case-study claims require product verification. They were translated, not independently substantiated or converted into Japanese customer claims.
5. **Translate and review full legal policies.** Terms, privacy and DPA bodies retain English. Translated internal organization rules are a language draft, not Japanese legal approval. Dedicated school/admin and PerlasFinance modules remain deferred.
6. **Keep the existing release gates.** `ja` remains a pending/unpublished locale with noindex treatment on pending marketing routes and no Japanese sitemap/hreflang/IndexNow promotion. Blog content retains its existing fallback. Locale-preference database changes belong to the separate international rollout and were not applied here.

See [`INTERNATIONAL_LOCALES.md`](INTERNATIONAL_LOCALES.md) for the shared release procedure.
