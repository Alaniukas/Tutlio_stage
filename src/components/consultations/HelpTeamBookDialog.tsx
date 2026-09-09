import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { HELP_TEAM_CATEGORY_I18N, type HelpTeamCategory } from '@/lib/schoolHelpTeamQuota';

export default function HelpTeamBookDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  category: HelpTeamCategory;
  organizationId: string;
  students: { id: string; full_name: string }[];
  specialists: { id: string; full_name: string }[];
  helpQuota?: { nextIsPaid: boolean; remaining: number };
  onBooked: () => void;
}) {
  const { t } = useTranslation();
  const [studentId, setStudentId] = useState('');
  const [specialistId, setSpecialistId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [audienceNote, setAudienceNote] = useState('');
  const [payAck, setPayAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPaid = props.helpQuota?.nextIsPaid ?? false;

  const submit = async () => {
    if (!studentId || !specialistId || !startTime || !endTime) return;
    if (isPaid && !payAck) return;
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/school-consultations', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'book_help',
          organization_id: props.organizationId,
          student_id: studentId,
          tutor_id: specialistId,
          help_team_category: props.category,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
          audience_note: audienceNote,
          pay_ack: payAck,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t('common.error'));
        return;
      }
      props.onBooked();
      props.onOpenChange(false);
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
          <DialogTitle>{t(HELP_TEAM_CATEGORY_I18N[props.category])}</DialogTitle>
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
          <div className="space-y-2">
            <Label>{t('compSch.tutor')}</Label>
            <Select value={specialistId} onValueChange={setSpecialistId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {props.specialists.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('compSch.start')}</Label>
            <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('compSch.end')}</Label>
            <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('schoolConsult.audienceNote')}</Label>
            <Input value={audienceNote} onChange={(e) => setAudienceNote(e.target.value)} />
          </div>
          {isPaid && (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={payAck} onChange={(e) => setPayAck(e.target.checked)} />
              <span>{t('schoolConsult.paidAck')}</span>
            </label>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" disabled={busy} onClick={submit}>{t('schoolConsult.bookSlot')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
