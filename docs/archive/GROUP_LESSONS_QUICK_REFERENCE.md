# Group Lessons - Quick Reference

## File Modified
`/src/pages/Calendar.tsx`

## New State Variables (Lines 245-251)
```typescript
const [isAddToGroupOpen, setIsAddToGroupOpen] = useState(false);
const [addToGroupStudentId, setAddToGroupStudentId] = useState<string>('');
const [addToGroupChoice, setAddToGroupChoice] = useState<'single' | 'all_future'>('single');
const [groupEditChoice, setGroupEditChoice] = useState<'single' | 'all_future' | null>(null);
const [groupCancelChoice, setGroupCancelChoice] = useState<'single' | 'all_future' | null>(null);
```

## Key Handlers

### 1. Add Student to Group (Line 1871)
```typescript
const handleAddStudentToGroup = async () => {
  // Creates sessions for selected student
  // Updates available_spots
  // Sends confirmation email
  // Supports single or all future sessions
}
```

### 2. Modified Cancel Handler (Line 1438)
```typescript
const handleCancelSession = async () => {
  // Step 1: Show group choice dialog if isGroupSession
  // Step 2: Show cancellation reason textarea
  // Step 3: Cancel single or all future based on choice
}
```

### 3. Modified Edit Handler (Line 1697)
```typescript
const handleSaveChanges = async () => {
  // Determines sessions to update based on groupEditChoice
  // Updates single or all future sessions
  // Sends reschedule emails if time changed
}
```

## UI Flow Diagrams

### Add Student Flow
```
Click "Pridėti mokinį" button
  ↓
Check if group has available spots
  ↓
Open Add Student Modal
  ↓
Select student from dropdown
  ↓
Choose "Tik ši pamoka" OR "Visos būsimos pamokos"
  ↓
Click "Pridėti mokinį"
  ↓
Create session(s) + Update available_spots + Send email
```

### Edit Flow
```
Click "Redaguoti" button
  ↓
If isGroupSession → Show Group Edit Choice Dialog
  ↓
Choose "Redaguoti tik šią pamoką" OR "Redaguoti visas būsimas"
  ↓
Click "Tęsti"
  ↓
Edit form appears
  ↓
Make changes → Click "Išsaugoti"
  ↓
Update single or all future sessions
```

### Cancel Flow
```
Click "Atšaukti" button
  ↓
If isGroupSession → Show Group Cancel Choice Dialog
  ↓
Choose "Atšaukti tik šią pamoką" OR "Atšaukti visas būsimas"
  ↓
Click "Tęsti atšaukimą"
  ↓
Show cancellation reason textarea
  ↓
Enter reason (min 5 chars) → Click "Patvirtinti atšaukimą"
  ↓
Cancel single or all future sessions
```

## Modal Locations

1. **Add Student Modal**: Line 3094
2. **Group Edit Choice Dialog**: Line 3199
3. **Group Cancel Choice Dialog**: Line 3270

## Database Queries

### Find Future Group Sessions
```typescript
const { data: futureSessions } = await supabase
  .from('sessions')
  .select('*')
  .eq('tutor_id', user.id)
  .eq('subject_id', selectedEvent.subject_id)
  .gte('start_time', selectedEvent.start_time)
  .eq('status', 'active');
```

### Update Available Spots
```typescript
const { data: sessionsAtTime } = await supabase
  .from('sessions')
  .select('id')
  .eq('tutor_id', user.id)
  .eq('start_time', timeKey)
  .eq('subject_id', selectedEvent.subject_id)
  .eq('status', 'active');

const remaining = (subject?.max_students || 0) - sessionsAtTime.length;
await supabase
  .from('sessions')
  .update({ available_spots: Math.max(0, remaining) })
  .in('id', sessionIds);
```

## Email Notifications

### Booking Confirmation (Add Student)
```typescript
await sendEmail({
  type: 'booking_confirmation',
  to: studentData.email,
  data: {
    studentName, tutorName, date, time,
    subject, price, duration,
    cancellationHours, cancellationFeePercent,
    paymentStatus: 'Laukiama apmokėjimo'
  }
});
```

### Cancellation Email
Uses existing `cancelSessionAndFillWaitlist()` function which handles emails automatically.

## Important Notes

1. **Group Detection**: Uses `isGroupSession` state variable set when event is opened
2. **Recurring Detection**: Checks for `recurring_session_id` field in session
3. **Available Spots**: Calculated as `max_students - current_student_count`
4. **Student Filtering**: Add modal filters out students already in the group
5. **Cleanup**: All choice states reset in `handleEventModalOpenChange()`

## Validation Rules

- **Add Student**: Must select a student, group must have available spots
- **Edit**: Same as before (no overlap validation)
- **Cancel**: Must provide reason with min 5 characters

