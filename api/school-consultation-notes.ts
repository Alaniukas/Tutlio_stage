import type { VercelRequest, VercelResponse } from './types.js';
import { requireConsultationsAuth, serviceSupabase, userConsultationSupabase } from './_lib/schoolConsultationsAccess.js';
import { consultationUuid, loadFamilyConsultation, familyConsultationAccess, FAMILY_CONSULTATION_NOTE_FIELDS } from './_lib/schoolFamilyConsultations.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireConsultationsAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
  const input = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const id = consultationUuid(req.method === 'GET' ? req.query?.consultation_id : input.consultation_id);
  if (!id) return res.status(400).json({ error: 'Invalid consultation' });
  try {
    const db = serviceSupabase();
    const booking = await loadFamilyConsultation(db, id);
    if (!booking) return res.status(404).json({ error: 'Consultation not found' });
    const access = await familyConsultationAccess(db, auth.userId, booking);
    if (!access.canReadNotes) return res.status(403).json({ error: 'Forbidden' });
    const privateDb = userConsultationSupabase(req);
    if (req.method === 'GET') {
      const { data, error } = await privateDb.from('school_consultation_notes').select(FAMILY_CONSULTATION_NOTE_FIELDS)
        .eq('consultation_id', id).eq('organization_id', booking.organization_id).order('created_at', { ascending: true });
      if (error) throw new Error('Unable to load notes');
      return res.status(200).json({ ok: true, notes: data || [], canWrite: access.canWriteNotes, authorUserId: auth.userId });
    }
    if (!access.canWriteNotes) return res.status(403).json({ error: 'Forbidden' });
    if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 10_000) return res.status(400).json({ error: 'Invalid note' });
    // Scope and authorship come from the live booking and session, never the request.
    const { data, error } = await privateDb.from('school_consultation_notes').upsert({
      consultation_id: id, organization_id: booking.organization_id, author_user_id: auth.userId,
      body: input.body.trim(), updated_at: new Date().toISOString(),
    }, { onConflict: 'consultation_id,author_user_id' }).select(FAMILY_CONSULTATION_NOTE_FIELDS).single();
    if (error) throw new Error('Unable to save note');
    return res.status(200).json({ ok: true, note: data });
  } catch {
    return res.status(503).json({ error: 'Consultation access unavailable' });
  }
}
