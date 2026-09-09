import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';

export default function ConsultationNeedDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: { id: string; full_name: string; grade?: string | null }[];
  subjects: { id: string; name: string }[];
  onSubmitted: () => void;
}) {
  const { t } = useTranslation();
  const [studentId, setStudentId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [topic, setTopic] = useState('');
  const [preferred, setPreferred] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const student = props.students.find((s) => s.id === studentId);

  const submit = async () => {
    if (!studentId || !topic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/school-consultations', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'need',
          student_id: studentId,
          subject_id: subjectId || null,
          topic: topic.trim(),
          preferred_times: preferred.trim() ? [{ note: preferred.trim() }] : [],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t('common.error'));
        return;
      }
      props.onSubmitted();
      props.onOpenChange(false);
      setTopic('');
      setPreferred('');
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('schoolConsult.need.title')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('compStu.student')}</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {props.students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {props.subjects.length > 0 && (
            <div className="space-y-2">
              <Label>{t('compSch.subject')}</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {props.subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {student?.grade && (
            <div className="space-y-2">
              <Label>{t('compStu.grade')}</Label>
              <Input value={student.grade} readOnly />
            </div>
          )}
          <div className="space-y-2">
            <Label>{t('schoolConsult.need.topic')}</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('schoolConsult.need.preferredTimes')}</Label>
            <Input value={preferred} onChange={(e) => setPreferred(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" disabled={busy || !studentId || !topic.trim()} onClick={submit}>
            {t('schoolConsult.need.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
