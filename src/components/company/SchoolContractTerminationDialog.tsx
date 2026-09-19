import { AlertTriangle, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type SchoolContractTerminationImpact = {
  willSuspendGroup: boolean;
  groupId: string;
  groupName: string;
  activeStudentCount: number;
  remainingActiveStudentCount: number;
  groupAlreadySuspended: boolean;
};

type Props = {
  open: boolean;
  studentName?: string | null;
  impact: SchoolContractTerminationImpact | null;
  impactLoading: boolean;
  groupConfirmed: boolean;
  reason: string;
  busy: boolean;
  cancelLabel: string;
  onGroupConfirmedChange: (checked: boolean) => void;
  onReasonChange: (reason: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export default function SchoolContractTerminationDialog({
  open,
  studentName,
  impact,
  impactLoading,
  groupConfirmed,
  reason,
  busy,
  cancelLabel,
  onGroupConfirmedChange,
  onReasonChange,
  onClose,
  onSubmit,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nutraukti sutartį</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Nutraukti sutartį mokiniui {studentName || '–'}.
            Pasirašytas dokumentas ir mokėjimų istorija išliks.
          </p>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            Mokinio prisijungimo nuorodos nustos veikti iš karto. Pagal šią sutartį nebebus siunčiami nauji užsiėmimų priminimai ir nebus skaičiuojami būsimi užsiėmimų mokesčiai.
          </div>
          {impactLoading ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Tikrinama, ar nutraukimas paveiks visą grupę…
            </div>
          ) : impact?.willSuspendGroup ? (
            <div role="alert" className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <p className="font-bold">Nutraukus sutartį iširs grupė „{impact.groupName}“.</p>
                  <p className="mt-1 leading-6">
                    Aktyvių mokinių skaičius sumažės iki {impact.remainingActiveStudentCount}. Kadangi grupiniam užsiėmimui reikia bent 3, visa grupė ir likusių mokinių grupinės sutartys bus automatiškai sustabdytos, o šeimos informuotos el. paštu.
                  </p>
                </div>
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg bg-white/70 px-3 py-2 font-medium">
                <input
                  type="checkbox"
                  checked={groupConfirmed}
                  onChange={(event) => onGroupConfirmedChange(event.target.checked)}
                  className="mt-0.5 rounded border-amber-400"
                />
                <span>Suprantu, kad bus sustabdyta visa grupė, ir noriu tęsti.</span>
              </label>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="school-contract-termination-reason">Nutraukimo priežastis</Label>
            <Textarea
              id="school-contract-termination-reason"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Trumpai nurodykite, kodėl ir kieno prašymu sutartis nutraukiama."
              maxLength={1000}
              className="min-h-24"
            />
          </div>
        </div>
        <DialogFooter className="sticky -mx-4 -mb-4 bottom-[-1px] z-10 border-t bg-background px-4 pb-4 pt-3 sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy
              || impactLoading
              || reason.trim().length < 3
              || (impact?.willSuspendGroup === true && !groupConfirmed)}
            onClick={onSubmit}
          >
            <Ban className="mr-1.5 h-4 w-4" />
            {busy
              ? 'Nutraukiama…'
              : impact?.willSuspendGroup
                ? 'Nutraukti ir sustabdyti grupę'
                : 'Nutraukti sutartį'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
