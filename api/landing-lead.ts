import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QUIZ_AUDIENCES = ['solo', 'company', 'school'] as const;
type QuizAudience = typeof QUIZ_AUDIENCES[number];

export interface LandingLeadPayload {
  email: string;
  source: string;
  audience: QuizAudience | null;
  locale: string | null;
  quiz_answers: Record<string, string | string[]> | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  consent_at: string | null;
}

function optionalText(value: unknown, maxLength: number): string | null {
  const normalized = String(value ?? '').trim().slice(0, maxLength);
  return normalized || null;
}

function sanitizeAnswers(value: unknown): Record<string, string | string[]> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const answers: Record<string, string | string[]> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 20)) {
    const key = rawKey.trim().slice(0, 64);
    if (!key) continue;
    if (typeof rawValue === 'string') {
      const answer = rawValue.trim().slice(0, 128);
      if (answer) answers[key] = answer;
      continue;
    }
    if (Array.isArray(rawValue)) {
      const answerList = Array.from(new Set(rawValue
        .filter((answer): answer is string => typeof answer === 'string')
        .map((answer) => answer.trim().slice(0, 128))
        .filter(Boolean)))
        .slice(0, 10);
      if (answerList.length > 0) answers[key] = answerList;
    }
  }
  return Object.keys(answers).length > 0 ? answers : null;
}

export function parseLandingLeadPayload(body: Record<string, unknown>):
  | { payload: LandingLeadPayload; error?: never }
  | { payload?: never; error: string } {
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
  const source = String(body.source || 'landing_integrations').trim().slice(0, 80);
  if (!EMAIL_RE.test(email)) return { error: 'Invalid email' };
  if (!source) return { error: 'Invalid source' };

  const isQuizLead = source.startsWith('quiz_');
  const audienceValue = String(body.audience ?? '').trim();
  const audience = QUIZ_AUDIENCES.includes(audienceValue as QuizAudience)
    ? audienceValue as QuizAudience
    : null;

  if (isQuizLead && (!audience || source !== `quiz_${audience}` || body.consent !== true)) {
    return { error: 'Invalid quiz lead' };
  }

  const locale = optionalText(body.locale, 12);
  if (locale && !/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(locale)) {
    return { error: 'Invalid locale' };
  }

  return {
    payload: {
      email,
      source,
      audience: isQuizLead ? audience : null,
      locale: isQuizLead ? locale : null,
      quiz_answers: isQuizLead ? sanitizeAnswers(body.quiz_answers) : null,
      utm_source: isQuizLead ? optionalText(body.utm_source, 200) : null,
      utm_medium: isQuizLead ? optionalText(body.utm_medium, 200) : null,
      utm_campaign: isQuizLead ? optionalText(body.utm_campaign, 200) : null,
      consent_at: isQuizLead ? new Date().toISOString() : null,
    },
  };
}

function isMissingQuizColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST204'
    || /quiz_answers|consent_at|audience|utm_(source|medium|campaign)/i.test(error.message || '');
}

function isDuplicateLeadError(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

function acceptForRetry(res: VercelResponse) {
  res.setHeader('Retry-After', '5');
  return res.status(202).json({ success: false, retry: true });
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body: Record<string, unknown>;
  try {
    const raw = req.body;
    body = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const parsed = parseLandingLeadPayload(body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const payload = parsed.payload;

  try {
    const supabase = getSupabase();

    const { data: existing, error: lookupError } = await supabase
      .from('landing_leads')
      .select('id')
      .eq('email', payload.email)
      .eq('source', payload.source)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error('landing_leads lookup error:', lookupError);
      return acceptForRetry(res);
    }

    if (existing) {
      if (payload.audience) {
        const { error: updateError } = await supabase
          .from('landing_leads')
          .update({
            locale: payload.locale,
            audience: payload.audience,
            quiz_answers: payload.quiz_answers,
            utm_source: payload.utm_source,
            utm_medium: payload.utm_medium,
            utm_campaign: payload.utm_campaign,
            consent_at: payload.consent_at,
          })
          .eq('id', existing.id);
        if (updateError && !isMissingQuizColumn(updateError)) {
          console.error('landing_leads update error:', updateError);
          return acceptForRetry(res);
        }
      }
      return res.status(200).json({ success: true, duplicate: true });
    }

    const leadRecord = payload.audience ? payload : {
      email: payload.email,
      source: payload.source,
    };
    let { error: dbError } = await supabase.from('landing_leads').insert(leadRecord);

    // Stage/local environments can keep collecting the email before this migration is pushed.
    if (payload.audience && isMissingQuizColumn(dbError)) {
      ({ error: dbError } = await supabase.from('landing_leads').insert({
        email: payload.email,
        source: payload.source,
      }));
    }

    if (isDuplicateLeadError(dbError)) {
      return res.status(200).json({ success: true, duplicate: true });
    }

    if (dbError) {
      console.error('landing_leads insert error:', dbError);
      return acceptForRetry(res);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('landing-lead error:', err);
    return acceptForRetry(res);
  }
}
