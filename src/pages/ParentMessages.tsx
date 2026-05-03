import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useConversations, getOrCreateConversation } from '@/hooks/useChat';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';
import type { Conversation, MessageableStudent } from '@/hooks/useChat';
import ParentLayout from '@/components/ParentLayout';

export default function ParentMessages() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { conversations, loading, refetch } = useConversations();
  const [active, setActive] = useState<Conversation | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const autoOpenedRef = useRef(false);

  const visibleConversations = useMemo(() => {
    return conversations;
  }, [conversations]);

  useEffect(() => {
    setActive((prev) => {
      if (!prev?.conversation_id) return prev;
      const fresh = visibleConversations.find((c) => c.conversation_id === prev.conversation_id);
      return fresh ?? prev;
    });
  }, [visibleConversations]);

  useEffect(() => {
    if (active && visibleConversations.some((c) => c.conversation_id === active.conversation_id)) return;
    if (visibleConversations.length === 1) {
      setActive(visibleConversations[0]);
      setMobileShowChat(true);
    }
  }, [loading, visibleConversations, active]);

  // Optional: jump to/start a conversation with a specific student via ?studentId=...
  // Order of preference: child's linked user (chat with child) -> child's tutor.
  useEffect(() => {
    const studentId = searchParams.get('studentId');
    if (!studentId || autoOpenedRef.current || loading) return;
    autoOpenedRef.current = true;

    void (async () => {
      const { data: stRow } = await supabase
        .from('students')
        .select('id, full_name, linked_user_id, tutor_id, profiles:tutor_id(full_name)')
        .eq('id', studentId)
        .maybeSingle();
      if (!stRow) return;

      const targetUserId = (stRow as any).linked_user_id || (stRow as any).tutor_id;
      if (!targetUserId) return;

      const existing = visibleConversations.find((c) => c.other_user_id === targetUserId);
      if (existing) {
        setActive(existing);
        setMobileShowChat(true);
        return;
      }

      const convId = await getOrCreateConversation(targetUserId);
      if (!convId) return;
      await refetch();

      const isChild = (stRow as any).linked_user_id === targetUserId;
      const targetName = isChild
        ? (stRow as any).full_name ?? ''
        : (stRow as any).profiles?.full_name ?? '';

      setActive({
        conversation_id: convId,
        last_message_at: new Date().toISOString(),
        other_user_id: targetUserId,
        other_user_name: targetName,
        other_user_email: '',
        last_message_content: null,
        last_message_type: null,
        last_message_sender_id: null,
        last_message_created_at: null,
        unread_count: 0,
        other_party_kind: isChild ? 'student' : 'tutor',
      });
      setMobileShowChat(true);
    })();
  }, [searchParams, loading, visibleConversations, refetch]);

  const handleSelect = (conv: Conversation) => {
    setActive(conv);
    setMobileShowChat(true);
  };

  const handleBack = () => setMobileShowChat(false);

  const handleConversationCreated = async (conversationId: string, contact: MessageableStudent) => {
    await refetch();
    const conv: Conversation = {
      conversation_id: conversationId,
      last_message_at: new Date().toISOString(),
      other_user_id: contact.linked_user_id,
      other_user_name: contact.full_name,
      other_user_email: contact.email ?? '',
      last_message_content: null,
      last_message_type: null,
      last_message_sender_id: null,
      last_message_created_at: null,
      unread_count: 0,
      other_party_kind:
        contact.role === 'student'
          ? 'student'
          : contact.role === 'tutor'
            ? 'tutor'
            : contact.role === 'org_admin'
              ? 'org_admin'
              : contact.role === 'parent'
                ? 'parent'
                : undefined,
    };
    setActive(conv);
    setMobileShowChat(true);
  };

  return (
    <ParentLayout>
      <main className="flex-1 flex flex-col min-h-0 w-full max-w-none px-2 sm:px-4 pt-3">
        <h1 className="text-lg font-black text-gray-900 px-1 pb-2 shrink-0 tracking-tight">
          {t('chat.title')}
        </h1>
        <div
          className="bg-white rounded-2xl border border-gray-200 shadow-sm flex isolate flex-1 min-h-0 w-full overflow-hidden"
          style={{ maxHeight: 'calc(100dvh - 7.5rem)' }}
        >
          <div className={`w-full lg:w-80 xl:w-96 border-r border-gray-100 flex-shrink-0 ${mobileShowChat ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'}`}>
            <ConversationList
              conversations={visibleConversations}
              activeId={active?.conversation_id ?? null}
              onSelect={handleSelect}
              onConversationCreated={handleConversationCreated}
              loading={loading}
              messageableAudience="parent"
            />
          </div>
          <div className={`flex-1 min-w-0 ${mobileShowChat ? '' : 'hidden lg:block'}`}>
            <ChatWindow
              conversation={active}
              onBack={handleBack}
              onMessageSent={refetch}
            />
          </div>
        </div>
      </main>
    </ParentLayout>
  );
}
