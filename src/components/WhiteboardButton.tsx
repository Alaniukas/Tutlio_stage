import { PenLine } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface WhiteboardButtonProps {
  roomId: string | null | undefined;
}

export default function WhiteboardButton({ roomId }: WhiteboardButtonProps) {
  const { t } = useTranslation();

  if (!roomId) return null;

  return (
    <a
      href={`/whiteboard/${roomId}`}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-50 text-violet-600 text-sm hover:bg-violet-100 transition-colors"
    >
      <PenLine className="w-4 h-4" />
      {t('whiteboard.open')}
    </a>
  );
}
