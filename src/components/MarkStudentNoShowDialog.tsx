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
import { useTranslation } from '@/lib/i18n';

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
  const { t } = useTranslation();
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
          <DialogTitle>{t('noShow.title')}</DialogTitle>
          <DialogDescription
            className="text-sm text-muted-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: t('noShow.desc') }}
          />
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button type="button" variant="outline" className="rounded-xl" disabled={saving} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" className="rounded-xl bg-rose-600 hover:bg-rose-700" disabled={saving} onClick={handleConfirm}>
            {saving ? t('common.saving') : t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
