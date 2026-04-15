import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Kai Supabase grąžina klaidą į URL fragmentą (pvz. #error=access_denied&error_code=otp_expired),
 * nukreipia į /login su query parametrais ir nuima hash, kad vartotojas matytų paaiškinimą.
 */
export default function SupabaseAuthHashErrors() {
  const navigate = useNavigate();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const hash = window.location.hash?.replace(/^#/, '') || '';
    if (!hash.includes('error=')) return;

    const params = new URLSearchParams(hash);
    const error = params.get('error');
    if (!error) return;

    handled.current = true;
    const errorCode = params.get('error_code') || error;
    const errorDescription = params.get('error_description') || '';

    const cleanPath = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', cleanPath);

    const qs = new URLSearchParams();
    qs.set('auth_error', errorCode);
    if (errorDescription) {
      qs.set('auth_error_detail', errorDescription.slice(0, 240));
    }
    navigate(`/login?${qs.toString()}`, { replace: true });
  }, [navigate]);

  return null;
}
