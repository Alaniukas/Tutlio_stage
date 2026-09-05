/**
 * School contracts list — lightweight summary load + paginated full rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  matchesContractFilter,
  matchesContractKindFilter,
  type SchoolContractFilter,
  type SchoolContractFilterInput,
  type SchoolContractFilterOptions,
  type SchoolContractKindFilter,
} from './schoolContractFilters.js';
import { extraLessonsContractSearchText } from './extraLessonsContractList.js';

export const CONTRACTS_PAGE_SIZE = 20;

export const CONTRACTS_FULL_SELECT =
  '*, media_publicity_consent, order_snapshot, class_group_id, unit_price_eur, class_group:school_class_groups!school_contracts_class_group_id_fkey(name, tutor:profiles!school_class_groups_tutor_id_fkey(full_name)), student:students(full_name, email, phone, payer_name, payer_email, payer_phone, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date, media_publicity_consent), signatures:school_contract_signatures(role, status, signed_at, gosign_transaction_id, manually_marked_at, signed_pdf_path), installments:school_payment_installments(installment_number, amount, due_date, payment_status)';

export const CONTRACTS_FULL_SELECT_FALLBACK =
  '*, media_publicity_consent, order_snapshot, class_group_id, unit_price_eur, student:students(full_name, email, phone, payer_name, payer_email, payer_phone, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date, media_publicity_consent), signatures:school_contract_signatures(role, status, signed_at, gosign_transaction_id, manually_marked_at, signed_pdf_path), installments:school_payment_installments(installment_number, amount, due_date, payment_status)';

export const CONTRACTS_SUMMARY_SELECT =
  'id, contract_number, signing_status, kind, created_at, completion_submitted_at, media_publicity_consent, order_snapshot, class_group_id, unit_price_eur, annual_fee, additional_fee_amount, additional_fee_purpose, sent_at, signed_at, pdf_url, signed_contract_url, student:students(full_name, payer_name, parent_secondary_name, payer_email, payer_phone, payer_personal_code, student_address, student_city, child_birth_date, media_publicity_consent), signatures:school_contract_signatures(role, status, signed_pdf_path), class_group:school_class_groups!school_contracts_class_group_id_fkey(name, tutor:profiles!school_class_groups_tutor_id_fkey(full_name))';

export const CONTRACTS_SUMMARY_SELECT_FALLBACK =
  'id, contract_number, signing_status, kind, created_at, completion_submitted_at, media_publicity_consent, order_snapshot, class_group_id, unit_price_eur, annual_fee, additional_fee_amount, additional_fee_purpose, sent_at, signed_at, pdf_url, signed_contract_url, student:students(full_name, payer_name, parent_secondary_name, payer_email, payer_phone, payer_personal_code, student_address, student_city, child_birth_date, media_publicity_consent), signatures:school_contract_signatures(role, status, signed_pdf_path)';

export type ContractSummaryRow = SchoolContractFilterInput & {
  id: string;
  kind?: string | null;
  contract_number?: string | null;
  created_at?: string | null;
  order_snapshot?: unknown;
  class_group?: { name?: string | null; tutor?: { full_name?: string | null } | null } | null;
  student?: {
    full_name?: string | null;
    payer_name?: string | null;
    parent_secondary_name?: string | null;
  } | null;
};

function normalizeSearchText(value: string): string {
  return value
    .replace(/ą/g, 'a').replace(/Ą/g, 'A')
    .replace(/č/g, 'c').replace(/Č/g, 'C')
    .replace(/ę/g, 'e').replace(/Ę/g, 'E')
    .replace(/ė/g, 'e').replace(/Ė/g, 'E')
    .replace(/į/g, 'i').replace(/Į/g, 'I')
    .replace(/š/g, 's').replace(/Š/g, 'S')
    .replace(/ų/g, 'u').replace(/Ų/g, 'U')
    .replace(/ū/g, 'u').replace(/Ū/g, 'U')
    .replace(/ž/g, 'z').replace(/Ž/g, 'Z');
}

function searchable(value: string): string {
  return normalizeSearchText(value).toLowerCase();
}

export function filterContractSummaries(
  summaries: ContractSummaryRow[],
  opts: {
    isSchoolView: boolean;
    contractFilter: SchoolContractFilter | 'unsigned';
    contractKindFilter: SchoolContractKindFilter;
    contractSearch: string;
    filterOptions?: SchoolContractFilterOptions;
  },
): ContractSummaryRow[] {
  const q = searchable(opts.contractSearch.trim());
  return summaries.filter((c) => {
    if (opts.isSchoolView) {
      if (!matchesContractFilter(opts.contractFilter as SchoolContractFilter, c, opts.isSchoolView, opts.filterOptions)) {
        return false;
      }
      if (!matchesContractKindFilter(opts.contractKindFilter, c.kind)) return false;
    } else {
      if (opts.contractFilter === 'signed' && c.signing_status !== 'signed') return false;
      if (opts.contractFilter === 'unsigned' && c.signing_status === 'signed') return false;
    }
    if (!q) return true;
    const haystack = searchable(
      [
        c.student?.full_name,
        c.student?.payer_name,
        c.student?.parent_secondary_name,
        c.contract_number,
        extraLessonsContractSearchText(c),
      ]
        .filter(Boolean)
        .join(' '),
    );
    return haystack.includes(q);
  });
}

export function paginateIds<T extends { id: string }>(rows: T[], page: number): { pageRows: T[]; total: number; pageCount: number; safePage: number } {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / CONTRACTS_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  const start = safePage * CONTRACTS_PAGE_SIZE;
  return {
    pageRows: rows.slice(start, start + CONTRACTS_PAGE_SIZE),
    total,
    pageCount,
    safePage,
  };
}

export async function fetchContractSummaries(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<{ data: ContractSummaryRow[]; error: Error | null }> {
  let data: unknown = null;
  let error: { message: string } | null = null;
  ({ data, error } = await supabase
    .from('school_contracts')
    .select(CONTRACTS_SUMMARY_SELECT)
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('created_at', { ascending: false }));
  if (error) {
    ({ data, error } = await supabase
      .from('school_contracts')
      .select(CONTRACTS_SUMMARY_SELECT_FALLBACK)
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .order('created_at', { ascending: false }));
  }
  return { data: (data || []) as unknown as ContractSummaryRow[], error: error ? new Error(error.message) : null };
}

export async function fetchContractsByIds<T>(
  supabase: SupabaseClient,
  organizationId: string,
  ids: string[],
): Promise<{ data: T[]; error: Error | null }> {
  if (!ids.length) return { data: [], error: null };
  let { data, error } = await supabase
    .from('school_contracts')
    .select(CONTRACTS_FULL_SELECT)
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .in('id', ids);
  if (error) {
    ({ data, error } = await supabase
      .from('school_contracts')
      .select(CONTRACTS_FULL_SELECT_FALLBACK)
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .in('id', ids));
  }
  if (error) return { data: [], error: new Error(error.message) };
  const order = new Map(ids.map((id, i) => [id, i]));
  const sorted = [...(data || [])].sort(
    (a, b) => (order.get((a as { id: string }).id) ?? 0) - (order.get((b as { id: string }).id) ?? 0),
  );
  return { data: sorted as T[], error: null };
}

export async function fetchAllFilteredContracts<T>(
  supabase: SupabaseClient,
  organizationId: string,
  ids: string[],
): Promise<{ data: T[]; error: Error | null }> {
  if (!ids.length) return { data: [], error: null };
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
  const all: T[] = [];
  for (const chunk of chunks) {
    const { data, error } = await fetchContractsByIds<T>(supabase, organizationId, chunk);
    if (error) return { data: [], error };
    all.push(...data);
  }
  const order = new Map(ids.map((id, i) => [id, i]));
  all.sort((a, b) => (order.get((a as { id: string }).id) ?? 0) - (order.get((b as { id: string }).id) ?? 0));
  return { data: all, error: null };
}
