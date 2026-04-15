import { useEffect, useState } from 'react';
import { Search, MessageSquare, Plus, X, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import type { Conversation } from '@/hooks/useChat';
import { useMessageableStudents, getOrCreateConversation } from '@/hooks/useChat';
import type { MessageableStudent } from '@/hooks/useChat';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (conv: Conversation) => void;
  onConversationCreated?: (conversationId: string, student: MessageableStudent) => void;
  loading: boolean;
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  onConversationCreated,
  loading,
}: ConversationListProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const { students, loading: studentsLoading, fetch: fetchStudents } = useMessageableStudents();

  useEffect(() => {
    if (showPicker) fetchStudents();
  }, [showPicker, fetchStudents]);

  const existingUserIds = new Set(conversations.map((c) => c.other_user_id));
  const availableStudents = students.filter(
    (s) => !existingUserIds.has(s.linked_user_id),
  );
  const filteredStudents = pickerSearch.trim()
    ? availableStudents.filter((s) =>
        s.full_name.toLowerCase().includes(pickerSearch.toLowerCase()),
      )
    : availableStudents;

  const handleStartConversation = async (student: MessageableStudent) => {
    setCreating(true);
    const convId = await getOrCreateConversation(student.linked_user_id);
    setCreating(false);
    if (convId) {
      setShowPicker(false);
      setPickerSearch('');
      onConversationCreated?.(convId, student);
    }
  };

  const filtered = search.trim()
    ? conversations.filter((c) =>
        c.other_user_name.toLowerCase().includes(search.toLowerCase()),
      )
    : conversations;

  const formatTime = (iso: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isYesterday) return t('chat.yesterday');
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';

  const counterpartyRoleLabel = (conv: Conversation) => {
    if (!conv.other_party_kind || conv.other_user_name.includes('↔')) return null;
    if (conv.other_party_kind === 'student') return t('chat.roleStudent');
    if (conv.other_party_kind === 'org_admin') return t('chat.roleAdmin');
    return t('chat.roleTutor');
  };

  const counterpartyRoleClass = (kind: Conversation['other_party_kind']) => {
    if (kind === 'student') return 'bg-emerald-100 text-emerald-700';
    if (kind === 'org_admin') return 'bg-amber-100 text-amber-800';
    return 'bg-violet-100 text-violet-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('chat.searchConversations')}
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
            />
          </div>
          <button
            onClick={() => setShowPicker((v) => !v)}
            title={t('chat.newConversation')}
            className={cn(
              'p-2 rounded-xl border transition-colors flex-shrink-0',
              showPicker
                ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100',
            )}
          >
            {showPicker ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {showPicker && (() => {
        const hasTutors = availableStudents.some((s) => s.role === 'tutor');
        return (
          <div className="border-b border-gray-100 bg-indigo-50/40">
            <div className="px-4 py-2">
              <p className="text-xs font-semibold text-indigo-700 mb-2">
                {hasTutors ? t('chat.selectContact') : t('chat.selectStudent')}
              </p>
              {availableStudents.length > 5 && (
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder={t('chat.searchConversations')}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                  />
                </div>
              )}
            </div>
            <div className="max-h-52 overflow-y-auto px-2 pb-2">
              {studentsLoading || creating ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  {creating && <span className="ml-2 text-xs text-indigo-600">{t('chat.startingConversation')}</span>}
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="text-center py-4 px-2">
                  <UserPlus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs font-medium text-gray-500">{t('chat.noStudentsAvailable')}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{t('chat.noStudentsAvailableDesc')}</p>
                </div>
              ) : (
                filteredStudents.map((student) => (
                  <button
                    key={student.student_id}
                    onClick={() => handleStartConversation(student)}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left hover:bg-white transition-colors"
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0',
                      student.role === 'tutor'
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-indigo-100 text-indigo-700',
                    )}>
                      {student.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-gray-900 truncate">{student.full_name}</p>
                        {student.role === 'tutor' && (
                          <span className="text-[10px] font-semibold bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-md flex-shrink-0">
                            {t('chat.roleTutor')}
                          </span>
                        )}
                      </div>
                      {student.email && (
                        <p className="text-[11px] text-gray-400 truncate">{student.email}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })()}

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && !showPicker ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <MessageSquare className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">{t('chat.emptyConversations')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('chat.emptyConversationsDesc')}</p>
          </div>
        ) : (
          filtered.map((conv) => {
            const roleText = counterpartyRoleLabel(conv);
            return (
            <button
              key={conv.conversation_id}
              onClick={() => onSelect(conv)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                activeId === conv.conversation_id
                  ? 'bg-indigo-100 hover:bg-indigo-100 border-l-[3px] border-indigo-600'
                  : 'bg-white hover:bg-gray-50',
              )}
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold',
                  activeId === conv.conversation_id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200 text-gray-600',
                )}
              >
                {getInitials(conv.other_user_name)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {conv.other_user_name}
                    </p>
                    {roleText && conv.other_party_kind && (
                      <span
                        className={cn(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 uppercase tracking-wide',
                          counterpartyRoleClass(conv.other_party_kind),
                        )}
                      >
                        {roleText}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0">
                    {formatTime(conv.last_message_created_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-gray-500 truncate">
                    {conv.last_message_sender_id === null
                      ? ''
                      : conv.last_message_type === 'file'
                        ? `📎 ${t('chat.file')}`
                        : conv.last_message_content ?? ''}
                  </p>
                  {conv.unread_count > 0 && (
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {conv.unread_count > 9 ? '9+' : conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
            );
          })
        )}
      </div>
    </div>
  );
}
