import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { type NoShowWhen, defaultNoShowWhenForNow } from '@/lib/noShowWhen';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionStart: Date;
  sessionEnd: Date;
  saving?: boolean;
  onConfirm: (when: NoShowWhen) => void | Promise<void>;
}

export default function MarkStudentNoShowDialog({
  open,
  onOpenChange,
  sessionStart,
  sessionEnd,
  saving,
  onConfirm,
}: Props) {
  const handleConfirm = () => {
    const when = defaultNoShowWhenForNow(sessionStart, sessionEnd, new Date());
    void onConfirm(when);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[100]"
        className="z-[101] w-[95vw] sm:max-w-md rounded-2xl"
      >
        <DialogHeader>
          <DialogTitle>Mokinys neatvyko</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            Pamoka bus pažymėta kaip <strong className="text-foreground">neįvykusi</strong>. Į komentarą įrašysime trumpą standartinį tekstą
            (prieš / per / po pamoką) pagal <strong className="text-foreground">patvirtinimo</strong> momentą ir suplanuotą pamokos pradžią bei
            pabaigą.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button type="button" variant="outline" className="rounded-xl" disabled={saving} onClick={() => onOpenChange(false)}>
            Atšaukti
          </Button>
          <Button type="button" className="rounded-xl bg-rose-600 hover:bg-rose-700" disabled={saving} onClick={handleConfirm}>
            {saving ? 'Saugoma…' : 'Patvirtinti'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
