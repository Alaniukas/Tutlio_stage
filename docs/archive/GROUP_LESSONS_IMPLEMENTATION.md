# Group Lessons - Three Missing Features Implementation

## Summary

Successfully implemented three missing features for group lessons in `/src/pages/Calendar.tsx`:

### 1. Add Student to Group Lesson (Pridėti mokinį)

**Location**: Line ~3075 (button click handler)

**Features**:
- Opens modal when "Pridėti mokinį" button clicked
- Shows student dropdown filtered to exclude students already in the group
- For recurring group lessons: Radio buttons for "Tik ši pamoka" / "Visos būsimos pamokos"
- Validates group capacity (checks available_spots)
- Creates session(s) for selected student
- Updates available_spots for all affected sessions
- Sends booking confirmation email to student
- If "Visos būsimos": creates sessions for all future occurrences

**State Variables**:
- `isAddToGroupOpen` - modal visibility (boolean)
- `addToGroupStudentId` - selected student ID (string)
- `addToGroupChoice` - 'single' | 'all_future'

**Handler**: `handleAddStudentToGroup()` (line ~1852)

---

### 2. Group Edit with Choice Dialog

**Location**: Edit button click handler (line ~2728)

**Features**:
- Detects if editing a group session (isGroupSession = true)
- Before opening edit form, shows confirmation dialog:
  - "Redaguoti tik šią pamoką"
  - "Redaguoti visas būsimas šios grupės pamokas"
- If "tik šią": edits only selectedEvent
- If "visas būsimas":
  - Finds all group sessions with same subject_id, tutor_id where start_time >= current session
  - Updates all of them with new time/topic/meeting_link

**State Variables**:
- `groupEditChoice` - 'single' | 'all_future' | null

**Modified Handler**: `handleSaveChanges()` (line ~1697)
- Added logic to update multiple sessions when groupEditChoice === 'all_future'

---

### 3. Group Cancel with Choice Dialog

**Location**: Cancel button handler (line ~1438)

**Features**:
- Detects if cancelling a group session (isGroupSession = true)
- Before showing cancellation reason textarea, shows choice dialog:
  - "Atšaukti tik šią pamoką"
  - "Atšaukti visas būsimas šios grupės pamokas"
- If "tik šią": cancels only this session (existing behavior)
- If "visas būsimas":
  - Finds all future group sessions (same subject_id, start_time >= current)
  - Cancels all using cancelSessionAndFillWaitlist in loop
  - Sends emails to all students

**State Variables**:
- `groupCancelChoice` - 'single' | 'all_future' | null

**Modified Handler**: `handleCancelSession()` (line ~1438)
- Added two-step flow: choice dialog → cancellation reason → execute

---

## Technical Implementation Details

### Session Interface Updates
Added `recurring_session_id?: string | null` to Session interface (line ~70)

### Modal Components Added

1. **Add Student to Group Modal** (line ~3091+)
   - Student dropdown with grade filtering
   - Radio buttons for single vs all future
   - Warning message about email notification
   - Validation for group capacity

2. **Group Edit Choice Dialog** (line ~3186+)
   - Radio buttons for edit scope
   - Descriptive text for each option
   - "Tęsti" button to proceed to edit form

3. **Group Cancel Choice Dialog** (line ~3226+)
   - Radio buttons for cancel scope
   - Warning about affecting all students
   - "Tęsti atšaukimą" button to proceed

### Key Patterns Used

- **Two-step confirmation**: Choice dialog → Action form → Execute
- **Reused existing components**: Dialog, Select, Button from shadcn/ui
- **Standard radio inputs**: Native HTML radio inputs (no RadioGroup component needed)
- **Proper cleanup**: Reset state on modal close via handleEventModalOpenChange

### Finding Future Sessions

```typescript
const { data: futureSessions } = await supabase
  .from('sessions')
  .select('*')
  .eq('tutor_id', user.id)
  .eq('subject_id', selectedEvent.subject_id)
  .gte('start_time', selectedEvent.start_time)
  .eq('status', 'active');
```

### Available Spots Check

```typescript
const hasAvailableSpots = selectedGroupSessions.some(s => (s.available_spots ?? 0) > 0);
if (!hasAvailableSpots) {
  alert('Grupė jau pilna!');
  return;
}
```

---

## Testing Instructions

### Test 1: Add Student to Single Group Session
1. Open Calendar
2. Click on a group lesson
3. Click "Pridėti mokinį"
4. Select a student not in the group
5. Choose "Tik ši pamoka"
6. Verify student is added to that session only
7. Check student receives confirmation email

### Test 2: Add Student to All Future Group Sessions
1. Create a recurring group lesson
2. Click on any occurrence
3. Click "Pridėti mokinį"
4. Select a student
5. Choose "Visos būsimos pamokos"
6. Verify student is added to all future occurrences
7. Check available_spots decrements correctly

### Test 3: Edit Single Group Session
1. Click on a group session
2. Click "Redaguoti"
3. Choose "Redaguoti tik šią pamoką"
4. Change time/topic
5. Save
6. Verify only that session changed

### Test 4: Edit All Future Group Sessions
1. Click on a recurring group session
2. Click "Redaguoti"
3. Choose "Redaguoti visas būsimas šios grupės pamokas"
4. Change meeting link
5. Save
6. Verify all future sessions updated

### Test 5: Cancel Single Group Session
1. Click on a group session
2. Click "Atšaukti"
3. Choose "Atšaukti tik šią pamoką"
4. Enter reason
5. Confirm
6. Verify only that session cancelled

### Test 6: Cancel All Future Group Sessions
1. Click on a recurring group session
2. Click "Atšaukti"
3. Choose "Atšaukti visas būsimas šios grupės pamokas"
4. Enter reason
5. Confirm
6. Verify all future sessions cancelled for all students
7. Check all students receive cancellation emails

---

## Files Modified

- `/src/pages/Calendar.tsx` - All three features implemented

## Build Status

✅ Project builds successfully with no TypeScript errors
✅ All existing functionality preserved
✅ New features integrated seamlessly with existing UI patterns

