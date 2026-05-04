// ─── Google Calendar Helper Library ──────────────────────────────────────────
// Functions for syncing Tutlio events with Google Calendar

import { createClient } from '@supabase/supabase-js';
import { format, parseISO } from 'date-fns';

function availabilityRecurringStartDateStr(slot: {
  start_date?: string | null;
  created_at?: string | null;
}): string {
  if (slot.start_date) return slot.start_date;
  if (slot.created_at) return format(parseISO(String(slot.created_at)), 'yyyy-MM-dd');
  return '1970-01-01';
}

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface GoogleEvent {
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  colorId?: string;
}

type RefreshAccessTokenResult =
  | { ok: true; accessToken: string; expiresInSec?: number }
  | { ok: false; invalidGrant: boolean; errorText: string };

// Refresh access token using refresh token
export async function refreshAccessToken(refreshToken: string): Promise<RefreshAccessTokenResult> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      const invalidGrant =
        txt.includes('invalid_grant') ||
        (() => {
          try {
            const j = JSON.parse(txt);
            return j?.error === 'invalid_grant';
          } catch {
            return false;
          }
        })();
      console.error('Token refresh failed:', txt);
      return { ok: false, invalidGrant, errorText: txt || `HTTP ${response.status}` };
    }

    const data = await response.json();
    const { access_token, expires_in } = data;

    if (!access_token || typeof access_token !== 'string') {
      return { ok: false, invalidGrant: false, errorText: 'Missing access_token in refresh response' };
    }
    return { ok: true, accessToken: access_token, expiresInSec: typeof expires_in === 'number' ? expires_in : undefined };
  } catch (err) {
    console.error('Error refreshing token:', err);
    return { ok: false, invalidGrant: false, errorText: err instanceof Error ? err.message : String(err) };
  }
}

// Get valid access token (refresh if needed)
async function getValidAccessToken(profile: any): Promise<string | null> {
  let accessToken = profile.google_calendar_access_token;
  const isExpired = profile.google_calendar_token_expiry && new Date(profile.google_calendar_token_expiry) <= new Date();

  if (isExpired && profile.google_calendar_refresh_token) {
    const refreshed = await refreshAccessToken(profile.google_calendar_refresh_token);
    if (!refreshed.ok) {
      // If refresh token is revoked/expired, disconnect so we stop spamming 401s.
      if (refreshed.invalidGrant && profile?.id) {
        await supabase
          .from('profiles')
          .update({
            google_calendar_connected: false,
            google_calendar_access_token: null,
            google_calendar_refresh_token: null,
            google_calendar_token_expiry: null,
            google_calendar_sync_enabled: false,
          })
          .eq('id', profile.id);
      }
      return null;
    }

    accessToken = refreshed.accessToken;
    // Update token in database
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + (refreshed.expiresInSec ?? 3600));

    await supabase
      .from('profiles')
      .update({
        google_calendar_access_token: accessToken,
        google_calendar_token_expiry: expiryDate.toISOString(),
      })
      .eq('id', profile.id);
  }

  return accessToken;
}

// Create event in Google Calendar. Returns event id or error message.
async function createGoogleEvent(accessToken: string, event: GoogleEvent): Promise<{ id: string } | { error: string }> {
  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    const errorBody = await response.text();
    if (!response.ok) {
      console.error('Failed to create event:', errorBody);
      let msg = errorBody;
      try {
        const j = JSON.parse(errorBody);
        if (j?.error?.message) msg = j.error.message;
      } catch (_) {}
      return { error: msg };
    }

    const data = JSON.parse(errorBody);
    return { id: data.id };
  } catch (err: any) {
    console.error('Error creating event:', err);
    return { error: err?.message || 'Network or server error' };
  }
}

// Update event in Google Calendar
async function updateGoogleEvent(accessToken: string, eventId: string, event: GoogleEvent): Promise<boolean> {
  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      console.error('Failed to update event:', await response.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error updating event:', err);
    return false;
  }
}

// Delete event from Google Calendar
async function deleteGoogleEvent(accessToken: string, eventId: string): Promise<boolean> {
  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      console.error('Failed to delete event:', await response.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error deleting event:', err);
    return false;
  }
}

// Search term to find Tutlio availability events (old and new format). "Laisvas laikas" is in the summary of all of them.
const AVAILABILITY_SEARCH_TERM = 'Laisvas laikas';

// List and delete all Tutlio availability events from Google Calendar (used when availability is removed/updated in Tutlio)
async function deleteTutlioAvailabilityEventsFromGoogle(accessToken: string): Promise<void> {
  try {
    const now = new Date();
    const timeMax = new Date(now);
    timeMax.setDate(timeMax.getDate() + 60);

    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: AVAILABILITY_SEARCH_TERM,
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: '250',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        console.error('Failed to list availability events:', await response.text());
        return;
      }

      const data = await response.json();
      pageToken = data.nextPageToken;

      for (const event of data.items || []) {
        if (event.id) {
          await deleteGoogleEvent(accessToken, event.id);
        }
      }
    } while (pageToken);
  } catch (err) {
    console.error('Error deleting Tutlio availability events from Google:', err);
  }
}

function getStatusLabel(session: any): string {
  const status = session.status;
  if (status === 'cancelled') return 'Atšaukta';
  if (status === 'no_show') return 'Neatvyko';
  if (status === 'completed') return session.paid ? 'Įvykusi ✓' : 'Įvykusi (neapmokėta)';
  return session.paid ? 'Apmokėta' : 'Laukiama apmokėjimo';
}

function getStatusColorId(session: any): string {
  if (session.status === 'cancelled') return '4';  // Flamingo / red
  if (session.status === 'no_show') return '11';    // Tomato / dark red
  if (session.status === 'completed') return session.paid ? '2' : '6'; // Sage / Tangerine
  return session.paid ? '9' : '5'; // Blueberry / Banana
}

function formatSessionEvent(session: any): GoogleEvent {
  const studentName = session.student?.full_name || 'Student';
  const subject = session.subject?.name || session.topic || 'Pamoka';
  const statusLabel = getStatusLabel(session);
  const summary = `📚 ${subject} - ${studentName} (${statusLabel})`;

  let description = `Pamoka su ${studentName}\n\n`;
  if (session.student?.email) description += `📧 Email: ${session.student.email}\n`;
  if (session.student?.grade) description += `📚 Grade: ${session.student.grade}\n`;
  if (session.topic) description += `📖 Tema: ${session.topic}\n`;
  if (session.price) description += `💶 Kaina: €${session.price}\n`;
  description += `💳 Statusas: ${statusLabel}\n`;
  if (session.meeting_link) description += `\n🔗 Susitikimo nuoroda: ${session.meeting_link}`;

  return {
    summary,
    description: description.trim(),
    start: {
      dateTime: new Date(session.start_time).toISOString(),
      timeZone: 'Europe/Vilnius',
    },
    end: {
      dateTime: new Date(session.end_time).toISOString(),
      timeZone: 'Europe/Vilnius',
    },
    colorId: getStatusColorId(session),
  };
}

// Unique marker so we can find and delete Tutlio availability events later
const TUTLIO_AVAILABILITY_MARKER = 'Tutlio-Availability';

// Format availability slot as Google Calendar event
function formatAvailabilityEvent(slot: any, startDate: Date, endDate: Date): GoogleEvent {
  return {
    summary: '🟢 Laisvas laikas',
    description: `${TUTLIO_AVAILABILITY_MARKER}\nAvailability slot`,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: 'Europe/Vilnius',
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: 'Europe/Vilnius',
    },
    colorId: '10', // Green for availability
  };
}

// Sync single session to Google Calendar. Returns { success, error? } so caller can show errors.
export async function syncSessionToGoogle(sessionId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Get profile with tokens
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!profile?.google_calendar_connected || !profile?.google_calendar_sync_enabled) {
      return { success: true }; // not an error, just sync disabled
    }

    const accessToken = await getValidAccessToken(profile);
    if (!accessToken) {
      return { success: false, error: 'Google access is not working. Try disconnecting and reconnecting Google Calendar.' };
    }

    // Get session with student and subject info
    const { data: session } = await supabase
      .from('sessions')
      .select(`
        *,
        student:students(full_name, email, grade),
        subject:subjects(name)
      `)
      .eq('id', sessionId)
      .single();

    if (!session || session.status === 'cancelled') {
      // If cancelled or deleted, remove from Google Calendar
      if (session?.google_calendar_event_id) {
        await deleteGoogleEvent(accessToken, session.google_calendar_event_id);
        await supabase
          .from('sessions')
          .update({ google_calendar_event_id: null })
          .eq('id', sessionId);
      }
    } else {
      const googleEvent = formatSessionEvent(session);

      if (session.google_calendar_event_id) {
        // Update existing event
        const success = await updateGoogleEvent(accessToken, session.google_calendar_event_id, googleEvent);
        if (!success) {
          // If update fails, try creating new event
          const result = await createGoogleEvent(accessToken, googleEvent);
          if ('id' in result) {
            await supabase
              .from('sessions')
              .update({ google_calendar_event_id: result.id })
              .eq('id', sessionId);
          } else if (result.error) {
            return { success: false, error: result.error };
          }
        }
      } else {
        // Create new event
        const result = await createGoogleEvent(accessToken, googleEvent);
        if ('id' in result) {
          await supabase
            .from('sessions')
            .update({ google_calendar_event_id: result.id })
            .eq('id', sessionId);
        } else if (result.error) {
          return { success: false, error: result.error };
        }
      }
    }

    // After any session change, clean up old availability events from Google Calendar
    // (but don't re-create them, since we only want to sync actual sessions now)
    try {
      await deleteTutlioAvailabilityEventsFromGoogle(accessToken);
    } catch (e) {
      console.error('[google-calendar] Failed to delete availability events after session sync', e);
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error syncing session:', err);
    return { success: false, error: err?.message || 'Sinchronizacijos klaida' };
  }
}

// Delete session from Google Calendar
export async function deleteSessionFromGoogle(sessionId: string, userId: string): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!profile?.google_calendar_connected) {
      return;
    }

    const accessToken = await getValidAccessToken(profile);
    if (!accessToken) {
      return;
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('google_calendar_event_id')
      .eq('id', sessionId)
      .single();

    if (session?.google_calendar_event_id) {
      await deleteGoogleEvent(accessToken, session.google_calendar_event_id);
      await supabase
        .from('sessions')
        .update({ google_calendar_event_id: null })
        .eq('id', sessionId);
    }
  } catch (err) {
    console.error('Error deleting session from Google:', err);
  }
}

// Parse time string from DB (e.g. "09:00", "09:00:00", "18:30:00") to [hours, minutes]
function parseTimeParts(t: any): [number, number] {
  const s = typeof t === 'string' ? t : String(t ?? '');
  const parts = s.split(':');
  const hours = parseInt(parts[0] ?? '0', 10) || 0;
  const minutes = parseInt(parts[1] ?? '0', 10) || 0;
  return [hours, minutes];
}

// Calculate availability segments (avoiding booked sessions and including breaks)
async function calculateAvailabilitySegments(tutorId: string, availabilitySlot: any, date: Date) {
  const [startH, startM] = parseTimeParts(availabilitySlot.start_time);
  const startTime = new Date(date);
  startTime.setHours(startH, startM, 0, 0);

  const [endH, endM] = parseTimeParts(availabilitySlot.end_time);
  const endTime = new Date(date);
  endTime.setHours(endH, endM, 0, 0);

  // Get all active sessions for this day
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const { data: sessions } = await supabase
    .from('sessions')
    .select('start_time, end_time')
    .eq('tutor_id', tutorId)
    .eq('status', 'active')
    .gte('start_time', dayStart.toISOString())
    .lte('start_time', dayEnd.toISOString())
    .order('start_time');

  // Get break duration from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('break_between_lessons')
    .eq('id', tutorId)
    .single();

  const breakMinutes = profile?.break_between_lessons || 0;

  // Build free segments
  const segments: Array<{ start: Date; end: Date }> = [];
  let currentStart = startTime;

  for (const session of sessions || []) {
    const sessionStart = new Date(session.start_time);
    const sessionEnd = new Date(session.end_time);

    // Add free time before this session
    if (currentStart < sessionStart) {
      segments.push({
        start: new Date(currentStart),
        end: new Date(sessionStart),
      });
    }

    // Move currentStart to after session + break
    currentStart = new Date(sessionEnd);
    if (breakMinutes > 0) {
      currentStart.setMinutes(currentStart.getMinutes() + breakMinutes);
    }
  }

  // Add remaining free time
  if (currentStart < endTime) {
    segments.push({
      start: new Date(currentStart),
      end: new Date(endTime),
    });
  }

  return segments;
}

// Sync availability slots to Google Calendar. Returns count created and first error if any.
export async function syncAvailabilityToGoogle(tutorId: string): Promise<{ created: number; error?: string }> {
  const out = { created: 0, error: undefined as string | undefined };
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', tutorId)
      .single();

    if (!profile?.google_calendar_connected || !profile?.google_calendar_sync_enabled) {
      return out;
    }

    const accessToken = await getValidAccessToken(profile);
    if (!accessToken) {
      out.error = 'Google access is not working. Disconnect and reconnect calendar.';
      return out;
    }

    // Get all availability slots
    const { data: slots } = await supabase
      .from('availability')
      .select('*')
      .eq('tutor_id', tutorId);

    if (!slots || slots.length === 0) return out;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);
    endDate.setHours(23, 59, 59, 999);

    // Dedupe by (date, start, end) so duplicate availability rows don't create multiple Google events
    const seenSegments = new Set<string>();

    for (const slot of slots) {
      if (slot.is_recurring && slot.day_of_week !== null) {
        for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
          if (d.getDay() === slot.day_of_week) {
            const dateStr = format(d, 'yyyy-MM-dd');
            if (dateStr < availabilityRecurringStartDateStr(slot)) continue;
            if (slot.end_date && new Date(d) > new Date(slot.end_date)) continue;
            if (slot.specific_date && new Date(d) < new Date(slot.specific_date)) continue;

            const segments = await calculateAvailabilitySegments(tutorId, slot, new Date(d));
            for (const segment of segments) {
              const durationMs = segment.end.getTime() - segment.start.getTime();
              if (durationMs < 15 * 60 * 1000) continue;
              const key = `${segment.start.getTime()}-${segment.end.getTime()}`;
              if (seenSegments.has(key)) continue;
              seenSegments.add(key);

              const googleEvent = formatAvailabilityEvent(slot, segment.start, segment.end);
              const result = await createGoogleEvent(accessToken, googleEvent);
              if ('id' in result) {
                out.created++;
              } else if (result.error && !out.error) {
                out.error = result.error;
                console.error('[google-calendar] Availability event failed:', result.error);
              }
            }
          }
        }
      } else if (slot.specific_date) {
        const slotDate = new Date(slot.specific_date);
        slotDate.setHours(0, 0, 0, 0);
        if (slotDate >= today && slotDate <= endDate) {
          const segments = await calculateAvailabilitySegments(tutorId, slot, new Date(slot.specific_date));
          for (const segment of segments) {
            const durationMs = segment.end.getTime() - segment.start.getTime();
            if (durationMs < 15 * 60 * 1000) continue;
            const key = `${segment.start.getTime()}-${segment.end.getTime()}`;
            if (seenSegments.has(key)) continue;
            seenSegments.add(key);

            const googleEvent = formatAvailabilityEvent(slot, segment.start, segment.end);
            const result = await createGoogleEvent(accessToken, googleEvent);
            if ('id' in result) {
              out.created++;
            } else if (result.error && !out.error) {
              out.error = result.error;
              console.error('[google-calendar] Availability event failed:', result.error);
            }
          }
        }
      }
    }
  } catch (err: any) {
    console.error('Error syncing availability:', err);
    out.error = err?.message || 'Laisvo laiko sinchronizacijos klaida';
  }
  return out;
}

// Include sessions from the last 24h so "today" is covered regardless of server timezone
function timeMinForSessions(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

// Sync all events (sessions + availability) to Google Calendar
export async function syncAllEventsToGoogle(userId: string, profile: any) {
  const accessToken = await getValidAccessToken(profile);
  if (!accessToken) {
    throw new Error('No valid access token');
  }

  // Explicitly remove cancelled sessions from Google so the event is always deleted
  const { data: cancelledSessions } = await supabase
    .from('sessions')
    .select('id, google_calendar_event_id')
    .eq('tutor_id', userId)
    .eq('status', 'cancelled')
    .not('google_calendar_event_id', 'is', null);
  for (const s of cancelledSessions || []) {
    if (s.google_calendar_event_id) {
      const deleted = await deleteGoogleEvent(accessToken, s.google_calendar_event_id);
      if (deleted) {
        await supabase.from('sessions').update({ google_calendar_event_id: null }).eq('id', s.id);
      }
    }
  }

  // Then delete all existing synced events and re-create only active ones
  await deleteAllCalendarEvents(userId, accessToken);

  // Sync all active sessions (from last 24h onward so today's sessions are always included)
  const timeMin = timeMinForSessions();
  const { data: sessions } = await supabase
    .from('sessions')
    .select(`
      *,
      student:students(full_name, email, grade),
      subject:subjects(name)
    `)
    .eq('tutor_id', userId)
    .eq('status', 'active')
    .gte('start_time', timeMin);

  let syncedSessions = 0;
  let firstSessionError: string | undefined;
  const totalSessions = (sessions || []).length;

  for (const session of sessions || []) {
    const googleEvent = formatSessionEvent(session);
    const result = await createGoogleEvent(accessToken, googleEvent);
    if ('id' in result) {
      await supabase
        .from('sessions')
        .update({ google_calendar_event_id: result.id })
        .eq('id', session.id);
      syncedSessions++;
    } else if (result.error) {
      if (!firstSessionError) firstSessionError = result.error;
      console.error('[google-calendar] Failed to create session event:', session.id, result.error);
    }
  }

  // Remove old Tutlio availability events from Google (no longer syncing availability, only sessions)
  await deleteTutlioAvailabilityEventsFromGoogle(accessToken);

  // Availability sync disabled - only sync actual sessions to Google Calendar
  // (not free time blocks, as per user request)

  return {
    sessions: syncedSessions,
    totalSessions,
    availability: 'disabled',
    availabilityCreated: 0,
    availabilityError: undefined,
    ...(firstSessionError && { sessionError: firstSessionError }),
  };
}

// Delete all calendar events for a user
export async function deleteAllCalendarEvents(userId: string, accessToken: string): Promise<void> {
  try {
    // Get all sessions with event IDs (including cancelled – we delete everything)
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, google_calendar_event_id')
      .eq('tutor_id', userId)
      .not('google_calendar_event_id', 'is', null);

    // Delete each event; clear event_id only when delete succeeds so we can retry on next sync if it failed
    for (const session of sessions || []) {
      if (session.google_calendar_event_id) {
        const deleted = await deleteGoogleEvent(accessToken, session.google_calendar_event_id);
        if (deleted) {
          await supabase.from('sessions').update({ google_calendar_event_id: null }).eq('id', session.id);
        }
      }
    }

    // Clear availability event IDs (availability is re-created by syncAvailabilityToGoogle after deleteTutlioAvailabilityEventsFromGoogle)
    await supabase
      .from('availability')
      .update({ google_calendar_event_id: null })
      .eq('tutor_id', userId);
  } catch (err) {
    console.error('Error deleting all events:', err);
  }
}
