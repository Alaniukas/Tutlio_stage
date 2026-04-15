# Feature Testing Plan

## Feature 1: Auto-Remove from Waitlist After Session Occurs

### Test Case 1: Session-Specific Waitlist Entry Removal
**Setup:**
1. Create a session for tomorrow at 10:00 AM
2. Add Student A to waitlist for this specific session

**Steps:**
1. Manually change session status to 'completed' in database OR wait for session time to pass
2. Run auto-complete cron: `curl http://localhost:3000/api/auto-complete-sessions` (or wait for cron)
3. Check waitlist table in database
4. Visit Waitlist page in UI

**Expected Result:**
- Waitlist entry for Student A is deleted from database
- API response includes `waitlistEntriesRemoved: 1`
- Waitlist page does not show Student A

### Test Case 2: Generic Waitlist Entry Preservation
**Setup:**
1. Add Student B to waitlist without specific session (generic "any time" entry)

**Steps:**
1. Run auto-complete cron
2. Check waitlist table

**Expected Result:**
- Student B remains in waitlist (not removed)
- Only session-specific entries for past sessions are removed

### Test Case 3: Old Generic Entry Cleanup (30 days)
**Setup:**
1. Manually create waitlist entry with `created_at` = 35 days ago and `session_id` = null

**Steps:**
1. Run auto-complete cron
2. Check waitlist table

**Expected Result:**
- Old generic entry is removed
- Recent generic entries are preserved

### Test Case 4: Client-Side Filtering
**Setup:**
1. Add Student C to waitlist for a session tomorrow
2. Manually set session end_time to yesterday in database (simulate past session)
3. Do NOT run cron yet

**Steps:**
1. Visit Waitlist page

**Expected Result:**
- Student C does not appear on Waitlist page (filtered out client-side)
- Entry still exists in database until cron runs

---

## Feature 2: Auto-Deduct from Lesson Package

### Test Case 1: Single Session with Available Package
**Setup:**
1. Create Student A with subject "Mathematics"
2. Create lesson package for Student A:
   - Subject: Mathematics
   - Total lessons: 5
   - Available lessons: 5
   - Reserved lessons: 0
   - Paid: true
   - Active: true

**Steps:**
1. As tutor, create a new session for Student A in Mathematics
2. Do NOT check "Mark as Paid"
3. Save session
4. Check database: sessions table
5. Check database: lesson_packages table

**Expected Result:**
- Session is created with `paid=true`, `payment_status='confirmed'`, `lesson_package_id=[package_id]`
- Package updated: `available_lessons=4`, `reserved_lessons=1`
- Student receives email with "Apmokėta iš pamokų paketo"
- Parent does NOT receive payment email

### Test Case 2: Single Session - No Package Available
**Setup:**
1. Student B has NO lesson packages for Mathematics

**Steps:**
1. Create session for Student B in Mathematics
2. Do NOT check "Mark as Paid"
3. Save session

**Expected Result:**
- Session created with `paid=false`, `payment_status='pending'`, `lesson_package_id=null`
- Student receives email with "Laukiama apmokėjimo"
- Parent receives payment email (if configured)

### Test Case 3: Package Exhaustion
**Setup:**
1. Student C has package with 2 available lessons in Physics

**Steps:**
1. Create session 1 for Student C in Physics
2. Check package: should have 1 available, 1 reserved
3. Create session 2 for Student C in Physics
4. Check package: should have 0 available, 2 reserved
5. Create session 3 for Student C in Physics
6. Check package and session 3

**Expected Result:**
- Sessions 1 & 2: paid via package
- Session 3: created as unpaid (no package lessons remaining)
- Package: `available_lessons=0`, `reserved_lessons=2`

### Test Case 4: Multiple Packages - FIFO Order
**Setup:**
1. Student D has 2 packages for English:
   - Package 1 (older): created 2 days ago, 3 available lessons
   - Package 2 (newer): created today, 5 available lessons

**Steps:**
1. Create session for Student D in English
2. Check which package was used

**Expected Result:**
- Older package (Package 1) is used first
- Package 1: `available_lessons=2`, `reserved_lessons=1`
- Package 2: unchanged
- Session links to Package 1

### Test Case 5: Different Subjects
**Setup:**
1. Student E has package for Mathematics (5 lessons)
2. Create session for Student E in Physics

**Steps:**
1. Create session in Physics (different subject)

**Expected Result:**
- Session created as unpaid
- Mathematics package is NOT used (wrong subject)

### Test Case 6: Recurring Sessions with Package
**Setup:**
1. Student F has package for Chemistry with 10 available lessons

**Steps:**
1. Create recurring session for Student F in Chemistry
2. Weekly, for 8 weeks (8 total sessions)
3. Save recurring session

**Expected Result:**
- 8 sessions created, all paid via package
- Package: `available_lessons=2`, `reserved_lessons=8`
- Student receives confirmation email with package payment status

### Test Case 7: Recurring Sessions - Package Runs Out
**Setup:**
1. Student G has package for Biology with 3 available lessons

**Steps:**
1. Create recurring session for Student G in Biology
2. Weekly, for 5 weeks (5 total sessions)
3. Save recurring session

**Expected Result:**
- First 3 sessions: paid via package
- Last 2 sessions: unpaid (package exhausted)
- Package: `available_lessons=0`, `reserved_lessons=3`

### Test Case 8: Assign Student to Availability Slot with Package
**Setup:**
1. Student H has package for Spanish (5 lessons)
2. Create availability slot for Spanish

**Steps:**
1. Open availability slot
2. Assign Student H to the slot
3. Save assignment

**Expected Result:**
- Session created with package payment
- Package: `available_lessons=4`, `reserved_lessons=1`
- Student receives email with package payment status

### Test Case 9: Group Lesson - Individual Packages
**Setup:**
1. Create group lesson subject "Art" (max 5 students)
2. Student I has package for Art (5 lessons)
3. Student J has NO package for Art

**Steps:**
1. Create group session in Art
2. Select both Student I and Student J
3. Save session

**Expected Result:**
- Session for Student I: paid via package
- Session for Student J: unpaid
- Student I's package: `available_lessons=4`, `reserved_lessons=1`

### Test Case 10: Session Completion Updates Package
**Setup:**
1. Student K has active session paid via package
2. Package shows: `reserved_lessons=1`, `completed_lessons=0`

**Steps:**
1. Mark session as completed (or wait for auto-complete)
2. Check package

**Expected Result:**
- Package updated: `reserved_lessons=0`, `completed_lessons=1`
- Total lesson count preserved

### Test Case 11: Session Cancellation Returns Credit
**Setup:**
1. Student L has session paid via package
2. Package shows: `available_lessons=2`, `reserved_lessons=1`

**Steps:**
1. Cancel the session
2. Check package

**Expected Result:**
- Package updated: `available_lessons=3`, `reserved_lessons=0`
- Credit returned to student

---

## Integration Tests

### Test Case: Both Features Together
**Setup:**
1. Student M is on waitlist for Session X
2. Session X is for Subject "Math"
3. Student M has package for Math (3 lessons available)

**Steps:**
1. Wait for Session X to complete
2. Run auto-complete cron

**Expected Result:**
- Session X marked as completed
- Student M removed from waitlist
- If new session created for Student M, it should use their package

---

## Performance Tests

### Test Case: Batch Package Updates
**Setup:**
1. Create 100 sessions with different package IDs
2. All sessions end at the same time

**Steps:**
1. Run auto-complete cron
2. Check logs for batch update confirmation

**Expected Result:**
- All packages updated in batch (not individual queries)
- Console shows: "Batch updated N packages"
- Response time < 2 seconds

---

## Edge Cases

### Edge Case 1: Inactive Package
**Setup:**
1. Student has package with `active=false`

**Steps:**
1. Create session

**Expected Result:**
- Package NOT used (inactive)
- Session created as unpaid

### Edge Case 2: Unpaid Package
**Setup:**
1. Student has package with `paid=false`

**Steps:**
1. Create session

**Expected Result:**
- Package NOT used (not paid yet)
- Session created as unpaid

### Edge Case 3: Manual "Mark as Paid" Overrides Package
**Setup:**
1. Student has available package

**Steps:**
1. Create session
2. Check "Mark as Paid" checkbox
3. Save

**Expected Result:**
- Session marked as paid manually
- Package NOT used (manual payment takes precedence)
- Session: `lesson_package_id=null`

---

## Database Consistency Checks

After each test, verify:
```sql
-- Total lessons should always equal sum of available, reserved, completed
SELECT *
FROM lesson_packages
WHERE total_lessons != (available_lessons + reserved_lessons + completed_lessons);
-- Should return 0 rows

-- Reserved lessons should not be negative
SELECT *
FROM lesson_packages
WHERE reserved_lessons < 0 OR available_lessons < 0 OR completed_lessons < 0;
-- Should return 0 rows

-- Sessions with package_id should be paid
SELECT *
FROM sessions
WHERE lesson_package_id IS NOT NULL AND paid = false;
-- Should return 0 rows
```

---

## Rollback Plan

If issues are found:
1. Database changes are backward compatible (only new columns added)
2. Can disable features by commenting out package check logic
3. Waitlist cleanup can be disabled by commenting out delete queries
4. No existing data is modified, only new sessions affected

---

## Monitoring

After deployment, monitor:
1. Auto-complete cron logs for waitlist cleanup counts
2. Package usage logs in session creation
3. Email delivery for "Apmokėta iš pamokų paketo" messages
4. Database consistency checks (run daily)

---

## User Acceptance Testing

Have a real tutor test:
1. Create student with package
2. Schedule sessions and see them auto-paid
3. Complete sessions and verify package updates
4. Use waitlist and see auto-cleanup
5. Verify emails received by student
