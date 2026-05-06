import { PenLine } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

interface WhiteboardButtonProps {
  roomId: string | null | undefined;
}

const WHITEBOARD_AUTH_BOOTSTRAP_KEY = 'tutlio_whiteboard_auth_bootstrap';
const WB_AUTH_REQUEST = 'tutlio:whiteboard-auth-request';
const WB_AUTH_RESPONSE = 'tutlio:whiteboard-auth-response';
const AUTH_BOOTSTRAP_TTL_MS = 2 * 60 * 1000;

export default function WhiteboardButton({ roomId }: WhiteboardButtonProps) {
  const { t } = useTranslation();

  if (!roomId) return null;

  const handleOpenInNewTab = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const targetUrl = `/whiteboard/${roomId}?new_tab=1`;
    const newTab = window.open(targetUrl, '_blank');
    if (!newTab) {
      window.location.href = targetUrl;
      return;
    }

    const origin = window.location.origin;
    let latestAccessToken: string | null = null;
    let latestRefreshToken: string | null = null;

    const sendTokensToTab = () => {
      if (!latestAccessToken || !latestRefreshToken || newTab.closed) return;
      try {
        newTab.postMessage(
          {
            type: WB_AUTH_RESPONSE,
            accessToken: latestAccessToken,
            refreshToken: latestRefreshToken,
          },
          origin,
        );
      } catch (err) {
        console.warn('[WhiteboardButton] postMessage auth failed:', err);
      }
    };

    const messageHandler = async (evt: MessageEvent) => {
      if (evt.origin !== origin) return;
      if (evt.source !== newTab) return;
      if (!evt.data || evt.data?.type !== WB_AUTH_REQUEST) return;
      sendTokensToTab();
    };
    window.addEventListener('message', messageHandler);
    window.setTimeout(() => window.removeEventListener('message', messageHandler), 15000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token && session?.refresh_token) {
        latestAccessToken = session.access_token;
        latestRefreshToken = session.refresh_token;
        localStorage.setItem(
          WHITEBOARD_AUTH_BOOTSTRAP_KEY,
          JSON.stringify({
            accessToken: latestAccessToken,
            refreshToken: latestRefreshToken,
            expiresAt: Date.now() + AUTH_BOOTSTRAP_TTL_MS,
          }),
        );
        sendTokensToTab();
      }
    } catch (err) {
      console.warn('[WhiteboardButton] Failed to prepare auth bootstrap:', err);
    }
  };

  return (
    <a
      href={`/whiteboard/${roomId}`}
      onClick={handleOpenInNewTab}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-50 text-violet-600 text-sm hover:bg-violet-100 transition-colors"
    >
      <PenLine className="w-4 h-4" />
      {t('whiteboard.open')}
    </a>
  );
}
