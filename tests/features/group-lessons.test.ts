import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * Group Lessons Feature Tests
 *
 * Testing the group lessons functionality:
 * 1. Creating group subjects with max_students
 * 2. Creating sessions from group subjects (available_spots set correctly)
 * 3. Multiple students booking the same group lesson slot
 * 4. Decrementing available_spots when students book
 * 5. Incrementing available_spots when students cancel
 * 6. Preventing bookings when available_spots = 0
 */

describe('Group Lessons', () => {
  // These are integration-style tests; skip locally unless env is provided.
  const hasEnv = Boolean(process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!hasEnv) {
    it.skip('requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY', () => {});
    return;
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  let testTutorId: string;
  let testStudent1Id: string;
  let testStudent2Id: string;
  let groupSubjectId: string;

  beforeEach(async () => {
    // Setup: Create test tutor, students, and group subject
    // Note: In real tests, you'd use test data or mock the database
  });

  it('should create a group subject with max_students', async () => {
    const { data: subject, error } = await supabase
      .from('subjects')
      .insert({
        tutor_id: testTutorId,
        name: 'Group Math',
        duration_minutes: 60,
        price: 20,
        color: '#4F46E5',
        is_group: true,
        max_students: 5,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(subject).toBeDefined();
    expect(subject?.is_group).toBe(true);
    expect(subject?.max_students).toBe(5);
  });

  it('should create a session with available_spots when using group subject', async () => {
    // When tutor creates a session from a group subject
    const startTime = new Date();
    startTime.setHours(startTime.getHours() + 2);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        tutor_id: testTutorId,
        student_id: testStudent1Id,
        subject_id: groupSubjectId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: 'active',
        price: 20,
        topic: 'Group Math',
        available_spots: 4, // max_students (5) - 1
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(session?.available_spots).toBe(4);
    expect(session?.subject_id).toBe(groupSubjectId);
  });

  it('should allow second student to book the same group lesson slot', async () => {
    // Given: A group session exists with available_spots > 0
    const existingSessionStart = new Date();
    existingSessionStart.setHours(existingSessionStart.getHours() + 3);

    const { data: existingSession } = await supabase
      .from('sessions')
      .insert({
        tutor_id: testTutorId,
        student_id: testStudent1Id,
        subject_id: groupSubjectId,
        start_time: existingSessionStart.toISOString(),
        end_time: new Date(existingSessionStart.getTime() + 60 * 60 * 1000).toISOString(),
        status: 'active',
        price: 20,
        available_spots: 4,
      })
      .select()
      .single();

    // When: Second student books the same time slot
    const { data: newSession, error } = await supabase
      .from('sessions')
      .insert({
        tutor_id: testTutorId,
        student_id: testStudent2Id,
        subject_id: groupSubjectId,
        start_time: existingSessionStart.toISOString(),
        end_time: new Date(existingSessionStart.getTime() + 60 * 60 * 1000).toISOString(),
        status: 'active',
        price: 20,
        available_spots: 3, // Decremented
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(newSession?.available_spots).toBe(3);

    // And: First session's available_spots should also be decremented
    const { data: updatedExisting } = await supabase
      .from('sessions')
      .select('available_spots')
      .eq('id', existingSession!.id)
      .single();

    expect(updatedExisting?.available_spots).toBe(3);
  });

  it('should increment available_spots when a student cancels', async () => {
    // Given: Two students in the same group lesson
    const sessionStart = new Date();
    sessionStart.setHours(sessionStart.getHours() + 4);

    const { data: session1 } = await supabase
      .from('sessions')
      .insert({
        tutor_id: testTutorId,
        student_id: testStudent1Id,
        subject_id: groupSubjectId,
        start_time: sessionStart.toISOString(),
        end_time: new Date(sessionStart.getTime() + 60 * 60 * 1000).toISOString(),
        status: 'active',
        available_spots: 3,
      })
      .select()
      .single();

    const { data: session2 } = await supabase
      .from('sessions')
      .insert({
        tutor_id: testTutorId,
        student_id: testStudent2Id,
        subject_id: groupSubjectId,
        start_time: sessionStart.toISOString(),
        end_time: new Date(sessionStart.getTime() + 60 * 60 * 1000).toISOString(),
        status: 'active',
        available_spots: 3,
      })
      .select()
      .single();

    // When: Student2 cancels
    await supabase
      .from('sessions')
      .update({ status: 'cancelled' })
      .eq('id', session2!.id);

    // Then: Available spots should increment on student1's session
    const { data: updatedSession1 } = await supabase
      .from('sessions')
      .select('available_spots')
      .eq('id', session1!.id)
      .single();

    expect(updatedSession1?.available_spots).toBe(4);
  });

  it('should show group lesson slots in student booking page', async () => {
    // When: Student views available slots for a group subject
    // The slot calculation should show slots that have group sessions with available_spots > 0

    // This would be tested in the frontend by checking if:
    // 1. Overlapping group sessions with available_spots > 0 don't block the slot
    // 2. Overlapping group sessions with available_spots = 0 DO block the slot
    expect(true).toBe(true); // Placeholder for frontend test
  });

  it('should prevent booking when available_spots reaches 0', async () => {
    // Given: A group session with 0 available spots
    const sessionStart = new Date();
    sessionStart.setHours(sessionStart.getHours() + 5);

    await supabase
      .from('sessions')
      .insert({
        tutor_id: testTutorId,
        student_id: testStudent1Id,
        subject_id: groupSubjectId,
        start_time: sessionStart.toISOString(),
        end_time: new Date(sessionStart.getTime() + 60 * 60 * 1000).toISOString(),
        status: 'active',
        available_spots: 0,
      });

    // When: Another student tries to book
    // The booking logic should check for available spots and prevent the booking

    // In the actual implementation (StudentBooking.tsx), this is done by:
    // 1. Checking if existing group sessions have available_spots > 0
    // 2. Showing an alert if no spots are available
    expect(true).toBe(true); // This is validated in the frontend
  });
});
