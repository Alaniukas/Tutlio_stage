# Laisvi vaikai: September 1–7 reconciliation

Read-only production preview on 2026-09-08: 13 planned invoices totaling €78, 23 skipped contracts and 22 held contracts. No invoices were created, no emails sent and no historical lesson evidence changed. Detailed local preview: `tmp/school-support-review/laisvi-billing-readonly.json` (contains private identifiers; do not publish).

## Nineteen outcome/payment holds

Six group occurrences on September 7 have neither a teacher Join timestamp nor an explicit outcome confirmation on any peer row. Student clicks and automatically completed statuses alone do not prove that the school delivered the group lesson. Sixteen unpaid held student rows need staff confirmation of the actual outcome. Three additional held rows carry existing paid flags and require payment reconciliation; two overlap these unconfirmed groups.

All times below are Europe/Vilnius. These are reconciliation references, not assertions that lessons occurred.

| Group ID | Time | Peer rows | Student clicks | Paid flags |
| --- | --- | ---: | ---: | ---: |
| 18bf3950-95fe-4d22-ba74-03b9a60a1428 | 09:00–09:45 | 4 | 2 | 0 |
| 14d8ad12-994b-47ae-a3bc-4502fc98dbe1 | 10:00–11:00 | 10 | 8 | 2 |
| c39e7435-12e3-4856-8b5f-a32c7fa3aefb | 12:00–13:00 | 6 | 4 | 0 |
| 82177160-a9db-4621-b592-40c6b64abde1 | 12:30–13:30 | 5 | 4 | 0 |
| 21ea6f7e-079d-4518-a0c9-31f3b7da4dbf | 14:00–15:00 | 3 | 2 | 0 |
| 924b1628-98aa-49e0-8333-6e5b64fb4b35 | 14:00–15:00 | 4 | 2 | 0 |

Paid-flagged sessions: `5e5cd69f-eff5-4f3c-9d33-193b961e84d3`, `7ce0cad9-2227-4bed-8cb2-a24448d3ec5a`, `be2de3ee-a127-4d5f-b18f-038c90bb2cc9`. All have price zero, paid=true/payment_status=paid, but no paid timestamp, payment method, invoice, Stripe, package or credit references. This does not establish whether money was received. Staff must identify the original payment or erroneous flag before billing; do not automatically reset them. The third row belongs to group `7eb59914-278c-42db-a50f-77d3d50fd969`, whose occurrence already has teacher Join evidence.

## Three individual schedule/linkage holds

| Contract ID | Finding | Required reconciliation |
| --- | --- | --- |
| 09598450-2ec4-4ab5-b0cc-d5f35cf8f4fc | Accepted Sep 7 14:07; agreed Monday 16:00–17:00; no matching individual row. Existing group rows are unrelated. | Verify whether this individual lesson took place and record its correct subject/outcome only from actual evidence. |
| b468a641-4c16-4828-a0e7-bb5801fb1e15 | Accepted Sep 7 14:29; agreed Monday 16:00–17:00; no nearby session rows. | Verify whether the lesson was delivered or cancelled; do not generate a historical billable occurrence from the schedule alone. |
| 813f62ef-bfb2-4f63-ac77-cdbbe4e34319 | Accepted Sep 7 12:00:32 during agreed 11:30–12:30 slot. Existing completed row f6081b3b-86e6-4b3b-a7ec-58eb8aaa4cd5 has no subject_id and starts before acceptance. | Verify the subject linkage and agreement/start timing. Neither whole-hour billing nor linkage can be inferred safely. |

## Code correction and safeguards

The old school lesson editor changed status without recording an explicit confirmation, leaving administrator-entered outcomes indistinguishable from automatic completion. The editor now offers an explicit outcome attestation, routed through the authenticated confirmation API. It accepts assigned teachers or same-organization administrators with sessions.edit, only after the lesson ends. Existing historical completed/no-show outcomes can be confirmed without repeating package counters or other transition effects. Conflicting finalized statuses must first be corrected through an explicit status workflow; they are not silently rewritten by confirmation.

The new evidence guard migration prevents browser-forged confirmation fields. It preserves current in-app teacher Join tracking only for the assigned teacher inside the actual join window, using database time; server-side Join and confirmation remain supported. No existing timestamps are backfilled. Clearing confirmation remains possible when reopening a lesson, which removes evidence rather than asserting delivery.

After staff reconcile these records, rerun the same read-only preview and review its changes before generating or sending invoices. The current holds are intentional and should not be removed by weakening the evidence requirements.
