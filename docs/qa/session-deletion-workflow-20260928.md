# Session deletion: real UI workflow QA

Date: 2026-09-28. The deletion workflows and fixture cleanup below are complete. Known limits are recorded separately.

## Environment and scope

The root agent operated the application through CUA and clicked the actual UI controls. These flows called the real local API and the active production Supabase project `cuhciqwmqfuajeeqjjbm`; they did not use mocked sessions or responses. All test writes were limited to Demo Mokykla, organization `c3a00000-7e57-4000-8000-000000000001`.

Fixtures use tag `QA_DELETE_20260928` and UUID prefix `c3a09280-7e57-4000-8000-`. The temporary helper and manifest are ignored QA artifacts. Local outbound mail suppression was enabled with value `1`. No emails, billing actions, commits, or deployments were performed. QA used a stable preview on port 3001 serving the frozen build copy at `tmp/session-deletion-preview-dist`, verified after the `common.hide` adjustment; it called the real local API on port 3002 and the production Demo database.

The exact migration application, permissions, and independent live recurrence guard proof are recorded in [migration verification](C:/Users/1olim/Downloads/Tutlio/docs/qa/session-deletion-migration-20260928.md).

## Completed checks

All dates and calendar times below use Europe/Vilnius. Fixture/template suffixes refer to the UUID prefix above.

| Actual UI flow | Result | Verified database state |
| --- | --- | --- |
| Demo admin, single occurrence in template `102` | PASS | Three lessons became two. Deleted `204` on October 1 at 10:00–11:00; `205` on October 8 and `206` on March 4 remained. A matching `single` exclusion was persisted. |
| Demo admin, all remaining occurrences in template `102`, after the single deletion | PASS | Two lessons became zero; the remaining October 8 and March 4 rows were removed. |
| Demo admin, this and future occurrences in template `103`, anchored on October 8 | PASS | Three lessons became one. Removed `208` on October 8 and `209` on March 4; `207` on October 1 remained. |
| Student, single occurrence `207` in template `103`, after the admin future deletion | PASS | The remaining one lesson became zero through the student's actual UI. |
| Parent, single occurrence in template `104` through the lesson list | PASS | Three lessons became two. Removed `210` on October 1; `211` on October 8 and `212` on March 4 remained. |
| Tutor, all remaining occurrences in template `104` from the hidden cancelled-lesson list | PASS | Two lessons became zero. Opened the October 8 lesson `211` at 13:00, selected ALL, and clicked the final React `Ištrinti`. Both `211` and `212` were deleted. Template `101` still had three lessons, and the group still had six. |
| Demo admin, one student's single group occurrence (`one_student`) | PASS | Group `500` went from six rows to five. Only Lukas's `213` on October 1 at 14:00–15:00 was deleted; Gabija's `214` at the same time remained. Both October 8 rows (`215`, `216`) and March 4 rows (`217`, `218`) remained. A `single` exclusion was persisted for group `500`, Lukas, and the October 1 start. |
| Demo admin, all remaining occurrences for the whole group (`whole_occurrence`) | PASS | Group `500` went from five rows to zero. Removed `214` on October 1, `215`/`216` on October 8, and `217`/`218` on March 4. The persisted `all` exclusion has `student_id=null`. Template `101` retained three lessons; source `616` remained exact; the existing external October 1 group retained its seven rows. |

The parent deletion was performed in `StudentSessions` at `/parent/lessons?studentId=c3a00000-7e57-4000-8000-0000000000e1`.

The tutor check used a fresh serial login. Its raw cancelled-lesson list displayed `211` even with `hidden_from_calendar=true`, allowing the tutor to open the exact lesson, choose among the three recurrence scopes, and complete the ALL deletion. The result list no longer showed template `104` rows. The hidden state was prepared separately, as documented below; this does not establish that the earlier UI hide action succeeded.

For the group participant check, the admin opened Lukas's `213` from `CompanySessions`, selected the single scope, and confirmed the deletion in React. The admin then opened the surviving Gabija row `214`; its student, topic, and time were correct. This check establishes one-student scope without removing the other participant or later group occurrences.

For the whole-group check, the admin first opened Groups and returned to the calendar so that the merged group metadata was loaded. The October 8, 14:00 `QA_DELETE_20260928_GROUP` card showed two members, Lukas and Gabija. The deletion dialog offered three scopes and explicitly said the group action applied to all its students. The admin selected ALL and clicked the final React delete confirmation; all five remaining fixture group rows were removed.

The independent live SQL guard probe after deleting `204` attempted an active lesson with the same student/template/start and a fresh UUID. The recurrence trigger rejected it with the expected message. After rollback, zero active rows existed for that deleted occurrence and the other two lessons remained. See the linked migration verification for the full result.

### Administrator screenshots

- [Recurrence choices](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/admin-recurrence-options.jpg)
- [Single confirmation](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/admin-single-confirm.jpg) and [single result](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/admin-single-result.jpg)
- [Future confirmation](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/admin-future-confirm.jpg) and [future result](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/admin-future-result.jpg)
- [All confirmation](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/admin-all-confirm.jpg) and [all result](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/admin-all-result.jpg)
- [One-student group choices](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/group-one-student-options.jpg) and [other participant remains](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/group-other-student-remains.jpg)
- [Whole-group choices](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/group-whole-options.jpg), [whole-group confirmation](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/group-whole-confirm.jpg), and [whole-group result](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/group-whole-result.jpg)

### Family screenshots

- [Parent recurrence choices](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/parent-options.jpg) and [parent single result](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/parent-single-result.jpg)
- [Student recurrence choices](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/student-options.jpg) and [student single result](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/student-single-result.jpg)

### Tutor screenshots

Actual tutor deletion evidence after hidden-state setup and fresh login: [hidden lesson list](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/tutor-hidden-list.jpg), [recurrence options](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/tutor-options.jpg), [ALL deletion result](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/tutor-all-result.jpg). The list/options screenshots were refreshed during this successful tutor session.

## Availability after booking and deletion

PASS through the actual UI. The original one-time source `c3a09280-7e57-4000-8000-000000000616` covers October 1, 16:00–18:00. It contains both subject IDs (`c3a00000-7e57-4000-8000-000000000011`, `c3a00000-7e57-4000-8000-000000000012`), `public_bookable=true`, and meeting link `https://example.invalid/QA_DELETE_20260928`.

The admin booked Gabija's Mathematics lesson for 16:00–17:00 through the real booking form (created lesson `fe30b9fd-0efe-40ff-8f22-a902156ba7a1`). The calendar then showed a blue lesson at 16:00–17:00 and green availability at 17:00–18:00. After hard deletion through the UI, the whole 16:00–18:00 interval appeared green again. The original availability row, both subjects, public-booking flag, and meeting link were preserved exactly throughout booking and deletion.

- [Original availability](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/availability-original.jpg)
- [Actual booking form](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/availability-booking-form.jpg)
- [Booked calendar](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/availability-booked-calendar.jpg)
- [Restored calendar](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/availability-restored-calendar.jpg)

## UI adjustments and automated validation

Native browser confirmation stalled automation in an older tab. The final flow uses a React confirmation after selecting the recurrence scope. The two-step confirmation changes passed 68 focused frontend tests. The cancelled-lesson hide action now says `Slėpti` and uses the `EyeOff` icon.

Frontend TypeScript lint and build exited successfully after the latest hide-label adjustment. API TypeScript lint and 206 focused regression tests passed before the final two-step UI change; this document does not claim they were rerun after it.

## Cleanup verification

PASS, independently verified at 10:50:23 UTC: [cleanup proof](C:/Users/1olim/Downloads/Tutlio/tmp/QA_DELETE_20260928-cleanup-proof.json). Cleanup removed only the three remaining fixture lessons (`201`, `202`, `203`), sixteen owned availability rows, templates `101`–`104`, isolated group `500`, and its related fixture records.

| Cleanup check | Result |
| --- | --- |
| Fixture data | PASS. Sessions, templates, groups, members, slots, exclusions, tagged availability, booking rows, and owned booking-range rows all count zero. |
| Original child pricing | PASS. All three Demo children restored to their original frequency `null` and manual flag `false`. |
| Original availability | PASS. The scoped baseline contained zero rows and remained unchanged; no original availability changes were recorded. The temporary source `616` was removed as owned QA data after its preservation had been verified. |
| Existing external group | PASS. The same seven rows retained their students, times, statuses, and group ID. |
| Files and chat | PASS. All nineteen exact session storage folders, including the booking, were empty; known parent-room paths and tagged chat artifacts were also empty. |
| QA manifest | PASS. State is `cleaned`. |
| Calendar after reload | PASS. The September 28–October 4 view contained no owned `QA_DELETE_20260928` lessons or green fixture availability. The existing October 1, 11:00–11:45 group with seven members remained. |

Visual cleanup evidence: [calendar after cleanup](C:/Users/1olim/.codex/visualizations/2026/09/28/01a0e72f-d79c-7982-a4e7-f17441a4e7fb/session-deletion/cleanup-calendar.jpg).

The earlier stalled native-confirmation tab was recovered to login, and all QA tabs were closed. The dedicated port 3001 preview process was stopped; the shared port 3000/3002 development servers were left running for other tasks. No browser handoff remains outstanding. No application commit or deployment was made.

## Known limits

| Check | Current status |
| --- | --- |
| Tutor hide button | UNCERTIFIED. Clicking `Slėpti` closed the modal, but the independent read still showed fixture `211` with `hidden_from_calendar=false`. The cause of that attempt was not established. |

For the hidden-row deletion check, the root explicitly authorized fixture preparation to change only `211` from `hidden_from_calendar=false` to `true`. Independent readback at 10:37:23 UTC confirmed it. This is fixture setup, not a successful UI hide check: [setup proof](C:/Users/1olim/Downloads/Tutlio/tmp/QA_DELETE_20260928-hidden211-setup-proof.json), [failed UI hide readback](C:/Users/1olim/Downloads/Tutlio/tmp/QA_DELETE_20260928-hidden211-proof.json).

Auth cross-session/old-session swaps were observed while multiple role tabs were open during the tutor setup. This does not establish the cause of the failed hide attempt. The root closed the other role tabs and signed in serially before the successful tutor deletion.

The existing `ParentCalendar` path was blocked by its missing profile-link condition (`!linkRes.data`). Parent lesson-list deletion passed as recorded above; no legacy profile-link fix was included. A clean browser console was not established: chat RLS and stale JSX messages were present during the session, and their wider effect remains unverified.
