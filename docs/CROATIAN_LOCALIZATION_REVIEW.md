# Croatian localization review

Date: 2026-08-31. Locale: `hr`; formatting: `hr-HR`; direction: left to right.

Status: **local translation draft for individual tutors and tutoring businesses; unpublished**. This task did not commit, deploy, apply migrations, change billing rules or modify other locale dictionaries.

## Coverage

[`src/lib/i18n/hr.ts`](../src/lib/i18n/hr.ts) contains **5,051 explicit overrides**, including **493 quiz keys**. Coverage includes tutor/business navigation, availability, calendars, students, connected parent/student portals, staff permissions, lesson status, finance, packages, invoices, chat, notifications, dictionary-based emails, support and marketing. All existing quiz branches are translated so the shared assessment remains coherent; this does not localize the separate school product.

The source has 4,105 distinct values across this scope. Whitespace-split word counts are 25,736 for the source keys and 25,600 for the target keys; the target has 4,011 distinct values. Counts include repeated strings and embedded markup and are informational, not a score normalization factor.

The other **522 English keys** remain fallback: `admin.*`, `school.*`, `schoolsLanding.*`, `perlasFinance.*`, `tos.*`, `priv.*` and `dpa.*`. Full legal documents, school-specific modules and platform administration are outside this request.

Additional Croatian copy covers all 72 public-booking interface labels, short dates, landing/pricing metadata, demo-family labels, disabled placeholder social proof, the support follow-up, and public-page/SSR labels. Registration defaults to `+385` for `hr`, offers the Croatian dial code and translates its accessibility label. Shared phone examples use `+385 91 123 4567`; international validation still accepts other countries' numbers.

## Application of the supplied guides

Both supplied files were used: `translation-guide.md` and `translation-evaluation-protocol.md` from the `noyellapp-main` directory. Their translation principles informed this platform implementation: accurate meaning, natural Croatian, consistent terminology, source/target review and preservation of protected content. Instructions describing a Word document with a right-hand translation column were treated as guidance for that document workflow, not as a separate request to create a Word deliverable. No delegation or external translation service was used.

The copy uses direct, informal singular address. Preferred terminology:

| Concept | Croatian |
| --- | --- |
| Individual tutor | samostalni instruktor |
| Tutoring business | centar za instrukcije / centar |
| Organization | organizacija |
| Lesson / subject / topic | sat / predmet / tema |
| Availability / time slot | dostupnost / termin |
| Waitlist | lista čekanja |
| Invoice / lesson package | račun / paket satova |
| Payer / guardian | platitelj / skrbnik |
| Cancel dialog / cancel lesson / delete | odustani / otkaži sat / izbriši |

Interpolation parameters, HTML tags and attributes, numbers, URLs, email addresses and newlines are preserved throughout the overrides. Names, legal entities, commercial amounts and example customer identities were not replaced with invented Croatian facts. Sample testimonials remain disabled under the existing `SHOW_PLACEHOLDER_SOCIAL_PROOF = false` gate.

The author review distinguished meaning errors from grammar and optional stylistic polish. Resolved examples:

| Finding | Correction |
| --- | --- |
| The source value `Pay` is shared by a business-pay explanation and payment buttons. A single translation lost the action meaning. | Buttons use `Plati`; `compSet.payDesc` explains the difference between lesson price and tutor pay. |
| The source value `Name` is shared by a subject name and a person's contact name. | `Naziv` for the subject; `Ime i prezime` for the support form. |
| `Cancel` covers both closing dialogs and cancelling lessons/invoices. | `Odustani`, `Otkaži sat`, and `Poništi račun` are assigned by context. |
| Abbreviated English entries such as `Tooltip`, `Must pay`, and `Confirm delete msg` omit useful meaning. | Fuller Lithuanian source copy and caller context informed Croatian waitlist help, booking restrictions and the irreversible account-deletion warning. |
| `dash.invoice` and `invoice.invoiceTitle` contain a date format in the source although callers use them as invoice labels. | Both use `Račun`; real date-format entries remain unchanged. |
| Payment-reminder source sentences are incomplete. | Croatian explains that the lesson remains unpaid while retaining the same student parameter and markup. |

This is an **author review plus technical verification, not a complete independent linguistic evaluation**. No final 1–10 score or native-speaker certification is claimed. For a full subsequent evaluation, use the supplied protocol's error deductions, count repeated root causes once, apply severity caps, and report both raw and capped scores. Passing integrity tests does not establish a 10.0 translation score.

## Verification and limits

- Final targeted regression run: **313 tests passed across 12 files**, with two workers. This includes Croatian checks, quiz components/navigation, shared locale loading, public pages, support, phone helpers, HTML escaping, metadata, SEO visibility and SSR rendering. Earlier concurrent runs exposed changing shared locale expectations and one import timeout; the final run passed without increasing timeouts.
- Focused checks cover the entire source-key set and protected tokens, browser/email/SSR dictionary loading, HTML escaping, payment/cancellation wording, Croatian date/phone handling, public labels, and continued noindex status.
- React component checks render Croatian tutor/business quiz choices and follow the business challenge-to-insight transition while retaining `/hr` in the route. These use jsdom and mocked external effects, not a live account.
- Frontend and API TypeScript checks pass. `git diff --check` passes.
- Live browser layout verification was unavailable: port 3000 served a different application, and this session could not bind a separate local preview port. The temporary inspection tab was closed; no other app or development server was changed.
- No real accounts, payments, emails, enquiries or database writes were used for verification. Mobile layouts, authenticated flows, delivered email layouts and exported documents still need QA.

## Before publication

1. **Native Croatian review:** check case agreement around runtime names, counts, gender, combined headings and narrow layouts. Review representative scheduling, cancellation, payment and invoice journeys with tutors and business administrators.
2. **Source defects:** `companyWait.inQueueSince` and `studentWait.addedOn` retain source date tokens that lack the caller's `{date}` placeholder. `cal.massCancelChars` likewise has no count placeholder in English. Fix source contracts and all affected dictionaries together instead of inventing Croatian-only parameters.
3. **Remaining hard-coded surfaces:** review embedded screenshots, user-authored content, third-party widgets and exports. For example, `Calendar.tsx` still has a hard-coded Lithuanian `Baigti` button. Full legal bodies remain English. A translated dictionary does not guarantee every rendered screen is Croatian.
4. **Commercial and legal review:** retain existing prices, marketing estimates, refund/trial claims and Lithuanian legal-entity types pending product review. Source copy about payment fees is inconsistent across pages. Translation does not establish Croatian invoicing, tax, payment-provider onboarding or payout readiness. Legacy `+370` validation messages were translated faithfully; the active international phone paths use localized examples.
5. **Keep release gates:** `hr` remains in `PENDING_TRANSLATION_LOCALES`, outside published sitemap/hreflang/IndexNow lists. Blog content retains English fallback; no Croatian blog columns or migration were added. Validate locale-preference persistence through the approved release process before publication.

See [the shared international locale guide](INTERNATIONAL_LOCALES.md) for release architecture.
