import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import type { RealtimeChannel } from '@supabase/supabase-js';

const CONV_CACHE_TTL = 300_000;
let convCache: { data: Conversation[]; ts: number } | null = null;

type ConversationListener = (list: Conversation[]) => void;
const convListeners = new Set<ConversationListener>();

function mapRpcRowsToConversations(data: unknown): Conversation[] {
  const raw = (data ?? []) as Record<string, unknown>[];
  return raw.map((row) => {
    const kind = row.other_party_kind as string | undefined;
    const other_party_kind =
      kind === 'student' || kind === 'tutor' || kind === 'org_admin' ? kind : undefined;
    return {
      conversation_id: row.conversation_id as string,
      last_message_at: row.last_message_at as string,
      other_user_id: row.other_user_id as string,
      other_user_name: row.other_user_name as string,
      other_user_email: row.other_user_email as string,
      last_message_content: (row.last_message_content as string) ?? null,
      last_message_type: (row.last_message_type as string) ?? null,
      last_message_sender_id: (row.last_message_sender_id as string) ?? null,
      last_message_created_at: (row.last_message_created_at as string) ?? null,
      unread_count: Number(row.unread_count ?? 0),
      email_notify_enabled: (row.my_email_notify_enabled as boolean) ?? true,
      email_notify_delay_hours: Number(row.my_email_notify_delay_hours ?? 12),
      other_party_kind,
    };
  });
}

async function fetchAndBroadcastConversations(): Promise<void> {
  const { data, error: err } = await supabase.rpc('get_my_conversations');
  if (err) {
    console.error('[useChat] get_my_conversations:', err.message);
    return;
  }
  const list = mapRpcRowsToConversations(data);
  convCache = { data: list, ts: Date.now() };
  convListeners.forEach((l) => l(list));
}

let inboxBroadcastDebounce: ReturnType<typeof setTimeout> | null = null;
function scheduleBroadcastConversations(): void {
  if (inboxBroadcastDebounce) clearTimeout(inboxBroadcastDebounce);
  inboxBroadcastDebounce = setTimeout(() => {
    inboxBroadcastDebounce = null;
    void fetchAndBroadcastConversations();
  }, 350);
}

let inboxChannel: RealtimeChannel | null = null;
let inboxChannelRefCount = 0;

function attachInboxRealtime(): void {
  inboxChannelRefCount += 1;
  if (inboxChannelRefCount !== 1) return;
  inboxChannel = supabase
    .channel('inbox-conversations')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      () => scheduleBroadcastConversations(),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_participants' },
      () => scheduleBroadcastConversations(),
    )
    .subscribe();
}

function detachInboxRealtime(): void {
  inboxChannelRefCount -= 1;
  if (inboxChannelRefCount === 0 && inboxChannel) {
    void supabase.removeChannel(inboxChannel);
    inboxChannel = null;
  }
}

export interface Conversation {
  conversation_id: string;
  last_message_at: string;
  other_user_id: string;
  other_user_name: string;
  other_user_email: string;
  last_message_content: string | null;
  last_message_type: string | null;
  last_message_sender_id: string | null;
  last_message_created_at: string | null;
  unread_count: number;
  tutor_name?: string;
  student_name?: string;
  tutor_id?: string;
  student_linked_id?: string;
  /** Current user's email notification prefs for this conversation */
  email_notify_enabled?: boolean;
  email_notify_delay_hours?: number;
  /** Counterparty role from get_my_conversations (when RPC returns it) */
  other_party_kind?: 'student' | 'tutor' | 'org_admin';
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: 'text' | 'file' | 'lesson_proposal';
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>(() => convCache?.data ?? []);
  const [loading, setLoading] = useState(
    () => !(convCache && Date.now() - convCache.ts < CONV_CACHE_TTL),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const listener: ConversationListener = (list) => setConversations(list);
    convListeners.add(listener);
    return () => {
      convListeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    attachInboxRealtime();
    return () => detachInboxRealtime();
  }, []);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('get_my_conversations');
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const list = mapRpcRowsToConversations(data);
    convCache = { data: list, ts: Date.now() };
    setLoading(false);
    convListeners.forEach((l) => l(list));
  }, []);

  useEffect(() => {
    if (convCache && Date.now() - convCache.ts < CONV_CACHE_TTL) {
      setConversations(convCache.data);
      setLoading(false);
      return;
    }
    void fetchConversations();
  }, [fetchConversations]);

  return { conversations, loading, error, refetch: fetchConversations };
}

/** Sum of unread_count across inbox; shares realtime + RPC with useConversations via convListeners. */
export function useTotalChatUnread() {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const listener: ConversationListener = (list) => {
      setTotal(list.reduce((s, c) => s + c.unread_count, 0));
    };
    convListeners.add(listener);
    attachInboxRealtime();
    if (convCache?.data) listener(convCache.data);
    else void fetchAndBroadcastConversations();
    return () => {
      convListeners.delete(listener);
      detachInboxRealtime();
    };
  }, []);

  return total;
}

export function useChatMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as ChatMessage[]);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    fetchMessages();

    channelRef.current = supabase
      .channel(`chat:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversationId, fetchMessages]);

  return { messages, loading, refetch: fetchMessages };
}

export async function sendMessage(
  conversationId: string,
  content: string,
  messageType: 'text' | 'file' | 'lesson_proposal' = 'text',
  metadata?: Record<string, unknown>,
): Promise<ChatMessage | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      message_type: messageType,
      metadata: metadata ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[useChat] sendMessage error:', error.message);
    return null;
  }

  await supabase
    .from('chat_conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  const inserted = data as ChatMessage;
  void (async () => {
    try {
      const headers = await authHeaders();
      await fetch('/api/chat-notify-on-message', {
        method: 'POST',
        headers,
        body: JSON.stringify({ conversationId, messageId: inserted.id }),
      });
    } catch {
      /* non-blocking */
    }
  })();

  return inserted;
}

export async function updateChatEmailNotifyPrefs(
  conversationId: string,
  prefs: { email_notify_enabled: boolean; email_notify_delay_hours: number },
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const hours = Math.min(168, Math.max(1, Math.round(Number(prefs.email_notify_delay_hours)) || 12));
  const { error } = await supabase
    .from('chat_participants')
    .update({
      email_notify_enabled: prefs.email_notify_enabled,
      email_notify_delay_hours: hours,
    })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);
  if (error) {
    console.error('[useChat] updateChatEmailNotifyPrefs:', error.message);
    return false;
  }
  void fetchAndBroadcastConversations();
  return true;
}

export async function getOrCreateConversation(otherUserId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    p_other_user_id: otherUserId,
  });
  if (error) {
    console.error('[useChat] getOrCreateConversation error:', error.message);
    return null;
  }
  return data as string;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('chat_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);

  void fetchAndBroadcastConversations();
}

export async function uploadChatFile(
  conversationId: string,
  file: File,
): Promise<{ path: string; url: string } | null> {
  const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const path = `${conversationId}/${safeName}`;

  const { error } = await supabase.storage
    .from('chat-files')
    .upload(path, file, { upsert: false });

  if (error) {
    console.error('[useChat] uploadChatFile error:', error.message);
    return null;
  }

  const { data: urlData } = await supabase.storage
    .from('chat-files')
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  return { path, url: urlData?.signedUrl ?? '' };
}

export interface MessageableStudent {
  student_id: string;
  linked_user_id: string;
  full_name: string;
  email: string | null;
  role?: 'student' | 'tutor';
}

let msgStudentsCache: { data: MessageableStudent[]; ts: number } | null = null;

export function useMessageableStudents() {
  const [students, setStudents] = useState<MessageableStudent[]>(msgStudentsCache?.data ?? []);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (force?: boolean) => {
    if (!force && msgStudentsCache && Date.now() - msgStudentsCache.ts < CONV_CACHE_TTL) {
      setStudents(msgStudentsCache.data);
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (adminRow) {
      const [{ data: admins }, { data: tutors }] = await Promise.all([
        supabase
          .from('organization_admins')
          .select('user_id')
          .eq('organization_id', adminRow.organization_id),
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('organization_id', adminRow.organization_id),
      ]);

      const adminIds = new Set((admins ?? []).map((a: any) => a.user_id));
      const orgTutors = (tutors ?? []).filter((t: any) => !adminIds.has(t.id));
      const tutorIds = orgTutors.map((t: any) => t.id);

      const { data: studentData } = tutorIds.length > 0
        ? await supabase
            .from('students')
            .select('id, linked_user_id, full_name, email')
            .in('tutor_id', tutorIds)
            .not('linked_user_id', 'is', null)
        : { data: [] };

      const result: MessageableStudent[] = [];

      for (const t of orgTutors) {
        if (t.id !== user.id) {
          result.push({
            student_id: t.id,
            linked_user_id: t.id,
            full_name: t.full_name ?? '',
            email: t.email ?? null,
            role: 'tutor',
          });
        }
      }

      const seen = new Set<string>();
      for (const s of (studentData ?? [])) {
        if (s.linked_user_id !== user.id && !seen.has(s.linked_user_id)) {
          seen.add(s.linked_user_id);
          result.push({
            student_id: s.id,
            linked_user_id: s.linked_user_id,
            full_name: s.full_name ?? '',
            email: s.email ?? null,
            role: 'student',
          });
        }
      }

      setStudents(result);
      msgStudentsCache = { data: result, ts: Date.now() };
    } else {
      const { data } = await supabase
        .from('students')
        .select('id, linked_user_id, full_name, email')
        .eq('tutor_id', user.id)
        .not('linked_user_id', 'is', null);

      const list = (data ?? []).map((s: any) => ({
        student_id: s.id,
        linked_user_id: s.linked_user_id,
        full_name: s.full_name,
        email: s.email,
      }));
      setStudents(list);
      msgStudentsCache = { data: list, ts: Date.now() };
    }

    setLoading(false);
  }, []);

  return { students, loading, fetch };
}

export async function downloadChatFile(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('chat-files')
    .createSignedUrl(storagePath, 60);
  if (error || !data) return null;
  return data.signedUrl;
}
