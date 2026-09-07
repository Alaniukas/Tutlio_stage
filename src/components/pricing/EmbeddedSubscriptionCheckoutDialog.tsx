import { useCallback, useMemo } from 'react';
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientSecret: string | null;
  publishableKey: string | null;
  completionUrl: string | null;
}

export default function EmbeddedSubscriptionCheckoutDialog({
  open,
  onOpenChange,
  clientSecret,
  publishableKey,
  completionUrl,
}: Props) {
  const { t } = useTranslation();
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );
  const handleComplete = useCallback(() => {
    if (completionUrl) window.location.assign(completionUrl);
  }, [completionUrl]);
  const checkoutOptions = useMemo(
    () => (clientSecret ? { clientSecret, onComplete: handleComplete } : null),
    [clientSecret, handleComplete],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[760px] max-h-[94vh] gap-0 overflow-y-auto border-0 bg-white p-3 sm:p-5">
        <DialogHeader className="px-2 pb-3 pr-10 text-left">
          <DialogTitle>{t('quiz.checkout.title')}</DialogTitle>
          <DialogDescription>{t('quiz.checkout.description')}</DialogDescription>
        </DialogHeader>
        {stripePromise && checkoutOptions ? (
          <EmbeddedCheckoutProvider
            key={clientSecret}
            stripe={stripePromise}
            options={checkoutOptions}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
