import { useState } from 'react';
import { Calendar, Clock, BookOpen, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/hooks/useChat';

interface LessonProposalCardProps {
  message: ChatMessage;
  isOwn: boolean;
  currentUserId: string | undefined;
}

interface ProposalMeta {
  date?: string;
  time?: string;
  subject_name?: string;
  price?: number;
  status?: 'pending' | 'accepted' | 'declined';
}

export default function LessonProposalCard({ message, isOwn, currentUserId }: LessonProposalCardProps) {
  const { t } = useTranslation();
  const meta = (message.metadata ?? {}) as ProposalMeta;
  const [status, setStatus] = useState(meta.status ?? 'pending');
  const [loading, setLoading] = useState(false);

  const canRespond = !isOwn && status === 'pending';

  const handleResponse = async (newStatus: 'accepted' | 'declined') => {
    setLoading(true);
    const { error } = await supabase
      .from('chat_messages')
      .update({ metadata: { ...meta, status: newStatus } })
      .eq('id', message.id);

    if (!error) setStatus(newStatus);
    setLoading(false);
  };

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const statusColor =
    status === 'accepted'
      ? 'border-green-200 bg-green-50'
      : status === 'declined'
        ? 'border-red-200 bg-red-50'
        : 'border-indigo-200 bg-indigo-50';

  const statusLabel =
    status === 'accepted'
      ? t('chat.lessonProposalAccepted')
      : status === 'declined'
        ? t('chat.lessonProposalDeclined')
        : t('chat.lessonProposalPending');

  return (
    <div className={cn('flex mb-3', isOwn ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%] rounded-2xl border-2 p-4', statusColor)}>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-indigo-600" />
          <span className="text-sm font-semibold text-indigo-700">{t('chat.lessonProposal')}</span>
        </div>

        {message.content && (
          <p className="text-sm text-gray-700 mb-3">{message.content}</p>
        )}

        <div className="grid grid-cols-2 gap-2 text-sm">
          {meta.date && (
            <div className="flex items-center gap-1.5 text-gray-600">
              <Calendar className="w-3.5 h-3.5" />
              <span>{meta.date}</span>
            </div>
          )}
          {meta.time && (
            <div className="flex items-center gap-1.5 text-gray-600">
              <Clock className="w-3.5 h-3.5" />
              <span>{meta.time}</span>
            </div>
          )}
          {meta.subject_name && (
            <div className="text-gray-600 col-span-2">
              <span className="font-medium">{meta.subject_name}</span>
            </div>
          )}
          {meta.price != null && (
            <div className="text-gray-900 font-semibold col-span-2">
              &euro;{Number(meta.price).toFixed(2)}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span
            className={cn(
              'text-xs font-medium px-2 py-1 rounded-full',
              status === 'accepted' && 'bg-green-100 text-green-700',
              status === 'declined' && 'bg-red-100 text-red-700',
              status === 'pending' && 'bg-indigo-100 text-indigo-700',
            )}
          >
            {statusLabel}
          </span>
          <span className="text-[10px] text-gray-400">{time}</span>
        </div>

        {canRespond && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => handleResponse('accepted')}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-sm font-medium bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {t('chat.lessonProposalAccept')}
            </button>
            <button
              onClick={() => handleResponse('declined')}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-sm font-medium bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              {t('chat.lessonProposalDecline')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
