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
      kind === 'student' || kind === 'tutor' || kind === 'org_admin' || kind === 'parent'
        ? kind
        : undefined;
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

let inboxConversationsInflight: Promise<void> | null = null;

async function fetchAndBroadcastConversations(): Promise<void> {
  if (inboxConversationsInflight) return inboxConversationsInflight;
  inboxConversationsInflight = (async () => {
    const { data, error: err } = await supabase.rpc('get_my_conversations');
    if (err) {
      console.error('[useChat] get_my_conversations:', err.message);
      return;
    }
    const list = mapRpcRowsToConversations(data);
    convCache = { data: list, ts: Date.now() };
    convListeners.forEach((l) => l(list));
  })().finally(() => {
    inboxConversationsInflight = null;
  });
  return inboxConversationsInflight;
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
  other_party_kind?: 'student' | 'tutor' | 'org_admin' | 'parent';
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

  // Org tutor license gating: allow read-only inbox for unlicensed org tutors.
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('organization_id, has_active_license')
      .eq('id', user.id)
      .maybeSingle();

    const orgId = (prof as any)?.organization_id as string | null | undefined;
    const hasActiveLicense = (prof as any)?.has_active_license !== false;

    if (orgId && !hasActiveLicense) {
      const { data: org } = await supabase
        .from('organizations')
        .select('tutor_license_count')
        .eq('id', orgId)
        .maybeSingle();
      const orgUsesLicenses = (Number((org as any)?.tutor_license_count) || 0) > 0;
      if (orgUsesLicenses) {
        console.warn('[useChat] sendMessage blocked: org tutor not licensed');
        return null;
      }
    }
  } catch (e) {
    // Non-critical: if the check fails, fall through to the normal send attempt.
  }

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
  role?: 'student' | 'tutor' | 'org_admin' | 'parent';
  /** When role === 'parent', the names of the linked children (so the
   *  contact picker can disambiguate "kieno tėvas"). */
  child_names?: string[];
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

    // Detect if the caller is actually a parent. Otherwise, do NOT take the parent path,
    // because tutors/admins also have RLS access to parent_students rows for students they
    // can see, which would otherwise hijack the flow and replace their real contact list
    // with a (mis)inferred parent list.
    let isParentUser = false;
    try {
      const { data: parentProfileId } = await supabase.rpc('get_my_parent_profile_id');
      isParentUser = !!parentProfileId;
    } catch {
      // If the helper RPC is unavailable, fall back to a direct query on parent_profiles
      // (which has user_id = auth.uid() RLS).
      try {
        const { data: pp } = await supabase
          .from('parent_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        isParentUser = !!pp?.id;
      } catch {
        isParentUser = false;
      }
    }

    if (isParentUser) {
      // Parent contacts: child tutors, org admins, and the parent's own linked children.
      try {
        const { data: contacts, error } = await supabase.rpc('get_parent_messageable_contacts');
        if (!error && Array.isArray(contacts)) {
          const list: MessageableStudent[] = contacts.map((c: any) => ({
            student_id: c.user_id,
            linked_user_id: c.user_id,
            full_name: c.full_name ?? '',
            email: c.email ?? null,
            role:
              c.role === 'org_admin'
                ? 'org_admin'
                : c.role === 'student'
                  ? 'student'
                  : 'tutor',
          }));
          setStudents(list);
          msgStudentsCache = { data: list, ts: Date.now() };
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('[useChat] get_parent_messageable_contacts failed:', err);
      }
      // If the RPC failed completely, fall back to deriving from parent_students directly.
      const { data: links } = await supabase
        .from('parent_students')
        .select('student_id, students(id, full_name, email, linked_user_id, tutor_id, profiles:tutor_id(id, full_name, email, organization_id))');
      const tutorProfiles: Array<{ id: string; full_name: string | null; email: string | null; organization_id: string | null }> = [];
      const childProfiles: Array<{ student_id: string; linked_user_id: string; full_name: string | null; email: string | null }> = [];
      const orgIds = new Set<string>();
      for (const link of links ?? []) {
        const st = (link as any).students as any;
        const prof = st?.profiles as any;
        if (prof?.id && !tutorProfiles.some((p) => p.id === prof.id)) {
          tutorProfiles.push({
            id: prof.id,
            full_name: prof.full_name ?? null,
            email: prof.email ?? null,
            organization_id: prof.organization_id ?? null,
          });
        }
        if (prof?.organization_id) orgIds.add(prof.organization_id);
        if (st?.linked_user_id && !childProfiles.some((c) => c.linked_user_id === st.linked_user_id)) {
          childProfiles.push({
            student_id: st.id,
            linked_user_id: st.linked_user_id,
            full_name: st.full_name ?? null,
            email: st.email ?? null,
          });
        }
      }
      const list: MessageableStudent[] = [];
      childProfiles.forEach((c) => {
        if (c.linked_user_id !== user.id) {
          list.push({
            student_id: c.student_id,
            linked_user_id: c.linked_user_id,
            full_name: c.full_name ?? '',
            email: c.email ?? null,
            role: 'student',
          });
        }
      });
      tutorProfiles.forEach((p) => {
        if (p.id !== user.id) {
          list.push({
            student_id: p.id,
            linked_user_id: p.id,
            full_name: p.full_name ?? '',
            email: p.email ?? null,
            role: 'tutor',
          });
        }
      });
      setStudents(list);
      msgStudentsCache = { data: list, ts: Date.now() };
      setLoading(false);
      return;
    }

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (adminRow) {
      const [{ data: admins }, { data: tutors }, { data: linkedStudents }] = await Promise.all([
        supabase
          .from('organization_admins')
          .select('user_id')
          .eq('organization_id', adminRow.organization_id),
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('organization_id', adminRow.organization_id),
        supabase
          .from('students')
          .select('linked_user_id, email')
          .eq('organization_id', adminRow.organization_id),
      ]);

      const adminIds = new Set((admins ?? []).map((a: any) => a.user_id));
      const linkedStudentUserIds = new Set(
        (linkedStudents ?? [])
          .map((s: any) => s.linked_user_id)
          .filter((id: string | null | undefined): id is string => Boolean(id)),
      );
      const linkedStudentEmails = new Set(
        (linkedStudents ?? [])
          .map((s: any) => String(s.email || '').trim().toLowerCase())
          .filter((email: string) => email.length > 0),
      );
      const orgTutors = (tutors ?? []).filter(
        (t: any) =>
          !adminIds.has(t.id) &&
          !linkedStudentUserIds.has(t.id) &&
          !linkedStudentEmails.has(String(t.email || '').trim().toLowerCase()),
      );
      const { data: studentData } = await supabase
        .from('students')
        .select('id, linked_user_id, full_name, email')
        .eq('organization_id', adminRow.organization_id)
        .not('linked_user_id', 'is', null);

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

      // Org admin: also allow starting conversations with parents of students in this org.
      // This enables admin -> parent initiation (and makes the UX symmetric with parent -> admin).
      // Use a SECURITY DEFINER RPC instead of relying on parent_profiles RLS, which is too
      // restrictive (it excludes parents whose child has no tutor assigned in the same org).
      try {
        const { data: parentRows, error: parentRpcErr } = await supabase.rpc(
          'get_org_admin_messageable_parents',
        );
        if (!parentRpcErr && Array.isArray(parentRows)) {
          // Aggregate children per parent so the picker can show "Parent · Vaikas A, B".
          const parentByUserId = new Map<string, MessageableStudent>();
          for (const row of parentRows as any[]) {
            const parentUserId = row?.user_id as string | null | undefined;
            if (!parentUserId) continue;
            if (parentUserId === user.id) continue;
            const childName: string | null =
              typeof row?.student_name === 'string' && row.student_name.trim().length > 0
                ? row.student_name.trim()
                : null;
            const existing = parentByUserId.get(parentUserId);
            if (existing) {
              if (childName && !(existing.child_names ?? []).includes(childName)) {
                existing.child_names = [...(existing.child_names ?? []), childName];
              }
              continue;
            }
            parentByUserId.set(parentUserId, {
              student_id: parentUserId,
              linked_user_id: parentUserId,
              full_name: row?.full_name ?? '',
              email: row?.email ?? null,
              role: 'parent',
              child_names: childName ? [childName] : [],
            });
          }
          for (const p of parentByUserId.values()) result.push(p);
        } else if (parentRpcErr) {
          console.warn('[useChat] get_org_admin_messageable_parents failed:', parentRpcErr);
        }
      } catch (err) {
        console.warn('[useChat] get_org_admin_messageable_parents threw:', err);
      }

      setStudents(result);
      msgStudentsCache = { data: result, ts: Date.now() };
    } else {
      // Decide between STUDENT branch (linked_user_id = user.id) and TUTOR branch.
      const { data: studentSelfRows } = await supabase
        .from('students')
        .select('id')
        .eq('linked_user_id', user.id)
        .limit(1);

      if (studentSelfRows && studentSelfRows.length > 0) {
        // ── STUDENT branch ──
        const list: MessageableStudent[] = [];
        const seen = new Set<string>();

        try {
          const { data: contacts, error: rpcErr } = await supabase.rpc(
            'get_student_messageable_contacts',
          );
          if (!rpcErr && Array.isArray(contacts)) {
            for (const row of contacts as any[]) {
              const uid = row?.user_id as string | null | undefined;
              if (!uid || uid === user.id || seen.has(uid)) continue;
              seen.add(uid);
              const role: MessageableStudent['role'] =
                row.role === 'tutor'
                  ? 'tutor'
                  : row.role === 'org_admin'
                    ? 'org_admin'
                    : row.role === 'parent'
                      ? 'parent'
                      : undefined;
              list.push({
                student_id: uid,
                linked_user_id: uid,
                full_name: row.full_name ?? '',
                email: row.email ?? null,
                role,
              });
            }
          } else if (rpcErr) {
            console.warn('[useChat] get_student_messageable_contacts failed:', rpcErr);
          }
        } catch (err) {
          console.warn('[useChat] get_student_messageable_contacts threw:', err);
        }

        // Fallback: derive from `students` row directly if RPC was unavailable.
        if (list.length === 0) {
          const { data: stRow } = await supabase
            .from('students')
            .select('id, tutor_id, profiles:tutor_id(id, full_name, email)')
            .eq('linked_user_id', user.id)
            .maybeSingle();
          const tp = (stRow as any)?.profiles as any;
          if (tp?.id && tp.id !== user.id) {
            list.push({
              student_id: tp.id,
              linked_user_id: tp.id,
              full_name: tp.full_name ?? '',
              email: tp.email ?? null,
              role: 'tutor',
            });
          }
        }

        setStudents(list);
        msgStudentsCache = { data: list, ts: Date.now() };
      } else {
        // ── TUTOR branch (individual tutor or org tutor) ──
        const { data } = await supabase
          .from('students')
          .select('id, linked_user_id, full_name, email')
          .eq('tutor_id', user.id)
          .not('linked_user_id', 'is', null);

        const list: MessageableStudent[] = (data ?? []).map((s: any) => ({
          student_id: s.id,
          linked_user_id: s.linked_user_id,
          full_name: s.full_name,
          email: s.email,
          role: 'student',
        }));

        // Tutors can also message the parents of their students.
        try {
          const { data: parents, error: parentsErr } = await supabase.rpc(
            'get_tutor_messageable_parents',
          );
          if (!parentsErr && Array.isArray(parents)) {
            // Aggregate children per parent so the picker can show "Parent · Vaikas A, B".
            const parentByUserId = new Map<string, MessageableStudent>();
            for (const p of parents as any[]) {
              const pid = p?.user_id as string | null | undefined;
              if (!pid || pid === user.id) continue;
              const childName: string | null =
                typeof p?.student_name === 'string' && p.student_name.trim().length > 0
                  ? p.student_name.trim()
                  : null;
              const existing = parentByUserId.get(pid);
              if (existing) {
                if (childName && !(existing.child_names ?? []).includes(childName)) {
                  existing.child_names = [...(existing.child_names ?? []), childName];
                }
                continue;
              }
              parentByUserId.set(pid, {
                student_id: pid,
                linked_user_id: pid,
                full_name: p.full_name ?? '',
                email: p.email ?? null,
                role: 'parent',
                child_names: childName ? [childName] : [],
              });
            }
            for (const p of parentByUserId.values()) list.push(p);
          }
        } catch (err) {
          console.warn('[useChat] get_tutor_messageable_parents failed:', err);
        }

        // Org tutors should also be able to message admins of their organization.
        try {
          const { data: admins, error: adminsErr } = await supabase.rpc(
            'get_tutor_messageable_admins',
          );
          if (!adminsErr && Array.isArray(admins)) {
            const seenAdmins = new Set<string>();
            for (const a of admins as any[]) {
              const aid = a?.user_id as string | null | undefined;
              if (!aid || aid === user.id || seenAdmins.has(aid)) continue;
              seenAdmins.add(aid);
              list.push({
                student_id: aid,
                linked_user_id: aid,
                full_name: a.full_name ?? '',
                email: a.email ?? null,
                role: 'org_admin',
              });
            }
          }
        } catch (err) {
          console.warn('[useChat] get_tutor_messageable_admins failed:', err);
        }

        setStudents(list);
        msgStudentsCache = { data: list, ts: Date.now() };
      }
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
