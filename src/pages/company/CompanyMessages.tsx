import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { useConversations } from '@/hooks/useChat';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';
import type { Conversation, MessageableStudent } from '@/hooks/useChat';
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';
import { ChevronDown } from 'lucide-react';

const ORG_CACHE_TTL = 300_000;
let orgConvCache: {
  data: Conversation[];
  tutors: { id: string; full_name: string }[];
  studentNames: { id: string; name: string }[];
  ts: number;
} | null = null;

export default function CompanyMessages() {
  const { t } = useTranslation();
  const { conversations: myConversations, loading: myLoading, refetch } = useConversations();
  const [orgConversations, setOrgConversations] = useState<Conversation[]>(orgConvCache?.data ?? []);
  const [orgLoading, setOrgLoading] = useState(!orgConvCache);
  const [active, setActive] = useState<Conversation | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [viewMode, setViewMode] = useState<'mine' | 'org'>('mine');
  const [filterTutor, setFilterTutor] = useState('');
  const [filterStudent, setFilterStudent] = useState('');
  const [orgTutors, setOrgTutors] = useState<{ id: string; full_name: string }[]>(orgConvCache?.tutors ?? []);
  const [orgStudentNames, setOrgStudentNames] = useState<{ id: string; name: string }[]>(orgConvCache?.studentNames ?? []);

  const fetchOrgConversations = useCallback(async () => {
    setOrgLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setOrgLoading(false); return; }

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!adminRow) { setOrgLoading(false); return; }

    const tutorList = await getOrgVisibleTutors(
      supabase as any,
      adminRow.organization_id,
      'id, full_name, email',
    );
    if (tutorList.length === 0) { setOrgLoading(false); return; }
    setOrgTutors(tutorList.map((t) => ({ id: t.id, full_name: t.full_name ?? '' })));
    const tutorIdSet = new Set(tutorList.map((t) => t.id));
    const tutorIds = tutorList.map((t) => t.id);

    // Pre-compute org admin user_ids so we can exclude them from the "student" slot
    // when mapping each conversation to a tutor↔counterparty pair.
    const { data: orgAdminRows } = await supabase
      .from('organization_admins')
      .select('user_id')
      .eq('organization_id', adminRow.organization_id);
    const adminIds = new Set<string>((orgAdminRows ?? []).map((r: any) => r.user_id).filter(Boolean));

    const { data: participantRows } = await supabase
      .from('chat_participants')
      .select('conversation_id, user_id')
      .in('user_id', tutorIds);

    if (!participantRows || participantRows.length === 0) {
      setOrgConversations([]);
      setOrgLoading(false);
      return;
    }

    const convIds = [...new Set(participantRows.map((r) => r.conversation_id))];
    const { data: allParticipants } = await supabase
      .from('chat_participants')
      .select('conversation_id, user_id, last_read_at')
      .in('conversation_id', convIds);

    const { data: convRows } = await supabase
      .from('chat_conversations')
      .select('id, last_message_at')
      .in('id', convIds)
      .order('last_message_at', { ascending: false });

    if (!convRows) { setOrgConversations([]); setOrgLoading(false); return; }

    const allUserIds = [...new Set((allParticipants ?? []).map((p) => p.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', allUserIds);

    const { data: studentRows } = await supabase
      .from('students')
      .select('linked_user_id, full_name, email')
      .in('linked_user_id', allUserIds);

    const { data: parentRows } = await supabase
      .from('parent_profiles')
      .select('user_id, full_name, email')
      .in('user_id', allUserIds);

    const nameMap = new Map<string, { name: string; email: string }>();
    (profiles ?? []).forEach((p) => nameMap.set(p.id, { name: p.full_name ?? '', email: p.email ?? '' }));
    (studentRows ?? []).forEach((s) => {
      if (s.linked_user_id && !nameMap.has(s.linked_user_id)) {
        nameMap.set(s.linked_user_id, { name: s.full_name ?? '', email: s.email ?? '' });
      }
    });
    (parentRows ?? []).forEach((p) => {
      if (p.user_id && !nameMap.has(p.user_id)) {
        nameMap.set(p.user_id, { name: p.full_name ?? '', email: p.email ?? '' });
      }
    });

    const linkedStudentUserIds = new Set<string>(
      (studentRows ?? [])
        .map((s: any) => s.linked_user_id)
        .filter((id: string | null | undefined): id is string => !!id),
    );
    const parentUserIds = new Set<string>(
      (parentRows ?? [])
        .map((p: any) => p.user_id)
        .filter((id: string | null | undefined): id is string => !!id),
    );

    const studentNamesSet = new Map<string, string>();

    const mapped: Conversation[] = convRows.map((c) => {
      const parts = (allParticipants ?? []).filter((p) => p.conversation_id === c.id);
      const tutorPart = parts.find((p) => tutorIdSet.has(p.user_id));
      const counterpartyPart = parts.find(
        (p) => !tutorIdSet.has(p.user_id) && !adminIds.has(p.user_id),
      );
      const other = parts.find((p) => p.user_id !== user.id) ?? parts[0];

      const tutorInfo = nameMap.get(tutorPart?.user_id ?? '') ?? { name: '-', email: '' };
      const counterpartyId = counterpartyPart?.user_id ?? '';
      const counterpartyInfo =
        nameMap.get(counterpartyId) ??
        nameMap.get(other?.user_id ?? '') ?? { name: 'Unknown', email: '' };

      const isParent = parentUserIds.has(counterpartyId);
      const isStudent = linkedStudentUserIds.has(counterpartyId);

      if (isStudent) {
        studentNamesSet.set(counterpartyId, counterpartyInfo.name);
      }

      const counterpartyLabel = isParent
        ? `${counterpartyInfo.name} (${t('chat.roleParent')})`
        : counterpartyInfo.name;
      const displayName = `${tutorInfo.name} ↔ ${counterpartyLabel}`;

      return {
        conversation_id: c.id,
        last_message_at: c.last_message_at,
        other_user_id: other?.user_id ?? '',
        other_user_name: displayName,
        other_user_email: counterpartyInfo.email,
        last_message_content: null,
        last_message_type: null,
        last_message_sender_id: null,
        last_message_created_at: c.last_message_at,
        unread_count: 0,
        tutor_name: tutorInfo.name,
        student_name: counterpartyInfo.name,
        tutor_id: tutorPart?.user_id,
        student_linked_id: isStudent ? counterpartyId : undefined,
        other_party_kind: isParent ? 'parent' : isStudent ? 'student' : undefined,
      };
    });

    const studentNamesList = Array.from(studentNamesSet.entries()).map(([id, name]) => ({ id, name }));
    setOrgStudentNames(studentNamesList);
    setOrgConversations(mapped);
    orgConvCache = { data: mapped, tutors: tutorList.map((t) => ({ id: t.id, full_name: t.full_name ?? '' })), studentNames: studentNamesList, ts: Date.now() };
    setOrgLoading(false);
  }, []);

  useEffect(() => {
    if (orgConvCache && Date.now() - orgConvCache.ts < ORG_CACHE_TTL) {
      setOrgConversations(orgConvCache.data);
      setOrgTutors(orgConvCache.tutors);
      setOrgStudentNames(orgConvCache.studentNames);
      setOrgLoading(false);
    } else {
      fetchOrgConversations();
    }
  }, [fetchOrgConversations]);

  const filteredOrgConversations = useMemo(() => {
    let list = orgConversations;
    if (filterTutor) list = list.filter((c) => c.tutor_id === filterTutor);
    if (filterStudent) list = list.filter((c) => c.student_linked_id === filterStudent);
    return list;
  }, [orgConversations, filterTutor, filterStudent]);

  const conversations = viewMode === 'mine' ? myConversations : filteredOrgConversations;
  const loading = viewMode === 'mine' ? myLoading : orgLoading;

  const handleSelect = (conv: Conversation) => {
    setActive(conv);
    setMobileShowChat(true);
  };

  const handleBack = () => setMobileShowChat(false);

  const participantNames = useMemo(() => {
    if (viewMode !== 'org' || !active) return undefined;
    const map = new Map<string, string>();
    if (active.tutor_id && active.tutor_name) map.set(active.tutor_id, active.tutor_name);
    if (active.student_linked_id && active.student_name) map.set(active.student_linked_id, active.student_name);
    return map.size > 0 ? map : undefined;
  }, [viewMode, active]);

  const participantRoles = useMemo(() => {
    if (viewMode !== 'org' || !active) return undefined;
    const map = new Map<string, string>();
    if (active.tutor_id) map.set(active.tutor_id, 'tutor');
    if (active.student_linked_id) {
      map.set(active.student_linked_id, 'student');
    } else if (active.other_party_kind === 'parent' && active.other_user_id) {
      map.set(active.other_user_id, 'parent');
    }
    return map.size > 0 ? map : undefined;
  }, [viewMode, active]);

  const handleConversationCreated = (conversationId: string, student: MessageableStudent) => {
    const newConv: Conversation = {
      conversation_id: conversationId,
      last_message_at: new Date().toISOString(),
      other_user_id: student.linked_user_id,
      other_user_name: student.full_name,
      other_user_email: student.email || '',
      last_message_content: null,
      last_message_type: null,
      last_message_sender_id: null,
      last_message_created_at: new Date().toISOString(),
      unread_count: 0,
      other_party_kind:
        student.role === 'student'
          ? 'student'
          : student.role === 'tutor'
            ? 'tutor'
            : student.role === 'org_admin'
              ? 'org_admin'
              : student.role === 'parent'
                ? 'parent'
                : undefined,
    };
    setActive(newConv);
    setMobileShowChat(true);
    refetch();
  };

  return (
    <>
      <div className="flex-1 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">{t('chat.title')}</h1>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setViewMode('mine')}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${viewMode === 'mine' ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
          >
            {t('chat.messages')}
          </button>
          <button
            onClick={() => setViewMode('org')}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${viewMode === 'org' ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
          >
            {t('chat.conversations')}
          </button>

          {viewMode === 'org' && (
            <div className="flex gap-2 ml-auto">
              <div className="relative">
                <select
                  value={filterTutor}
                  onChange={(e) => setFilterTutor(e.target.value)}
                  className="appearance-none bg-white border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300"
                >
                  <option value="">{t('chat.allTutors')}</option>
                  {orgTutors.map((tu) => (
                    <option key={tu.id} value={tu.id}>{tu.full_name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  value={filterStudent}
                  onChange={(e) => setFilterStudent(e.target.value)}
                  className="appearance-none bg-white border border-gray-200 rounded-xl px-3 py-2 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-300"
                >
                  <option value="">{t('chat.allStudents')}</option>
                  {orgStudentNames.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex isolate" style={{ height: 'calc(100vh - 240px)' }}>
          <div className={`w-full lg:w-80 xl:w-96 border-r border-gray-100 flex-shrink-0 ${mobileShowChat ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'}`}>
            <ConversationList
              conversations={conversations}
              activeId={active?.conversation_id ?? null}
              onSelect={handleSelect}
              onConversationCreated={handleConversationCreated}
              loading={loading}
            />
          </div>

          <div className={`flex-1 min-w-0 min-h-0 flex flex-col overflow-visible ${!mobileShowChat ? 'hidden lg:flex' : 'flex'}`}>
            <ChatWindow
              conversation={active}
              onBack={handleBack}
              onMessageSent={refetch}
              participantNames={participantNames}
              participantRoles={participantRoles}
            />
          </div>
        </div>
      </div>
    </>
  );
}
