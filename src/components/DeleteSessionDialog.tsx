import { useEffect, useId, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';
import { deletionConfirmationKey, type SessionDeleteScope } from '@/lib/sessionDeletion';

type DeleteSessionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recurring: boolean;
  wholeGroup?: boolean;
  familyOnlyCancelled?: boolean;
  busy?: boolean;
  onDelete: (scope: SessionDeleteScope) => void | Promise<void>;
};

export function DeleteSessionDialog({ open, onOpenChange, recurring, wholeGroup, familyOnlyCancelled, busy = false, onDelete }: DeleteSessionDialogProps) {
  const { t } = useTranslation();
  const [selectedScope, setSelectedScope] = useState<SessionDeleteScope | null>(null);
  const descriptionId = useId();
  const descriptionRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!open) setSelectedScope(null);
  }, [open]);

  useEffect(() => {
    if (selectedScope) descriptionRef.current?.focus();
  }, [selectedScope]);

  const changeOpen = (nextOpen: boolean) => {
    if (busy) return;
    if (!nextOpen) setSelectedScope(null);
    onOpenChange(nextOpen);
  };

  const selectedScopeLabel = selectedScope === 'all'
    ? 'cal.deleteAllRemaining'
    : selectedScope === 'future'
      ? 'cal.deleteThisAndFuture'
      : recurring ? 'cal.deleteOnlyThis' : 'cal.deleteSession';

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="w-[95vw] sm:max-w-[480px]" hideClose={busy} aria-describedby={descriptionId}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            {t(recurring ? 'cal.deleteRecurringTitle' : 'cal.deleteSession')}
          </DialogTitle>
          <DialogDescription id={descriptionId} ref={descriptionRef} tabIndex={selectedScope ? -1 : undefined} className="whitespace-pre-line">
            {t(selectedScope ? deletionConfirmationKey(selectedScope) : 'cal.deleteChoose')}
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm text-gray-600 space-y-2">
          {selectedScope && <p className="font-medium text-gray-900">{t(selectedScopeLabel)}</p>}
          {recurring && (familyOnlyCancelled || selectedScope !== 'single') && <p>{t(familyOnlyCancelled ? 'cal.deleteCancelledOnlyHint' : 'cal.deleteAllRemainingHint')}</p>}
          {wholeGroup && <p>{t('cal.deleteGroupHint')}</p>}
          {!selectedScope && <p className="text-xs text-gray-500">{t('cal.deleteHint')}</p>}
        </div>
        {!selectedScope && <div className="flex flex-col gap-2">
          <Button variant="outline" className="h-auto min-h-9 whitespace-normal py-2 rounded-xl border-red-200 text-red-700 hover:bg-red-50" autoFocus disabled={busy} onClick={() => setSelectedScope('single')}>
            {t(recurring ? 'cal.deleteOnlyThis' : 'cal.deleteSession')}
          </Button>
          {recurring && (
            <>
              <Button variant="outline" className="h-auto min-h-9 whitespace-normal py-2 rounded-xl border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={() => setSelectedScope('future')}>
                {t('cal.deleteThisAndFuture')}
              </Button>
              <Button variant="outline" className="h-auto min-h-9 whitespace-normal py-2 rounded-xl border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={() => setSelectedScope('all')}>
                {t('cal.deleteAllRemaining')}
              </Button>
            </>
          )}
        </div>}
        <DialogFooter>
          {selectedScope && <Button variant="outline" className="rounded-xl" disabled={busy} onClick={() => setSelectedScope(null)}>{t('common.back')}</Button>}
          <Button variant="outline" className="rounded-xl" disabled={busy} onClick={() => changeOpen(false)}>{t('cal.cancelBtn')}</Button>
          {selectedScope && <Button variant="destructive" className="rounded-xl" disabled={busy} onClick={() => { if (!busy) void onDelete(selectedScope); }}>{t('cal.delete')}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
