import { XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n';

export default function PackagePaymentCancelled() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">{t('payment.cancelled')}</h1>
        <p className="text-sm text-gray-500 mb-8">{t('payment.cancelledDesc')}</p>
        <Button asChild className="w-full rounded-2xl">
          <Link to="/login">{t('payment.backToSystem')}</Link>
        </Button>
      </div>
    </div>
  );
}
