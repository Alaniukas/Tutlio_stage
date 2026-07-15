import { useMemo, useState } from 'react';
import AssignStudentFreeSlotDialog from '@/components/AssignStudentFreeSlotDialog';

const MOCK_STUDENTS = [
  { id: 's1', full_name: 'Jonas Petraitis' },
  { id: 's2', full_name: 'Ona Kazlauskaitė' },
  { id: 's3', full_name: 'Mokinys Test (labai ilgas vardas patikrai ar telpa modale)' },
];

export default function PreviewAssignStudentModal() {
  const [open, setOpen] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [topic, setTopic] = useState('MATEMATIKA');
  const [meetingLink, setMeetingLink] = useState('');
  const [isPaid, setIsPaid] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState('slot-1');

  const slots = useMemo(
    () => [
      { label: '16:00 – 17:00', startIso: 'slot-1' },
      { label: '16:15 – 17:15', startIso: 'slot-2' },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-slate-900/90 p-4 sm:p-8">
      <div className="mx-auto max-w-xl space-y-4 text-white">
        <p className="text-sm text-slate-300">
          Peržiūros puslapis — „Pridėti mokinį į laisvą laiką“ modalas (fake duomenys, be API).
        </p>
        {!open && (
          <button
            type="button"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => setOpen(true)}
          >
            Atidaryti modalą
          </button>
        )}
      </div>

      <AssignStudentFreeSlotDialog
        open={open}
        onOpenChange={setOpen}
        tutorName="TEST"
        subjectName="MATEMATIKA"
        startIso="2026-07-27T13:00:00.000Z"
        endIso="2026-07-27T14:00:00.000Z"
        slots={slots}
        selectedSlot={selectedSlot}
        onSelectedSlotChange={setSelectedSlot}
        students={MOCK_STUDENTS}
        studentId={studentId}
        onStudentIdChange={setStudentId}
        studentIds={[]}
        onStudentIdsChange={() => undefined}
        isGroup={false}
        topic={topic}
        onTopicChange={setTopic}
        meetingLink={meetingLink}
        onMeetingLinkChange={setMeetingLink}
        isPaid={isPaid}
        onIsPaidChange={setIsPaid}
        showTrialButton
        onCancel={() => setOpen(false)}
        onCreate={() => window.alert('Peržiūra: Sukurti pamoką (be API)')}
        onReserveTrial={() => window.alert('Peržiūra: Rezervuoti bandomąją (be API)')}
      />
    </div>
  );
}
