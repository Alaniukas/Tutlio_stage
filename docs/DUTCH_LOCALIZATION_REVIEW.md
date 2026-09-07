# Dutch customer readiness review

Prepared 2026-08-31. These are local changes and verification results, not confirmation that production has been updated.

## Assessment

The identified translation defects and missing Dutch copy in the tutor, tutoring-company, quiz and public-enquiry paths have been corrected. The resolved Dutch dictionary covers all 5,574 keys in the current English/Lithuanian source union. Automated coverage is complete; it is not a linguistic or production sign-off.

Do not advertise this as a certified 10/10 Dutch release. A native Dutch review of the complete rendered customer journey, deployed authentication/payment checks and mobile verification remain outstanding. The Lithuania-specific school-contract workflow is explicitly not approved for Dutch customers by this work.

## What changed

| Area | Result |
| --- | --- |
| Existing dictionary | 217 existing values corrected, including misleading actions, incomplete explanations, payment deadlines, account terminology, student calendar views and phone guidance. |
| Team and permissions | 46 explicit Dutch overrides replace the inherited English baseline. |
| Quiz | All 493 quiz entries translated in `src/lib/i18n/nlQuiz.ts`, including all three audiences, questions, results, offers and consent. Dutch no longer waits for the English fallback dictionary. |
| Public tutor page | All 72 interface labels translated in `src/lib/i18n/nlPublicPage.ts`; Dutch date abbreviations and public lesson-price formatting added. |
| Transactional emails | Payment reminders, parent invoice fragments, cancellation wording and package singular/plural corrected. New-student and lesson-status reminders now have Dutch branches. |
| Enquiry notifications | The tutor's notification uses their Dutch preference, or the page locale when no preference exists. Dutch labels replace the English/Lithuanian mix. |
| Appointment time | The public picker, selected-date summary and enquiry email use the page's advertised timezone. Grouping accounts for dates that differ from UTC; timestamps submitted to the API remain unchanged. |

Examples of corrected meanings:

- `Spaar voor deze leerling` → `Opslaan voor deze leerling`: saving settings is not saving money.
- `Ik betaal mezelf` → `Ik betaal de lessen zelf`: the student pays for their own lessons.
- `Elke gratis les` → `Elke beschikbare les`: availability does not imply a zero price.
- Both student-calendar Week and Month previously said `Vandaag`; they now say `Week` and `Maand`.
- A payment deadline previously labeled `Prijs` now says `Betalingstermijn`, with the number of hours and before/after timing restored.
- Account deletion now warns about deleting the account irreversibly, rather than deleting a message.

Numbers, customer names, URLs, HTML structure and interpolation values were preserved except where actual application callers established that the source dictionary itself was incomplete. Pricing rules, fee calculations, payment currencies, permissions, database schema and release flags were not changed. Public price formatting preserves the existing market's currency.

## Method and source defects

The supplied `translation-guide.md` and `translation-evaluation-protocol.md` were used as quality criteria: preserve meaning, correct consequential errors, retain terminology and technical content, and avoid changing acceptable language merely to meet a stylistic preference. Their embedded document-production instructions were not treated as a request to produce a Word file.

The review combined source/target comparison, inspection of application callers, complete mechanical dictionary checks, selected browser inspection and rendered component/email tests. It did not include a native reviewer reading every word of the entire dictionary. No final numerical protocol grade is therefore assigned.

Some English/Lithuanian entries were shortened labels or had lost values supplied by the application. Restoring those values in Dutch is intentional. `tests/lib/i18n-nl-quality.test.ts` records 25 explicit caller contracts rather than ignoring interpolation mismatches generally. These include calendar student names/counts, synchronization errors, queue dates, organization names, package recipients and payment-reminder deadlines. The student/parent settings password-length hint follows the existing six-character client validation; server password policy still belongs in the deployed authentication check.

Valid Dutch words shared with English, such as `Accountant` and `Online school`, are explicitly allowed. Real customer/company names and technical example addresses were not renamed to make them appear Dutch.

## Verification

The focused run passed **154 tests across nine files**:

```sh
npm test -- tests/lib/i18n-nl-quality.test.ts tests/pages/dutch-quiz.test.tsx tests/pages/dutch-public-page.test.tsx tests/api/dutch-email.test.ts tests/api/dutch-public-page-email.test.ts tests/api/slovenian-email.test.ts tests/lib/i18n-coverage.test.ts tests/lib/public-page.test.ts tests/pages/quiz-funnel.test.tsx --maxWorkers=2
```

Checks cover:

- Complete source-key coverage, no inherited English team prose, HTML/link structure and interpolation contracts.
- Dutch rendering through frontend, email and SSR translation resolvers.
- All quiz audience routes, business multiple-choice continuation and consent screens without submitting a lead.
- Public enquiry contact validation, confirmation, rate-limit/server-error recovery, not-found copy, Dutch price formatting and selected-date summary.
- Enquiry email recipient preference, escaping, unchanged submitted timestamp and existing rate-limit protection.
- Payment reminders before/after a lesson, self-payer/parent wording, cancellation roles, package quantities and the two newly localized tutor notifications.
- Amsterdam midnight boundaries and both daylight-saving transitions.
- International `+31` and `+32` phone validation and the `nl-NL` formatting tag.

The full suite (`npm test -- --maxWorkers=2`) also passed: **1,679 passed, one skipped; 198 test files passed, one skipped**. Both frontend and API TypeScript checks passed. A production build passed using a separate `/tmp` output directory, preserving the shared workspace's `dist` directory. The build reported large-bundle and mixed static/dynamic Excalidraw import warnings; it was not a performance audit.

Browser verification used the existing local development server. The Dutch quiz landing, business audience selection, questions and insight screen rendered and navigated correctly. The confirmed viewport was 1280 × 720. The requested mobile viewport was not applied by the browser capability, so mobile layout is not marked passed. The public tutor URL was blocked by browser URL policy; it was not retried through another access path. That page was instead exercised in isolated component tests with mocked data, which does not substitute for live browser QA.

No email was delivered, live lead created, account changed or payment initiated. No production database query, migration, auth-template publication, commit, push or deployment was performed for this work.

The enquiry query only adds the existing `public_pages.timezone` column to its projection. Its schema declaration is in `supabase/migrations/20260809122602_public_pages.sql`; query behaviour was checked with a mocked Supabase client and the [official select reference](https://supabase.com/docs/reference/javascript/select). No authorization or RLS policy changes were needed.

## Remaining release gates

1. **Native Dutch review:** read the rendered landing/pricing, signup, quiz, tutor/company dashboard, calendar, student/parent views and actual email previews. Confirm tone and terminology; inspect embedded screenshots as well as selectable text. Follow the supplied evaluation protocol for a final scored review.
2. **Deployed authentication and preference persistence:** complete signup confirmation, login, password reset and organization invitations with approved test accounts. Verify Dutch survives links, refresh, sign-out/in and a clean browser, and that hosted email templates match the code. Check the effective server password policy.
3. **Approved sandbox payment journey:** verify checkout language, unchanged amounts/currency, success/cancellation returns, invoice output, email links and reminders. No real charges are required for this gate.
4. **Desktop/mobile public page:** verify 390px and desktop layouts, keyboard navigation, wrapping, real published-profile loading, enquiry delivery and the timezone displayed to both visitor and tutor.
5. **School-contract boundary:** `schoolContract*`, `schoolInstallment*` and related signing/admin messages in `api/send-email.ts` still contain hardcoded Lithuanian/English content. Several force Lithuanian regardless of the requested locale. Translation alone does not adapt this Lithuania-specific contract/signature workflow to the Netherlands. Do not include it in Dutch readiness claims without a separate product and legal review.
6. **Legacy campaigns and legal content:** historical `productUpdate*` mail templates still contain Lithuanian/English and must not be sent to a Dutch segment without localization. Dutch policy bodies, country-specific tax/invoice requirements, school-grade assumptions and customer support operations were not legally or operationally certified by this translation pass.

The shared international-locale rollout is tracked separately in `docs/LOCALE_PRODUCTION_READINESS.md`. This Dutch pass does not approve or publish other locales.
