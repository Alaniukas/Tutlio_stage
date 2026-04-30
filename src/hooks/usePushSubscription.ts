import { useEffect, useRef } from 'react';
import { isPushSupported, subscribeToPush } from '@/lib/pushNotifications';

/**
 * Attempts push notification subscription once per session.
 * Call from any authenticated layout — the browser will show the permission
 * prompt only if the user hasn't already granted/denied it.
 */
export function usePushSubscription() {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || !isPushSupported()) return;
    attempted.current = true;

    const timer = setTimeout(() => {
      subscribeToPush().catch((err) =>
        console.warn('[push] subscription failed:', err),
      );
    }, 3000);

    return () => clearTimeout(timer);
  }, []);
}
