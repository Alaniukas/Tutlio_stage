import { useRef, useState, useEffect } from 'react';
import mammoth from 'mammoth';
import { supabase } from '@/lib/supabase';
import { getCached, setCache, invalidateCache } from '@/lib/dataCache';
import { authHeaders } from '@/lib/apiHelpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, FileText, Send, CheckCircle, Edit2, Trash2, PenLine, Settings, Save, Search, Download, MoreVertical } from 'lucide-react';
import Toast from '@/components/Toast';
import { sendEmail } from '@/lib/email';
import { useTranslation } from '@/lib/i18n';
import { sortStudentsByFullName } from '@/lib/sortStudentsByFullName';
import { useLocation } from 'react-router-dom';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { schoolContractPdfStoragePath } from '@/lib/schoolContractPdfPath';
import { openContractFileInNewTab, uploadContractFile } from '@/lib/contractStorage';
import { isManualSignedFile, MANUAL_SIGNED_FILE_ACCEPT, mimeForManualSignedFile } from '@/lib/schoolFinanceExport';
import { fmtMoney } from '@/lib/marketMoney';
import { validateDocxTemplateBytes } from '@/lib/docxTemplateValidation';
import {
  mergeSchoolContractSigningSettings,
  parseSchoolContractSigningSettings,
  type SchoolContractSigningSettings,
} from '@/lib/schoolContractSigningSettings';
import {
  countContractsByFilter,
  currentContractPdfPath,
  matchesContractFilter,
  schoolCanInitiateSignature,
  shouldPromptSchoolSignedOnScan,
  type SchoolContractFilter,
} from '@/lib/schoolContractFilters';
import { buildSchoolContractExportRows, schoolContractsExportFilename } from '@/lib/schoolContractsExport';
import { downloadSchoolContractsXlsx } from '@/lib/schoolContractsXlsxExport';
import { fetchOrganizationRow } from '@/lib/orgLookup';
import ExtraLessonsOfferDialog from '@/components/company/ExtraLessonsOfferDialog';

interface Student {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  grade?: string | null;
  payer_name: string | null;
  payer_email: string | null;
  payer_phone?: string | null;
  payer_personal_code?: string | null;
  parent_secondary_name?: string | null;
  parent_secondary_email?: string | null;
  parent_secondary_phone?: string | null;
  parent_secondary_personal_code?: string | null;
  parent_secondary_address?: string | null;
  student_address?: string | null;
  student_city?: string | null;
  child_birth_date?: string | null;
}

interface Template {
  id: string;
  name: string;
  body: string;
  annual_fee_default: number | null;
  pdf_url?: string | null;
}

interface Contract {
  id: string;
  organization_id: string;
  template_id: string | null;
  contract_number?: string | null;
  student_id: string;
  filled_body: string;
  annual_fee: number;
  signing_status: 'draft' | 'sent' | 'awaiting_school_signature' | 'signed_by_school' | 'signed';
  signed_at: string | null;
  sent_at: string | null;
  created_at: string;
  pdf_url?: string | null;
  signed_contract_url?: string | null;
  signed_uploaded_at?: string | null;
  completion_submitted_at?: string | null;
  media_publicity_consent?: string | null;
  additional_fee_amount?: number | null;
  additional_fee_purpose?: string | null;
  kind?: 'annual' | 'extra_lessons' | null;
  accepted_at?: string | null;
  signatures?: { role: string; status: string; signed_at?: string | null; gosign_transaction_id?: string | null; manually_marked_at?: string | null; signed_pdf_path?: string | null }[];
  installments?: { installment_number: number; amount: number; due_date: string | null; payment_status: string | null }[];
  student?: { full_name: string; email: string; phone?: string | null; payer_name: string | null; payer_email: string | null; payer_phone?: string | null; payer_personal_code?: string | null; parent_secondary_name?: string | null; parent_secondary_email?: string | null; parent_secondary_phone?: string | null; parent_secondary_personal_code?: string | null; parent_secondary_address?: string | null; student_address?: string | null; student_city?: string | null; child_birth_date?: string | null; media_publicity_consent?: string | null };
}

interface InstallmentDraft {
  amount: string;
  due_date: string;
}

/** 20% nuolaida metiniam mokesčiui: įrašoma jau sumažinta suma (sutartis, mokėjimai, įmokų validacija). */
export const ANNUAL_FEE_DISCOUNT_RATE = 0.2;

const parseAnnualFeeInput = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};

export const discountedAnnualFee = (value: string): string => {
  const n = parseAnnualFeeInput(value);
  if (n == null || n < 0) return '';
  return (Math.round(n * (1 - ANNUAL_FEE_DISCOUNT_RATE) * 100) / 100).toFixed(2);
};

const PLACEHOLDERS = ['{{contract_number}}', '{{student_name}}', '{{student_email}}', '{{student_phone}}', '{{parent_name}}', '{{parent_email}}', '{{parent_phone}}', '{{parent_personal_code}}', '{{parent_address}}', '{{parent2_name}}', '{{parent2_email}}', '{{parent2_phone}}', '{{parent2_personal_code}}', '{{parent2_address}}', '{{parent2_adress}}', '{{parent2_block}}', '{{parent2_inline}}', '{{child_birth_date}}', '{{address}}', '{{annual_fee}}', '{{date}}', '{{school_name}}'];

function fillPlaceholders(body: string, data: Record<string, string>): string {
  let result = body;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  // Avoid leaving large empty gaps when optional blocks/placeholders are blank.
  result = result
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
  return result;
}

function normalizePdfText(value: string): string {
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

/** DOCX uploads often have empty MIME in Chromium; Storage needs the correct Content-Type */
function schoolTemplateUploadContentType(file: File, fileExt: string): string {
  const ft = file.type?.trim();
  if (ft && ft !== '' && ft !== 'application/octet-stream') return ft;
  if (fileExt === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (fileExt === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

/** Template display name from an uploaded file name: extension stripped, capped length. */
function templateNameFromFileName(fileName: string): string {
  return fileName
    .replace(/\.(pdf|docx)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
}

type ContractInstallmentRow = {
  installment_number: number;
  amount: number;
  due_date: string | null;
  payment_status: string | null;
};

function contractInstallmentsForEmail(installments?: ContractInstallmentRow[] | null) {
  const rows = [...(installments || [])].sort((a, b) => a.installment_number - b.installment_number);
  if (rows.length <= 1) return [];
  return rows.map((r) => ({
    number: r.installment_number,
    amount: Number(r.amount).toFixed(2),
    dueDate: r.due_date ? new Date(r.due_date).toLocaleDateString('lt-LT') : '—',
    paid: r.payment_status === 'paid',
  }));
}

function contractInstallmentEmailExtras(contract: {
  installments?: ContractInstallmentRow[] | null;
  additional_fee_amount?: number | string | null;
  additional_fee_purpose?: string | null;
}) {
  const installments = contractInstallmentsForEmail(contract.installments);
  if (!installments.length) return {};
  return {
    installments,
    additionalFeeAmount:
      Number(contract.additional_fee_amount || 0) > 0
        ? Number(contract.additional_fee_amount).toFixed(2)
        : undefined,
    additionalFeePurpose: contract.additional_fee_purpose || undefined,
  };
}

const CONTRACTS_CACHE_KEY = 'company_contracts';
const CONTRACTS_SELECT = '*, media_publicity_consent, student:students(full_name, email, phone, payer_name, payer_email, payer_phone, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date, media_publicity_consent), signatures:school_contract_signatures(role, status, signed_at, gosign_transaction_id, manually_marked_at, signed_pdf_path), installments:school_payment_installments(installment_number, amount, due_date, payment_status)';

export default function CompanyContracts() {
  const { t: tr } = useTranslation();
  const location = useLocation();
  const isSchoolView = location.pathname.startsWith('/school');
  const cc = getCached<any>(CONTRACTS_CACHE_KEY);
  const [orgId, setOrgId] = useState<string | null>(cc?.orgId ?? null);
  const [orgName, setOrgName] = useState(cc?.orgName ?? '');
  const [orgEmail, setOrgEmail] = useState(cc?.orgEmail ?? '');
  const [orgFeatures, setOrgFeatures] = useState<Record<string, unknown>>(cc?.orgFeatures ?? {});
  const [eSignEnabled, setESignEnabled] = useState(Boolean(cc?.eSignEnabled));
  const [signingSettings, setSigningSettings] = useState<SchoolContractSigningSettings>(
    cc?.signingSettings ?? parseSchoolContractSigningSettings({}, cc?.orgEmail ?? ''),
  );
  const [savingSigningSettings, setSavingSigningSettings] = useState(false);
  const [templates, setTemplates] = useState<Template[]>(cc?.templates ?? []);
  const [contracts, setContracts] = useState<Contract[]>(cc?.contracts ?? []);
  const [students, setStudents] = useState<Student[]>(cc?.students ?? []);
  const [loading, setLoading] = useState(!cc);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [tForm, setTForm] = useState({ name: '', body: '', annual_fee_default: '', pdf_url: '' });
  const [templatePdfFile, setTemplatePdfFile] = useState<File | null>(null);
  const [extraOfferOpen, setExtraOfferOpen] = useState(false);
  const [classGroups, setClassGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [isTemplateDragActive, setIsTemplateDragActive] = useState(false);
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);

  const [contractOpen, setContractOpen] = useState(false);
  const [contractStudentSearch, setContractStudentSearch] = useState('');
  const [cForm, setCForm] = useState({ student_id: '', template_id: '', contract_number: '', annual_fee: '', filled_body: '' });
  const [contractParentName, setContractParentName] = useState('');
  const [contractParentEmail, setContractParentEmail] = useState('');
  const [contractParentPhone, setContractParentPhone] = useState('');
  const [contractParentPersonalCode, setContractParentPersonalCode] = useState('');
  const [contractChildBirthDate, setContractChildBirthDate] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [parentsWillFillMissing, setParentsWillFillMissing] = useState(false);
  const [sendImmediately, setSendImmediately] = useState(true);
  const [paymentMode, setPaymentMode] = useState<'full' | 'installments'>('full');
  const [installmentRows, setInstallmentRows] = useState<InstallmentDraft[]>([{ amount: '', due_date: '' }]);
  const [hasAdditionalFee, setHasAdditionalFee] = useState(false);
  const [additionalFeePurpose, setAdditionalFeePurpose] = useState('');
  const [additionalFeeAmount, setAdditionalFeeAmount] = useState('');
  const [applyFeeDiscount, setApplyFeeDiscount] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<'contracts' | 'templates'>('contracts');

  // Contract list filter (schools accumulate many contracts — no more scrolling).
  const [contractFilter, setContractFilter] = useState<SchoolContractFilter | 'unsigned'>('all');
  const [contractSearch, setContractSearch] = useState('');
  const [exportingContracts, setExportingContracts] = useState(false);

  useEffect(() => { if (!getCached(CONTRACTS_CACHE_KEY)) load(); }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('success') === '1' || params.get('cancelled') === '1' || params.get('installment')) {
      reload();
    }
  }, [location.search]);

  const load = async () => {
    if (!getCached(CONTRACTS_CACHE_KEY)) setLoading(true);
    try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: admin } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!admin?.organization_id) return;
    setOrgId(admin.organization_id);
    const org = await fetchOrganizationRow<{
      name?: string;
      email?: string;
      features?: Record<string, unknown>;
    }>(supabase as any, admin.organization_id, 'name, email, features');
    const name = org?.name || '';
    const email = org?.email || '';
    const features = org?.features && typeof org.features === 'object'
      ? org.features as Record<string, unknown>
      : {};
    const nextSigningSettings = parseSchoolContractSigningSettings(features, email);
    setOrgName(name);
    setOrgEmail(email);
    setOrgFeatures(features);
    setESignEnabled(features.school_contract_esign === true);
    setSigningSettings(nextSigningSettings);

    const [tRes, cRes, sRes] = await Promise.all([
      supabase.from('school_contract_templates').select('*').eq('organization_id', admin.organization_id).order('created_at', { ascending: false }),
      supabase.from('school_contracts').select(CONTRACTS_SELECT).eq('organization_id', admin.organization_id).is('archived_at', null).order('created_at', { ascending: false }).limit(2000),
      supabase.from('students').select('id, full_name, email, phone, grade, payer_name, payer_email, payer_phone, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date, media_publicity_consent').eq('organization_id', admin.organization_id).order('full_name'),
    ]);

    const tData = tRes.data || [];
    const cData = cRes.data || [];
    const sData = sRes.data || [];
    setTemplates(tData);
    setContracts(cData);
    setStudents(sData);
    setCache(CONTRACTS_CACHE_KEY, {
      orgId: admin.organization_id,
      orgName: name,
      orgEmail: email,
      orgFeatures: features,
      eSignEnabled: features.school_contract_esign === true,
      signingSettings: nextSigningSettings,
      templates: tData,
      contracts: cData,
      students: sData,
    });
    } catch (err) {
      console.error('[CompanyContracts] load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const reload = () => { invalidateCache(CONTRACTS_CACHE_KEY); load(); };

  /**
   * Status polling must not put the whole page back into its initial loading
   * state. Refresh only contract cards so settings/forms stay untouched and no
   * spinner flashes while the server reconciles GoSign in the background.
   */
  const refreshContractsSilently = async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from('school_contracts')
      .select(CONTRACTS_SELECT)
      .eq('organization_id', orgId)
      .is('archived_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[CompanyContracts] background contract refresh failed:', error.message);
      return;
    }
    const nextContracts = (data || []) as Contract[];
    setContracts(nextContracts);
    const cached = getCached<any>(CONTRACTS_CACHE_KEY);
    if (cached) setCache(CONTRACTS_CACHE_KEY, { ...cached, contracts: nextContracts });
  };

  useEffect(() => {
    if (!orgId) return;
    const refresh = () => { void refreshContractsSilently(); };
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'tutlio:school-contract-updated') refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'tutlio:school-contract-updated') refresh();
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    const hasPending = contracts.some((contract) =>
      ['sent', 'awaiting_school_signature', 'signed_by_school'].includes(contract.signing_status),
    );
    const timer = hasPending ? window.setInterval(refresh, 30_000) : undefined;
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      if (timer) window.clearInterval(timer);
    };
  }, [orgId, contracts.map((contract) => `${contract.id}:${contract.signing_status}`).join('|')]);

  const saveSigningSettings = async () => {
    if (!orgId) return;
    const email = signingSettings.email.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setToast({ message: 'Įveskite teisingą sutarčių srauto el. pašto adresą.', type: 'error' });
      return;
    }
    if (!signingSettings.reason.trim()) {
      setToast({ message: 'Įveskite el. parašo paskirtį.', type: 'error' });
      return;
    }
    setSavingSigningSettings(true);
    const mergedFeatures = mergeSchoolContractSigningSettings(orgFeatures, signingSettings);
    const { error } = await supabase.from('organizations').update({ features: mergedFeatures }).eq('id', orgId);
    setSavingSigningSettings(false);
    if (error) {
      setToast({ message: error.message, type: 'error' });
      return;
    }
    setOrgFeatures(mergedFeatures);
    setSigningSettings(parseSchoolContractSigningSettings(mergedFeatures, orgEmail));
    invalidateCache(CONTRACTS_CACHE_KEY);
    setToast({ message: 'El. pasirašymo nustatymai išsaugoti.', type: 'success' });
  };

  const saveTemplate = async () => {
    if (!orgId) return;
    if (!isSchoolView && !tForm.name.trim()) return;
    if (isSchoolView && !templatePdfFile && !tForm.pdf_url) return;
    setSaving(true);
    const resolvedTemplateName = isSchoolView
      ? (tForm.name.trim()
        || (templatePdfFile ? templateNameFromFileName(templatePdfFile.name) : '')
        || `Sutarties sablonas ${new Date().toLocaleDateString('lt-LT')}`)
      : tForm.name.trim();

    const payload: {
      organization_id: string;
      name: string;
      body: string;
      annual_fee_default: number | null;
      pdf_url: string | null;
    } = {
      organization_id: orgId,
      name: resolvedTemplateName,
      body: tForm.body,
      annual_fee_default: tForm.annual_fee_default.trim() !== '' ? Number(tForm.annual_fee_default) : null,
      pdf_url: tForm.pdf_url || null,
    };

    if (templatePdfFile) {
      const fileExt = templatePdfFile.name.split('.').pop()?.toLowerCase() || 'pdf';
      if (fileExt === 'docx') {
        const validationError = validateDocxTemplateBytes(await templatePdfFile.arrayBuffer());
        if (validationError) {
          setToast({ message: validationError, type: 'error' });
          setSaving(false);
          return;
        }
      }
      const hdrs = await authHeaders();
      if (!hdrs.Authorization) {
        setToast({ message: tr('school.toastTemplateMustBeLogged'), type: 'error' });
        setSaving(false);
        return;
      }

      const signRes = await fetch('/api/school-contract-template-signed-upload-url', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ organizationId: orgId, extension: fileExt }),
      });
      const signJson = (await signRes.json().catch(() => ({}))) as {
        path?: string;
        token?: string;
        error?: string;
      };
      if (
        !signRes.ok ||
        typeof signJson.path !== 'string' ||
        typeof signJson.token !== 'string'
      ) {
        const msg =
          typeof signJson.error === 'string' && signJson.error
            ? signJson.error
            : tr('school.toastTemplateUploadPrepareFail');
        setToast({ message: msg, type: 'error' });
        setSaving(false);
        return;
      }

      const contentType = schoolTemplateUploadContentType(templatePdfFile, fileExt);
      const { error: uploadErr } = await supabase.storage
        .from('school-contracts')
        .uploadToSignedUrl(signJson.path, signJson.token, templatePdfFile, {
          cacheControl: '3600',
          upsert: false,
          contentType,
        });

      if (uploadErr) {
        setToast({ message: uploadErr.message, type: 'error' });
        setSaving(false);
        return;
      }
      const { data } = supabase.storage.from('school-contracts').getPublicUrl(signJson.path);
      payload.pdf_url = data.publicUrl;

      // If admin uploads DOCX template, extract text once and keep as editable body placeholders source.
      // This allows populating contract fields from the exact template wording and still sending PDF output.
      // Schools included: their `filled_body` (and any legacy text fallback) must carry
      // the real contract wording from the uploaded DOCX, not the generic default body.
      if (fileExt === 'docx') {
        try {
          const buffer = await templatePdfFile.arrayBuffer();
          const extracted = await mammoth.extractRawText({ arrayBuffer: buffer });
          if ((extracted.value || '').trim()) {
            payload.body = extracted.value;
          }
        } catch {
          // Ignore extraction errors; keep existing template body.
        }
      }
    }

    if (editTemplate) {
      const { error } = await supabase.from('school_contract_templates').update(payload).eq('id', editTemplate.id);
      if (error) { setToast({ message: error.message, type: 'error' }); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('school_contract_templates').insert(payload);
      if (error) { setToast({ message: error.message, type: 'error' }); setSaving(false); return; }
    }

    setSaving(false);
    setTemplateOpen(false);
    setEditTemplate(null);
    setTemplatePdfFile(null);
    setTForm({ name: '', body: tr('school.contract.defaultBody'), annual_fee_default: '', pdf_url: '' });
    setToast({ message: editTemplate ? tr('school.toastTemplateUpdated') : tr('school.toastTemplateCreated'), type: 'success' });
    reload();
  };

  const setTemplateFileFromCandidate = (candidate: File | null) => {
    if (!candidate) return;
    const lowerName = candidate.name.toLowerCase();
    const isDocx =
      candidate.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx');
    const isPdf = candidate.type === 'application/pdf' || lowerName.endsWith('.pdf');
    // School contracts are generated by filling the uploaded DOCX, so the layout
    // matches the uploaded document. A PDF template can't be filled — it would
    // silently degrade to the synthesized text PDF, so schools may only use DOCX.
    const isAllowed = isSchoolView ? isDocx : isDocx || isPdf;
    if (!isAllowed) {
      setToast({
        message: isSchoolView
          ? 'Įkelkite DOCX formato šabloną. Tik DOCX failą sistema gali užpildyti mokinio duomenimis nekeisdama jūsų dokumento formato.'
          : 'Galima ikelti tik PDF arba DOCX faila.',
        type: 'error',
      });
      return;
    }
    setTemplatePdfFile(candidate);
    // School admins pick a file instead of typing a name, so the template name
    // follows the newest uploaded file (they can still adjust it in the input).
    if (isSchoolView) {
      const derived = templateNameFromFileName(candidate.name);
      if (derived) setTForm((prev) => ({ ...prev, name: derived }));
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm(tr('school.confirmDeleteTemplate'))) return;
    await supabase.from('school_contract_templates').delete().eq('id', id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const openEditTemplate = (t: Template) => {
    setEditTemplate(t);
    setTemplatePdfFile(null);
    setTForm({ name: t.name, body: t.body, annual_fee_default: t.annual_fee_default?.toString() || '', pdf_url: t.pdf_url || '' });
    setTemplateOpen(true);
  };

  const openCreateContract = () => {
    setCForm({ student_id: '', template_id: '', contract_number: '', annual_fee: isSchoolView ? '300' : '', filled_body: tr('school.contract.defaultBody') });
    setContractParentName('');
    setContractParentEmail('');
    setContractParentPhone('');
    setContractParentPersonalCode('');
    setContractChildBirthDate('');
    setContractAddress('');
    setParentsWillFillMissing(false);
    setSendImmediately(true);
    setPaymentMode('full');
    setInstallmentRows([{ amount: '', due_date: '' }]);
    setHasAdditionalFee(false);
    setAdditionalFeePurpose('');
    setAdditionalFeeAmount('');
    setApplyFeeDiscount(false);
    setContractStudentSearch('');
    setContractOpen(true);
  };

  const buildFilledBody = (opts: {
    contractNumber?: string;
    templateBody?: string;
    annualFee: string;
    studentId: string;
    parentName?: string;
    parentEmail?: string;
    parentPhone?: string;
    parentPersonalCode?: string;
    parent2Name?: string;
    parent2Email?: string;
    parent2Phone?: string;
    parent2PersonalCode?: string;
    parent2Address?: string;
    childBirthDate?: string;
    address?: string;
  }) => {
    const s = students.find((st) => st.id === opts.studentId);
    const sourceBody = opts.templateBody ?? cForm.filled_body;
    const contractNumber = opts.contractNumber ?? cForm.contract_number ?? '';
    const parentName = opts.parentName ?? contractParentName ?? s?.payer_name ?? '';
    const parentEmail = opts.parentEmail ?? contractParentEmail ?? s?.payer_email ?? '';
    const parentPhone = opts.parentPhone ?? contractParentPhone ?? s?.payer_phone ?? '';
    const parentPersonalCode = opts.parentPersonalCode ?? contractParentPersonalCode ?? s?.payer_personal_code ?? '';
    const address = opts.address ?? contractAddress ?? '';
    const parent2NameRaw = opts.parent2Name ?? s?.parent_secondary_name ?? '';
    const parent2EmailRaw = opts.parent2Email ?? s?.parent_secondary_email ?? '';
    const parent2PhoneRaw = opts.parent2Phone ?? s?.parent_secondary_phone ?? '';
    const parent2PersonalCodeRaw = opts.parent2PersonalCode ?? s?.parent_secondary_personal_code ?? '';
    const parent2AddressRaw = opts.parent2Address ?? s?.parent_secondary_address ?? '';
    const hasParent2 = [parent2NameRaw, parent2EmailRaw, parent2PhoneRaw, parent2PersonalCodeRaw, parent2AddressRaw]
      .some((v) => (v || '').trim().length > 0);
    const parent2Name = hasParent2 ? parent2NameRaw : '';
    const parent2Email = hasParent2 ? parent2EmailRaw : '';
    const parent2Phone = hasParent2 ? parent2PhoneRaw : '';
    const parent2PersonalCode = hasParent2 ? parent2PersonalCodeRaw : '';
    const parent2Address = hasParent2 ? parent2AddressRaw : '';
    const parent2Block = hasParent2
      ? [
        `${parent2Name}`,
        `asm. k.: ${parent2PersonalCode}`,
        `tel. nr.: ${parent2Phone}`,
        `el. paštas: ${parent2Email}`,
        `${parent2Address}`,
      ].join('\n')
      : '';
    const parent2Inline = hasParent2
      ? `${parent2Name}; asm. k.: ${parent2PersonalCode}; tel. nr.: ${parent2Phone}; el. paštas: ${parent2Email}; ${parent2Address};`
      : '';
    const childBirthDate = opts.childBirthDate ?? contractChildBirthDate ?? '';
    if (!sourceBody?.trim()) {
      return [
        `Mokinys: ${s?.full_name || ''}`,
        `Tėvai / globėjai: ${parentName}`,
        `Tėvų el. paštas: ${parentEmail}`,
        `Tėvų tel.: ${parentPhone}`,
        `Tėvų asm. kodas: ${parentPersonalCode}`,
        ...(hasParent2 ? [
          `2 tėvo vardas: ${parent2Name}`,
          `2 tėvo el. paštas: ${parent2Email}`,
          `2 tėvo tel.: ${parent2Phone}`,
          `2 tėvo asm. kodas: ${parent2PersonalCode}`,
          `2 tėvo adresas: ${parent2Address}`,
        ] : []),
        `Vaiko gimimo data: ${childBirthDate}`,
        `Gyvenamoji vieta: ${address}`,
        `Metinis mokestis: ${opts.annualFee || ''}`,
        `Mokykla: ${orgName || ''}`,
        `Data: ${new Date().toLocaleDateString('lt-LT')}`,
      ].join('\n');
    }
    return fillPlaceholders(sourceBody, {
      '{{contract_number}}': contractNumber,
      '{{student_name}}': s?.full_name || '',
      '{{student_email}}': s?.email || '',
      '{{student_phone}}': s?.phone || '',
      '{{parent_name}}': parentName,
      '{{parent_email}}': parentEmail,
      '{{parent_phone}}': parentPhone,
      '{{parent_personal_code}}': parentPersonalCode,
      '{{parent_address}}': address,
      '{{parent2_name}}': parent2Name,
      '{{parent2_email}}': parent2Email,
      '{{parent2_phone}}': parent2Phone,
      '{{parent2_personal_code}}': parent2PersonalCode,
      '{{parent2_address}}': parent2Address,
      '{{parent2_adress}}': parent2Address,
      '{{parent2_block}}': parent2Block,
      '{{parent2_inline}}': parent2Inline,
      '{{child_birth_date}}': childBirthDate,
      '{{address}}': address,
      '{{annual_fee}}': opts.annualFee || '',
      '{{date}}': new Date().toLocaleDateString('lt-LT'),
      '{{school_name}}': orgName,
    });
  };

  /** Emails installment details to the payer. The email's "Pay now" button links to the
   *  on-demand /api/pay-school-installment checkout, so the payer can pay anytime. */
  const sendFirstInstallmentPaymentLink = async (params: {
    installmentId: string;
    installmentNumber: number;
    totalInstallments: number;
    amount: number;
    dueDate: string;
    studentName: string;
    parentName: string;
    recipientEmail: string;
    additionalFeeAmount?: number;
    additionalFeePurpose?: string;
    annualFee?: number;
  }): Promise<void> => {
    const emailed = await sendEmail({
      type: 'school_installment_request',
      to: params.recipientEmail,
      data: {
        schoolName: orgName,
        schoolEmail: signingSettings.email || orgEmail,
        contactEmail: signingSettings.parentContactEmail || signingSettings.email || orgEmail,
        studentName: params.studentName,
        parentName: params.parentName,
        recipientName: params.parentName,
        installmentNumber: params.installmentNumber,
        totalInstallments: params.totalInstallments,
        amount: Number(params.amount).toFixed(2),
        dueDate: new Date(params.dueDate).toLocaleDateString('lt-LT'),
        additionalFeeAmount: params.additionalFeeAmount ? Number(params.additionalFeeAmount).toFixed(2) : undefined,
        additionalFeePurpose: params.additionalFeePurpose || undefined,
        contractAnnualFee: params.annualFee != null && String(params.annualFee) !== '' ? Number(params.annualFee).toFixed(2) : undefined,
        installmentId: params.installmentId,
        ...(orgId ? { organizationId: orgId } : {}),
      },
    });
    if (!emailed) {
      throw new Error(tr('school.toastInstallmentEmailFail'));
    }
  };

  const createCompletionUrl = async (contractId: string): Promise<string | null> => {
    try {
      const hdrs = await authHeaders();
      const resp = await fetch('/api/school-contract-completion-link', {
        method: 'POST',
        headers: { ...hdrs, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) return null;
      return typeof json?.completionUrl === 'string' ? json.completionUrl : null;
    } catch {
      return null;
    }
  };

  const uploadGeneratedContractPdf = async (params: {
    contractId: string;
    contractNumber?: string;
    studentName: string;
    parentName: string;
    parentEmail: string;
    parentPhone: string;
    parentPersonalCode: string;
    parent2Name: string;
    parent2Email: string;
    parent2Phone: string;
    parent2PersonalCode: string;
    parent2Address: string;
    childBirthDate: string;
    address: string;
    annualFee: number | string;
    body: string;
  }) => {
    if (!orgId) return null;
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    let y = 800;
    const left = 48;
    const lineHeight = 16;
    page.drawText(normalizePdfText('Metinio mokesčio sutartis'), { x: left, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
    y -= 28;
    const metaRows = [
      `Sutarties Nr.: ${params.contractNumber || ''}`,
      `Mokykla: ${orgName || ''}`,
      `Mokinys: ${params.studentName || ''}`,
      `Tevai / globejai: ${params.parentName || ''}`,
      `Tevu el. pastas: ${params.parentEmail || ''}`,
      `Tevu tel.: ${params.parentPhone || ''}`,
      `Tevu asm. kodas: ${params.parentPersonalCode || ''}`,
      `2 tevas: ${params.parent2Name || ''}`,
      `2 tevo el. pastas: ${params.parent2Email || ''}`,
      `2 tevo tel.: ${params.parent2Phone || ''}`,
      `2 tevo asm. kodas: ${params.parent2PersonalCode || ''}`,
      `2 tevo adresas: ${params.parent2Address || ''}`,
      `Vaiko gimimo data: ${params.childBirthDate || ''}`,
      `Adresas: ${params.address || ''}`,
      `Metinis mokestis: EUR ${Number(params.annualFee || 0).toFixed(2)}`,
      `Data: ${new Date().toLocaleDateString('lt-LT')}`,
    ];
    metaRows.forEach((row) => {
      page.drawText(normalizePdfText(row), { x: left, y, size: 12, font, color: rgb(0.2, 0.2, 0.2) });
      y -= lineHeight;
    });
    y -= 10;
    page.drawText(normalizePdfText('Sutarties tekstas:'), { x: left, y, size: 12, font: bold, color: rgb(0.12, 0.12, 0.12) });
    y -= 18;

    const wrap = (text: string, maxLen = 92) => {
      const words = text.split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (next.length > maxLen) {
          if (cur) lines.push(cur);
          cur = w;
        } else {
          cur = next;
        }
      }
      if (cur) lines.push(cur);
      return lines;
    };
    const bodyLines = params.body
      .split('\n')
      .flatMap((line) => wrap(line.trim() || ' ', 92));

    for (const line of bodyLines) {
      if (y < 56) break;
      page.drawText(normalizePdfText(line), { x: left, y, size: 12, font, color: rgb(0.23, 0.23, 0.23) });
      y -= 16;
    }

    const bytes = await pdfDoc.save();
    const path = schoolContractPdfStoragePath({
      organizationId: orgId,
      contractId: params.contractId,
      contractNumber: params.contractNumber || null,
    });
    const { error: uploadErr } = await supabase.storage.from('school-contracts').upload(path, new Blob([bytes], { type: 'application/pdf' }), {
      cacheControl: '3600',
      upsert: true,
      contentType: 'application/pdf',
    });
    if (uploadErr) return null;
    const { data } = supabase.storage.from('school-contracts').getPublicUrl(path);
    return data.publicUrl;
  };

  const buildTemplatePayload = (params: {
    studentName: string;
    studentEmail: string;
    studentPhone: string;
    parentName: string;
    parentEmail: string;
    parentPhone: string;
    parentPersonalCode: string;
    parent2Name: string;
    parent2Email: string;
    parent2Phone: string;
    parent2PersonalCode: string;
    parent2Address: string;
    childBirthDate: string;
    address: string;
    annualFee: string | number;
    contractNumber: string;
  }) => ({
    ...(() => {
      const hasParent2 = [
        params.parent2Name,
        params.parent2Email,
        params.parent2Phone,
        params.parent2PersonalCode,
        params.parent2Address,
      ].some((v) => (v || '').trim().length > 0);
      const parent2Name = hasParent2 ? (params.parent2Name || '') : '';
      const parent2Email = hasParent2 ? (params.parent2Email || '') : '';
      const parent2Phone = hasParent2 ? (params.parent2Phone || '') : '';
      const parent2PersonalCode = hasParent2 ? (params.parent2PersonalCode || '') : '';
      const parent2Address = hasParent2 ? (params.parent2Address || '') : '';
      const parent2Block = hasParent2
        ? [
          `${parent2Name}`,
          `asm. k.: ${parent2PersonalCode}`,
          `tel. nr.: ${parent2Phone}`,
          `el. paštas: ${parent2Email}`,
          `${parent2Address}`,
        ].join('\n')
        : '';
      const parent2Inline = hasParent2
        ? `${parent2Name}; asm. k.: ${parent2PersonalCode}; tel. nr.: ${parent2Phone}; el. paštas: ${parent2Email}; ${parent2Address};`
        : '';
      return {
        parent2_name: parent2Name,
        parent2_email: parent2Email,
        parent2_phone: parent2Phone,
        parent2_personal_code: parent2PersonalCode,
        parent2_address: parent2Address,
        parent2_adress: parent2Address,
        parent2_block: parent2Block,
        parent2_inline: parent2Inline,
      };
    })(),
    contract_number: params.contractNumber || '',
    student_name: params.studentName || '',
    student_email: params.studentEmail || '',
    student_phone: params.studentPhone || '',
    parent_name: params.parentName || '',
    parent_email: params.parentEmail || '',
    parent_phone: params.parentPhone || '',
    parent_personal_code: params.parentPersonalCode || '',
    parent_address: params.address || '',
    child_birth_date: params.childBirthDate || '',
    address: params.address || '',
    annual_fee: String(params.annualFee ?? ''),
    date: new Date().toLocaleDateString('lt-LT'),
    school_name: orgName || '',
  });

  /** True when the template has an uploaded DOCX file (fillable while keeping the school's own layout). */
  const templateFileIsDocx = (url?: string | null) =>
    String(url || '').toLowerCase().replace(/[?#].*$/, '').endsWith('.docx');

  const createFilledTemplateFile = async (params: {
    contractId: string;
    templateUrl?: string | null;
    studentName: string;
    studentEmail: string;
    studentPhone: string;
    parentName: string;
    parentEmail: string;
    parentPhone: string;
    parentPersonalCode: string;
    parent2Name: string;
    parent2Email: string;
    parent2Phone: string;
    parent2PersonalCode: string;
    parent2Address: string;
    childBirthDate: string;
    address: string;
    annualFee: string | number;
    contractNumber: string;
    fallbackBody: string;
  }) => {
    if (!orgId) return null;

    const templatePayload = buildTemplatePayload({
      studentName: params.studentName,
      studentEmail: params.studentEmail,
      studentPhone: params.studentPhone,
      parentName: params.parentName,
      parentEmail: params.parentEmail,
      parentPhone: params.parentPhone,
      parentPersonalCode: params.parentPersonalCode,
      parent2Name: params.parent2Name,
      parent2Email: params.parent2Email,
      parent2Phone: params.parent2Phone,
      parent2PersonalCode: params.parent2PersonalCode,
      parent2Address: params.parent2Address,
      childBirthDate: params.childBirthDate,
      address: params.address,
      annualFee: params.annualFee,
      contractNumber: params.contractNumber,
    });

    if (templateFileIsDocx(params.templateUrl)) {
      try {
        const hdrs = await authHeaders();
        if (!hdrs.Authorization) {
          throw new Error(tr('school.toastTemplateMustBeLogged'));
        }
        const renderResp = await fetch('/api/school-contract-render-docx-pdf', {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({
            organizationId: orgId,
            contractId: params.contractId,
            contractNumber: params.contractNumber,
            templateUrl: params.templateUrl,
            templatePayload,
          }),
        });
        const renderJson = (await renderResp.json().catch(() => ({}))) as { pdfUrl?: string; error?: string };
        if (renderResp.ok && typeof renderJson.pdfUrl === 'string' && renderJson.pdfUrl) {
          return renderJson.pdfUrl;
        }
        throw new Error(typeof renderJson.error === 'string' ? renderJson.error : 'DOCX → PDF nepavyko');
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Nepavyko konvertuoti DOCX i PDF');
      }
    }

    // Fallback for non-DOCX templates: generate PDF from filled text.
    return await uploadGeneratedContractPdf({
      contractId: params.contractId,
      contractNumber: params.contractNumber,
      studentName: params.studentName,
      parentName: params.parentName,
      parentEmail: params.parentEmail,
      parentPhone: params.parentPhone,
      parentPersonalCode: params.parentPersonalCode,
      parent2Name: params.parent2Name,
      parent2Email: params.parent2Email,
      parent2Phone: params.parent2Phone,
      parent2PersonalCode: params.parent2PersonalCode,
      parent2Address: params.parent2Address,
      childBirthDate: params.childBirthDate,
      address: params.address,
      annualFee: params.annualFee,
      body: params.fallbackBody,
    });
  };

  const onTemplateSelect = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const nextAnnual = tpl.annual_fee_default?.toString() || cForm.annual_fee;
    setCForm((prev) => ({
      ...prev,
      template_id: templateId,
      annual_fee: nextAnnual,
      filled_body: buildFilledBody({
        templateBody: tpl.body,
        annualFee: nextAnnual,
        studentId: prev.student_id,
      }),
    }));
  };

  const generateContractNumber = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `SUT-${y}${m}${d}-${h}${min}`;
  };

  const onStudentSelect = (studentId: string) => {
    const s = students.find((st) => st.id === studentId);
    setContractParentName(s?.payer_name || '');
    setContractParentEmail(s?.payer_email || '');
    setContractParentPhone(s?.payer_phone || '');
    setContractParentPersonalCode(s?.payer_personal_code || '');
    setContractChildBirthDate(s?.child_birth_date || '');
    const studentAddress = [s?.student_address || '', s?.student_city || ''].filter(Boolean).join(', ');
    setContractAddress(studentAddress);
    setCForm((prev) => ({
      ...prev,
      student_id: studentId,
      filled_body: buildFilledBody({
        annualFee: prev.annual_fee,
        studentId,
        parentName: s?.payer_name || '',
        parentEmail: s?.payer_email || '',
        parentPhone: s?.payer_phone || '',
        parentPersonalCode: s?.payer_personal_code || '',
        childBirthDate: s?.child_birth_date || '',
        address: studentAddress,
      }),
    }));
  };

  const createContract = async () => {
    const annualFeeNum = parseAnnualFeeInput(cForm.annual_fee);
    if (!orgId || !cForm.student_id || annualFeeNum == null) return;
    if (isSchoolView ? annualFeeNum < 0 : annualFeeNum <= 0) {
      setToast({
        message: isSchoolView ? 'Metinis mokestis negali būti neigiamas.' : 'Metinis mokestis turi būti didesnis nei 0.',
        type: 'error',
      });
      return;
    }
    const effectiveAnnualFee = applyFeeDiscount && isSchoolView ? discountedAnnualFee(cForm.annual_fee) : cForm.annual_fee;
    const additionalFeeAmountNum = hasAdditionalFee ? Number(additionalFeeAmount) : 0;
    const effectiveContractNumber = cForm.contract_number.trim() || generateContractNumber();
    if (!contractParentName.trim()) {
      setToast({ message: tr('compStu.parentNameRequiredError'), type: 'error' });
      return;
    }
    if (!contractParentEmail.trim()) {
      setToast({ message: tr('compStu.parentEmailRequiredError'), type: 'error' });
      return;
    }
    if (!isSchoolView && !contractParentPhone.trim()) {
      setToast({ message: tr('compStu.parentPhoneRequiredError'), type: 'error' });
      return;
    }
    if (paymentMode === 'installments' && installmentRows.some((r) => !r.amount || !r.due_date)) {
      setToast({ message: tr('school.installmentsRequired'), type: 'error' });
      return;
    }
    if (hasAdditionalFee && !additionalFeePurpose.trim()) {
      setToast({ message: 'Įrašykite papildomo mokesčio paskirtį.', type: 'error' });
      return;
    }
    if (hasAdditionalFee && !(additionalFeeAmountNum > 0)) {
      setToast({ message: 'Papildomo mokesčio suma turi būti didesnė nei 0.', type: 'error' });
      return;
    }
    if (paymentMode === 'installments') {
      const installmentsTotal = installmentRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      const annual = Number(effectiveAnnualFee);
      if (Math.abs(installmentsTotal - annual) > 0.01) {
        setToast({ message: tr('school.installmentsTotalMismatch'), type: 'error' });
        return;
      }
    }
    setSaving(true);
    try {
      const finalBody = buildFilledBody({
      contractNumber: effectiveContractNumber,
      annualFee: effectiveAnnualFee,
      studentId: cForm.student_id,
      parentName: contractParentName.trim(),
      parentEmail: contractParentEmail.trim(),
      parentPhone: contractParentPhone.trim(),
      parentPersonalCode: contractParentPersonalCode.trim(),
      childBirthDate: contractChildBirthDate.trim(),
      address: contractAddress.trim(),
      });

      const selectedStudent = students.find((st) => st.id === cForm.student_id);
      if (
        selectedStudent &&
        (
          selectedStudent.payer_name !== contractParentName.trim() ||
          selectedStudent.payer_email !== contractParentEmail.trim() ||
          selectedStudent.payer_phone !== contractParentPhone.trim() ||
          (selectedStudent.payer_personal_code || '') !== contractParentPersonalCode.trim() ||
          (selectedStudent.child_birth_date || '') !== contractChildBirthDate.trim()
        )
      ) {
        await supabase
          .from('students')
          .update({
            payer_name: contractParentName.trim(),
            payer_email: contractParentEmail.trim(),
            payer_phone: contractParentPhone.trim() || null,
            payer_personal_code: contractParentPersonalCode.trim() || null,
            child_birth_date: contractChildBirthDate.trim() || null,
          })
          .eq('id', cForm.student_id);
      }

      const missingFields = [
        !contractAddress.trim() ? 'Gyvenamoji vieta' : '',
        !contractChildBirthDate.trim() ? 'Vaiko gimimo data' : '',
        !contractParentPersonalCode.trim() ? 'Tėvų asmens kodas' : '',
        !contractParentPhone.trim() ? 'Tėvų tel. nr.' : '',
        isSchoolView ? 'Vaiko atvaizdo naudojimo sutikimas' : '',
      ].filter(Boolean);

      const preContractId = crypto.randomUUID();
      const selectedTemplate = templates.find((t) => t.id === cForm.template_id);
      const generatedPdfUrl = await createFilledTemplateFile({
        contractId: preContractId,
        templateUrl: selectedTemplate?.pdf_url || null,
        studentName: selectedStudent?.full_name || '',
        studentEmail: selectedStudent?.email || '',
        studentPhone: selectedStudent?.phone || '',
        parentName: contractParentName.trim(),
        parentEmail: contractParentEmail.trim(),
        parentPhone: contractParentPhone.trim(),
        parentPersonalCode: contractParentPersonalCode.trim(),
        parent2Name: selectedStudent?.parent_secondary_name || '',
        parent2Email: selectedStudent?.parent_secondary_email || '',
        parent2Phone: selectedStudent?.parent_secondary_phone || '',
        parent2PersonalCode: selectedStudent?.parent_secondary_personal_code || '',
        parent2Address: selectedStudent?.parent_secondary_address || '',
        childBirthDate: contractChildBirthDate.trim(),
        address: contractAddress.trim(),
        annualFee: effectiveAnnualFee,
        contractNumber: effectiveContractNumber,
        fallbackBody: finalBody,
      });

      const { data: created, error } = await supabase.from('school_contracts').insert({
        id: preContractId,
        organization_id: orgId,
        template_id: cForm.template_id || null,
        contract_number: effectiveContractNumber,
        student_id: cForm.student_id,
        filled_body: finalBody,
        pdf_url: generatedPdfUrl || null,
        annual_fee: Number(effectiveAnnualFee),
        additional_fee_amount: hasAdditionalFee ? additionalFeeAmountNum : null,
        additional_fee_purpose: hasAdditionalFee ? additionalFeePurpose.trim() : null,
        signing_status: sendImmediately ? 'sent' : 'draft',
        sent_at: sendImmediately ? new Date().toISOString() : null,
      }).select('*, student:students(full_name, email, payer_name, payer_email, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date)').single();

      if (error) { setToast({ message: error.message, type: 'error' }); return; }

      let installmentsForEmail: Array<{ number: number; amount: string; dueDate: string }> = [];

      if (paymentMode === 'installments' && created) {
      let schedule = installmentRows.map((r, idx) => ({
        contract_id: created.id,
        installment_number: idx + 1,
        amount: Number(r.amount) + (idx === 0 && hasAdditionalFee ? additionalFeeAmountNum : 0),
        due_date: r.due_date,
      }));
      if (schedule.every((row) => row.amount <= 0) && Number(effectiveAnnualFee) === 0 && !hasAdditionalFee) {
        schedule = [{
          contract_id: created.id,
          installment_number: 1,
          amount: 0,
          due_date: installmentRows[0]?.due_date || new Date().toISOString().slice(0, 10),
        }];
      } else {
        schedule = schedule.filter((row) => row.amount > 0);
      }
      installmentsForEmail = schedule.map((row) => ({
        number: row.installment_number,
        amount: Number(row.amount).toFixed(2),
        dueDate: row.due_date ? new Date(row.due_date).toLocaleDateString('lt-LT') : '—',
      }));
      const { error: installmentsErr } = schedule.length > 0 ? await supabase
        .from('school_payment_installments')
        .insert(schedule) : { error: null };
      if (installmentsErr) {
        setToast({ message: installmentsErr.message, type: 'error' });
        reload();
        return;
      }
      }

      if (paymentMode === 'full' && created) {
      const dueDate = new Date().toISOString().slice(0, 10);
      const fullPaymentAmount = Number(effectiveAnnualFee) + (hasAdditionalFee ? additionalFeeAmountNum : 0);
      const { error: oneInstallmentErr } = await supabase
        .from('school_payment_installments')
        .insert({
          contract_id: created.id,
          installment_number: 1,
          amount: fullPaymentAmount,
          due_date: dueDate,
        });
      if (oneInstallmentErr) {
        setToast({ message: oneInstallmentErr.message, type: 'error' });
        reload();
        return;
      }
      }

      if (sendImmediately && created) {
        const recipient = contractParentEmail.trim() || created.student?.payer_email || created.student?.email;
        if (!recipient) {
          await supabase.from('school_contracts').update({ signing_status: 'draft', sent_at: null }).eq('id', created.id);
          setToast({ message: tr('school.toastNoEmail'), type: 'error' });
          reload();
          return;
        }

        const sendContractChainOk = await (async (): Promise<boolean> => {
          const shouldIncludeCompletion = isSchoolView || (parentsWillFillMissing && missingFields.length > 0);
          const completionUrl = shouldIncludeCompletion ? await createCompletionUrl(created.id) : null;
          if (shouldIncludeCompletion && !completionUrl) {
            await supabase.from('school_contracts').update({ signing_status: 'draft', sent_at: null }).eq('id', created.id);
            setToast({ message: 'Nepavyko sukurti saugios sutarties peržiūros nuorodos.', type: 'error' });
            reload();
            return false;
          }
          const ok = await sendEmail({
            type: 'school_contract',
            to: recipient,
            data: {
              schoolName: orgName,
              schoolEmail: signingSettings.email || orgEmail,
              studentName: created.student?.full_name || '',
              parentName: contractParentName.trim() || created.student?.payer_name || created.student?.full_name || '',
              recipientName: contractParentName.trim() || created.student?.payer_name || created.student?.full_name || '',
              parentPhone: contractParentPhone.trim(),
              parentPersonalCode: contractParentPersonalCode.trim() || undefined,
              childBirthDate: contractChildBirthDate.trim() || undefined,
              address: contractAddress.trim() || undefined,
              missingFields: isSchoolView ? missingFields : (parentsWillFillMissing ? missingFields : []),
              requiresReview: isSchoolView,
              completionUrl: completionUrl || undefined,
              contractId: created.id,
              contractNumber: created.contract_number || effectiveContractNumber,
              annualFee: created.annual_fee,
              contractBody: created.filled_body,
              pdfUrl: created.pdf_url || undefined,
              date: new Date().toLocaleDateString('lt-LT'),
              ...(installmentsForEmail.length > 1
                ? {
                    installments: installmentsForEmail,
                    additionalFeeAmount: hasAdditionalFee ? additionalFeeAmountNum.toFixed(2) : undefined,
                    additionalFeePurpose: hasAdditionalFee ? additionalFeePurpose.trim() : undefined,
                  }
                : {}),
              ...(orgId ? { organizationId: orgId } : {}),
            },
          });
          if (!ok) {
            await supabase.from('school_contracts').update({ signing_status: 'draft', sent_at: null }).eq('id', created.id);
            setToast({ message: tr('school.toastContractSendFail'), type: 'error' });
            reload();
            return false;
          }

          // Payment email is intentionally NOT sent here; it goes out when the admin
          // marks the contract as signed (#3). Installment rows are created above.
          return true;
        })();

        if (!sendContractChainOk) return;
      }

      setContractOpen(false);
      const baseSuccessMsg = sendImmediately
        ? tr('school.toastContractSendingSoon')
        : paymentMode === 'installments'
          ? tr('school.toastContractAndInstallmentsCreated')
          : tr('school.toastContractCreated');
      setToast({ message: baseSuccessMsg, type: 'success' });
      reload();
    } catch (e: any) {
      setToast({ message: e?.message || 'Nepavyko sukurti sutarties.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /** Builds + sends the `school_contract` email for an existing contract row (no status/payment side effects). */
  const sendSchoolContractEmail = async (
    contract: Contract,
    recipient: string,
    pdfUrl?: string | null,
  ): Promise<boolean> => {
    const student = contract.student;
    const missingFields = [
      !(student?.student_address || '').trim() && !(student?.student_city || '').trim() ? 'Gyvenamoji vieta' : '',
      !(student?.child_birth_date || '').trim() ? 'Vaiko gimimo data' : '',
      !(student?.payer_personal_code || '').trim() ? 'Tėvų asmens kodas' : '',
      !(student?.payer_phone || '').trim() ? 'Tėvų tel. nr.' : '',
      isSchoolView && !(String((contract as any)?.media_publicity_consent || '').trim()) ? 'Vaiko atvaizdo naudojimo sutikimas' : '',
    ].filter(Boolean);
    const completionUrl = isSchoolView || missingFields.length > 0 ? await createCompletionUrl(contract.id) : null;
    if (isSchoolView && !completionUrl) {
      setToast({ message: 'Nepavyko sukurti saugios sutarties peržiūros nuorodos.', type: 'error' });
      return false;
    }
    return await sendEmail({
      type: 'school_contract',
      to: recipient,
      data: {
        schoolName: orgName,
        schoolEmail: signingSettings.email || orgEmail,
        studentName: student?.full_name || '',
        parentName: student?.payer_name || student?.full_name || '',
        recipientName: student?.payer_name || student?.full_name || '',
        parentPhone: student?.payer_phone || undefined,
        parentPersonalCode: student?.payer_personal_code || undefined,
        missingFields,
        requiresReview: isSchoolView,
        completionUrl: completionUrl || undefined,
        contractId: contract.id,
        childBirthDate: student?.child_birth_date || undefined,
        address: [student?.student_address, student?.student_city].filter(Boolean).join(', ') || undefined,
        contractNumber: contract.contract_number || undefined,
        annualFee: contract.annual_fee,
        contractBody: contract.filled_body,
        pdfUrl: pdfUrl || undefined,
        date: new Date().toLocaleDateString('lt-LT'),
        ...contractInstallmentEmailExtras(contract),
        ...(orgId ? { organizationId: orgId } : {}),
      },
    });
  };

  /** Re-sends the contract email to the same recipient without status or payment changes (#4). */
  const resendContract = async (contract: Contract) => {
    const student = contract.student;
    const recipient = (student?.payer_email || student?.email || '').trim();
    if (!recipient) {
      setToast({ message: tr('school.toastNoEmail'), type: 'error' });
      return;
    }
    const ok = await sendSchoolContractEmail(contract, recipient, contract.pdf_url);
    setToast({
      message: ok ? tr('school.toastContractResent') : tr('school.toastContractResendFail'),
      type: ok ? 'success' : 'error',
    });
  };

  const sendContract = async (contract: Contract) => {
    try {
      const student = contract.student;
      const recipient = student?.payer_email || student?.email;
      if (!recipient) {
        setToast({ message: tr('school.toastNoEmail'), type: 'error' });
        return;
      }

      const selectedTemplate = templates.find((t) => t.id === contract.template_id);
      const ensuredPdfUrl = contract.pdf_url || await createFilledTemplateFile({
        contractId: contract.id,
        templateUrl: selectedTemplate?.pdf_url || null,
        studentName: student?.full_name || '',
        studentEmail: student?.email || '',
        studentPhone: student?.phone || '',
        parentName: student?.payer_name || student?.full_name || '',
        parentEmail: student?.payer_email || student?.email || '',
        parentPhone: student?.payer_phone || '',
        parentPersonalCode: student?.payer_personal_code || '',
        parent2Name: student?.parent_secondary_name || '',
        parent2Email: student?.parent_secondary_email || '',
        parent2Phone: student?.parent_secondary_phone || '',
        parent2PersonalCode: student?.parent_secondary_personal_code || '',
        parent2Address: student?.parent_secondary_address || '',
        childBirthDate: student?.child_birth_date || '',
        address: '',
        annualFee: contract.annual_fee,
        contractNumber: contract.contract_number || '',
        fallbackBody: contract.filled_body || '',
      });
      if (ensuredPdfUrl && ensuredPdfUrl !== contract.pdf_url) {
        await supabase.from('school_contracts').update({ pdf_url: ensuredPdfUrl }).eq('id', contract.id);
      }

      void (async () => {
        const ok = await sendSchoolContractEmail(contract, recipient, ensuredPdfUrl);

        if (!ok) {
          setToast({ message: tr('school.toastContractSendFail'), type: 'error' });
          reload();
          return;
        }

        // Ensure a first installment row exists, but DO NOT send the payment email here.
        // The payment email is sent only when the admin marks the contract as signed (#3).
        const { data: existingInstallments } = await supabase
          .from('school_payment_installments')
          .select('id')
          .eq('contract_id', contract.id)
          .limit(1);

        if (!existingInstallments || existingInstallments.length === 0) {
          const dueDate = new Date().toISOString().slice(0, 10);
          await supabase
            .from('school_payment_installments')
            .insert({
              contract_id: contract.id,
              installment_number: 1,
              amount: Number(contract.annual_fee) + Number(contract.additional_fee_amount || 0),
              due_date: dueDate,
            });
        }

        await supabase
          .from('school_contracts')
          .update({ signing_status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', contract.id);
        reload();
      })();

      setToast({
        message: tr('school.toastContractSendingSoon'),
        type: 'success',
      });
      reload();
    } catch (e: any) {
      setToast({ message: e?.message || 'Nepavyko sugeneruoti PDF is DOCX sablono.', type: 'error' });
    }
  };

  /** Send the first/pending installment payment email. Called only after a contract is marked signed (#3). */
  const sendPaymentEmailForSignedContract = async (contract: Contract) => {
    const student = contract.student;
    const recipient = (student?.payer_email || student?.email || '').trim();
    if (!recipient) return;
    const { data: installments } = await supabase
      .from('school_payment_installments')
      .select('id, installment_number, amount, due_date, payment_status')
      .eq('contract_id', contract.id)
      .order('installment_number', { ascending: true });
    if (!installments || installments.length === 0) return;
    // Do not fall back to a paid row — re-sending after late signature upload
    // confused parents who already paid (e.g. July payment + August manual upload).
    const pending = installments.find((i: { payment_status?: string }) => i.payment_status !== 'paid');
    if (!pending) return;
    try {
      await sendFirstInstallmentPaymentLink({
        installmentId: pending.id,
        installmentNumber: pending.installment_number,
        totalInstallments: installments.length,
        amount: Number(pending.amount),
        dueDate: pending.due_date,
        studentName: student?.full_name || '',
        parentName: student?.payer_name || student?.full_name || '',
        recipientEmail: recipient,
        additionalFeeAmount: Number(contract.additional_fee_amount || 0),
        additionalFeePurpose: contract.additional_fee_purpose || undefined,
        annualFee: Number(contract.annual_fee || 0),
      });
    } catch (e: any) {
      setToast({ message: e?.message || tr('school.toastInstallmentEmailFail'), type: 'error' });
    }
  };

  // ─── E-sign contracts: manual "signature received" override ────────────────
  // For parents who signed OUTSIDE the Tutlio flow (own Dokobit account, etc.)
  // and never uploaded the file back. With a file the parent's real signatures
  // land in the final contract; without a file only the status advances.
  const [manualMarkContract, setManualMarkContract] = useState<Contract | null>(null);
  const [manualMarkBusy, setManualMarkBusy] = useState(false);
  const [manualMarkErr, setManualMarkErr] = useState('');
  const [manualMarkNoFileConfirm, setManualMarkNoFileConfirm] = useState(false);
  const [pendingScanUpload, setPendingScanUpload] = useState<{ contract: Contract; file: File } | null>(null);

  const openManualMark = (contract: Contract) => {
    setManualMarkErr('');
    setManualMarkNoFileConfirm(false);
    setManualMarkContract(contract);
  };

  const finishManualMark = (done: boolean, withFile: boolean) => {
    setManualMarkContract(null);
    setToast({
      message: done
        ? withFile
          ? 'Parašas patvirtintas iš įkelto failo — sutartis pasirašyta abiejų šalių.'
          : 'Sutartis pažymėta kaip pasirašyta (be parašo failo).'
        : 'Parašas užfiksuotas. Laukiama kito pasirašančiojo.',
      type: 'success',
    });
    reload();
  };

  const manualMarkWithFile = async (file: File) => {
    const contract = manualMarkContract;
    if (!contract) return;
    setManualMarkBusy(true);
    setManualMarkErr('');
    try {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        setManualMarkErr('Įkelkite PDF failą (jei pasirašyta ADOC/ASiC formatu, Dokobit pasirinkite PDF formatą).');
        return;
      }
      const hdrs = await authHeaders();
      const r1 = await fetch('/api/school-contract-esign-mark-signed', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ contractId: contract.id, action: 'upload-url' }),
      });
      const j1 = await r1.json().catch(() => ({}));
      if (!r1.ok || !j1.signedUrl || !j1.path) {
        setManualMarkErr(j1.error || 'Nepavyko paruošti įkėlimo. Bandykite dar kartą.');
        return;
      }
      const put = await fetch(j1.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
        body: file,
      });
      if (!put.ok) {
        setManualMarkErr('Nepavyko įkelti failo. Patikrinkite ryšį ir bandykite dar kartą.');
        return;
      }
      const r2 = await fetch('/api/school-contract-esign-mark-signed', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ contractId: contract.id, action: 'finalize', path: j1.path }),
      });
      const j2 = await r2.json().catch(() => ({}));
      if (j2.alreadySigned) {
        finishManualMark(true, true);
        return;
      }
      if (!r2.ok || !j2.ok) {
        setManualMarkErr(j2.error || 'Įkelto failo patikrinti nepavyko. Bandykite dar kartą.');
        return;
      }
      finishManualMark(Boolean(j2.done), true);
    } catch {
      setManualMarkErr('Įvyko klaida. Bandykite dar kartą.');
    } finally {
      setManualMarkBusy(false);
    }
  };

  const manualMarkWithoutFile = async () => {
    const contract = manualMarkContract;
    if (!contract || !manualMarkNoFileConfirm) return;
    setManualMarkBusy(true);
    setManualMarkErr('');
    try {
      const hdrs = await authHeaders();
      const res = await fetch('/api/school-contract-esign-mark-signed', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ contractId: contract.id, action: 'finalize', confirmNoFile: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (j.alreadySigned) {
        finishManualMark(true, false);
        return;
      }
      if (!res.ok || !j.ok) {
        setManualMarkErr(j.error || 'Nepavyko pažymėti. Bandykite dar kartą.');
        return;
      }
      finishManualMark(Boolean(j.done), false);
    } catch {
      setManualMarkErr('Įvyko klaida. Bandykite dar kartą.');
    } finally {
      setManualMarkBusy(false);
    }
  };

  const markSigned = async (contract: Contract) => {
    try {
      const hdrs = await authHeaders();
      const res = await fetch('/api/school-contract-mark-signed', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ contractId: contract.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success !== true) {
        setToast({ message: data?.error || `HTTP ${res.status}`, type: 'error' });
      } else {
        setToast({ message: tr('school.toastContractSigned'), type: 'success' });
        // Payment email only when newly signed and there is still something unpaid.
        if (!data.alreadySigned && data.hasUnpaidInstallment !== false) {
          await sendPaymentEmailForSignedContract(contract);
        }
      }
    } catch (e: any) {
      setToast({ message: e?.message || tr('common.error'), type: 'error' });
    } finally {
      reload();
    }
  };

  const deleteContract = async (id: string) => {
    if (!confirm(tr('school.confirmDeleteContract'))) return;
    const { error } = await supabase
      .from('school_contracts')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setToast({ message: error.message, type: 'error' });
      return;
    }
    setContracts((prev) => prev.filter((c) => c.id !== id));
    reload();
  };

  const openContractFile = async (urlOrPath?: string | null) => {
    const ok = await openContractFileInNewTab(urlOrPath);
    if (!ok) setToast({ message: tr('school.toastFileOpenFail'), type: 'error' });
  };

  const uploadSignedContract = async (contract: Contract, file: File, schoolAlreadySigned: boolean) => {
    if (!orgId) return;
    if (!isManualSignedFile(file)) {
      setToast({ message: tr('school.toastSignedUploadInvalidType'), type: 'error' });
      return;
    }
    const wasSigned = contract.signing_status === 'signed';
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const safeStudent = (contract.student?.full_name || 'student')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const path = `${orgId}/signed/${contract.id}-${safeStudent}-${Date.now()}.${fileExt}`;

    setSaving(true);
    const { path: storedPath, error: uploadErr } = await uploadContractFile(
      path,
      file,
      mimeForManualSignedFile(file),
    );
    if (uploadErr || !storedPath) {
      setSaving(false);
      setToast({ message: uploadErr || tr('school.toastTemplateUploadPrepareFail'), type: 'error' });
      return;
    }

    if (!schoolAlreadySigned) {
      const { error: updateErr } = await supabase
        .from('school_contracts')
        .update({
          pdf_url: storedPath,
          signed_uploaded_at: new Date().toISOString(),
          signing_status: 'awaiting_school_signature',
          signed_contract_url: null,
        })
        .eq('id', contract.id);
      if (updateErr) {
        setSaving(false);
        setToast({ message: updateErr.message, type: 'error' });
        return;
      }
      await supabase
        .from('school_contract_signatures')
        .update({
          status: 'pending',
          signed_at: null,
          signed_pdf_path: null,
          gosign_transaction_id: null,
          signing_url: null,
          error_message: null,
        })
        .eq('contract_id', contract.id)
        .eq('role', 'school')
        .neq('status', 'pending');
      setSaving(false);
      setPendingScanUpload(null);
      setToast({ message: tr('school.toastParentCopyUploadedForSchoolSign'), type: 'success' });
      reload();
      return;
    }

    const { error: updateErr } = await supabase
      .from('school_contracts')
      .update({
        signed_contract_url: storedPath,
        signed_uploaded_at: new Date().toISOString(),
        signing_status: 'signed',
        signed_at: contract.signed_at || new Date().toISOString(),
      })
      .eq('id', contract.id);
    setSaving(false);
    setPendingScanUpload(null);
    if (updateErr) {
      setToast({ message: updateErr.message, type: 'error' });
      return;
    }
    setToast({ message: tr('school.toastSignedContractUploaded'), type: 'success' });
    let hasUnpaidInstallment: boolean | undefined;
    try {
      const hdrs = await authHeaders();
      const markRes = await fetch('/api/school-contract-mark-signed', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ contractId: contract.id, manualUpload: true }),
      });
      const markJson = await markRes.json().catch(() => ({}));
      if (typeof markJson.hasUnpaidInstallment === 'boolean') {
        hasUnpaidInstallment = markJson.hasUnpaidInstallment;
      }
    } catch {
      /* non-fatal — contract file is already stored; signature close retries via reconcile */
    }
    if (!wasSigned && hasUnpaidInstallment !== false) {
      await sendPaymentEmailForSignedContract({ ...contract, signing_status: 'signed' });
    }
    reload();
  };

  const pickAndUploadSignedContract = (contract: Contract) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = MANUAL_SIGNED_FILE_ACCEPT;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!isManualSignedFile(file)) {
        setToast({ message: tr('school.toastSignedUploadInvalidType'), type: 'error' });
        return;
      }
      if (shouldPromptSchoolSignedOnScan(contract, eSignEnabled)) {
        setPendingScanUpload({ contract, file });
        return;
      }
      await uploadSignedContract(contract, file, true);
    };
    input.click();
  };

  // GoSign: directorė initiates her (in-app) signature, then is redirected to
  // the GoSign signing page. Only shown for contracts in 'awaiting_school_signature'.
  const signAsSchool = async (contract: Contract) => {
    const signingWindow = window.open('', `tutlio-contract-sign-${contract.id}`, 'popup,width=1100,height=820');
    if (!signingWindow) {
      setToast({ message: 'Naršyklė užblokavo pasirašymo langą. Leiskite iššokančius langus ir bandykite dar kartą.', type: 'error' });
      return;
    }
    signingWindow.document.title = 'Ruošiamas GoSign pasirašymas';
    signingWindow.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px">Ruošiamas saugus pasirašymo langas…</p>';
    try {
      const hdrs = await authHeaders();
      if (!hdrs.Authorization) {
        signingWindow.close();
        setToast({ message: 'Turite būti prisijungę.', type: 'error' });
        return;
      }
      setSaving(true);
      const res = await fetch('/api/school-contract-sign-init', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ contractId: contract.id }),
      });
      const j = (await res.json().catch(() => ({}))) as { signingUrl?: string; error?: string };
      if (res.ok && j.signingUrl) {
        signingWindow.location.href = j.signingUrl;
        return;
      }
      signingWindow.close();
      const message = /timed out|timeout/i.test(j.error || '')
        ? 'Registrų centro (GoSign) paslauga šiuo metu atsako lėtai. Palaukite kelias sekundes ir spauskite „Pasirašyti“ dar kartą — pasirašymas nesidubliuos.'
        : j.error || 'Nepavyko pradėti pasirašymo.';
      setToast({ message, type: 'error' });
    } catch (e: any) {
      signingWindow.close();
      setToast({ message: e?.message || 'Klaida pradedant pasirašymą.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Diacritics-insensitive match (Vėgėlė findable as "vegele" and vice versa).
  const searchable = (value: string) => normalizePdfText(value).toLowerCase();
  const contractFilterCounts = countContractsByFilter(contracts, isSchoolView, { eSignEnabled });
  const visibleContracts = contracts.filter((c) => {
    if (isSchoolView) {
      if (!matchesContractFilter(contractFilter as SchoolContractFilter, c, isSchoolView, { eSignEnabled })) return false;
    } else {
      if (contractFilter === 'signed' && c.signing_status !== 'signed') return false;
      if (contractFilter === 'unsigned' && c.signing_status === 'signed') return false;
    }
    const q = searchable(contractSearch.trim());
    if (!q) return true;
    const haystack = searchable(
      [c.student?.full_name, c.student?.payer_name, c.student?.parent_secondary_name, c.contract_number]
        .filter(Boolean)
        .join(' '),
    );
    return haystack.includes(q);
  });

  const exportContractsXlsx = async () => {
    if (!isSchoolView || visibleContracts.length === 0) return;
    setExportingContracts(true);
    try {
      const rows = buildSchoolContractExportRows(visibleContracts, tr, isSchoolView);
      const date = new Date().toISOString().slice(0, 10);
      const filename = schoolContractsExportFilename(contractFilter, contractSearch, date);
      await downloadSchoolContractsXlsx(rows, tr, filename, orgName);
    } catch (e: any) {
      setToast({ message: e?.message || tr('school.contractExportFail'), type: 'error' });
    } finally {
      setExportingContracts(false);
    }
  };

  const statusBadge = (s: Contract['signing_status']) => {
    const map = {
      draft: { label: tr('school.draft'), cls: 'bg-gray-100 text-gray-600' },
      sent: { label: tr('school.sentStatus'), cls: 'bg-amber-50 text-amber-700' },
      awaiting_school_signature: { label: tr('school.statusAwaitingSchool'), cls: 'bg-indigo-50 text-indigo-700' },
      signed_by_school: { label: tr('school.statusSignedBySchool'), cls: 'bg-blue-50 text-blue-700' },
      signed: { label: eSignEnabled ? tr('school.statusSignedBoth') : tr('school.signedStatus'), cls: 'bg-green-50 text-green-700' },
    };
    const { label, cls } = map[s];
    return <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
  };

  const schoolContractFilterLabel = (key: SchoolContractFilter, count: number) =>
    `${({
      all: tr('school.filterAll'),
      draft: tr('school.filterDraft'),
      sent: tr('school.filterSent'),
      awaiting_school: tr('school.filterAwaitingSchool'),
      awaiting_parents: tr('school.filterAwaitingParents'),
      incomplete_data: tr('school.filterIncompleteData'),
      signed: tr('school.filterSigned'),
    } as const)[key]} (${count})`;

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">{tr('school.contractsTitle')}</h1>
          <div className="flex items-center gap-2">
            <div className="bg-gray-100 rounded-lg p-1 flex gap-1">
              <button onClick={() => setTab('contracts')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'contracts' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                {tr('school.tabContracts')}
              </button>
              <button onClick={() => setTab('templates')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'templates' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                {tr('school.tabTemplates')}
              </button>
            </div>
            {tab === 'contracts' ? (
              <div className="flex gap-2">
                {Boolean(orgFeatures.school_extra_lessons_contract) && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const headers = await authHeaders();
                        const res = await fetch('/api/school-class-groups', { headers });
                        const data = await res.json();
                        if (res.ok) setClassGroups((data.groups || []).map((g: { id: string; name: string }) => ({ id: g.id, name: g.name })));
                      } catch { /* ignore */ }
                      setExtraOfferOpen(true);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> {tr('school.extra.newOffer')}
                  </Button>
                )}
                <Button onClick={openCreateContract} className="bg-emerald-600 hover:bg-emerald-700">
                  <Plus className="w-4 h-4 mr-2" /> {tr('school.newContract')}
                </Button>
              </div>
            ) : (
              <Button onClick={() => { setEditTemplate(null); setTemplatePdfFile(null); setTForm({ name: '', body: tr('school.contract.defaultBody'), annual_fee_default: '', pdf_url: '' }); setTemplateOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" /> {tr('school.newTemplate')}
              </Button>
            )}
          </div>
        </div>

        {isSchoolView && (
          <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-indigo-700" />
                  <h2 className="font-semibold text-gray-900">El. pasirašymo nustatymai</h2>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${eSignEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                    {eSignEnabled ? 'GoSign aktyvus' : 'GoSign neaktyvus'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-600">
                  Šis el. paštas naudojamas visam sutarčių pasirašymo srautui. Paskirtis, vieta ir kontaktas įrašomi į elektroninio parašo metaduomenis.
                </p>
              </div>
              <Button
                size="sm"
                onClick={saveSigningSettings}
                disabled={savingSigningSettings}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {savingSigningSettings ? 'Saugoma…' : 'Išsaugoti nustatymus'}
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Sutarčių srauto el. paštas</Label>
                <Input
                  type="email"
                  value={signingSettings.email}
                  onChange={(event) => setSigningSettings((current) => ({ ...current, email: event.target.value }))}
                  placeholder={orgEmail || 'sutartys@organizacija.lt'}
                />
              </div>
              <div className="space-y-1.5">
                <Label>El. parašo paskirtis</Label>
                <Input
                  value={signingSettings.reason}
                  onChange={(event) => setSigningSettings((current) => ({ ...current, reason: event.target.value }))}
                  placeholder="Ugdymo sutarties pasirašymas"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Pasirašymo vieta</Label>
                <Input
                  value={signingSettings.location}
                  onChange={(event) => setSigningSettings((current) => ({ ...current, location: event.target.value }))}
                  placeholder="Pvz. Vilnius"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Parašo kontaktas</Label>
                <Input
                  value={signingSettings.contact}
                  onChange={(event) => setSigningSettings((current) => ({ ...current, contact: event.target.value }))}
                  placeholder={signingSettings.email || orgEmail}
                />
              </div>
            </div>
          </section>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        ) : tab === 'contracts' ? (
          contracts.length === 0 ? (
            <div className="text-center py-20">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">{tr('school.noContracts')}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                {isSchoolView ? (
                  <Select
                    value={contractFilter as SchoolContractFilter}
                    onValueChange={(v) => setContractFilter(v as SchoolContractFilter)}
                  >
                    <SelectTrigger className="w-full sm:w-[min(100%,320px)] rounded-xl border-gray-200 bg-white">
                      <SelectValue placeholder={tr('school.filterContractsLabel')} />
                    </SelectTrigger>
                    <SelectContent>
                      {([
                        'all',
                        'draft',
                        'sent',
                        'awaiting_school',
                        'awaiting_parents',
                        'incomplete_data',
                        'signed',
                      ] as const).map((key) => (
                        <SelectItem key={key} value={key}>
                          {schoolContractFilterLabel(key, contractFilterCounts[key])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="bg-gray-100 rounded-lg p-1 flex gap-1 flex-wrap">
                    {([
                      ['all', tr('school.filterAll'), contracts.length],
                      ['unsigned', tr('school.filterUnsigned'), contracts.length - contractFilterCounts.signed],
                      ['signed', tr('school.filterSigned'), contractFilterCounts.signed],
                    ] as const).map(([key, label, count]) => (
                      <button
                        key={key}
                        onClick={() => setContractFilter(key)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${contractFilter === key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        {label} <span className={contractFilter === key ? 'text-gray-500' : 'text-gray-400'}>({count})</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    value={contractSearch}
                    onChange={(e) => setContractSearch(e.target.value)}
                    placeholder={tr('school.searchContracts')}
                    className="pl-9 rounded-xl"
                  />
                </div>
                {isSchoolView && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-xl"
                    onClick={() => void exportContractsXlsx()}
                    disabled={exportingContracts || visibleContracts.length === 0}
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    {exportingContracts ? tr('school.exportingExcel') : tr('school.exportExcel')}
                  </Button>
                )}
              </div>
              {visibleContracts.length === 0 ? (
                <p className="text-center text-gray-500 py-12">{tr('school.noContractsFiltered')}</p>
              ) : (
            <div className="grid gap-3">
              {visibleContracts.map((c, contractIdx) => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="space-y-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400 tabular-nums">{contractIdx + 1}.</span>
                        <p className="font-semibold text-gray-900">{c.student?.full_name || '—'}</p>
                        {c.kind === 'extra_lessons' && (
                          <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium bg-teal-50 text-teal-800">
                            {tr('school.extra.kindBadge')}
                          </span>
                        )}
                        {statusBadge(c.signing_status)}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {c.contract_number && <span className="mr-3">Sutarties Nr. {c.contract_number}</span>}
                        {tr('school.annualFee')} <span className="font-medium text-gray-700">&euro;{Number(c.annual_fee).toFixed(2)}</span>
                        {Number(c.additional_fee_amount || 0) > 0 && (
                          <span className="ml-3 text-gray-600">
                            + Papildomas: <span className="font-medium text-gray-700">&euro;{Number(c.additional_fee_amount).toFixed(2)}</span>
                            {c.additional_fee_purpose ? ` (${c.additional_fee_purpose})` : ''}
                          </span>
                        )}
                        {c.sent_at && <span className="ml-3">{tr('school.sent')} {new Date(c.sent_at).toLocaleDateString('lt-LT')}</span>}
                        {c.signed_at && <span className="ml-3">{tr('school.signed')} {new Date(c.signed_at).toLocaleDateString('lt-LT')}</span>}
                      </p>
                      {(c.installments || []).length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          <span className="font-medium text-gray-600">{tr('school.installmentsLabel')}</span>{' '}
                          {[...(c.installments || [])]
                            .sort((a, b) => a.installment_number - b.installment_number)
                            .map((inst, i, arr) => (
                              <span key={inst.installment_number} className={inst.payment_status === 'paid' ? 'text-emerald-700' : undefined}>
                                {inst.installment_number}) €{Number(inst.amount).toFixed(2)}
                                {inst.due_date ? ` (${new Date(inst.due_date).toLocaleDateString('lt-LT')})` : ''}
                                {inst.payment_status === 'paid' ? ' ✓' : ''}
                                {i < arr.length - 1 ? '  ·  ' : ''}
                              </span>
                            ))}
                        </p>
                      )}
                      {(() => {
                        const currentPdf = currentContractPdfPath(c);
                        const schoolSignedPdf = (c.signatures || []).find((s) => s.role === 'school' && s.status === 'signed' && s.signed_pdf_path)?.signed_pdf_path;
                        const parentScan = c.signed_contract_url && c.signed_contract_url !== currentPdf ? c.signed_contract_url : null;
                        return (
                          <>
                            {currentPdf && (
                              <p className={`text-xs mt-1 ${schoolSignedPdf ? 'text-emerald-700' : 'text-indigo-700'}`}>
                                {schoolSignedPdf ? 'Naujausia pasirašyta versija' : 'Naujausia sutarties versija'}
                                {' '}({c.student?.full_name || 'mokinys'}):{' '}
                                <button type="button" className="underline" onClick={() => openContractFile(currentPdf)}>
                                  Atidaryti failą
                                </button>
                              </p>
                            )}
                            {parentScan && (
                              <p className="text-xs text-gray-500 mt-1">
                                Įkelta tėvų kopija (be naujausio mokyklos parašo):{' '}
                                <button type="button" className="underline" onClick={() => openContractFile(parentScan)}>
                                  Atidaryti originalą
                                </button>
                              </p>
                            )}
                          </>
                        );
                      })()}
                      {(c.signatures || []).some((s) => s.role.startsWith('parent') && s.status === 'signed' && !s.gosign_transaction_id && !s.manually_marked_at) && (
                        <p className="text-xs text-emerald-700 mt-1">
                          Tėvų parašas gautas per Smart-ID (Dokobit) — PDF vientisumas ir naujas parašas patikrinti automatiškai.
                        </p>
                      )}
                      {(c.signatures || []).some((s) => s.role.startsWith('parent') && s.status === 'signed' && s.manually_marked_at) && (
                        <p className="text-xs text-amber-700 mt-1">
                          Tėvų parašas pažymėtas administratoriaus ranka — žr. sutarties failą, ar jame matomi visų šalių parašai.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
                      {c.signing_status === 'draft' && (
                        <Button size="sm" onClick={() => sendContract(c)}>
                          <Send className="w-3.5 h-3.5 mr-1.5" /> {tr('school.send')}
                        </Button>
                      )}
                      {eSignEnabled && schoolCanInitiateSignature(c) && (
                        <Button size="sm" onClick={() => signAsSchool(c)} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                          <PenLine className="w-3.5 h-3.5 mr-1.5" /> {saving ? 'Ruošiama…' : tr('school.signAsDirector')}
                        </Button>
                      )}
                      {c.signing_status === 'signed_by_school' && !schoolCanInitiateSignature(c) && (
                        <span className="text-xs text-blue-700 font-medium">{tr('school.waitingParentSignature')}</span>
                      )}

                      {(() => {
                        const menuActions = [
                          eSignEnabled && c.signing_status === 'signed_by_school',
                          !eSignEnabled && (c.signing_status === 'sent'
                            || c.signing_status === 'awaiting_school_signature'
                            || c.signing_status === 'signed_by_school'),
                          c.signing_status !== 'draft' && (!eSignEnabled || c.signing_status === 'sent'),
                          c.signing_status !== 'draft',
                        ].some(Boolean);
                        if (!menuActions) return null;
                        return (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1.5">
                            <MoreVertical className="w-4 h-4" />
                            {tr('school.contractActions')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-64 p-1">
                          <div className="flex flex-col">
                            {eSignEnabled && c.signing_status === 'signed_by_school' && !schoolCanInitiateSignature(c) && (
                              <button
                                type="button"
                                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left hover:bg-gray-50 text-green-700"
                                onClick={() => openManualMark(c)}
                              >
                                <CheckCircle className="w-4 h-4 shrink-0" />
                                {tr('school.markSigned')}
                              </button>
                            )}
                            {!eSignEnabled && (c.signing_status === 'sent'
                              || c.signing_status === 'awaiting_school_signature'
                              || c.signing_status === 'signed_by_school') && (
                              <button
                                type="button"
                                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left hover:bg-gray-50 text-green-700"
                                onClick={() => markSigned(c)}
                              >
                                <CheckCircle className="w-4 h-4 shrink-0" />
                                {tr('school.markSigned')}
                              </button>
                            )}
                            {c.signing_status !== 'draft' && (!eSignEnabled || c.signing_status === 'sent') && (
                              <button
                                type="button"
                                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left hover:bg-gray-50"
                                onClick={() => resendContract(c)}
                              >
                                <Send className="w-4 h-4 shrink-0" />
                                {tr('school.resend')}
                              </button>
                            )}
                            {c.signing_status !== 'draft' && (
                              <button
                                type="button"
                                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left hover:bg-gray-50"
                                onClick={() => pickAndUploadSignedContract(c)}
                                disabled={saving}
                              >
                                <FileText className="w-4 h-4 shrink-0" />
                                {tr('school.uploadSignedCopy')}
                              </button>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                        );
                      })()}

                      <button
                        onClick={() => deleteContract(c.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-auto"
                        aria-label={tr('school.confirmDeleteContract')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {eSignEnabled && c.signing_status === 'sent' && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      Laukiama, kol tėvai peržiūrės sutartį ir patvirtins duomenis Tutlio puslapyje.
                    </div>
                  )}
                  {eSignEnabled && c.signing_status === 'awaiting_school_signature' && c.completion_submitted_at && (
                    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
                      Tėvai patvirtino duomenis. Peržiūrėkite naujausią PDF ir pasirašykite naujame GoSign lange.
                    </div>
                  )}
                </div>
              ))}
            </div>
              )}
            </>
          )
        ) : (
          templates.length === 0 ? (
            <div className="text-center py-20">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">{tr('school.noTemplates')}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {templates.map((tpl) => (
                <div key={tpl.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 break-words">{tpl.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {tr('school.defaultFee')} {tpl.annual_fee_default != null ? fmtMoney(tpl.annual_fee_default) : tr('school.defaultFeeNotSet')}
                    </p>
                    {tpl.pdf_url && (
                      <button type="button" className="text-xs text-emerald-700 hover:underline" onClick={() => openContractFile(tpl.pdf_url)}>
                        {tr('school.openPdfTemplate')}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditTemplate(tpl)}>
                      <Edit2 className="w-3.5 h-3.5 mr-1.5" /> {tr('school.edit')}
                    </Button>
                    <button onClick={() => deleteTemplate(tpl.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <Dialog
        open={Boolean(pendingScanUpload)}
        onOpenChange={(open) => { if (!open && !saving) setPendingScanUpload(null); }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{tr('school.scanAskSchoolSignedTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">{tr('school.scanAskSchoolSignedBody')}</p>
          {pendingScanUpload && (
            <p className="text-sm text-gray-900 font-medium">
              {pendingScanUpload.contract.student?.full_name || pendingScanUpload.file.name}
            </p>
          )}
          <div className="grid gap-2">
            <Button
              disabled={saving || !pendingScanUpload}
              className="h-auto whitespace-normal py-3"
              onClick={() => {
                if (!pendingScanUpload) return;
                void uploadSignedContract(pendingScanUpload.contract, pendingScanUpload.file, true);
              }}
            >
              <span className="block text-left">
                <span className="block font-semibold">{tr('school.scanAskSchoolSignedYes')}</span>
                <span className="block text-xs font-normal opacity-90 mt-0.5">{tr('school.scanAskSchoolSignedYesHint')}</span>
              </span>
            </Button>
            <Button
              variant="outline"
              disabled={saving || !pendingScanUpload}
              className="h-auto whitespace-normal py-3"
              onClick={() => {
                if (!pendingScanUpload) return;
                void uploadSignedContract(pendingScanUpload.contract, pendingScanUpload.file, false);
              }}
            >
              <span className="block text-left">
                <span className="block font-semibold">{tr('school.scanAskSchoolSignedNo')}</span>
                <span className="block text-xs font-normal text-gray-600 mt-0.5">{tr('school.scanAskSchoolSignedNoHint')}</span>
              </span>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={saving} onClick={() => setPendingScanUpload(null)}>
              {tr('common.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(manualMarkContract)} onOpenChange={(open) => { if (!open && !manualMarkBusy) setManualMarkContract(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pažymėti tėvų parašą ranka</DialogTitle>
          </DialogHeader>
          {manualMarkContract && (() => {
            const sigs = manualMarkContract.signatures || [];
            const primarySigned = sigs.some((s) => s.role === 'parent_primary' && s.status === 'signed');
            const pendingName = primarySigned
              ? manualMarkContract.student?.parent_secondary_name || 'antrasis iš tėvų'
              : manualMarkContract.student?.payer_name || 'tėvas / globėjas';
            return (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Naudokite tik tada, kai <span className="font-medium text-gray-900">{pendingName}</span> sutartį
                  tikrai pasirašė ne per Tutlio nuorodą (pvz., savo Dokobit paskyroje), o sistema vis dar rodo „laukiama tėvų parašo“.
                </p>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Rekomenduojama: įkelti pasirašytą PDF</p>
                  <p className="text-xs text-gray-600 mb-2">
                    Įkelkite iš Dokobit (ar kitos sistemos) atsisiųstą pasirašytą PDF. Failas patikrinamas automatiškai,
                    o galutinėje sutartyje matysis <span className="font-medium">visų šalių parašai</span>.
                    Jei turite tik nuotrauką pasirašytos sutarties, naudokite mygtuką „{tr('school.uploadSignedCopy')}“ sutarčių sąraše.
                  </p>
                  <label className={`block ${manualMarkBusy ? 'opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      disabled={manualMarkBusy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void manualMarkWithFile(file);
                        e.target.value = '';
                      }}
                    />
                    <span className="block w-full text-center border-2 border-emerald-600 text-emerald-700 hover:bg-emerald-50 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors">
                      {manualMarkBusy ? 'Įkeliama ir tikrinama…' : 'Įkelti pasirašytą PDF'}
                    </span>
                  </label>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Be failo (kraštutinis atvejis)</p>
                  <p className="text-xs text-gray-600 mb-2">
                    Sutartis bus pažymėta pasirašyta, tačiau tėvų parašas <span className="font-medium">nebus matomas
                    sutarties faile</span> — liks paskutinė Tutlio turima PDF versija (su mokyklos parašu).
                  </p>
                  <label className="flex items-start gap-2 text-xs text-gray-700 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={manualMarkNoFileConfirm}
                      disabled={manualMarkBusy}
                      onChange={(e) => setManualMarkNoFileConfirm(e.target.checked)}
                    />
                    <span>Patvirtinu, kad įsitikinau, jog {pendingName} sutartį pasirašė, ir prisiimu atsakomybę už žymėjimą be parašo failo.</span>
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={manualMarkBusy || !manualMarkNoFileConfirm}
                    onClick={() => void manualMarkWithoutFile()}
                    className="w-full text-amber-800 border-amber-300 hover:bg-amber-100"
                  >
                    {manualMarkBusy ? 'Žymima…' : 'Pažymėti pasirašyta be failo'}
                  </Button>
                </div>
                {manualMarkErr && (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">{manualMarkErr}</p>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTemplate ? tr('school.editTemplate') : tr('school.newTemplateDialog')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!isSchoolView && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{tr('school.templateName')}</Label>
                    <Input value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} placeholder={tr('school.templateNamePlaceholder')} />
                  </div>
                  <div className="space-y-2">
                    <Label>{tr('school.templateDefaultFee')}</Label>
                    <Input type="number" step="0.01" value={tForm.annual_fee_default} onChange={(e) => setTForm({ ...tForm, annual_fee_default: e.target.value })} placeholder="500.00" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{tr('school.contractBody')}</Label>
                  <p className="text-xs text-gray-400">{tr('school.placeholdersHint')} {PLACEHOLDERS.join(', ')}</p>
                  <Textarea
                    value={tForm.body}
                    onChange={(e) => setTForm({ ...tForm, body: e.target.value })}
                    className="min-h-[300px] font-mono text-sm"
                    placeholder={tr('school.enterTemplatePlaceholder')}
                  />
                </div>
              </>
            )}
            {isSchoolView && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{tr('school.templateName')}</Label>
                  <Input value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} placeholder={tr('school.templateNamePlaceholder')} />
                </div>
                <div className="space-y-2">
                  <Label>{tr('school.templateDefaultFee')}</Label>
                  <Input type="number" min="0" step="0.01" value={tForm.annual_fee_default} onChange={(e) => setTForm({ ...tForm, annual_fee_default: e.target.value })} placeholder="300" />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>{isSchoolView ? 'Įkelti DOCX failą' : tr('school.templatePdf')}</Label>
              <div
                className={`rounded-lg border-2 border-dashed p-4 text-sm transition-colors ${
                  isTemplateDragActive
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                    : 'border-gray-300 bg-gray-50 text-gray-600'
                }`}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setIsTemplateDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsTemplateDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsTemplateDragActive(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsTemplateDragActive(false);
                  const dropped = e.dataTransfer.files?.[0] || null;
                  setTemplateFileFromCandidate(dropped);
                }}
                onClick={() => templateFileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    templateFileInputRef.current?.click();
                  }
                }}
              >
                <p>
                  {isSchoolView
                    ? 'Nutempkite DOCX failą čia arba paspauskite pasirinkti failą.'
                    : 'Nutempkite PDF/DOCX faila cia arba paspauskite pasirinkti faila.'}
                </p>
                {isSchoolView && (
                  <p className="mt-1 text-xs text-gray-500">
                    Sutartys generuojamos užpildant jūsų DOCX dokumentą, todėl šriftas, paraštės ir išdėstymas išlieka tokie, kokius įkėlėte.
                  </p>
                )}
                {templatePdfFile && (
                  <p className="mt-2 text-xs text-emerald-700">Pasirinktas failas: {templatePdfFile.name}</p>
                )}
              </div>
              {isSchoolView && (
                <p className="text-xs text-gray-400">
                  {tr('school.placeholdersHint')} {PLACEHOLDERS.join(', ')}
                </p>
              )}
              <Input
                ref={templateFileInputRef}
                type="file"
                accept={isSchoolView
                  ? '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  : 'application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'}
                onChange={(e) => setTemplateFileFromCandidate(e.target.files?.[0] || null)}
                className="sr-only"
              />
              <Button type="button" variant="outline" onClick={() => templateFileInputRef.current?.click()}>
                Pasirinkti faila
              </Button>
              {tForm.pdf_url && (
                <button type="button" className="text-xs text-emerald-700 hover:underline" onClick={() => openContractFile(tForm.pdf_url)}>
                  {tr('school.openPdfTemplate')}
                </button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>{tr('school.cancel')}</Button>
            <Button
              onClick={saveTemplate}
              disabled={saving || (!isSchoolView && !tForm.name.trim()) || (isSchoolView && !templatePdfFile && !tForm.pdf_url)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? tr('school.savingTemplate') : editTemplate ? tr('school.update') : tr('school.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={contractOpen} onOpenChange={setContractOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr('school.newContractDialog')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{tr('school.studentName')}</Label>
                <Select
                  value={cForm.student_id}
                  onValueChange={(studentId) => {
                    onStudentSelect(studentId);
                    setContractStudentSearch('');
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={tr('school.selectStudent')} /></SelectTrigger>
                  {/* Radix Select has no onOpenAutoFocus; the search input keeps focus via autoFocus + stopPropagation. */}
                  <SelectContent className="max-h-72 overflow-y-auto">
                    <div className="sticky top-0 z-10 bg-white p-2 border-b border-gray-100">
                      <Input
                        value={contractStudentSearch}
                        onChange={(e) => setContractStudentSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        autoFocus
                        placeholder={tr('common.search')}
                        className="h-9 rounded-xl"
                      />
                    </div>
                    {(contractStudentSearch
                      ? sortStudentsByFullName(students).filter((s) =>
                          (s.full_name || '').toLowerCase().includes(contractStudentSearch.trim().toLowerCase()),
                        )
                      : sortStudentsByFullName(students)
                    ).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}{s.grade?.trim() ? ` — ${s.grade.trim()}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cForm.student_id && (
                  <p className="text-xs text-gray-500">
                    {(() => {
                      const grade = students.find((s) => s.id === cForm.student_id)?.grade?.trim();
                      return grade ? `Klasė: ${grade}` : 'Klasė nenurodyta (galite priskirti mokinių sąraše).';
                    })()}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{tr('school.templateLabel')}</Label>
                <Select value={cForm.template_id} onValueChange={onTemplateSelect}>
                  <SelectTrigger><SelectValue placeholder={tr('school.selectTemplate')} /></SelectTrigger>
                  <SelectContent>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isSchoolView && !templateFileIsDocx(templates.find((t) => t.id === cForm.template_id)?.pdf_url) && (
                  <p className="text-xs text-amber-700">
                    {cForm.template_id
                      ? 'Šis šablonas neturi DOCX failo, todėl sutartis bus sugeneruota supaprastintu Tutlio formatu. Kad sutartis atrodytų kaip jūsų įkeltas dokumentas, šablone įkelkite DOCX failą.'
                      : 'Nepasirinkus šablono su DOCX failu sutartis bus sugeneruota supaprastintu Tutlio formatu.'}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sutarties numeris</Label>
              <Input
                value={cForm.contract_number}
                onChange={(e) => {
                  const contractNumber = e.target.value;
                  setCForm((prev) => ({
                    ...prev,
                    contract_number: contractNumber,
                    filled_body: buildFilledBody({
                      contractNumber,
                      annualFee: prev.annual_fee,
                      studentId: prev.student_id,
                      parentName: contractParentName,
                      parentEmail: contractParentEmail,
                      parentPhone: contractParentPhone,
                      parentPersonalCode: contractParentPersonalCode,
                      childBirthDate: contractChildBirthDate,
                      address: contractAddress,
                    }),
                  }));
                }}
                placeholder="Pvz. SUT-2026-001"
              />
              <p className="text-xs text-gray-500">
                Jei neįrašysite, numeris bus sugeneruotas automatiškai.
              </p>
            </div>
            <div className="space-y-2">
              <Label>{tr('school.annualFeeStar')}</Label>
              <Input
                type="number"
                min={isSchoolView ? '0' : undefined}
                step="0.01"
                value={cForm.annual_fee}
                onChange={(e) =>
                  setCForm({
                    ...cForm,
                    annual_fee: e.target.value,
                    filled_body: buildFilledBody({
                      contractNumber: cForm.contract_number,
                      annualFee: e.target.value,
                      studentId: cForm.student_id,
                      parentName: contractParentName,
                      parentEmail: contractParentEmail,
                      parentPhone: contractParentPhone,
                      parentPersonalCode: contractParentPersonalCode,
                      childBirthDate: contractChildBirthDate,
                      address: contractAddress,
                    }),
                  })
                }
                placeholder={isSchoolView ? '300' : '500.00'}
              />
              {isSchoolView && (
                <p className="text-xs text-gray-500">
                  Numatytoji suma — 300 EUR. Galite įrašyti ir 0 EUR. Įrašyta suma bus naudojama sutartyje ir mokėjimuose.
                </p>
              )}
              {isSchoolView && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={applyFeeDiscount}
                    onChange={(e) => setApplyFeeDiscount(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-600"
                  />
                  Taikyti 20% nuolaidą
                </label>
              )}
              {isSchoolView && applyFeeDiscount && discountedAnnualFee(cForm.annual_fee) && (
                <p className="text-xs font-medium text-emerald-700">
                  Su nuolaida: {discountedAnnualFee(cForm.annual_fee)} EUR — ši suma bus įrašyta sutartyje ir mokėjimuose.
                </p>
              )}
            </div>
            {isSchoolView && (
              <div className="space-y-3 rounded-xl border border-gray-200 p-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={hasAdditionalFee}
                    onChange={(e) => setHasAdditionalFee(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-600"
                  />
                  Papildomas mokestis
                </label>
                {hasAdditionalFee && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Paskirtis</Label>
                      <Input
                        value={additionalFeePurpose}
                        onChange={(e) => setAdditionalFeePurpose(e.target.value)}
                        placeholder="Pvz. administravimo mokestis"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Suma (EUR)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={additionalFeeAmount}
                        onChange={(e) => setAdditionalFeeAmount(e.target.value)}
                        placeholder="50.00"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{tr('compStu.parentFullNameRequired')}</Label>
                <Input
                  value={contractParentName}
                  onChange={(e) => {
                    const parentName = e.target.value;
                    setContractParentName(parentName);
                    setCForm((prev) => ({
                      ...prev,
                      filled_body: buildFilledBody({
                        annualFee: prev.annual_fee,
                        studentId: prev.student_id,
                        parentName,
                        parentEmail: contractParentEmail,
                        parentPhone: contractParentPhone,
                        parentPersonalCode: contractParentPersonalCode,
                        childBirthDate: contractChildBirthDate,
                        address: contractAddress,
                      }),
                    }));
                  }}
                  placeholder={tr('compStu.parentNamePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label>{tr('compStu.parentEmailRequired')}</Label>
                <Input
                  type="email"
                  value={contractParentEmail}
                  onChange={(e) => {
                    const parentEmail = e.target.value;
                    setContractParentEmail(parentEmail);
                    setCForm((prev) => ({
                      ...prev,
                      filled_body: buildFilledBody({
                        annualFee: prev.annual_fee,
                        studentId: prev.student_id,
                        parentName: contractParentName,
                        parentEmail,
                        parentPhone: contractParentPhone,
                        parentPersonalCode: contractParentPersonalCode,
                        childBirthDate: contractChildBirthDate,
                        address: contractAddress,
                      }),
                    }));
                  }}
                  placeholder="tevai@example.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>{isSchoolView ? 'Tėvų tel. nr.' : tr('compStu.parentPhoneRequired')}</Label>
                <Input
                  value={contractParentPhone}
                  onChange={(e) => {
                    const parentPhone = e.target.value;
                    setContractParentPhone(parentPhone);
                    setCForm((prev) => ({
                      ...prev,
                      filled_body: buildFilledBody({
                        annualFee: prev.annual_fee,
                        studentId: prev.student_id,
                        parentName: contractParentName,
                        parentEmail: contractParentEmail,
                        parentPhone,
                        parentPersonalCode: contractParentPersonalCode,
                        childBirthDate: contractChildBirthDate,
                        address: contractAddress,
                      }),
                    }));
                  }}
                  placeholder="+370 600 00000"
                />
              </div>
              <div className="space-y-2">
                <Label>Tėvų asmens kodas</Label>
                <Input
                  value={contractParentPersonalCode}
                  onChange={(e) => {
                    const parentPersonalCode = e.target.value;
                    setContractParentPersonalCode(parentPersonalCode);
                    setCForm((prev) => ({
                      ...prev,
                      filled_body: buildFilledBody({
                        annualFee: prev.annual_fee,
                        studentId: prev.student_id,
                        parentName: contractParentName,
                        parentEmail: contractParentEmail,
                        parentPhone: contractParentPhone,
                        parentPersonalCode,
                        childBirthDate: contractChildBirthDate,
                        address: contractAddress,
                      }),
                    }));
                  }}
                  placeholder="Asmens kodas"
                />
              </div>
              <div className="space-y-2">
                <Label>Vaiko gimimo data</Label>
                <DateInput
                  value={contractChildBirthDate}
                  onChange={(e) => {
                    const childBirthDate = e.target.value;
                    setContractChildBirthDate(childBirthDate);
                    setCForm((prev) => ({
                      ...prev,
                      filled_body: buildFilledBody({
                        annualFee: prev.annual_fee,
                        studentId: prev.student_id,
                        parentName: contractParentName,
                        parentEmail: contractParentEmail,
                        parentPhone: contractParentPhone,
                      parentPersonalCode: contractParentPersonalCode,
                        childBirthDate,
                        address: contractAddress,
                      }),
                    }));
                  }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Gyvenamoji vieta</Label>
              <Input
                value={contractAddress}
                onChange={(e) => {
                  const address = e.target.value;
                  setContractAddress(address);
                  setCForm((prev) => ({
                    ...prev,
                    filled_body: buildFilledBody({
                      annualFee: prev.annual_fee,
                      studentId: prev.student_id,
                      parentName: contractParentName,
                      parentEmail: contractParentEmail,
                      parentPhone: contractParentPhone,
                      parentPersonalCode: contractParentPersonalCode,
                      childBirthDate: contractChildBirthDate,
                      address,
                    }),
                  }));
                }}
                placeholder="Miestas, gatvė, namo nr."
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={parentsWillFillMissing}
                onChange={(e) => setParentsWillFillMissing(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600"
              />
              Tėvai užpildys trūkstamus duomenis po sutarties gavimo
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={sendImmediately}
                onChange={(e) => setSendImmediately(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600"
              />
              {tr('school.sendContractImmediately')}
            </label>
            <div className="space-y-2">
              <Label>{tr('school.paymentPlan')}</Label>
              <Select value={paymentMode} onValueChange={(v: 'full' | 'installments') => setPaymentMode(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">{tr('school.payFull')}</SelectItem>
                  <SelectItem value="installments">{tr('school.payInstallments')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paymentMode === 'installments' && (
              <div className="space-y-3 rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">{tr('school.installments')}</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => setInstallmentRows((prev) => [...prev, { amount: '', due_date: '' }])}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> {tr('school.add')}
                  </Button>
                </div>
                {installmentRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-[32px_1fr_1fr_32px] gap-2 items-end">
                    <span className="text-xs text-gray-500 pb-2">#{idx + 1}</span>
                    <div className="space-y-1">
                      <Label className="text-xs">{tr('school.amount')}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) =>
                          setInstallmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r)))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{tr('school.dueDateField')}</Label>
                      <DateInput
                        value={row.due_date}
                        onChange={(e) =>
                          setInstallmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, due_date: e.target.value } : r)))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      disabled={installmentRows.length === 1}
                      onClick={() => setInstallmentRows((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractOpen(false)}>{tr('school.cancel')}</Button>
            <Button onClick={createContract} disabled={saving || !cForm.student_id || parseAnnualFeeInput(cForm.annual_fee) == null} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? tr('school.creating') : tr('school.createContract')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExtraLessonsOfferDialog
        open={extraOfferOpen}
        onOpenChange={setExtraOfferOpen}
        students={students}
        groups={classGroups}
        onCreated={(info) => {
          setToast({ message: `${tr('school.extra.sent')} ${info.contractNumber}`, type: 'success' });
          invalidateCache(CONTRACTS_CACHE_KEY);
        }}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
