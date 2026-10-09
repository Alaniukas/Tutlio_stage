import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authHeaders } from '@/lib/apiHelpers';
import { suggestedTutorInvoiceNumber } from '@/lib/tutorInvoiceSeries';
import { useTranslation } from '@/lib/i18n';

export type UpdatedCompanyInvoice = { id: string; invoice_number: string; status: 'issued' | 'paid' | 'cancelled' };
export default function TutorInvoiceNumberDialog({ invoice, tutorName, onClose, onSaved }: {
  invoice: UpdatedCompanyInvoice | null; tutorName: string; onClose: () => void;
  onSaved: (invoice: UpdatedCompanyInvoice) => void;
}) {
  const { t } = useTranslation();
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setNumber(invoice ? suggestedTutorInvoiceNumber(invoice.invoice_number, tutorName) : '');
    setError('');
  }, [invoice?.id, invoice?.invoice_number, tutorName]);
  const save = async () => {
    if (!invoice) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/company-invoice-update', { method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ action: 'change_number', invoiceId: invoice.id,
          expectedNumber: invoice.invoice_number, invoiceNumber: number }) });
      const result = await response.json();
      if (!response.ok || result.invoice?.id !== invoice.id || !result.invoice?.invoice_number) {
        setError(t(response.status === 409 ? 'invoices.numberConflict' : 'common.saveFailed')); return;
      }
      onSaved(result.invoice); onClose();
    } catch { setError(t('common.saveFailed')); }
    finally { setSaving(false); }
  };
  return <Dialog open={Boolean(invoice)} onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent><DialogHeader><DialogTitle>{t('invoices.changeNumber')}</DialogTitle>
      <DialogDescription>{t('invoices.numberCorrectionNote', { number: invoice?.invoice_number || '' })}</DialogDescription>
    </DialogHeader>
      <div className="space-y-2"><Label htmlFor="correct-tutor-invoice-number">{t('invoices.newNumber')}</Label>
        <Input id="correct-tutor-invoice-number" value={number} maxLength={60} disabled={saving}
          onChange={event => setNumber(event.target.value)} />
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}</div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
        <Button onClick={() => void save()} disabled={saving || !number.trim()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t('common.save')}
        </Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
