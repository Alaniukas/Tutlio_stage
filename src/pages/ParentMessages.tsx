import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';
import { useConversations } from '@/hooks/useChat';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';
import type { Conversation } from '@/hooks/useChat';

export default function ParentMessages() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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

  const handleBack = () => setMobileShowChat(false);

  return (
    <div className="min-h-screen bg-[#f7f7fb]">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/parent')}>
          <ArrowLeft className="w-4 h-4 mr-1" /> {t('common.back')}
        </Button>
        <h1 className="text-xl font-bold text-gray-900">{t('chat.title')}</h1>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex isolate" style={{ height: 'calc(100vh - 180px)' }}>
          <div className={`w-full lg:w-80 xl:w-96 border-r border-gray-100 flex-shrink-0 ${mobileShowChat ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'}`}>
            <ConversationList
              conversations={conversations}
              activeId={active?.conversation_id ?? null}
              onSelect={handleSelect}
              loading={loading}
            />
          </div>
          <div className={`flex-1 min-w-0 ${mobileShowChat ? '' : 'hidden lg:block'}`}>
            <ChatWindow
              conversation={active}
              onBack={handleBack}
              onSent={refetch}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
