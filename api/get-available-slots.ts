// ─── Server-side slot availability calculation ────────────────────────────────
// Optimized endpoint to calculate available time slots without client-side loops
// This moves the 60-day slot calculation from client to server for better performance

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { addDays, getDay, format, parse } from 'date-fns';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tutorId, studentId, daysAhead = 60, breakBetweenLessons = 15, minBookingHours = 1 } = req.body;

  if (!tutorId) {
    return res.status(400).json({ error: 'tutorId is required' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Internal server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch tutor availability rules
    const { data: availability, error: avError } = await supabase
      .from('availability')
      .select('*')
      .eq('tutor_id', tutorId);

    if (avError) throw avError;

    // Fetch occupied slots (existing sessions) in date range
    const startDate = new Date();
    const endDate = addDays(startDate, daysAhead);

    const { data: existingSessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('start_time, end_time')
      .eq('tutor_id', tutorId)
      .neq('status', 'cancelled')
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString());

    if (sessionsError) throw sessionsError;

    // Build occupied slots lookup for fast checking
    const occupiedSlots = new Set<string>();
    (existingSessions || []).forEach((session: any) => {
      const start = new Date(session.start_time);
      const end = new Date(session.end_time);
      let current = new Date(start);

      while (current < end) {
        occupiedSlots.add(current.toISOString());
        current = new Date(current.getTime() + 30 * 60000); // 30-min increments
      }
    });

    // Calculate available slots
    const availableSlots: Array<{ start: string; end: string; date: string }> = [];
    const currentTime = new Date();
    const minBookingTime = new Date(currentTime.getTime() + minBookingHours * 3600000);

    for (let i = 0; i <= daysAhead; i++) {
      const day = addDays(currentTime, i);
      const dateStr = format(day, 'yyyy-MM-dd');
      const dow = getDay(day);

      // Filter availability rules for this day
      const rules = (availability || []).filter((a: any) => {
        if (a.is_recurring) {
          // For recurring: match day of week and check end_date constraint
          if (a.day_of_week !== dow) return false;
          if (a.end_date && dateStr > a.end_date) return false;
          return true;
        }
        // For specific date
        return a.specific_date === dateStr;
      });

      for (const rule of rules) {
        const startParts = rule.start_time.split(':');
        const endParts = rule.end_time.split(':');

        let slotStart = new Date(day);
        slotStart.setHours(parseInt(startParts[0]), parseInt(startParts[1]), 0, 0);

        const ruleEnd = new Date(day);
        ruleEnd.setHours(parseInt(endParts[0]), parseInt(endParts[1]), 0, 0);

        // Generate 30-minute slots
        while (slotStart < ruleEnd) {
          const slotEnd = new Date(slotStart.getTime() + 30 * 60000);

          // Check constraints
          const isInFuture = slotStart >= minBookingTime;
          const notOccupied = !occupiedSlots.has(slotStart.toISOString());

          // Check break between lessons (if there's a session ending at this time)
          let hasBreak = true;
          const beforeSlotTime = new Date(slotStart.getTime() - breakBetweenLessons * 60000);
          if (occupiedSlots.has(beforeSlotTime.toISOString())) {
            hasBreak = false;
          }

          if (isInFuture && notOccupied && hasBreak && slotEnd <= ruleEnd) {
            availableSlots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString(),
              date: dateStr,
            });
          }

          slotStart = slotEnd;
        }
      }
    }

    return res.status(200).json({
      success: true,
      slots: availableSlots,
      totalSlots: availableSlots.length,
    });
  } catch (err: any) {
    console.error('[get-available-slots] Error:', err);
    return res.status(500).json({ error: err?.message || 'Unknown error' });
  }
}
