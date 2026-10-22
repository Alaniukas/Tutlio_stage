# Pro Klasė: pricing frequency when creating a client

Release reconciliation, 2026-10-22: the original feature is in `047dc1af98c16fabe12647f3c4b1c0f565d3b73f`, and the additional automatic-mode display correction is in `c9987d87`. Both are included in the user's now-authorized combined production release. The original verification below created and removed synthetic records only in the QA organization, without changing real customer records, payments, invoices or messages. The expanded release check passed 201 tests across 19 files. Deployment and live-QA receipts are in ignored `output/proklase-check-20261022/172814/release/`.

## Request and evidence

The user supplied `WhatsApp Video 2026-10-22 at 15.59.50.mp4` (31.43 seconds) and asked to check it for Pro Klasė. The recording requests a weekly lesson-count selector while adding a client, so the administrator can choose the pricing frequency before saving instead of remembering to edit the new card afterward. Statements inside the recording were treated as incident evidence, not authorization for production changes.

The user explicitly authorized sending this recording's audio to OpenAI for transcription. Extracted frames, audio and transcript remain in ignored `output/proklase-check-20261022/155950/`.

Read-only production inspection confirmed that `students.pricing_lessons_per_week`, `students.pricing_lessons_per_week_is_manual`, `set_student_pricing_frequency(uuid, smallint)` and the recurring-frequency triggers already exist. Pro Klasė has three grade bands for each of the 1-, 2- and 3-lesson pricing tiers. This change requires no schema migration.

## Behavior

- The new-client form displays “Pamokų per savaitę (kainodara)” beside the grade selector. It uses the existing localized automatic and 1–7 weekly options from the student card.
- The same control is available for each additional child and for a sibling added from an existing card. Each child has an independent selection. A new form starts in automatic mode.
- An explicit frequency is inserted with the student and marked manual on every new tutor assignment, before lesson creation or invitations. Leaving automatic mode selected keeps the existing column defaults.
- Pricing reads carry the manual flag. Creating a recurring series uses a valid manual frequency even when that series contains only one weekday. A subsequent frequency write cannot replace that manual contract with the size of the new series.
- For automatic Pro Klasė pricing, recurring creation/conversion requests automatic recomputation through the existing RPC with `p_lessons_per_week = null`. This uses the child's whole schedule instead of pinning the count to a single series. Manual contracts are retained when converting a one-off lesson to a series.
- An unsuccessful pricing read stops lesson/template creation instead of assuming the contract is automatic. Individual-price priority and trial pricing are preserved.
- The creation selector is restricted to the existing Pro Klasė admin context, including its QA organization. Other organization forms retain their existing fields.

## Verification

138 tests passed across 17 files. Coverage includes the actual client form, all tutor assignments, separate children, sibling creation, returning to automatic mode, draft reset, actual recurring creation/conversion, failed pricing reads, trial and individual prices, other organization forms and the required tutor-invoice privacy regressions.

The first sandboxed Vitest invocation could not collect tests because Windows rejected temporary-file renames with `EPERM`. The successful run used the same synthetic fixtures outside that filesystem sandbox. UI tests render the real components with mocked services; this is not a live production-browser verification.

`npm run lint`, `npm run build` and `git diff --check` passed. The build retains the existing Tailwind sourcemap, Excalidraw import and bundle-size warnings. The React review confirmed controlled per-child state, a module-level reusable field, associated labels, keyboard selection and reuse of existing translations.

A production release requires the explicit authorization and `simo-local` commit/clean-checkout/push sequence in AGENTS.md section 8. Pre-existing unrelated workspace changes were preserved.

## Follow-up: live verification requested by the user

The user explicitly requested double-checking the implementation. The full story checked was: the administrator selects a weekly pricing frequency in the client form, the student assignments retain the selection, recurring lessons use the correct tier, and the saved mode is rendered correctly when the card is reopened.

The deployed QA form rendered the new selector with automatic and 1–7 weekly choices. Selecting 3 for the first child and 2 for an additional child preserved both independent draft values. This browser check did not submit invitations or provision accounts. The browser console contained no errors during these checks. Screenshot: ignored `output/proklase-check-20261022/155950/double-check/create-form.png`.

An integration script signed in through Supabase Auth with the existing QA administrator, then used that authenticated client's normal RLS path to insert the same pricing fields used by the form. The service role was used only to verify fixture ownership and clean up the exact synthetic IDs. All six live checks passed:

| Check | Observed result |
| --- | --- |
| Student creation with manual frequency | Both tutor assignments stored frequency 3 and manual=true. |
| Recurring series for a manual contract | Two separate one-day series retained frequency 3; their regular lessons cost €22 each. |
| Automatic frequency across tutors | Two series produced frequency 2 and manual=false. Automatic RPC recomputation changed both unpaid future lessons to €25. |
| Different children sharing a payer | Recomputing the automatic child left the other child's manual frequency at 3. |
| Trial lesson | €10 remained unchanged by the dynamic tier. |
| Individual price | The explicit €19 price took priority over the €22 dynamic tier. |

The deployed browser then loaded the newly inserted automatic child's card. This exposed a rendering bug: the database stored frequency=2 with manual=false, but the selector displayed “2 k./sav.” as though the contract were manual. The old value expression ignored the mode whenever an effective count existed.

The local correction selects a numeric option only when the manual flag is true. Automatic mode now displays its automatic option while the separate effective-frequency hint still shows 2. The label is also associated with its control. Two real-component regressions cover both modes with the same stored count; the sibling creation test scopes its control to that child's form.

The follow-up passed 73 tests across 7 files, plus `npm run lint`, `npm run build` and `git diff --check`. At that verification stage, the extra label correction had been verified in rendered component tests and had not yet been released; see the release reconciliation above for its later inclusion.

All four synthetic student assignments, four recurring templates, six lessons and the individual-price fixture were removed. A separate database query confirmed zero remaining fixture students, lessons or series, and the browser search returned no matches with the original QA client count restored. The QA browser session was signed out. Receipt: ignored `output/proklase-check-20261022/155950/double-check/live-qa.json`.

Scope: this combines live browser selection/readback, authenticated database integration and real-component submission tests. It is not a claim of one uninterrupted live browser submission. The local Vite server returned HTTP 200 but was inaccessible to the integrated browser, so deployed browser checks used the released version of the feature. No production code or schema was changed by this verification.
