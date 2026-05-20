# Sync guide: cherry-pick targets (2026-05-20)

**Branch at time of writing:** `Simo-local` (base commit `3be9d60`)  
**Status:** Changes below are **uncommitted** in the working tree unless you have since committed them.  
**Purpose:** Give agents (or humans) an exact file list when syncing to `tutlio/main`, `origin/main`, or another branch — without pulling unrelated Perlas / SEO / enterprise work from the same branch.

**Do not cherry-pick the whole branch** — `Simo-local` also contains Perlas Finance, SEO middleware, whiteboard overhaul, etc. Pick **only** the paths listed in the bundles below.

---

## Bundle A — Tutor/student lesson cancel fix

### Problem

- Tutors (especially on mobile Calendar) saw the cancel modal close but the lesson stayed **active**.
- Cause: client-side Supabase cancel (RLS failures) + `Calendar.tsx` closed the modal even when cancel failed.
- Local dev: `/api/cancel-session` returned **401** when `dev:test` env vars were overwritten by `.env.local`.

### Solution summary

- All tutor/org cancel flows use **`POST /api/cancel-session`** (service role) via `src/lib/lesson-actions.ts`.
- API validates auth (tutor, org admin, student, **parent**).
- Calendar/Dashboard only close UI on success; errors use toast/alert.
- `realtime.setAuth` is unrelated to cancel but was fixed the same day for chat (Bundle B).

### Files to include (cancel bundle)

| Path | Role |
|------|------|
| `api/_lib/cancel-session-access.ts` | **NEW** — `canTutorSideCancelSession`, `canStudentSideCancelSession` |
| `api/cancel-session.ts` | Auth checks, `reasonTrimmed`, parent fallback, tutor email on tutor-cancel |
| `api/_lib/auth.ts` | Try `SUPABASE_URL` + `VITE_SUPABASE_URL` for Bearer validation |
| `src/lib/lesson-actions.ts` | **REPLACED** — thin wrapper `cancelSessionViaApi` → `/api/cancel-session` (removed ~300 lines client-side cancel/waitlist) |
| `src/pages/Calendar.tsx` | Close modal only on success; toast on error |
| `src/pages/Dashboard.tsx` | Surface API error in toast |
| `src/pages/Students.tsx` | Use API cancel (was direct `sessions.update`) |
| `src/pages/company/CompanySessions.tsx` | Use shared helper + alert on failure |
| `src/pages/company/CompanyTvarkarastis.tsx` | Use API cancel (was direct `sessions.update`) |
| `scripts/dev-api-local.ts` | Preserve `dev:test` / `dev:prod` Supabase env; warn on URL mismatch |
| `tests/lib/cancel-session-via-api.test.ts` | **NEW** — client wrapper tests |
| `tests/api/cancel-session-access.test.ts` | **NEW** — access helper tests |

### Files to exclude from cancel bundle

- `src/pages/StudentSessions.tsx` — already called `/api/cancel-session` directly (unchanged in this work; optional to verify parity).

### Production requirements

- Vercel env: `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_URL` (or `VITE_SUPABASE_URL`) on the **same** Supabase project as the browser anon key.
- Deploy **API + frontend** together.

### Verify

1. Tutor: Calendar → open lesson → cancel with reason (≥5 chars) → lesson becomes cancelled; on failure modal stays open.
2. Org admin: company schedule/sessions cancel.
3. Student/parent cancel still works via existing `StudentSessions` flow.

---

## Bundle B — Real-time messaging (chat UI)

### Problem

- Messages saved to DB but **chat box did not update instantly** for tutor or student.
- Causes: no optimistic append after send; Realtime JWT not set (`realtime.setAuth`); unreliable filtered `postgres_changes`.

### Solution summary

- `supabase.realtime.setAuth(access_token)` on session load and auth changes.
- `appendMessage()` after successful send in `ChatWindow`.
- 4s silent poll fallback while conversation is open.
- Realtime channel error → refetch.
- DB: `REPLICA IDENTITY FULL` on `chat_messages`.

### Files to include (chat bundle)

| Path | Role |
|------|------|
| `src/lib/supabase.ts` | `realtime.setAuth()` on `getSession` + `onAuthStateChange` |
| `src/hooks/useChat.ts` | `appendMessage`, merge helper, poll fallback, subscribe status handler |
| `src/components/chat/ChatWindow.tsx` | Call `appendMessage` after text/file send |
| `supabase/migrations/20260520100000_chat_messages_realtime_replica.sql` | **NEW** — `ALTER TABLE chat_messages REPLICA IDENTITY FULL` |

### Production requirements

- Run migration on Supabase (or `supabase db push`).
- Dashboard → Database → Publications: `chat_messages` and `chat_participants` on `supabase_realtime` (should already exist from `20260406200000_chat_system.sql`).

### Verify

1. Two browsers: tutor + student in same conversation.
2. Send message → appears immediately for sender; other side within ~1s (Realtime) or ≤4s (poll).

---

## Bundle C — Student invite onboarding (no separate email confirmation)

### Problem

- After student registration via invite link, UI told users to **confirm email** in inbox, but product intent is: **invite link already proves email** → account should be login-ready immediately.

### Solution summary

- `api/register-student.ts`: `signUp` + confirmation email → **`auth.admin.createUser`** with `email_confirm: true` and `user_metadata` (no anon client / no `emailRedirectTo`).
- `StudentOnboarding.tsx`: success step shows green “account ready” instead of violet “check your email”.
- i18n: new key `onboard.accountReady` in all locale files.

### Files to include (student email bundle)

| Path | Role |
|------|------|
| `api/register-student.ts` | Admin `createUser`, `email_confirm: true`, drop anon key requirement |
| `src/pages/StudentOnboarding.tsx` | Success UI: `accountReady` + green check (not `confirmEmail` flow) |
| `src/lib/i18n/en.ts` | `onboard.accountReady` |
| `src/lib/i18n/lt.ts` | `onboard.accountReady` |
| `src/lib/i18n/de.ts` | `onboard.accountReady` |
| `src/lib/i18n/dk.ts` | `onboard.accountReady` |
| `src/lib/i18n/ee.ts` | `onboard.accountReady` |
| `src/lib/i18n/es.ts` | `onboard.accountReady` |
| `src/lib/i18n/fi.ts` | `onboard.accountReady` |
| `src/lib/i18n/fr.ts` | `onboard.accountReady` |
| `src/lib/i18n/lv.ts` | `onboard.accountReady` |
| `src/lib/i18n/no.ts` | `onboard.accountReady` |
| `src/lib/i18n/pl.ts` | `onboard.accountReady` |
| `src/lib/i18n/se.ts` | `onboard.accountReady` |

### Production requirements

- `SUPABASE_SERVICE_ROLE_KEY` on Vercel (already required for this API).
- No Supabase Auth “confirm email” template change required for this flow (confirmation email no longer sent for invite signup).

### Verify

1. Open student invite link → complete onboarding → see “account ready” → log in immediately without inbox confirmation.

---

## Bundle D — Minor UI cleanup (optional)

Non-functional purple **initials avatar** removed from mobile tutor header and student header.

| Path | Role |
|------|------|
| `src/components/Layout.tsx` | Remove top-right avatar on mobile; center logo |
| `src/components/StudentLayout.tsx` | Remove top-right initials circle |

Safe to include with any sync; not required for cancel/chat/onboarding fixes.

---

## Combined file list (copy-paste for agents)

```text
# A — Cancel
api/_lib/cancel-session-access.ts
api/cancel-session.ts
api/_lib/auth.ts
src/lib/lesson-actions.ts
src/pages/Calendar.tsx
src/pages/Dashboard.tsx
src/pages/Students.tsx
src/pages/company/CompanySessions.tsx
src/pages/company/CompanyTvarkarastis.tsx
scripts/dev-api-local.ts
tests/lib/cancel-session-via-api.test.ts
tests/api/cancel-session-access.test.ts

# B — Chat realtime
src/lib/supabase.ts
src/hooks/useChat.ts
src/components/chat/ChatWindow.tsx
supabase/migrations/20260520100000_chat_messages_realtime_replica.sql

# C — Student onboarding email
api/register-student.ts
src/pages/StudentOnboarding.tsx
src/lib/i18n/en.ts
src/lib/i18n/lt.ts
src/lib/i18n/de.ts
src/lib/i18n/dk.ts
src/lib/i18n/ee.ts
src/lib/i18n/es.ts
src/lib/i18n/fi.ts
src/lib/i18n/fr.ts
src/lib/i18n/lv.ts
src/lib/i18n/no.ts
src/lib/i18n/pl.ts
src/lib/i18n/se.ts

# D — Optional UI
src/components/Layout.tsx
src/components/StudentLayout.tsx
```

---

## How to cherry-pick (git)

### If changes are committed on `Simo-local`

```bash
# Example: cherry-pick one commit that only contains these fixes
git fetch origin
git checkout target-branch
git cherry-pick <commit-sha>
```

Prefer **one commit per bundle** (A, B, C) for cleaner history.

### If changes are still uncommitted (typical)

```bash
# From repo root, on a branch with only the desired files staged:
git add <paths from Combined file list>
git commit -m "fix: lesson cancel via API, chat realtime UX, student invite without email confirm"
```

Or generate a patch:

```bash
git diff HEAD -- <paths> > patches/2026-05-20-sync.patch
git apply patches/2026-05-20-sync.patch
```

### Suggested commit messages

- **A:** `fix: tutor lesson cancel via API and keep modal open on failure`
- **B:** `fix: instant chat updates (realtime auth, optimistic append, replica)`
- **C:** `fix: student invite signup without separate email confirmation step`
- **D:** `chore: remove non-functional header avatars`

---

## Overlap with `tutlio/main` (2026-05-20 audit)

Upstream `tutlio/main` has **different** recent work (Stripe trial, auth locale emails, subscribe flow). These bundles are **not** on `tutlio/main` as of the audit. When merging:

1. Cherry-pick A/B/C onto your line (e.g. `Simo-local` or `main`).
2. Resolve conflicts in `Calendar.tsx`, `lesson-actions.ts`, `auth.ts` if upstream touched the same files.
3. Run migration `20260520100000_chat_messages_realtime_replica.sql` after deploy.

---

## Related upstream-only (do NOT expect in this workspace)

If syncing **from** `tutlio/main` **into** this branch, separate tickets:

- 7-day Stripe trial / `startTrial` (`TutorSubscribe`, `create-subscription-checkout`)
- Multilocale Supabase email templates under `supabase/email-templates/`
- `api/request-password-reset.ts`, `src/lib/auth-locale.ts`

Those are independent of the 2026-05-20 bundles above.

---

## Quick test checklist

| Bundle | Test |
|--------|------|
| A | Tutor cancels lesson on Calendar (mobile width); lesson status = cancelled |
| A | Failed cancel shows error; modal does not close |
| B | Chat message appears instantly for sender and receiver |
| C | Student invite onboarding → login without email confirmation step |
| D | No dead avatar button top-right on tutor mobile / student header |

---

*Generated for agent/human sync workflows. Update this file if commits are split or rebased.*
