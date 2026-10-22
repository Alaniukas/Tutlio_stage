import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCached, invalidateCache, setCache } from '@/lib/dataCache';
import { schoolContractAllowsInstallmentPayment } from '@/lib/schoolContractPaymentGate';
import { resolveAuthUser } from '@/lib/authSession';
import { fetchAllRows } from '@/lib/fetchAllRows';

export interface SchoolPaymentContract {
  id: string;
  student_id: string;
  contract_number?: string | null;
  annual_fee: number;
  additional_fee_amount?: number | null;
  additional_fee_purpose?: string | null;
  signing_status: string;
  organization_id?: string;
  archived_at?: string | null;
  staff_document_type?: string | null;
  party_kind?: string | null;
  student?: { full_name: string; email: string; payer_email: string | null; payer_name: string | null };
}

export interface SchoolPaymentInstallment {
  id: string;
  contract_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  payment_status: 'pending' | 'paid' | 'overdue' | 'failed';
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id?: string | null;
  paid_at: string | null;
  created_at: string;
  contract?: SchoolPaymentContract;
}

const PAYMENTS_CACHE_KEY = 'company_payments';

export function useSchoolPaymentsData({ includePaidHistory = false }: { includePaidHistory?: boolean } = {}) {
  const cacheKey = includePaidHistory ? `${PAYMENTS_CACHE_KEY}:history` : PAYMENTS_CACHE_KEY;
  const pc = getCached<any>(cacheKey);
  const [orgId, setOrgId] = useState<string | null>(pc?.orgId ?? null);
  const [orgName, setOrgName] = useState(pc?.orgName ?? '');
  const [orgEmail, setOrgEmail] = useState(pc?.orgEmail ?? '');
  const [orgContactEmail, setOrgContactEmail] = useState(pc?.orgContactEmail ?? '');
  const [orgStripeConnected, setOrgStripeConnected] = useState<boolean>(pc?.orgStripeConnected ?? false);
  const [orgFeatures, setOrgFeatures] = useState<Record<string, unknown>>(pc?.orgFeatures ?? {});
  const [contracts, setContracts] = useState<SchoolPaymentContract[]>(pc?.contracts ?? []);
  const [installments, setInstallments] = useState<SchoolPaymentInstallment[]>(pc?.installments ?? []);
  const [loading, setLoading] = useState(!pc);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!getCached(cacheKey)) setLoading(true);
    setError(false);
    try {
      const user = await resolveAuthUser();
      if (!user) { setLoading(false); return; }

      const { data: admin, error: adminError } = await supabase
        .from('organization_admins')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (adminError) throw new Error(adminError.message);
      if (!admin?.organization_id) { setLoading(false); return; }
      setOrgId(admin.organization_id);

      let name = '';
      let email = '';
      let contactEmail = '';
      let stripeConnected = false;
      let featuresObj: Record<string, unknown> = {};
      try {
        const org = await supabase
          .from('organizations')
          .select('name, email, features, stripe_account_id, stripe_onboarding_complete')
          .eq('id', admin.organization_id)
          .maybeSingle();
        name = org.data?.name || '';
        email = org.data?.email || '';
        const features = org.data?.features;
        featuresObj = (
          features && typeof features === 'object' && !Array.isArray(features)
            ? features
            : {}
        ) as Record<string, unknown>;
        setOrgFeatures(featuresObj);
        contactEmail =
          (typeof featuresObj.contact_email === 'string' && featuresObj.contact_email.trim()) ||
          (typeof featuresObj.school_contract_signing_email === 'string' && featuresObj.school_contract_signing_email.trim()) ||
          email;
        stripeConnected = !!org.data?.stripe_onboarding_complete && !!org.data?.stripe_account_id;
      } catch (err) {
        console.warn('[useSchoolPaymentsData] organization lookup failed:', err);
      }
      setOrgName(name);
      setOrgEmail(email);
      setOrgContactEmail(contactEmail);
      setOrgStripeConnected(stripeConnected);

      let contractsQuery = supabase
        .from('school_contracts')
        .select('id, organization_id, student_id, contract_number, annual_fee, signing_status, archived_at, staff_document_type, party_kind, student:students(full_name, email, payer_email, payer_name)')
        .eq('organization_id', admin.organization_id)
        .is('staff_document_type', null)
        .or('party_kind.is.null,party_kind.eq.student')
        .order('created_at', { ascending: false })
        .order('id');
      if (!includePaidHistory) {
        contractsQuery = contractsQuery.is('archived_at', null).eq('signing_status', 'signed');
      }

      const contractRows = await fetchAllRows((from, to) => contractsQuery.range(from, to));
      const allContracts: SchoolPaymentContract[] = contractRows.map((contract) => ({
        ...contract,
        student: Array.isArray(contract.student) ? contract.student[0] : contract.student,
      }));
      // Only current signed contracts may create schedules or outstanding debt.
      // A historical receipt remains valid even if its contract is now unsigned.
      const cData = allContracts.filter((contract) => !contract.archived_at
        && schoolContractAllowsInstallmentPayment(contract.signing_status));
      const contractIds = allContracts.map((row) => row.id);

      const installmentsRaw: SchoolPaymentInstallment[] = [];
      const chunkSize = 100;
      for (let offset = 0; offset < contractIds.length; offset += chunkSize) {
        const chunk = contractIds.slice(offset, offset + chunkSize);
        const page = await fetchAllRows<SchoolPaymentInstallment>((from, to) => supabase
          .from('school_payment_installments')
          .select('*, contract:school_contracts!inner(id, student_id, contract_number, annual_fee, additional_fee_amount, additional_fee_purpose, signing_status, organization_id, archived_at, staff_document_type, party_kind, student:students(full_name, email, payer_email, payer_name))')
          .in('contract_id', chunk)
          .eq('contract.organization_id', admin.organization_id)
          .is('contract.staff_document_type', null)
          .order('due_date', { ascending: true })
          .order('id')
          .range(from, to));
        installmentsRaw.push(...page);
      }

      const filtered = installmentsRaw.filter(
        (i) =>
          i.contract?.organization_id === admin.organization_id &&
          !i.contract.staff_document_type &&
          (!i.contract.party_kind || i.contract.party_kind === 'student') &&
          ((!i.contract.archived_at && schoolContractAllowsInstallmentPayment(i.contract.signing_status))
            || (includePaidHistory && i.payment_status === 'paid')),
      );
      setContracts(cData);
      setInstallments(filtered);
      setCache(cacheKey, {
        orgId: admin.organization_id,
        orgName: name,
        orgEmail: email,
        orgContactEmail: contactEmail,
        orgStripeConnected: stripeConnected,
        orgFeatures: featuresObj,
        contracts: cData,
        installments: filtered,
      });
    } catch (err) {
      console.error('[useSchoolPaymentsData] payments load failed:', err);
      invalidateCache(cacheKey);
      setContracts([]);
      setInstallments([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, includePaidHistory]);

  useEffect(() => { void load(); }, [load]);

  const reload = useCallback(() => {
    invalidateCache(PAYMENTS_CACHE_KEY);
    void load();
  }, [load]);

  return {
    orgId,
    orgName,
    orgEmail,
    orgContactEmail,
    orgStripeConnected,
    orgFeatures,
    contracts,
    installments,
    loading,
    error,
    reload,
    setInstallments,
  };
}
