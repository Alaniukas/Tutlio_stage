import { useEffect, useId, useRef, useState } from 'react';
import { Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';
import { annulSessionPayment, type AnnulledSessionPayment } from '@/lib/sessionPaymentAnnulment';
import { sessionPaymentAnnulmentErrorKey, sessionPaymentAnnulmentText } from '@/lib/i18n/sessionPaymentAnnulmentCopy';

export function AnnulSessionPaymentDialog({ open, onOpenChange, sessionId, onAnnulled }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  onAnnulled: (session: AnnulledSessionPayment) => void;
}) {
  const { t, locale } = useTranslation();
  const descriptionId = useId();
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setError(null); }, [open, sessionId]);

  const confirm = async () => {
    if (!sessionId || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError(null);
    const result = await annulSessionPayment(sessionId);
    submitting.current = false;
    setSaving(false);
    if (result.ok === false) { setError(result.code); return; }
    onAnnulled(result.session);
    onOpenChange(false);
  };

  return (
    <Dialog open={open && !!sessionId} onOpenChange={next => { if (!submitting.current) onOpenChange(next); }}>
      <DialogContent className="max-w-md" aria-describedby={descriptionId} hideClose={saving}>
        <DialogHeader>
          <DialogTitle>{sessionPaymentAnnulmentText(locale, 'action')}</DialogTitle>
          <DialogDescription id={descriptionId}>{sessionPaymentAnnulmentText(locale, 'description')}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-red-700">{sessionPaymentAnnulmentText(locale, sessionPaymentAnnulmentErrorKey(error))}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button disabled={saving || !sessionId} onClick={() => void confirm()} className="bg-amber-700 hover:bg-amber-800">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
            {sessionPaymentAnnulmentText(locale, 'action')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
