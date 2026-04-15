import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** true = student cannot book new lessons (unpaid debt / overdue payment) */
export function useStudentPaymentBlock(studentId: string | null | undefined) {
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(!!studentId);

  const refetch = useCallback(async () => {
    if (!studentId) {
      setBlocked(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc('student_booking_blocked_overdue', {
      p_student_id: studentId,
    });
    if (error) {
      console.error('student_booking_blocked_overdue', error);
      setBlocked(false);
    } else {
      setBlocked(!!data);
    }
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { blocked, loading, refetch };
}
