import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Loader2,
  Mail,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { buildLocalizedPath, useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { SupportWidgetCopyKey } from '@/lib/i18n/supportCopyKeys';
import {
  SUPPORT_PAGE_SUGGESTIONS,
  parseSupportPageIds,
  type SupportPageId,
} from '@/lib/supportPageSuggestions';
import { cn } from '@/lib/utils';
import SupportRobotIcon from './SupportRobotIcon';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestionPages?: SupportPageId[];
  showPurchaseCta?: boolean;
};

type ContactForm = {
  name: string;
  email: string;
  phone: string;
  message: string;
  website: string;
};

type IntroPhase = 'thinking' | 'typing' | 'done';

const EMPTY_CONTACT: ContactForm = { name: '', email: '', phone: '', message: '', website: '' };
const SESSION_ID_KEY = 'tutlio_support_session_id';
const CHAT_KEY = 'tutlio_support_messages';
const NUDGE_KEY = 'tutlio_support_nudge_seen';

const FALLBACK_COPY: Record<SupportWidgetCopyKey, string> = {
  'support.widget.label': 'AI support',
  'support.widget.title': 'Tutlio AI Support',
  'support.widget.online': 'Online · replies instantly',
  'support.widget.welcome': 'Let’s quickly see whether Tutlio fits what you need. Which option best describes you?',
  'support.widget.nudge': 'Not sure Tutlio fits? Let’s find out',
  'support.widget.dismissNudge': 'Dismiss',
  'support.widget.close': 'Close support',
  'support.widget.contact': 'Contact us',
  'support.widget.contactHint': 'We typically reply within 15 min',
  'support.widget.whatsappAlternative': 'or text us via WhatsApp',
  'support.widget.placeholder': 'Ask about Tutlio…',
  'support.widget.send': 'Send message',
  'support.widget.stop': 'Stop response',
  'support.widget.thinking': 'Looking up the right product area…',
  'support.widget.error': 'I couldn’t finish that answer. Please try again or contact our team.',
  'support.widget.suggestion1': 'I’m a tutor',
  'support.widget.suggestion2': 'I manage a tutoring team',
  'support.widget.suggestion3': 'I represent a school',
  'support.widget.recommendedPages': 'Recommended pages',
  'support.widget.purchaseCta': 'I want Tutlio',
  'support.widget.closeWarningTitle': 'Close and clear this chat?',
  'support.widget.closeWarningBody': 'Closing clears the conversation from this widget. A private copy stays stored for support analysis.',
  'support.widget.keepChat': 'Keep chat',
  'support.widget.closeAndClear': 'Close and clear',
  'support.contact.title': 'Contact Tutlio support',
  'support.contact.subtitle': 'We typically answer emails within 15 minutes.',
  'support.contact.name': 'Name',
  'support.contact.email': 'Email',
  'support.contact.phone': 'Phone (optional)',
  'support.contact.message': 'How can we help?',
  'support.contact.messagePlaceholder': 'Describe what you expected and what happened…',
  'support.contact.attachImage': 'Attach an image',
  'support.contact.attachImageHint': 'PNG, JPEG, or WebP · up to 5 MB',
  'support.contact.removeImage': 'Remove image',
  'support.contact.imageError': 'Select a PNG, JPEG, or WebP image up to 5 MB.',
  'support.contact.submit': 'Send',
  'support.contact.successTitle': 'Your message is on its way',
  'support.contact.successBody': 'Thanks — the Tutlio team will reply by email, typically within 15 minutes.',
  'support.contact.error': 'We couldn’t send the form. Please try again or email info@tutlio.lt.',
  'support.contact.back': 'Back to AI support',
};

function messageId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const created = messageId();
    localStorage.setItem(SESSION_ID_KEY, created);
    return created;
  } catch {
    return messageId();
  }
}

function getExistingSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_ID_KEY);
  } catch {
    return null;
  }
}

function restoreMessages(): ChatMessage[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CHAT_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(-12)
      .map((item): ChatMessage | null => {
        if (!item || typeof item !== 'object') return null;
        const value = item as Partial<ChatMessage>;
        const role = value.role === 'user' ? 'user' : value.role === 'assistant' ? 'assistant' : null;
        const content = String(value.content || '').trim().slice(0, 8_000);
        const suggestionPages = parseSupportPageIds(value.suggestionPages);
        const showPurchaseCta = value.showPurchaseCta === true;
        return role && content
          ? { id: String(value.id || messageId()), role, content, suggestionPages, showPurchaseCta }
          : null;
      })
      .filter((item): item is ChatMessage => Boolean(item));
  } catch {
    return [];
  }
}

export default function SupportWidget() {
  const location = useLocation();
  const { locale, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(restoreMessages);
  const [introPhase, setIntroPhase] = useState<IntroPhase>('thinking');
  const [introText, setIntroText] = useState('');
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [contact, setContact] = useState<ContactForm>(EMPTY_CONTACT);
  const [contactSending, setContactSending] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState('');
  const [contactImage, setContactImage] = useState<File | null>(null);
  const [contactImagePreview, setContactImagePreview] = useState('');
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contactImageInputRef = useRef<HTMLInputElement>(null);
  const contactRequestIdRef = useRef(messageId());
  const abortRef = useRef<AbortController | null>(null);

  const copy = (key: string) => {
    const translated = t(key);
    return translated === key ? FALLBACK_COPY[key] || key : translated;
  };

  const page = `${location.pathname}${location.search}`;
  const welcomeText = copy('support.widget.welcome');
  const hideWidget = location.pathname.includes('/embed/') || location.pathname.startsWith('/preview/');
  const suggestions = useMemo(() => [
    copy('support.widget.suggestion1'),
    copy('support.widget.suggestion2'),
    copy('support.widget.suggestion3'),
  // `t` changes when the active locale dictionary changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [locale, t]);

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-12)));
    } catch {
      // Conversation persistence is best-effort and stays within this browser tab.
    }
  }, [messages]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (!sessionStorage.getItem(NUDGE_KEY) && !open) setShowNudge(true);
      } catch {
        if (!open) setShowNudge(true);
      }
    }, 7_000);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, streaming]);

  useEffect(() => {
    if (!open || contactOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 160);
    return () => window.clearTimeout(timer);
  }, [open, contactOpen]);

  useEffect(() => {
    if (!open || contactOpen || messages.length > 0) return;
    if (introPhase === 'done' && introText === welcomeText) return;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setIntroText(welcomeText);
      setIntroPhase('done');
      return;
    }

    setIntroPhase('thinking');
    setIntroText('');
    let typingTimer: number | undefined;
    const thinkingTimer = window.setTimeout(() => {
      setIntroPhase('typing');
      let characterIndex = 0;
      typingTimer = window.setInterval(() => {
        characterIndex += 1;
        setIntroText(welcomeText.slice(0, characterIndex));
        if (characterIndex >= welcomeText.length) {
          if (typingTimer) window.clearInterval(typingTimer);
          setIntroPhase('done');
        }
      }, 18);
    }, 650);

    return () => {
      window.clearTimeout(thinkingTimer);
      if (typingTimer) window.clearInterval(typingTimer);
    };
  // Phase/text updates are driven by the timers; rerunning on every character would restart the animation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactOpen, messages.length, open, welcomeText]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!contactImage) {
      setContactImagePreview('');
      return;
    }
    const preview = URL.createObjectURL(contactImage);
    setContactImagePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [contactImage]);

  const dismissNudge = () => {
    setShowNudge(false);
    try {
      sessionStorage.setItem(NUDGE_KEY, '1');
    } catch {
      // Best effort.
    }
  };

  const openWidget = () => {
    dismissNudge();
    setCloseConfirmOpen(false);
    setOpen(true);
  };

  const clearAndCloseWidget = () => {
    const sessionId = getExistingSessionId();
    abortRef.current?.abort();
    if (sessionId) {
      void fetch('/api/support-chat-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ sessionId, page, locale }),
      }).catch((error) => console.error('[support-widget] Could not mark chat closed:', error));
    }

    setMessages([]);
    setIntroPhase('thinking');
    setIntroText('');
    setInput('');
    setStreaming(false);
    setContactOpen(false);
    setContact(EMPTY_CONTACT);
    setContactImage(null);
    setContactSuccess(false);
    setContactError('');
    setCloseConfirmOpen(false);
    setOpen(false);
    contactRequestIdRef.current = messageId();
    try {
      sessionStorage.removeItem(CHAT_KEY);
      localStorage.removeItem(SESSION_ID_KEY);
    } catch {
      // The in-memory state is still cleared when browser storage is unavailable.
    }
  };

  const requestClose = () => {
    dismissNudge();
    const hasUserContent = messages.length > 0
      || Boolean(input.trim())
      || Boolean(contact.name.trim() || contact.phone.trim() || contact.message.trim())
      || Boolean(contactImage)
      || contactSuccess;
    if (hasUserContent) {
      setCloseConfirmOpen(true);
      return;
    }
    clearAndCloseWidget();
  };

  const toggleWidget = () => {
    if (open) requestClose();
    else openWidget();
  };

  const openContact = async () => {
    setContactOpen(true);
    setContactSuccess(false);
    setContactError('');
    const lastQuestion = [...messages].reverse().find((message) => message.role === 'user')?.content;
    setContact((current) => ({
      ...current,
      message: current.message || (lastQuestion ? `${lastQuestion}\n\n` : ''),
    }));

    if (!contact.email) {
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user?.email) {
          setContact((current) => ({ ...current, email: current.email || data.user?.email || '' }));
        }
      } catch {
        // Public visitors do not have an auth session; leave the field empty.
      }
    }
  };

  const sendMessage = async (override?: string) => {
    const question = String(override ?? input).trim().slice(0, 2_000);
    if (!question || streaming) return;

    const userMessage: ChatMessage = { id: messageId(), role: 'user', content: question };
    const assistantMessage: ChatMessage = { id: messageId(), role: 'assistant', content: '' };
    const requestMessages = [...messages, userMessage].slice(-10);
    setIntroText(welcomeText);
    setIntroPhase('done');
    setMessages((current) => [...current, userMessage, assistantMessage].slice(-12));
    setInput('');
    setStreaming(true);
    dismissNudge();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: requestMessages.map(({ role, content }) => ({ role, content })),
          locale,
          page,
          sessionId: getSessionId(),
          requestId: userMessage.id,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(errorBody?.error || `Support request failed (${response.status})`);
      }
      if (!response.body) throw new Error('Streaming is not available in this browser.');

      const suggestionPages = parseSupportPageIds(response.headers.get('x-tutlio-support-pages'));
      const showPurchaseCta = response.headers.get('x-tutlio-support-purchase-cta') === '1';
      setMessages((current) => current.map((message) => (
        message.id === assistantMessage.id
          ? { ...message, suggestionPages, showPurchaseCta }
          : message
      )));

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setMessages((current) => current.map((message) => (
          message.id === assistantMessage.id ? { ...message, content: fullText } : message
        )));
      }
      fullText += decoder.decode();
      if (!fullText.trim()) throw new Error('The support response was empty.');
      setMessages((current) => current.map((message) => (
        message.id === assistantMessage.id ? { ...message, content: fullText } : message
      )));
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages((current) => current.filter((message) => (
          message.id !== assistantMessage.id || message.content.trim()
        )));
      } else {
        console.error('[support-widget] Chat error:', error);
        setMessages((current) => current.map((message) => (
          message.id === assistantMessage.id
            ? { ...message, content: copy('support.widget.error') }
            : message
        )));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const submitContact = async (event: FormEvent) => {
    event.preventDefault();
    if (contactSending) return;
    setContactSending(true);
    setContactError('');

    try {
      const sessionId = getSessionId();
      let attachment: {
        path: string;
        name: string;
        type: string;
        size: number;
      } | null = null;

      if (contactImage) {
        const prepareResponse = await fetch('/api/support-attachment-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            name: contactImage.name,
            type: contactImage.type,
            size: contactImage.size,
            page,
            locale,
          }),
        });
        const upload = await prepareResponse.json().catch(() => null) as {
          path?: string;
          token?: string;
          name?: string;
          type?: string;
          size?: number;
        } | null;
        if (!prepareResponse.ok || !upload?.path || !upload.token) {
          throw new Error('Could not prepare the support image upload.');
        }

        const { error: uploadError } = await supabase.storage
          .from('support-attachments')
          .uploadToSignedUrl(upload.path, upload.token, contactImage, {
            contentType: contactImage.type,
            cacheControl: '3600',
          });
        if (uploadError) throw uploadError;
        attachment = {
          path: upload.path,
          name: upload.name || contactImage.name,
          type: upload.type || contactImage.type,
          size: upload.size || contactImage.size,
        };
      }

      const response = await fetch('/api/support-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...contact,
          page,
          locale,
          sessionId,
          requestId: contactRequestIdRef.current,
          attachment,
          conversation: messages.slice(-6).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!response.ok) throw new Error('Contact request failed');
      setContactSuccess(true);
    } catch (error) {
      console.error('[support-widget] Contact error:', error);
      setContactError(copy('support.contact.error'));
    } finally {
      setContactSending(false);
    }
  };

  const selectContactImage = (file: File | null) => {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      setContactImage(null);
      setContactError(copy('support.contact.imageError'));
      if (contactImageInputRef.current) contactImageInputRef.current.value = '';
      return;
    }
    setContactImage(file);
    setContactError('');
  };

  if (hideWidget) return null;

  return (
    <>
      {open && (
        <section
          aria-label={copy('support.widget.title')}
          className="fixed inset-x-3 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[175] flex h-[min(680px,calc(100dvh-8.5rem))] flex-col overflow-hidden rounded-[28px] border border-indigo-100 bg-white shadow-[0_24px_80px_-18px_rgba(49,46,129,0.38)] sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(680px,calc(100dvh-7.5rem))] sm:w-[400px]"
        >
          <header className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-800 to-indigo-600 px-5 pb-4 pt-5 text-white">
            <div className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full bg-cyan-300/20 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-16 left-20 h-32 w-32 rounded-full bg-violet-300/20 blur-2xl" />
            <div className="relative flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/20 bg-white/12 shadow-inner">
                <SupportRobotIcon className="h-10 w-10" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="truncate text-[15px] font-bold tracking-tight">{copy('support.widget.title')}</h2>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-indigo-100">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-70" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
                  </span>
                  {copy('support.widget.online')}
                </p>
              </div>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={requestClose}
                  className="grid h-9 w-9 place-items-center rounded-full text-indigo-100 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label={copy('support.widget.close')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </header>

          <div ref={messagesRef} role="log" aria-live="polite" className="flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-indigo-50/70 via-white to-white px-4 py-5">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-600 shadow-sm">
                <SupportRobotIcon className="h-7 w-7" />
              </div>
              <div className="max-w-[84%] rounded-2xl rounded-tl-md border border-indigo-100 bg-white px-3.5 py-3 text-[13px] leading-relaxed text-slate-700 shadow-sm">
                {introPhase === 'thinking' ? (
                  <span className="inline-flex h-5 items-center gap-1" aria-label={copy('support.widget.thinking')}>
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400"
                        style={{ animationDelay: `${dot * 120}ms` }}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                ) : (
                  <>
                    {introText}
                    {introPhase === 'typing' && (
                      <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-indigo-400 align-middle" aria-hidden="true" />
                    )}
                  </>
                )}
              </div>
            </div>

            {messages.map((message) => (
              <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'items-start gap-2.5')}>
                {message.role === 'assistant' && (
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-600 shadow-sm">
                    <SupportRobotIcon className="h-7 w-7" />
                  </div>
                )}
                <div className="max-w-[84%]">
                  <div className={cn(
                    'whitespace-pre-wrap break-words px-3.5 py-3 text-[13px] leading-relaxed shadow-sm',
                    message.role === 'user'
                      ? 'rounded-2xl rounded-br-md bg-indigo-600 text-white'
                      : 'rounded-2xl rounded-tl-md border border-slate-100 bg-white text-slate-700',
                  )}>
                    {message.content || (
                      <span className="inline-flex items-center gap-2 text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                        {copy('support.widget.thinking')}
                      </span>
                    )}
                  </div>

                  {message.role === 'assistant' && message.content && message.showPurchaseCta ? (
                    <a
                      href={buildLocalizedPath('/pricing', locale)}
                      className="mt-2 inline-flex max-w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:-translate-y-px hover:bg-indigo-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                    >
                      {copy('support.widget.purchaseCta')}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : null}

                  {message.role === 'assistant'
                    && message.content
                    && message.suggestionPages?.some((pageId) => !message.showPurchaseCta || pageId !== 'pricing') ? (
                    <div className="mt-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-2.5">
                      <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-500">
                        {copy('support.widget.recommendedPages')}
                      </p>
                      <div className="space-y-1">
                        {message.suggestionPages
                          .filter((pageId) => !message.showPurchaseCta || pageId !== 'pricing')
                          .map((pageId) => {
                            const suggestion = SUPPORT_PAGE_SUGGESTIONS[pageId];
                            return (
                              <a
                                key={suggestion.id}
                                href={buildLocalizedPath(suggestion.href, locale)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-[11px] font-semibold leading-snug text-indigo-800 shadow-sm transition hover:-translate-y-px hover:text-indigo-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                              >
                                <span className="min-w-0 flex-1 line-clamp-2">{copy(suggestion.labelKey)}</span>
                                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-indigo-400" aria-hidden="true" />
                              </a>
                            );
                          })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {messages.length === 0 && introPhase === 'done' && (
              <div className="flex flex-wrap gap-2 pl-10">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void sendMessage(suggestion)}
                    className="rounded-full border border-indigo-200 bg-white px-3 py-2 text-left text-xs font-medium text-indigo-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 bg-white px-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3">
            <div className="mb-2.5 grid min-h-[72px] grid-cols-2 overflow-hidden rounded-xl border border-indigo-100 bg-indigo-50/60">
              <button
                type="button"
                onClick={() => void openContact()}
                className="flex min-w-0 items-center gap-2.5 px-2.5 py-2 text-left transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-indigo-600 shadow-sm">
                  <Mail className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-slate-800">{copy('support.widget.contact')}</span>
                  <span className="mt-0.5 block line-clamp-2 text-[11px] leading-tight text-slate-500">
                    {copy('support.widget.contactHint')}
                  </span>
                </span>
              </button>
              <a
                href="https://wa.me/37062394956"
                target="_blank"
                rel="noreferrer"
                aria-label={copy('support.widget.whatsappAlternative')}
                className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 border-l border-indigo-100 bg-white/75 px-3 py-2 text-left text-[10px] font-bold leading-tight text-emerald-700 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
              >
                <span className="h-8 w-8 overflow-hidden rounded-[8px]" aria-hidden="true">
                  <img
                    src="/whatsapp-support-icon.png"
                    alt=""
                    className="h-[48px] w-[48px] max-w-none -translate-x-[8px] -translate-y-[8px]"
                  />
                </span>
                <span>{copy('support.widget.whatsappAlternative')}</span>
              </a>
            </div>

            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 transition focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(event) => setInput(event.target.value.slice(0, 2_000))}
                onKeyDown={handleKeyDown}
                placeholder={copy('support.widget.placeholder')}
                disabled={streaming}
                className="max-h-24 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => streaming ? abortRef.current?.abort() : void sendMessage()}
                disabled={!streaming && !input.trim()}
                aria-label={streaming ? copy('support.widget.stop') : copy('support.widget.send')}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {streaming ? <Square className="h-3.5 w-3.5 fill-current" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {contactOpen && (
            <div className="absolute inset-0 z-20 flex flex-col bg-white">
              <header className="border-b border-slate-100 bg-gradient-to-br from-indigo-950 to-indigo-700 px-4 pb-4 pt-5 text-white">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setContactOpen(false)}
                    className="grid h-9 w-9 place-items-center rounded-full text-indigo-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    aria-label={copy('support.contact.back')}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div>
                    <h2 className="text-[15px] font-bold">{copy('support.contact.title')}</h2>
                    <p className="mt-0.5 text-xs text-indigo-100">{copy('support.contact.subtitle')}</p>
                  </div>
                </div>
              </header>

              {contactSuccess ? (
                <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                  <div className="grid h-16 w-16 place-items-center rounded-3xl bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-9 w-9" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-slate-900">{copy('support.contact.successTitle')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{copy('support.contact.successBody')}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setContactOpen(false);
                      setContactSuccess(false);
                      setContact(EMPTY_CONTACT);
                      setContactImage(null);
                      contactRequestIdRef.current = messageId();
                    }}
                    className="mt-6 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                  >
                    {copy('support.contact.back')}
                  </button>
                </div>
              ) : (
                <form onSubmit={submitContact} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
                  <label className="block text-xs font-semibold text-slate-700">
                    {copy('support.contact.name')}
                    <input
                      required
                      autoComplete="name"
                      value={contact.name}
                      onChange={(event) => setContact({ ...contact, name: event.target.value })}
                      className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    {copy('support.contact.email')}
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      value={contact.email}
                      onChange={(event) => setContact({ ...contact, email: event.target.value })}
                      className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    {copy('support.contact.phone')}
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={contact.phone}
                      onChange={(event) => setContact({ ...contact, phone: event.target.value })}
                      className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    {copy('support.contact.message')}
                    <textarea
                      required
                      minLength={10}
                      rows={5}
                      value={contact.message}
                      onChange={(event) => setContact({ ...contact, message: event.target.value.slice(0, 4_000) })}
                      placeholder={copy('support.contact.messagePlaceholder')}
                      className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal leading-relaxed outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </label>
                  <div>
                    <span className="block text-xs font-semibold text-slate-700">{copy('support.contact.attachImage')}</span>
                    <input
                      ref={contactImageInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={contactSending}
                      onChange={(event) => selectContactImage(event.target.files?.[0] || null)}
                      className="sr-only"
                    />
                    {contactImage ? (
                      <div className="mt-1.5 flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-2.5">
                        {contactImagePreview && (
                          <img
                            src={contactImagePreview}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-lg object-cover"
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-slate-700">{contactImage.name}</span>
                          <span className="block text-[11px] text-slate-500">{Math.max(1, Math.round(contactImage.size / 1024))} KB</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setContactImage(null);
                            if (contactImageInputRef.current) contactImageInputRef.current.value = '';
                          }}
                          aria-label={copy('support.contact.removeImage')}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => contactImageInputRef.current?.click()}
                        className="mt-1.5 flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      >
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                          <ImagePlus className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="block text-xs font-semibold text-slate-700">{copy('support.contact.attachImage')}</span>
                          <span className="block text-[11px] text-slate-500">{copy('support.contact.attachImageHint')}</span>
                        </span>
                      </button>
                    )}
                  </div>
                  <label className="absolute -left-[9999px]" aria-hidden="true">
                    Website
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={contact.website}
                      onChange={(event) => setContact({ ...contact, website: event.target.value })}
                    />
                  </label>

                  {contactError && <p className="text-xs font-medium text-red-600">{contactError}</p>}

                  <button
                    type="submit"
                    disabled={contactSending}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60"
                  >
                    {contactSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {copy('support.contact.submit')}
                  </button>
                </form>
              )}
            </div>
          )}

          {closeConfirmOpen && (
            <div
              className="absolute inset-0 z-40 flex items-end justify-center bg-indigo-950/45 p-4 backdrop-blur-[2px] sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby="support-close-title"
            >
              <div className="w-full rounded-3xl bg-white p-5 shadow-2xl">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 id="support-close-title" className="text-sm font-bold text-slate-900">
                      {copy('support.widget.closeWarningTitle')}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {copy('support.widget.closeWarningBody')}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCloseConfirmOpen(false)}
                    className="h-10 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    {copy('support.widget.keepChat')}
                  </button>
                  <button
                    type="button"
                    onClick={clearAndCloseWidget}
                    className="h-10 rounded-xl bg-indigo-600 text-xs font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  >
                    {copy('support.widget.closeAndClear')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {showNudge && !open && (
        <div className="fixed bottom-[calc(6.7rem+env(safe-area-inset-bottom))] right-4 z-[174] flex items-center gap-2 rounded-2xl border border-indigo-100 bg-white px-3 py-2.5 shadow-[0_12px_34px_-10px_rgba(49,46,129,0.35)] sm:bottom-24 sm:right-6">
          <button type="button" onClick={toggleWidget} className="flex items-center gap-2 text-left text-xs font-semibold text-slate-800">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            {copy('support.widget.nudge')}
          </button>
          <button type="button" onClick={dismissNudge} aria-label={copy('support.widget.dismissNudge')} className="text-slate-400 hover:text-slate-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={toggleWidget}
        aria-label={open ? copy('support.widget.close') : copy('support.widget.label')}
        aria-expanded={open}
        className="group fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-3 z-[176] grid h-[76px] w-[76px] place-items-center bg-transparent text-indigo-700 transition duration-300 hover:-translate-y-1 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 sm:bottom-4 sm:right-5"
      >
        {open ? <X className="relative h-7 w-7" /> : <SupportRobotIcon className="relative h-16 w-16 transition-transform duration-300 group-hover:scale-105" />}
        {!open && <span className="absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full border-2 border-white bg-emerald-400" />}
      </button>
    </>
  );
}
