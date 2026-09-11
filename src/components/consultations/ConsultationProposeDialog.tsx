import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';

export default function ConsultationProposeDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  requestIds: string[];
  onProposed: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'individual' | 'group' | 'join_lesson'>('individual');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!props.requestIds.length || !startTime || !endTime) return;
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/school-consultations', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'propose',
          organization_id: props.organizationId,
          request_ids: props.requestIds,
          mode,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t('common.error'));
        return;
      }
      props.onProposed();
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
          <DialogTitle>{t('schoolConsult.proposeTime')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipas</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="group">Grupinė</SelectItem>
                <SelectItem value="individual">Individuali</SelectItem>
                <SelectItem value="join_lesson">Prisijungimas prie pamokos</SelectItem>
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
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" disabled={busy} onClick={submit}>{t('schoolConsult.proposeTime')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
