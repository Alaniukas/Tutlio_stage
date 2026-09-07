import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getCached, invalidateCache, setCache } from '@/lib/dataCache';
import { schoolContractAllowsInstallmentPayment } from '@/lib/schoolContractPaymentGate';

export interface SchoolPaymentContract {
  id: string;
  student_id: string;
  contract_number?: string | null;
  annual_fee: number;
  additional_fee_amount?: number | null;
  additional_fee_purpose?: string | null;
  signing_status: string;
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
  paid_at: string | null;
  created_at: string;
  contract?: SchoolPaymentContract;
}

const PAYMENTS_CACHE_KEY = 'company_payments';

export function useSchoolPaymentsData() {
  const pc = getCached<any>(PAYMENTS_CACHE_KEY);
  const [orgId, setOrgId] = useState<string | null>(pc?.orgId ?? null);
  const [orgName, setOrgName] = useState(pc?.orgName ?? '');
  const [orgEmail, setOrgEmail] = useState(pc?.orgEmail ?? '');
  const [orgContactEmail, setOrgContactEmail] = useState(pc?.orgContactEmail ?? '');
  const [orgStripeConnected, setOrgStripeConnected] = useState<boolean>(pc?.orgStripeConnected ?? false);
  const [contracts, setContracts] = useState<SchoolPaymentContract[]>(pc?.contracts ?? []);
  const [installments, setInstallments] = useState<SchoolPaymentInstallment[]>(pc?.installments ?? []);
  const [loading, setLoading] = useState(!pc);

  const load = useCallback(async () => {
    if (!getCached(PAYMENTS_CACHE_KEY)) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: admin } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!admin?.organization_id) { setLoading(false); return; }
    setOrgId(admin.organization_id);

    let name = '';
    let email = '';
    let contactEmail = '';
    let stripeConnected = false;
    try {
      const org = await supabase
        .from('organizations')
        .select('name, email, features, stripe_account_id, stripe_onboarding_complete')
        .eq('id', admin.organization_id)
        .maybeSingle();
      name = org.data?.name || '';
      email = org.data?.email || '';
      const features = org.data?.features;
      const featObj = (
        features && typeof features === 'object' && !Array.isArray(features)
          ? features
          : {}
      ) as Record<string, unknown>;
      contactEmail =
        (typeof featObj.contact_email === 'string' && featObj.contact_email.trim()) ||
        (typeof featObj.school_contract_signing_email === 'string' && featObj.school_contract_signing_email.trim()) ||
        email;
      stripeConnected = !!org.data?.stripe_onboarding_complete && !!org.data?.stripe_account_id;
    } catch (err) {
      console.warn('[useSchoolPaymentsData] organization lookup failed:', err);
    }
    setOrgName(name);
    setOrgEmail(email);
    setOrgContactEmail(contactEmail);
    setOrgStripeConnected(stripeConnected);

    const cRes = await supabase
      .from('school_contracts')
      .select('id, student_id, contract_number, annual_fee, signing_status, archived_at, student:students(full_name, email, payer_email, payer_name)')
      .eq('organization_id', admin.organization_id)
      .is('archived_at', null)
      .eq('signing_status', 'signed')
      .order('created_at', { ascending: false });

    const cData = cRes.data || [];
    const contractIds = cData.map((row) => row.id).filter(Boolean);

    let installmentsRaw: SchoolPaymentInstallment[] = [];
    const chunkSize = 100;
    for (let offset = 0; offset < contractIds.length; offset += chunkSize) {
      const chunk = contractIds.slice(offset, offset + chunkSize);
      const iRes = await supabase
        .from('school_payment_installments')
        .select('*, contract:school_contracts(id, student_id, contract_number, annual_fee, additional_fee_amount, additional_fee_purpose, signing_status, organization_id, archived_at, student:students(full_name, email, payer_email, payer_name))')
        .in('contract_id', chunk)
        .order('due_date', { ascending: true });
      installmentsRaw = installmentsRaw.concat((iRes.data || []) as SchoolPaymentInstallment[]);
    }

    const filtered = installmentsRaw.filter(
      (i: any) =>
        i.contract?.organization_id === admin.organization_id &&
        !i.contract?.archived_at &&
        schoolContractAllowsInstallmentPayment(i.contract?.signing_status),
    );
    setContracts(cData as unknown as SchoolPaymentContract[]);
    setInstallments(filtered);
    setCache(PAYMENTS_CACHE_KEY, {
      orgId: admin.organization_id,
      orgName: name,
      orgEmail: email,
      orgContactEmail: contactEmail,
      orgStripeConnected: stripeConnected,
      contracts: cData,
      installments: filtered,
    });
    setLoading(false);
  }, []);

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
    contracts,
    installments,
    loading,
    reload,
    setInstallments,
  };
}
