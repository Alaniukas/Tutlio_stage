import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authHeaders } from '@/lib/apiHelpers';
import { useUser } from '@/contexts/UserContext';
import { useTranslation } from '@/lib/i18n';
import { Loader2, CheckCircle2, Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';

type EntityType = 'verslo_liudijimas' | 'individuali_veikla' | 'mb' | 'uab' | 'ii';

interface InvoiceProfile {
  id?: string;
  entity_type: EntityType;
  business_name: string;
  company_code: string;
  vat_code: string;
  address: string;
  activity_number: string;
  personal_code: string;
  contact_email: string;
  contact_phone: string;
  invoice_series: string;
}

interface InvoiceSettingsFormProps {
  scope?: 'user' | 'organization';
  allowedEntityTypes?: EntityType[];
  onSaved?: () => void;
}

const EMPTY_PROFILE: InvoiceProfile = {
  entity_type: 'individuali_veikla',
  business_name: '',
  company_code: '',
  vat_code: '',
  address: '',
  activity_number: '',
  personal_code: '',
  contact_email: '',
  contact_phone: '',
  invoice_series: 'SF',
};

const COMPANY_TYPES: EntityType[] = ['mb', 'uab', 'ii'];

export default function InvoiceSettingsForm({
  scope = 'user',
  allowedEntityTypes,
  onSaved,
}: InvoiceSettingsFormProps) {
  const { t } = useTranslation();
  const { profile: userProfile } = useUser();
  const [form, setForm] = useState<InvoiceProfile>({ ...EMPTY_PROFILE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entityTypes: EntityType[] = allowedEntityTypes || (
    scope === 'organization'
      ? ['mb', 'uab', 'ii', 'individuali_veikla']
      : ['verslo_liudijimas', 'individuali_veikla']
  );

  const isCompanyEntity = COMPANY_TYPES.includes(form.entity_type);

  useEffect(() => {
    fetchSettings();
  }, [scope]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/invoice-settings?scope=${scope}`, {
        headers: await authHeaders(),
      });
      const json = await res.json();
      if (json.data) {
        setForm({
          id: json.data.id,
          entity_type: json.data.entity_type || entityTypes[0],
          business_name: json.data.business_name || '',
          company_code: json.data.company_code || '',
          vat_code: json.data.vat_code || '',
          address: json.data.address || '',
          activity_number: json.data.activity_number || '',
          personal_code: json.data.personal_code || '',
          contact_email: json.data.contact_email || '',
          contact_phone: json.data.contact_phone || '',
          invoice_series: json.data.invoice_series || 'SF',
        });
      } else {
        setForm(prev => ({
          ...prev,
          entity_type: entityTypes[0],
          contact_email: userProfile?.email || '',
          contact_phone: userProfile?.phone || '',
        }));
      }
    } catch {
      setError(t('invoiceSettings.fetchError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch('/api/invoice-settings', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ ...form, scope }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('common.error'));

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onSaved?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof InvoiceProfile, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Label className="text-sm font-semibold text-gray-700 mb-2 block">
          {t('invoiceSettings.entityType')}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          {entityTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => updateField('entity_type', type)}
              className={cn(
                'flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all text-sm',
                form.entity_type === type
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-indigo-200'
              )}
            >
              {COMPANY_TYPES.includes(type) ? (
                <Building2 className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              ) : (
                <User className="w-4 h-4 text-indigo-600 flex-shrink-0" />
              )}
              <span className="font-medium text-gray-900">
                {t(`invoiceSettings.entityType_${type}`)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {isCompanyEntity ? (
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium text-gray-700">
              {t('invoiceSettings.businessName')} *
            </Label>
            <Input
              value={form.business_name}
              onChange={(e) => updateField('business_name', e.target.value)}
              placeholder={t('invoiceSettings.businessNamePlaceholder')}
              className="mt-1 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium text-gray-700">
                {t('invoiceSettings.companyCode')} *
              </Label>
              <Input
                value={form.company_code}
                onChange={(e) => updateField('company_code', e.target.value)}
                placeholder="123456789"
                className="mt-1 rounded-lg"
              />
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">
                {t('invoiceSettings.vatCode')}
              </Label>
              <Input
                value={form.vat_code}
                onChange={(e) => updateField('vat_code', e.target.value)}
                placeholder="LT123456789"
                className="mt-1 rounded-lg"
              />
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium text-gray-700">
              {t('invoiceSettings.address')} *
            </Label>
            <Input
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
              placeholder={t('invoiceSettings.addressPlaceholder')}
              className="mt-1 rounded-lg"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium text-gray-700">
              {t('invoiceSettings.activityNumber')} *
            </Label>
            <Input
              value={form.activity_number}
              onChange={(e) => updateField('activity_number', e.target.value)}
              placeholder={t('invoiceSettings.activityNumberPlaceholder')}
              className="mt-1 rounded-lg"
            />
          </div>
          <div>
            <Label className="text-sm font-medium text-gray-700">
              {t('invoiceSettings.personalCode')}
            </Label>
            <Input
              value={form.personal_code}
              onChange={(e) => updateField('personal_code', e.target.value)}
              placeholder="39001010000"
              className="mt-1 rounded-lg"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-sm font-medium text-gray-700">
            {t('invoiceSettings.contactEmail')}
          </Label>
          <Input
            type="email"
            value={form.contact_email}
            onChange={(e) => updateField('contact_email', e.target.value)}
            placeholder="info@example.lt"
            className="mt-1 rounded-lg"
          />
        </div>
        <div>
          <Label className="text-sm font-medium text-gray-700">
            {t('invoiceSettings.contactPhone')}
          </Label>
          <Input
            type="tel"
            value={form.contact_phone}
            onChange={(e) => updateField('contact_phone', e.target.value)}
            placeholder="+370 600 00000"
            className="mt-1 rounded-lg"
          />
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium text-gray-700">
          {t('invoiceSettings.invoiceSeries')}
        </Label>
        <Input
          value={form.invoice_series}
          onChange={(e) => updateField('invoice_series', e.target.value.toUpperCase())}
          placeholder="SF"
          className="mt-1 rounded-lg w-24"
          maxLength={10}
        />
        <p className="text-xs text-gray-500 mt-1">{t('invoiceSettings.invoiceSeriesHint')}</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <p className="text-sm text-green-700 font-medium">{t('invoiceSettings.saved')}</p>
        </div>
      )}

      <Button
        onClick={handleSave}
        disabled={saving}
        className="rounded-xl bg-indigo-600 hover:bg-indigo-700"
      >
        {saving ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t('common.saving')}</>
        ) : (
          t('invoiceSettings.save')
        )}
      </Button>
    </div>
  );
}
