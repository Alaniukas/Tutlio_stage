# Czech tutor and business localization review

Prepared 2026-08-31. **Local translation draft, not production release approval.**

## Locale and scope

The language code is **`cs`**, the country code is **`CZ`**, and formatting uses **`cs-CZ`**. `cz` is not introduced as a competing language code. Czech is left-to-right and calendars start on Monday. Existing account time zones are unchanged.

`src/lib/i18n/cs.ts` now exports **5,051 explicit Czech overrides**, including **all 493 quiz entries**. These cover individual tutors, tutoring businesses, their connected student/parent portals, scheduling and availability, staff permissions, packages, payments, invoices, messages, dictionary-based emails, marketing, support and the shared recommendation quiz. The dictionary contains 4,014 distinct values and 23,959 word segments (21,991 after deduplicating identical values), measured with Czech `Intl.Segmenter` after removing markup and interpolation tokens. These counts describe scope, not a quality score.

The remaining **522 keys retain English**: dedicated platform administration (`admin`, 95), school functionality (`school`, 259), school marketing (`schoolsLanding`, 125), Lithuania-specific PerlasFinance (34), and full terms/privacy/DPA bodies (9). Shared company components and the school branch of the shared quiz are translated; this does not mean the dedicated school product is localized.

Additional prepared surfaces:

- All 72 public-booking labels, enquiry/error/draft states, short dates, landing/pricing metadata, public-page SSR labels and the server footer school link.
- The shared tutor/business public-page editor, including image/address errors, accessible form text, preview controls, colors and background labels. User-authored names, biographies, subjects and reviews are not translated or saved by this task.
- Czech registration defaults to `+420`, with `+420 601 123 456` as an example. Existing international phone validation is reused; Lithuania-specific validation is unchanged.
- Czech confirmation/recovery email copy, selected-language metadata and the four generated local multilingual auth artifacts. The artifact comparison confirms that only a Czech branch was added; existing language branches are unchanged.
- Czech branches for the operational student-assignment and lesson-status reminder emails, including missing-contact guidance, daily reminder wording and count-neutral summaries. Existing non-Czech branches and delivery behavior are unchanged.
- Checkout presentation maps `cs` to Stripe's supported `cs` code. No price IDs, amounts, currencies, payment eligibility, subscription behavior or provider accounts were changed.
- Demo family/city labels and existing fictional social-proof text. Names, contacts, ratings, statistics and the disabled `SHOW_PLACEHOLDER_SOCIAL_PROOF` flag remain unchanged. No Czech customer endorsement was invented.

## Applying the supplied guides

Used `translation-guide.md` and `translation-evaluation-protocol.md` supplied from the `noyellapp-main` project. Their requirements for faithful meaning, natural language, consistent terminology and error severity were applied to this platform. Embedded instructions about a different product, a Word deliverable or claiming a native-speaker identity were not treated as additional user requests. No external translation service or sub-agent was used.

The English dictionary is the main source. Lithuanian source text and actual callers resolve incomplete or mislabeled English entries; the existing Slovak draft was a terminology/context reference. English and Lithuanian dictionaries were not edited. Keys, interpolation tokens, markup, links, email addresses, numeric values and line breaks are preserved, except for the three explicit source-contract repairs below. Source currency, company, policy and marketing claims were not converted into Czech market facts.

The copy uses professional formal address, clear action infinitives and these terms:

| Concept | Czech |
| --- | --- |
| Tutor / tutoring business | lektor / doučovací centrum |
| Organization | organizace |
| Student / parent / guardian | student / rodič / zákonný zástupce |
| Lesson / elapsed hour | lekce / hodina |
| Tutor pay / payer | odměna lektora / plátce |
| Availability / slot | dostupnost / volný termín |
| Waitlist | čekací listina |
| Lesson package / invoice | balíček lekcí / faktura |
| Cancel / delete | zrušit / odstranit |
| Paid / unpaid | uhrazeno / neuhrazeno |

Existing plural selectors include categories such as 2–9 that do not match Czech grammar. Where the caller appends a count, neutral units such as `lek.`, `hod.`, `fakt.` or count-first labels avoid false inflections. Lessons remain distinct from elapsed hours. Recurring-weekday messages avoid gender-dependent wording before an arbitrary weekday. Full native review should still check dynamic fragments in context.

## Review corrections

| Area | Correction and evidence |
| --- | --- |
| Incomplete warnings | Unpaid-lesson/waitlist restrictions, account deletion, availability confirmations, package notes and finance explanations use the complete Lithuanian meaning and their callers rather than English placeholder labels. Account removal explicitly states that it is irreversible. |
| Payment reminders | Completed the truncated English sentences for the payer and student; the deadline row says `Lhůta pro úhradu` instead of repeating the price label. Before-start and after-end reminders are verified through dry-run rendering. |
| `em.payReminderTiming` — contract repair | The source contains only a label, but `paymentReminderEmail` passes `hours` and `timing`. Czech uses `{hours} h {timing}`. The separate finance settings label remains a label. |
| `invoice.emailNote` — contract repair | English says only “Email note”. Lithuanian and `SendInvoiceModal` establish delivery to each payer and the `{days}` deadline. Czech preserves both. |
| `cal.massCancelChars` — contract repair | English says only “Mass cancel chars”. Lithuanian and validation establish the `/5` character minimum. |
| Cancellation window | The booking email now explicitly says `Méně než {hours} hod. před lekcí: {fee}`. This matches the strict `hoursLeft < cancellationHoursValue` late-cancellation condition and avoids an ambiguous “within N hours” phrase. |
| Payment versus remuneration | The center's remainder after tutor pay is explained separately from buttons to pay or confirm a payment. |
| Idle action labels | `auth.saveNewPassword`, `dash.confirmPayment` and `cal.addStudentsBtn` use action labels. Their callers already use separate busy-state keys; Czech no longer repeats “Updating/Confirming/Adding” on an idle button. |
| Invoice labels | `dash.invoice` and `invoice.invoiceTitle` contain date-format text in the source despite being invoice labels. Czech uses `Faktura`. |
| Units and quantities | Lesson-count fragments use `lek.`; elapsed time uses `hod.`. Count labels and recurring weekday text avoid incompatible legacy plural categories. |

Integrity tests check every scoped key, using explicit reference contracts for the three named token/number repairs. They do not skip arbitrary keys to make the tests pass.

**No final 1–10 linguistic certification is assigned.** This is an author review with automated checks, not an independent native Czech review of every rendered flow. The supplied protocol's Critical/Major/Minor/Micro categories guided corrections. A final evaluator should deduct 2.5 for the first Critical and 1.5 for each further Critical, 0.9 per Major, 0.3 per Minor and 0.1 per Micro; apply the 1.0 floor and severity caps; report raw and capped scores. Do not normalize deductions by word count or count the same repeated root cause multiple times. Passing tests does not establish a score of 10.0.

## Verification

- `npm run locales:check`: **768 tests passed across 58 files**, including generated-auth-artifact drift, all locale quality checks, routing, selectors, auth callbacks and SSR release gates. One parallel run hit the existing five-second school-SSR import timeout; the complete suite passed on rerun without changing test timeouts or implementation.
- Additional focused Czech/UI/shared regression run: **167 tests passed across 12 files**. This overlaps the locale check and must not be added to it as a unique total.
- Czech tests cover 5,051-key completeness, the 493 quiz entries, all interpolation/HTML/numeric/URL/email/newline contracts, browser/email/SSR agreement, escaped HTML, payment/deletion wording, Czech phone handling and all public-booking labels.
- Date tests round-trip all 12 months and every weekday across short, medium, long, full and date-time formats. Monday-first weeks and the public short date `22. 8.` pass without a library patch.
- Component checks render the Czech registration form with `+420`, render the shared public-page editor without saving user content, and exercise the quiz's business multi-select-to-insight transition while retaining `/cs` routes.
- Email dry runs verify before/after payment deadlines, payer/student wording, escaped names and the payment link; student assignments with/without contacts; and status reminders with counts 1, 2 and 5. Czech/Dutch email regression checks also passed (18 tests across two files). Delivery and push are mocked; no messages are sent.
- Frontend and API TypeScript checks passed. The isolated production build passed. Build output is under `/private/tmp/tutlio-cs-localization/build`; the main thread's `dist` output was not replaced. Existing sourcemap, mixed static/dynamic import and large-chunk warnings remain.
- React review: the changes add static copy and locale selection only. No new effects, data fetching, save behavior, permissions or component state flows were introduced.

These are local automated checks, not live account, browser visual or email-client QA. No real registration, password reset, email delivery, invoice PDF/XLSX, payment or database preference write was exercised.

## Remaining release gates

1. Native Czech review of full tutor/business/student/parent flows, dynamic names/counts, narrow layouts, email appearance and terminology. Artwork, screenshots, user content and other hard-coded strings can still use another language.
2. Known shared source gaps remain: `companyWait.inQueueSince` and `studentWait.addedOn` contain date-format tokens although callers pass `{date}`. They are retained as existing contracts, not silently reinterpreted by this draft. Review these shared source defects before claiming a fully localized launch.
3. Review existing marketing claims before publication, including trial/card requirements, fees, language counts, savings and customer attribution. Source contradictions were not silently resolved as part of translation. Fictional social proof remains disabled.
4. Translate and legally review full terms/privacy/DPA separately. Shared internal tutor rules are translated, not certified for Czech legal compliance. Lithuanian entity types and accounting conventions remain Lithuanian; language does not establish local tax or invoice compliance.
5. Verify currencies, payment-provider eligibility, settlement, billing, support and invoice exports separately. Checkout language selection is presentation only; [Stripe's locale list](https://docs.stripe.com/api/checkout/sessions/create#create_checkout_session-locale) includes `cs`.
6. Follow [Locale production readiness](LOCALE_PRODUCTION_READINESS.md) for database preference preflight, approval and persistence QA. Czech is already covered by the prepared international locale migration. No migration was created or applied in this task.
7. Install the generated confirmation/recovery subjects and bodies in the approved hosted project only through the release process. Local generation does not update [hosted Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates). Check the project's SMTP/template eligibility; [new Free projects using default SMTP have template restrictions](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

Only development draft availability changed. Production UI options, SEO/sitemap/hreflang/IndexNow lists, blog schema fields and localized-asset release lists remain unchanged. **No commit, push, deployment, hosted template installation or database mutation was performed.**
