import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, ArrowLeft, Mail, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import {
  useChatMessages,
  sendMessage,
  markConversationRead,
  uploadChatFile,
  updateChatEmailNotifyPrefs,
} from '@/hooks/useChat';
import type { Conversation } from '@/hooks/useChat';
import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/lib/supabase';
import MessageBubble from './MessageBubble';
import type { SenderRole } from './MessageBubble';
import ChatFileUpload from './ChatFileUpload';

interface ChatWindowProps {
  conversation: Conversation | null;
  onBack?: () => void;
  onMessageSent?: () => void;
  participantNames?: Map<string, string>;
  participantRoles?: Map<string, string>;
}

export default function ChatWindow({ conversation, onBack, onMessageSent, participantNames, participantRoles }: ChatWindowProps) {
  const { t } = useTranslation();
  const { user } = useUser();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [emailNotifyEnabled, setEmailNotifyEnabled] = useState(true);
  const [emailNotifyDelayHours, setEmailNotifyDelayHours] = useState(12);
  const [emailNotifyLoading, setEmailNotifyLoading] = useState(false);
  const [emailPrefsOpen, setEmailPrefsOpen] = useState(false);
  const [thirdPartySenders, setThirdPartySenders] = useState<Map<string, string>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, loading } = useChatMessages(conversation?.conversation_id ?? null);

  useEffect(() => {
    if (!conversation?.conversation_id || !user?.id) return;
    let cancelled = false;
    setEmailNotifyLoading(true);
    void (async () => {
      const { data } = await supabase
        .from('chat_participants')
        .select('email_notify_enabled, email_notify_delay_hours')
        .eq('conversation_id', conversation.conversation_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setEmailNotifyEnabled(data.email_notify_enabled !== false);
        setEmailNotifyDelayHours(data.email_notify_delay_hours ?? 12);
      } else {
        setEmailNotifyEnabled(conversation.email_notify_enabled !== false);
        setEmailNotifyDelayHours(conversation.email_notify_delay_hours ?? 12);
      }
      setEmailNotifyLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversation?.conversation_id, conversation?.email_notify_enabled, conversation?.email_notify_delay_hours, user?.id]);

  useEffect(() => {
    setEmailPrefsOpen(false);
  }, [conversation?.conversation_id]);

  useEffect(() => {
    if (!emailPrefsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEmailPrefsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [emailPrefsOpen]);

  const persistEmailNotify = async (enabled: boolean, hours: number) => {
    if (!conversation?.conversation_id || !user?.id) return;
    setEmailNotifyLoading(true);
    const ok = await updateChatEmailNotifyPrefs(conversation.conversation_id, {
      email_notify_enabled: enabled,
      email_notify_delay_hours: hours,
    });
    if (!ok) {
      const { data } = await supabase
        .from('chat_participants')
        .select('email_notify_enabled, email_notify_delay_hours')
        .eq('conversation_id', conversation.conversation_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setEmailNotifyEnabled(data.email_notify_enabled !== false);
        setEmailNotifyDelayHours(data.email_notify_delay_hours ?? 12);
      }
    }
    setEmailNotifyLoading(false);
  };

  useEffect(() => {
    if (!conversation || messages.length === 0) {
      setThirdPartySenders(new Map());
      return;
    }

    const knownIds = new Set<string>();
    if (user?.id) knownIds.add(user.id);
    if (conversation.other_user_id) knownIds.add(conversation.other_user_id);
    if (participantRoles) {
      for (const id of participantRoles.keys()) knownIds.add(id);
    }

    const unknownIds = [...new Set(
      messages.filter((m) => !knownIds.has(m.sender_id)).map((m) => m.sender_id),
    )];

    if (unknownIds.length === 0) {
      setThirdPartySenders(new Map());
      return;
    }

    supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', unknownIds)
      .then(({ data }) => {
        const map = new Map<string, string>();
        (data ?? []).forEach((p) => map.set(p.id, p.full_name ?? 'Admin'));
        setThirdPartySenders(map);
      });
  }, [messages, user?.id, conversation?.other_user_id, conversation?.conversation_id, participantRoles]);

  useEffect(() => {
    if (conversation?.conversation_id && conversation.unread_count > 0) {
      markConversationRead(conversation.conversation_id);
    }
  }, [conversation?.conversation_id, messages.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    if (conversation && inputRef.current) {
      inputRef.current.focus();
    }
  }, [conversation?.conversation_id]);

  const getSenderRole = useMemo(() => {
    return (senderId: string): SenderRole | undefined => {
      if (participantRoles?.has(senderId)) return participantRoles.get(senderId) as SenderRole;
      if (thirdPartySenders.has(senderId)) return 'admin';
      return undefined;
    };
  }, [participantRoles, thirdPartySenders]);

  const getDisplayName = useMemo(() => {
    return (senderId: string): string | undefined => {
      if (participantNames?.has(senderId)) return participantNames.get(senderId);
      if (thirdPartySenders.has(senderId)) return thirdPartySenders.get(senderId);
      return undefined;
    };
  }, [participantNames, thirdPartySenders]);

  const handleSend = async () => {
    if (!conversation || !text.trim() || sending) return;
    setSending(true);
    const result = await sendMessage(conversation.conversation_id, text.trim());
    if (result) {
      setText('');
      onMessageSent?.();
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (file: File) => {
    if (!conversation) return;
    setUploading(true);
    const result = await uploadChatFile(conversation.conversation_id, file);
    if (result) {
      await sendMessage(
        conversation.conversation_id,
        '',
        'file',
        { storage_path: result.path, file_name: file.name, file_size: file.size },
      );
      onMessageSent?.();
    }
    setUploading(false);
  };

  const getDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return t('chat.today');
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return t('chat.yesterday');
    return d.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
          <Send className="w-7 h-7 text-indigo-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-700">{t('chat.noConversationSelected')}</h3>
        <p className="text-sm text-gray-400 mt-1">{t('chat.noConversationSelectedDesc')}</p>
      </div>
    );
  }

  const initials = conversation.other_user_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  let lastDateLabel = '';

  return (
    <div className="flex flex-col h-full">
      {/* Header + el. pašto nustatymai (kompaktiškai) */}
      <div className="relative flex-shrink-0 border-b border-gray-100 bg-white z-20">
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3">
          {onBack && (
            <button type="button" onClick={onBack} className="p-1 -ml-1 lg:hidden flex-shrink-0">
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
          )}
          <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <p className="text-sm font-semibold text-gray-900 truncate">{conversation.other_user_name}</p>
              {conversation.other_party_kind && !conversation.other_user_name.includes('↔') && (
                <span
                  className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 uppercase tracking-wide',
                    conversation.other_party_kind === 'student' && 'bg-emerald-100 text-emerald-700',
                    conversation.other_party_kind === 'org_admin' && 'bg-amber-100 text-amber-800',
                    conversation.other_party_kind === 'tutor' && 'bg-violet-100 text-violet-700',
                  )}
                >
                  {conversation.other_party_kind === 'student'
                    ? t('chat.roleStudent')
                    : conversation.other_party_kind === 'org_admin'
                      ? t('chat.roleAdmin')
                      : t('chat.roleTutor')}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 truncate">{conversation.other_user_email}</p>
          </div>
          <button
            type="button"
            onClick={() => setEmailPrefsOpen((o) => !o)}
            className={cn(
              'relative flex-shrink-0 flex items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-semibold transition-all',
              emailPrefsOpen
                ? 'border-indigo-200 bg-indigo-50 text-indigo-800 shadow-sm'
                : 'border-gray-200/80 bg-gray-50/80 text-gray-600 hover:bg-gray-100 hover:border-gray-300',
            )}
            title={t('chat.emailPrefsTitle')}
          >
            <Mail className="w-4 h-4" />
            <span className="hidden sm:inline max-w-[7rem] truncate">
              {emailNotifyEnabled
                ? t('chat.emailPrefsBadgeOn', { hours: String(emailNotifyDelayHours) })
                : t('chat.emailPrefsBadgeOff')}
            </span>
            <ChevronDown
              className={cn('w-3.5 h-3.5 opacity-70 transition-transform', emailPrefsOpen && 'rotate-180')}
            />
            {emailNotifyEnabled && !emailPrefsOpen && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white"
                aria-hidden
              />
            )}
          </button>
        </div>

        {emailPrefsOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-10 bg-black/25 sm:hidden"
              aria-label={t('chat.emailPrefsClose')}
              onClick={() => setEmailPrefsOpen(false)}
            />
            <div
              className={cn(
                'absolute z-20 mx-3 sm:mx-0 sm:right-4 top-full mt-1 w-[calc(100%-1.5rem)] sm:w-[min(100vw-2rem,18rem)]',
                'rounded-2xl border border-gray-200/90 bg-white p-4 shadow-xl shadow-gray-900/10',
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 leading-tight">{t('chat.emailPrefsPanelTitle')}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{t('chat.emailPrefsPanelSub')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailPrefsOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 flex-shrink-0"
                  title={t('chat.emailPrefsClose')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none py-1">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  checked={emailNotifyEnabled}
                  disabled={emailNotifyLoading}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setEmailNotifyEnabled(v);
                    void persistEmailNotify(v, emailNotifyDelayHours);
                  }}
                />
                <span className="text-sm text-gray-800">{t('chat.notificationsEnabled')}</span>
              </label>

              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-1.5">{t('chat.notificationsDelayLabel')}</p>
                <select
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50/80 text-gray-900 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 outline-none disabled:opacity-50"
                  value={emailNotifyDelayHours}
                  disabled={emailNotifyLoading || !emailNotifyEnabled}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    setEmailNotifyDelayHours(h);
                    void persistEmailNotify(emailNotifyEnabled, h);
                  }}
                >
                  {[1, 2, 3, 6, 12, 24, 48].map((h) => (
                    <option key={h} value={h}>
                      {h} {t('chat.notificationsHours')}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed mt-3">{t('chat.emailNotifyHint')}</p>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-gray-400">{t('chat.emptyMessages')}</p>
            <p className="text-xs text-gray-300 mt-1">{t('chat.emptyMessagesDesc')}</p>
          </div>
        ) : (
          messages.map((msg) => {
            const dateLabel = getDateLabel(msg.created_at);
            const showDateSep = dateLabel !== lastDateLabel;
            lastDateLabel = dateLabel;

            const isOwn = msg.sender_id === user?.id;

            return (
              <div key={msg.id}>
                {showDateSep && (
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">
                      {dateLabel}
                    </span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                )}
                <MessageBubble
                  message={msg}
                  isOwn={isOwn}
                  currentUserId={user?.id}
                  senderName={getDisplayName(msg.sender_id)}
                  senderRole={!isOwn ? getSenderRole(msg.sender_id) : undefined}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 bg-white flex-shrink-0">
        <div className="flex items-end gap-2">
          <ChatFileUpload onFileSelect={handleFileSelect} uploading={uploading} />
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.sendMessage')}
            rows={1}
            className="flex-1 resize-none text-sm px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 max-h-32"
            style={{ minHeight: '40px' }}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className={cn(
              'p-2.5 rounded-xl bg-indigo-600 text-white transition-all',
              text.trim() && !sending
                ? 'hover:bg-indigo-700 shadow-sm'
                : 'opacity-40 cursor-not-allowed',
            )}
          >
            <Send className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
