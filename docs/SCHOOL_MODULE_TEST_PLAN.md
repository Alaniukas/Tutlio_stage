# School Module -- Phase 1 Test Plan

## Prerequisite: Seed Data

Before testing, a school and school admin must exist in the database.  
Run these SQL statements via Supabase SQL Editor (replace email/password as needed):

```sql
-- 1. Create the school
INSERT INTO public.schools (id, name, email, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Online School', 'admin@testschool.lt', 'active');

-- 2. Create an auth user for the school admin (via Supabase Dashboard > Authentication > Add User)
--    Email: admin@testschool.lt / Password: Test1234!
--    Then get the user's UUID from the auth.users table.

-- 3. Link the user as a school admin (replace <USER_UUID>)
INSERT INTO public.school_admins (user_id, school_id)
VALUES ('<USER_UUID>', '00000000-0000-0000-0000-000000000001');
```

---

## Changes Summary

### New files created

| File | Purpose |
|------|---------|
| `supabase/migrations/20260419000001_school_module.sql` | DB tables: schools, school_admins, school_contract_templates, school_contracts, school_payment_installments + columns school_id on students/profiles + RLS policies |
| `supabase/migrations/20260419000002_school_handle_new_user.sql` | Updated handle_new_user() trigger to propagate school_id to profile |
| `src/components/SchoolProtectedRoute.tsx` | Auth guard -- checks school_admins table |
| `src/components/SchoolLayout.tsx` | Sidebar layout with navigation for school admin |
| `src/pages/SchoolLogin.tsx` | Login page for school admins |
| `src/pages/school/SchoolDashboard.tsx` | Dashboard overview (stats, quick status) |
| `src/pages/school/SchoolStudents.tsx` | Student CRUD with parent/payer data |
| `src/pages/school/SchoolContracts.tsx` | Contract templates + per-student contracts |
| `src/pages/school/SchoolPayments.tsx` | Installment schedule creation + payment links |
| `src/pages/school/SchoolSettings.tsx` | Edit school name and email |
| `api/create-school-installment-checkout.ts` | Creates Stripe Checkout for an installment |

### Modified files

| File | What changed |
|------|--------------|
| `src/App.tsx` | Added imports + SchoolProtectedWithUser wrapper + /school/* routes |
| `src/lib/email.ts` | Added `'school_contract'` and `'school_installment_request'` to EmailType union |
| `api/send-email.ts` | Added `schoolContract()` and `schoolInstallmentRequest()` email template functions + wired in switch/case |
| `api/stripe-webhook.ts` | Added handler for `tutlio_school_installment_id` metadata (marks paid, auto-generates invite code on first payment) |
| `api/register-student.ts` | After registration, propagates school_id from student to profile |

---

## Test Cases

### TC-01: School Admin Login

**Route:** `/school/login`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to `/school/login` | Login page shows with emerald/teal branding, "School Administration" title |
| 2 | Enter non-admin credentials | Error: "This account is not a school administrator." |
| 3 | Enter valid school admin credentials | Redirects to `/school` (dashboard) |
| 4 | Navigate to `/school/login` while already logged in as school admin | Auto-redirects to `/school` |

### TC-02: School Admin Route Protection

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to `/school/students` without being logged in | Redirects to `/school/login` |
| 2 | Log in as a regular tutor, navigate to `/school/students` | Redirects to `/school/login` (not a school admin) |
| 3 | Log in as school admin, navigate to `/school/students` | Page loads normally |

### TC-03: School Dashboard

**Route:** `/school`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Log in as school admin | Dashboard shows with "Welcome back, Test Online School" |
| 2 | Check stat cards | Three cards: Students (0), Contracts (0), Payments (0/0) |
| 3 | Quick Status section | Shows "Everything looks good!" when no pending items |

### TC-04: Add Students

**Route:** `/school/students`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Add Student" | Dialog opens with student form + parent/payer fields |
| 2 | Fill only student name, click "Add Student" | Student created, appears in list with "Pending" badge |
| 3 | Fill student name + email + parent info, add | Student appears with parent info visible |
| 4 | Search for a student by name | List filters correctly |
| 5 | Search for a student by email | List filters correctly |
| 6 | Click on a student card | Detail dialog opens with all info |
| 7 | Click trash icon on a student | Confirm dialog, then student removed |
| 8 | Check dashboard after adding students | Student count updated |

### TC-05: Contract Templates

**Route:** `/school/contracts` (Templates tab)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Switch to "Templates" tab | Empty state shown |
| 2 | Click "New Template" | Dialog opens with name, default fee, and body textarea |
| 3 | Body textarea pre-filled with default template | Contains placeholders: `{{student_name}}`, `{{parent_name}}`, `{{annual_fee}}`, etc. |
| 4 | Set name = "Annual 2026", fee = 500, save | Template appears in list |
| 5 | Click "Edit" on template | Dialog opens pre-filled, can modify and save |
| 6 | Click trash on template | Template deleted |

### TC-06: Create and Send Contract

**Route:** `/school/contracts` (Contracts tab)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "New Contract" | Dialog with student dropdown, template dropdown, fee, body |
| 2 | Select a template | Fee auto-populates from template default, body fills in |
| 3 | Select a student | Placeholders in body replaced with student/parent names |
| 4 | Set annual fee, click "Create Contract" | Contract appears in list with "Draft" badge |
| 5 | Click "Send" on a draft contract | Email sent to parent/student email, status changes to "Sent" |
| 6 | Verify email received | Email has school branding (green header), contract body, fee table |
| 7 | Click "Mark Signed" on a sent contract | Status changes to "Signed", signed date shown |
| 8 | Check dashboard | Contract stats updated |

### TC-07: Create Payment Schedule

**Route:** `/school/payments`

**Prerequisite:** At least one signed contract exists.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "New Schedule" | Dialog opens with contract selector and installment rows |
| 2 | Select a signed contract | Contract info shown |
| 3 | Add 3 installment rows (click "Add") | 3 rows with amount + date inputs |
| 4 | Click "Auto-split evenly" | Amounts auto-calculated from annual fee / 3 |
| 5 | Set due dates, click "Create Schedule" | Schedule appears grouped by contract with progress bar |
| 6 | Verify amounts total matches annual fee | Summary row shows correct total |

### TC-08: Send Payment Link

**Route:** `/school/payments`

**Prerequisite:** Payment schedule exists with pending installments.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Send Link" on a pending installment | Loading spinner, then success toast |
| 2 | Check parent/payer email | Email received with payment link, amount, due date, school name |
| 3 | Click payment link in email | Stripe Checkout page opens with correct amount |
| 4 | Complete Stripe test payment (card 4242...) | Redirected to `/school/payments?success=1` |

### TC-09: Stripe Webhook -- Installment Payment

**Prerequisite:** Payment link sent and Stripe checkout completed.

| Step | Action | Expected |
|------|--------|----------|
| 1 | After Stripe payment completes | Webhook fires, installment status changes to "paid" |
| 2 | Check payment schedule in UI | Installment shows green "Paid" badge with date |
| 3 | Progress bar updates | Reflects new paid amount |

### TC-10: Auto Invite Code on First Payment

**Prerequisite:** Student has no invite code yet, first installment just paid.

| Step | Action | Expected |
|------|--------|----------|
| 1 | After first installment payment via Stripe | Webhook generates a 6-char invite code |
| 2 | Check students table in DB | `invite_code` is set on the student |
| 3 | Check student email (or parent email) | Invite email received with code and `/book/<CODE>` link |
| 4 | Navigate to `/book/<CODE>` | StudentOnboarding page loads with student data |
| 5 | Complete student registration | Student's `linked_user_id` is set |
| 6 | Check `profiles` table | New profile has `school_id` set |
| 7 | Check students page in school admin | Student shows "Registered" badge |

### TC-11: Second Installment Does NOT Re-generate Invite Code

| Step | Action | Expected |
|------|--------|----------|
| 1 | Send and pay the second installment | Installment marked as paid |
| 2 | Check student record | Invite code is unchanged (not regenerated) |
| 3 | No duplicate invite email sent | Only the first payment triggers invite |

### TC-12: School Settings

**Route:** `/school/settings`

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to settings | Current school name and email pre-filled |
| 2 | Change name, click "Save Changes" | Success toast, name updated |
| 3 | Verify sidebar updates | School name in sidebar header reflects new name (after page reload) |

### TC-13: School student_id propagation via /book/:inviteCode

| Step | Action | Expected |
|------|--------|----------|
| 1 | School admin adds student with school_id | students.school_id = school UUID |
| 2 | After first payment, invite code generated | Student can register at `/book/<CODE>` |
| 3 | Student completes registration | `profiles.school_id` is set to same school UUID |
| 4 | Verify in DB: `SELECT school_id FROM profiles WHERE id = '<STUDENT_USER_UUID>'` | Returns the school UUID |

### TC-14: Edge Cases

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create contract for student with no email | "Send" shows error: "No email address for this student or parent" |
| 2 | Create payment schedule with 0 installments | "Create Schedule" button stays disabled |
| 3 | Try to pay an already-paid installment via API | Returns 400: "Already paid" |
| 4 | Delete an installment that's already paid | Delete button not shown for paid installments |
| 5 | Non-school-admin calls `/api/create-school-installment-checkout` | Returns 403: "Not a school admin" |
| 6 | Send payment link for installment from different school | Returns 403: "Installment does not belong to your school" |

---

## Database Tables to Verify

After running migrations, confirm these tables exist:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'school%';
```

Expected: `schools`, `school_admins`, `school_contract_templates`, `school_contracts`, `school_payment_installments`

Confirm new columns:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'students' AND column_name = 'school_id';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'school_id';
```

Confirm RLS helper function:

```sql
SELECT proname FROM pg_proc WHERE proname = 'is_school_admin';
```

---

## Stripe Test Configuration

For testing Stripe payments locally:

1. Use Stripe test mode keys in `.env.local`
2. Run Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe-webhook`
3. Use test card: `4242 4242 4242 4242`, any future expiry, any CVC
4. Webhook events to verify: `checkout.session.completed`
