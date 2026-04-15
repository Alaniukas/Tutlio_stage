import { Download, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { downloadChatFile } from '@/hooks/useChat';
import type { ChatMessage } from '@/hooks/useChat';
import LessonProposalCard from './LessonProposalCard';

export type SenderRole = 'student' | 'tutor' | 'admin';

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  currentUserId?: string;
  senderName?: string;
  senderRole?: SenderRole;
}

const roleBubbleStyles: Record<SenderRole, string> = {
  student: 'bg-blue-50 text-gray-900 rounded-bl-md',
  tutor: 'bg-emerald-50 text-gray-900 rounded-bl-md',
  admin: 'bg-amber-50 text-gray-900 rounded-bl-md',
};

const roleNameColors: Record<SenderRole, string> = {
  student: 'text-blue-600',
  tutor: 'text-emerald-600',
  admin: 'text-amber-600',
};

const roleBadgeStyles: Record<SenderRole, string> = {
  student: 'bg-blue-100 text-blue-700',
  tutor: 'bg-emerald-100 text-emerald-700',
  admin: 'bg-amber-100 text-amber-700',
};

export default function MessageBubble({ message, isOwn, currentUserId, senderName, senderRole }: MessageBubbleProps) {
  const { t } = useTranslation();

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const bubbleBg = isOwn
    ? 'bg-indigo-600 text-white rounded-br-md'
    : senderRole
      ? roleBubbleStyles[senderRole]
      : 'bg-gray-100 text-gray-900 rounded-bl-md';

  const nameColor = senderRole ? roleNameColors[senderRole] : 'text-indigo-600';
  const timeColor = isOwn ? 'text-indigo-200' : 'text-gray-400';

  const roleLabelMap: Record<SenderRole, string> = {
    student: t('chat.roleStudent'),
    tutor: t('chat.roleTutor'),
    admin: t('chat.roleAdmin'),
  };

  const handleFileDownload = async () => {
    const path = (message.metadata as any)?.storage_path;
    if (!path) return;
    const url = await downloadChatFile(path);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = (message.metadata as any)?.file_name ?? 'file';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  const renderSenderLabel = () => {
    if (isOwn) return null;
    if (!senderName && !senderRole) return null;

    return (
      <div className="flex items-center gap-1.5 mb-0.5">
        {senderName && (
          <span className={cn('text-xs font-semibold', nameColor)}>{senderName}</span>
        )}
        {senderRole && (
          <span
            className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-tight',
              roleBadgeStyles[senderRole],
            )}
          >
            {roleLabelMap[senderRole]}
          </span>
        )}
      </div>
    );
  };

  if (message.message_type === 'lesson_proposal') {
    return (
      <LessonProposalCard message={message} isOwn={isOwn} currentUserId={currentUserId} />
    );
  }

  if (message.message_type === 'file') {
    const meta = message.metadata as { file_name?: string; file_size?: number } | null;
    const fileName = meta?.file_name ?? t('chat.file');
    const fileSize = meta?.file_size
      ? meta.file_size < 1024 * 1024
        ? `${(meta.file_size / 1024).toFixed(1)} KB`
        : `${(meta.file_size / (1024 * 1024)).toFixed(1)} MB`
      : '';

    return (
      <div className={cn('flex mb-3', isOwn ? 'justify-end' : 'justify-start')}>
        <div className={cn('max-w-[75%] rounded-2xl px-4 py-3', bubbleBg)}>
          {renderSenderLabel()}
          <button
            onClick={handleFileDownload}
            className={cn(
              'flex items-center gap-2.5 w-full text-left',
              isOwn ? 'hover:text-indigo-100' : 'hover:text-indigo-600',
            )}
          >
            <FileText className="w-5 h-5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{fileName}</p>
              {fileSize && (
                <p className={cn('text-xs', isOwn ? 'text-indigo-200' : 'text-gray-500')}>
                  {fileSize}
                </p>
              )}
            </div>
            <Download className="w-4 h-4 flex-shrink-0" />
          </button>
          {message.content && (
            <p className="text-sm mt-2 whitespace-pre-wrap break-words">{message.content}</p>
          )}
          <p className={cn('text-[10px] mt-1', timeColor)}>{time}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex mb-3', isOwn ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[75%] rounded-2xl px-4 py-2.5', bubbleBg)}>
        {renderSenderLabel()}
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        <p className={cn('text-[10px] mt-1', timeColor)}>{time}</p>
      </div>
    </div>
  );
}
