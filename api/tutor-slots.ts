import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { tutorId, start, end } = req.query;

    if (!tutorId || typeof tutorId !== 'string') {
        return res.status(400).json({ error: 'tutorId is required' });
    }

    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

        if (!supabaseUrl || !supabaseKey) {
            console.error('Missing Supabase env vars in /api/tutor-slots');
            return res.status(500).json({ error: 'Internal server configuration error.' });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Build query with date filtering for performance
        let query = supabase
            .from('sessions')
            .select('id, start_time, end_time, subject_id, available_spots')
            .eq('tutor_id', tutorId)
            .neq('status', 'cancelled');

        // Apply date range filters if provided (critical for performance)
        if (start && typeof start === 'string') {
            query = query.gte('start_time', start);
        }
        if (end && typeof end === 'string') {
            query = query.lte('start_time', end);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching tutor slots:', error);
            throw error;
        }

        return res.status(200).json(data || []);
    } catch (err: any) {
        console.error('Endpoint crashed safely:', err);
        return res.status(500).json({ error: err?.message || 'Unknown error' });
    }
}
