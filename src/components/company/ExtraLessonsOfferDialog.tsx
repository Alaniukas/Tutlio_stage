import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { authHeaders } from '@/lib/apiHelpers';
import {
  buildExtraLessonsOrderSnapshot,
  formatScheduleLabel,
  indicativeMonthlyPrice,
  type ExtraLessonsScheduleSlot,
} from '@/lib/extraLessonsContract';
import { DateRangeFields, ScheduleSlotPicker } from '@/components/company/ScheduleSlotPicker';

type Student = { id: string; full_name: string; payer_email?: string | null; grade?: string | null };
type Group = { id: string; name: string; slots?: { weekday: number; start_time: string; end_time: string }[] };

export default function ExtraLessonsOfferDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: Student[];
  groups: Group[];
  onCreated: (info: { acceptUrl: string; contractNumber: string }) => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [serviceType, setServiceType] = useState<'group' | 'individual'>('group');
  const [platform, setPlatform] = useState('Google Meet');
  const [duration, setDuration] = useState('45');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [baseLessons, setBaseLessons] = useState('8');
  const [slots, setSlots] = useState<ExtraLessonsScheduleSlot[]>([]);
  const [groupId, setGroupId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewMonthly = indicativeMonthlyPrice(Number(baseLessons) || 0, Number(unitPrice) || 0);
  const scheduleLabel = useMemo(() => formatScheduleLabel(slots), [slots]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const group = props.groups.find((g) => g.id === groupId);
    const order = buildExtraLessonsOrderSnapshot({
      service_name: serviceName || group?.name || '',
      service_type: serviceType,
      platform,
      duration_minutes: Number(duration) || 45,
      schedule_slots: slots,
      schedule_label: scheduleLabel,
      start_date: startDate,
      end_date: endDate,
      unit_price_eur: Number(unitPrice) || 0,
      base_lessons_per_month: Number(baseLessons) || 0,
      group_id: groupId || null,
      group_name: group?.name || null,
    });
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/extra-lessons-contract-offer', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          student_id: studentId,
          ...order,
          send: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Nepavyko sukurti pasiūlymo.');
        setBusy(false);
        return;
      }
      props.onCreated({ acceptUrl: data.acceptUrl, contractNumber: data.contractNumber });
      props.onOpenChange(false);
    } catch {
      setError('Nepavyko sukurti pasiūlymo.');
    }
    setBusy(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Papildomų pamokų sutartis</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500">
          Privaloma: mokinys ir pamokos kaina. Grafiką, datas ir kitus laukus galite palikti tuščius —
          tėvai juos užpildys priimdami sutartį.
        </p>
        <div className="space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <Label>Mokinys *</Label>
            <select className="w-full border rounded-md h-9 px-2 text-sm" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Pasirinkite…</option>
              {props.students.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Paslaugos pavadinimas</Label>
            <Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="nebūtina, jei pasirinkta grupė" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipas</Label>
              <select className="w-full border rounded-md h-9 px-2 text-sm" value={serviceType} onChange={(e) => setServiceType(e.target.value as 'group' | 'individual')}>
                <option value="group">Grupinė</option>
                <option value="individual">Individuali</option>
              </select>
            </div>
            <div>
              <Label>Grupė</Label>
              <select className="w-full border rounded-md h-9 px-2 text-sm" value={groupId} onChange={(e) => {
                const id = e.target.value;
                setGroupId(id);
                const g = props.groups.find((x) => x.id === id);
                if (g) {
                  setServiceName((prev) => prev || g.name);
                  if (g.slots?.length) {
                    setSlots(g.slots.map((s) => ({
                      weekday: Number(s.weekday),
                      start_time: String(s.start_time).slice(0, 5),
                      end_time: String(s.end_time || '').slice(0, 5) || null,
                    })));
                  }
                }
              }}>
                <option value="">—</option>
                {props.groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Platforma</Label>
              <Input value={platform} onChange={(e) => setPlatform(e.target.value)} />
            </div>
            <div>
              <Label>Trukmė (min)</Label>
              <Input value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Grafikas (pasirinkite dienas)</Label>
            <ScheduleSlotPicker slots={slots} onChange={setSlots} durationMinutes={Number(duration) || 45} />
          </div>
          <DateRangeFields startDate={startDate} endDate={endDate} onStart={setStartDate} onEnd={setEndDate} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Pamokos kaina (€) *</Label>
              <Input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="12.00" />
            </div>
            <div>
              <Label>Bazinis kiekis / mėn.</Label>
              <Input value={baseLessons} onChange={(e) => setBaseLessons(e.target.value)} />
            </div>
          </div>
          <p className="text-sm text-gray-600">Orientacinė mėnesio kaina: <strong>{previewMonthly.toFixed(2)} €</strong></p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>Atšaukti</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={busy || !studentId || !(Number(unitPrice) > 0)} onClick={submit}>
            {busy ? 'Siunčiama…' : 'Siųsti tėvams'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
