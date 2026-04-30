import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { useTranslation } from '@/lib/i18n';
import { useConversations } from '@/hooks/useChat';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';
import type { Conversation } from '@/hooks/useChat';
import type { MessageableStudent } from '@/hooks/useChat';

export default function Messages() {
  const { t } = useTranslation();
  const { conversations, loading, refetch } = useConversations();
  const [active, setActive] = useState<Conversation | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  useEffect(() => {
    setActive((prev) => {
      if (!prev?.conversation_id) return prev;
      const fresh = conversations.find((c) => c.conversation_id === prev.conversation_id);
      return fresh ?? prev;
    });
  }, [conversations]);

  const handleSelect = (conv: Conversation) => {
    setActive(conv);
    setMobileShowChat(true);
  };

  const handleConversationCreated = async (conversationId: string, student: MessageableStudent) => {
    await refetch();
    const conv: Conversation = {
      conversation_id: conversationId,
      last_message_at: new Date().toISOString(),
      other_user_id: student.linked_user_id,
      other_user_name: student.full_name,
      other_user_email: student.email ?? '',
      last_message_content: null,
      last_message_type: null,
      last_message_sender_id: null,
      last_message_created_at: null,
      unread_count: 0,
      other_party_kind: student.role === 'student' ? 'student' : student.role === 'tutor' ? 'tutor' : undefined,
    };
    setActive(conv);
    setMobileShowChat(true);
  };

  const handleBack = () => setMobileShowChat(false);

  return (
    <Layout>
      <div className="max-w-screen-xl mx-auto px-2 sm:px-4 xl:px-6 py-2 sm:py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-3 sm:mb-4 px-2 sm:px-0">{t('chat.title')}</h1>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex isolate" style={{ height: 'calc(100dvh - 160px)' }}>
          {/* Conversation list - hidden on mobile when chat is open */}
          <div className={`w-full lg:w-80 xl:w-96 border-r border-gray-100 flex-shrink-0 ${mobileShowChat ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'}`}>
            <ConversationList
              conversations={conversations}
              activeId={active?.conversation_id ?? null}
              onSelect={handleSelect}
              onConversationCreated={handleConversationCreated}
              loading={loading}
            />
          </div>

          {/* Chat window - hidden on mobile when list is shown */}
          <div className={`flex-1 min-w-0 min-h-0 flex flex-col overflow-visible ${!mobileShowChat ? 'hidden lg:flex' : 'flex'}`}>
            <ChatWindow
              conversation={active}
              onBack={handleBack}
              onMessageSent={refetch}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
