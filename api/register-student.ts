// ─── Vercel Serverless Function: Register Student (no confirmation email) ────
// POST /api/register-student
// Creates a Supabase auth user with email_confirm: true so no verification
// email is sent. Then updates the students table with onboarding data.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Missing Supabase env vars' });
    }

    const {
      email,
      password,
      studentId,
      fullName,
      phone,
      age,
      grade,
      subjectId,
      payerType,
      payerName,
      payerEmail,
      payerPhone,
      acceptedAt,
    } = req.body || {};

    if (!email || !password || !studentId) {
      return res.status(400).json({ error: 'Missing required fields: email, password, studentId' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id, tutor_id, email')
      .eq('id', studentId)
      .maybeSingle();

    if (studentErr || !student) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    if (student.email?.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({ error: 'Email does not match student record' });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'student',
        student_id: studentId,
        email,
        phone: phone || null,
        age: age || null,
        grade: grade || null,
        subject_id: subjectId || null,
        payment_payer: payerType || null,
        payer_name: payerType === 'parent' ? payerName : null,
        payer_email: payerType === 'parent' ? payerEmail : null,
        payer_phone: payerType === 'parent' ? payerPhone : null,
        accepted_privacy_policy_at: acceptedAt || null,
        accepted_terms_at: acceptedAt || null,
      },
    });

    if (authError || !authData.user) {
      return res.status(400).json({ error: authError?.message || 'Failed to create user' });
    }

    await supabase.from('students').update({
      payment_payer: payerType || null,
      payer_name: payerType === 'parent' ? payerName : null,
      payer_email: payerType === 'parent' ? payerEmail : null,
      payer_phone: payerType === 'parent' ? payerPhone : null,
      phone: phone || null,
      accepted_privacy_policy_at: acceptedAt || null,
      accepted_terms_at: acceptedAt || null,
    }).eq('id', studentId);

    // If the student belongs to a school, propagate school_id to their profile
    const { data: studentFull } = await supabase
      .from('students')
      .select('school_id')
      .eq('id', studentId)
      .maybeSingle();

    if (studentFull?.school_id) {
      await supabase.from('profiles').upsert({
        id: authData.user.id,
        email,
        full_name: fullName,
        phone: phone || null,
        school_id: studentFull.school_id,
      }, { onConflict: 'id' });
    }

    return res.status(200).json({ success: true, userId: authData.user.id });
  } catch (err: any) {
    console.error('[register-student] Error:', err?.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
