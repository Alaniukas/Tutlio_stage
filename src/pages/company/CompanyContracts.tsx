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
import { Plus, FileText, Send, CheckCircle, Edit2, Trash2 } from 'lucide-react';
import Toast from '@/components/Toast';
import { sendEmail } from '@/lib/email';
import { useTranslation } from '@/lib/i18n';
import { sortStudentsByFullName } from '@/lib/sortStudentsByFullName';
import { useLocation } from 'react-router-dom';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { schoolContractPdfStoragePath } from '@/lib/schoolContractPdfPath';

interface Student {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
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
  signing_status: 'draft' | 'sent' | 'signed';
  signed_at: string | null;
  sent_at: string | null;
  created_at: string;
  pdf_url?: string | null;
  signed_contract_url?: string | null;
  signed_uploaded_at?: string | null;
  student?: { full_name: string; email: string; phone?: string | null; payer_name: string | null; payer_email: string | null; payer_phone?: string | null; payer_personal_code?: string | null; parent_secondary_name?: string | null; parent_secondary_email?: string | null; parent_secondary_phone?: string | null; parent_secondary_personal_code?: string | null; parent_secondary_address?: string | null; student_address?: string | null; student_city?: string | null; child_birth_date?: string | null };
}

interface InstallmentDraft {
  amount: string;
  due_date: string;
}

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

const CONTRACTS_CACHE_KEY = 'company_contracts';

export default function CompanyContracts() {
  const { t: tr } = useTranslation();
  const location = useLocation();
  const isSchoolView = location.pathname.startsWith('/school');
  const orgBasePath = location.pathname.startsWith('/school') ? '/school' : '/company';
  const cc = getCached<any>(CONTRACTS_CACHE_KEY);
  const [orgId, setOrgId] = useState<string | null>(cc?.orgId ?? null);
  const [orgName, setOrgName] = useState(cc?.orgName ?? '');
  const [orgEmail, setOrgEmail] = useState(cc?.orgEmail ?? '');
  const [templates, setTemplates] = useState<Template[]>(cc?.templates ?? []);
  const [contracts, setContracts] = useState<Contract[]>(cc?.contracts ?? []);
  const [students, setStudents] = useState<Student[]>(cc?.students ?? []);
  const [loading, setLoading] = useState(!cc);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [tForm, setTForm] = useState({ name: '', body: '', annual_fee_default: '', pdf_url: '' });
  const [templatePdfFile, setTemplatePdfFile] = useState<File | null>(null);
  const [isTemplateDragActive, setIsTemplateDragActive] = useState(false);
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);

  const [contractOpen, setContractOpen] = useState(false);
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
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<'contracts' | 'templates'>('contracts');

  useEffect(() => { if (!getCached(CONTRACTS_CACHE_KEY)) load(); }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('success') === '1' || params.get('cancelled') === '1' || params.get('installment')) {
      reload();
    }
  }, [location.search]);

  const load = async () => {
    if (!getCached(CONTRACTS_CACHE_KEY)) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: admin } = await supabase
      .from('organization_admins')
      .select('organization_id, organizations(name, email)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!admin?.organization_id) { setLoading(false); return; }
    setOrgId(admin.organization_id);
    const name = (admin.organizations as any)?.name || '';
    const email = (admin.organizations as any)?.email || '';
    setOrgName(name);
    setOrgEmail(email);

    const [tRes, cRes, sRes] = await Promise.all([
      supabase.from('school_contract_templates').select('*').eq('organization_id', admin.organization_id).order('created_at', { ascending: false }),
      supabase.from('school_contracts').select('*, media_publicity_consent, student:students(full_name, email, phone, payer_name, payer_email, payer_phone, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date, media_publicity_consent)').eq('organization_id', admin.organization_id).is('archived_at', null).order('created_at', { ascending: false }),
      supabase.from('students').select('id, full_name, email, phone, payer_name, payer_email, payer_phone, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date, media_publicity_consent').eq('organization_id', admin.organization_id).order('full_name'),
    ]);

    const tData = tRes.data || [];
    const cData = cRes.data || [];
    const sData = sRes.data || [];
    setTemplates(tData);
    setContracts(cData);
    setStudents(sData);
    setCache(CONTRACTS_CACHE_KEY, { orgId: admin.organization_id, orgName: name, orgEmail: email, templates: tData, contracts: cData, students: sData });
    setLoading(false);
  };

  const reload = () => { invalidateCache(CONTRACTS_CACHE_KEY); load(); };

  const saveTemplate = async () => {
    if (!orgId) return;
    if (!isSchoolView && !tForm.name.trim()) return;
    if (isSchoolView && !templatePdfFile && !tForm.pdf_url) return;
    setSaving(true);
    const resolvedTemplateName = isSchoolView
      ? (tForm.name.trim() || templatePdfFile?.name || `Sutarties sablonas ${new Date().toLocaleDateString('lt-LT')}`)
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
      annual_fee_default: tForm.annual_fee_default ? Number(tForm.annual_fee_default) : null,
      pdf_url: tForm.pdf_url || null,
    };

    if (templatePdfFile) {
      const fileExt = templatePdfFile.name.split('.').pop()?.toLowerCase() || 'pdf';
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
      if (fileExt === 'docx') {
        try {
          const buffer = await templatePdfFile.arrayBuffer();
          const extracted = await mammoth.extractRawText({ arrayBuffer: buffer });
          if (!isSchoolView && (extracted.value || '').trim()) {
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
    const isAllowed =
      candidate.type === 'application/pdf' ||
      candidate.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.pdf') ||
      lowerName.endsWith('.docx');
    if (!isAllowed) {
      setToast({ message: 'Galima ikelti tik PDF arba DOCX faila.', type: 'error' });
      return;
    }
    setTemplatePdfFile(candidate);
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

  /** Always emails installment details to the payer. Adds Stripe link only if checkout succeeds (e.g. org Connect ready). */
  const sendFirstInstallmentPaymentLink = async (params: {
    installmentId: string;
    installmentNumber: number;
    totalInstallments: number;
    amount: number;
    dueDate: string;
    studentName: string;
    parentName: string;
    recipientEmail: string;
  }): Promise<{ paymentUrl?: string; checkoutError?: string }> => {
    let paymentUrl: string | undefined;
    let checkoutError: string | undefined;
    try {
      const hdrs = await authHeaders();
      const resp = await fetch('/api/create-school-installment-checkout', {
        method: 'POST',
        headers: { ...hdrs, 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId: params.installmentId, returnPath: `${orgBasePath}/contracts` }),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && typeof json?.url === 'string') {
        paymentUrl = json.url;
      } else {
        const raw =
          (typeof json?.message === 'string' && json.message.trim()) ||
          (typeof json?.error === 'string' && json.error) ||
          `HTTP ${resp.status}`;
        const code = typeof json?.code === 'string' ? json.code : '';
        checkoutError = code ? `${raw} (${code})` : raw;
        console.warn('[CompanyContracts] Checkout not created:', checkoutError);
      }
    } catch (e) {
      checkoutError = tr('school.checkoutNetworkError');
      console.warn('[CompanyContracts] create-school-installment-checkout failed:', e);
    }

    const emailed = await sendEmail({
      type: 'school_installment_request',
      to: params.recipientEmail,
      data: {
        schoolName: orgName,
        schoolEmail: orgEmail,
        studentName: params.studentName,
        parentName: params.parentName,
        recipientName: params.parentName,
        installmentNumber: params.installmentNumber,
        totalInstallments: params.totalInstallments,
        amount: Number(params.amount).toFixed(2),
        dueDate: new Date(params.dueDate).toLocaleDateString('lt-LT'),
        ...(paymentUrl ? { paymentUrl } : {}),
      },
    });
    if (!emailed) {
      throw new Error(tr('school.toastInstallmentEmailFail'));
    }

    const out: { paymentUrl?: string; checkoutError?: string } = {};
    if (paymentUrl) out.paymentUrl = paymentUrl;
    else if (checkoutError) out.checkoutError = checkoutError;
    return out;
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

    const lowerUrl = (params.templateUrl || '').toLowerCase();
    if (lowerUrl.endsWith('.docx')) {
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
    const nextAnnual = isSchoolView ? '300' : (tpl.annual_fee_default?.toString() || cForm.annual_fee);
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
    if (!orgId || !cForm.student_id || !cForm.annual_fee) return;
    const effectiveAnnualFee = isSchoolView ? '300' : cForm.annual_fee;
    const effectiveContractNumber = cForm.contract_number.trim() || generateContractNumber();
    if (!contractParentName.trim()) {
      setToast({ message: tr('compStu.parentNameRequiredError'), type: 'error' });
      return;
    }
    if (!contractParentEmail.trim()) {
      setToast({ message: tr('compStu.parentEmailRequiredError'), type: 'error' });
      return;
    }
    if (!contractParentPhone.trim()) {
      setToast({ message: tr('compStu.parentPhoneRequiredError'), type: 'error' });
      return;
    }
    if (paymentMode === 'installments' && installmentRows.some((r) => !r.amount || !r.due_date)) {
      setToast({ message: tr('school.installmentsRequired'), type: 'error' });
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
            payer_phone: contractParentPhone.trim(),
            payer_personal_code: contractParentPersonalCode.trim() || null,
            child_birth_date: contractChildBirthDate.trim() || null,
          })
          .eq('id', cForm.student_id);
      }

      const missingFields = [
        !contractAddress.trim() ? 'Gyvenamoji vieta' : '',
        !contractChildBirthDate.trim() ? 'Vaiko gimimo data' : '',
        !contractParentPersonalCode.trim() ? 'Tėvų asmens kodas' : '',
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
        signing_status: sendImmediately ? 'sent' : 'draft',
        sent_at: sendImmediately ? new Date().toISOString() : null,
      }).select('*, student:students(full_name, email, payer_name, payer_email, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_phone, parent_secondary_personal_code, parent_secondary_address, student_address, student_city, child_birth_date)').single();

      if (error) { setToast({ message: error.message, type: 'error' }); return; }

      let firstInstallment:
        | { id: string; installment_number: number; amount: number; due_date: string }
        | null = null;
      let totalInstallments = 0;

      if (paymentMode === 'installments' && created) {
      const schedule = installmentRows.map((r, idx) => ({
        contract_id: created.id,
        installment_number: idx + 1,
        amount: Number(r.amount),
        due_date: r.due_date,
      }));
      const { data: insertedInstallments, error: installmentsErr } = await supabase
        .from('school_payment_installments')
        .insert(schedule)
        .select('id, installment_number, amount, due_date')
        .order('installment_number', { ascending: true });
      if (installmentsErr) {
        setToast({ message: installmentsErr.message, type: 'error' });
        reload();
        return;
      }
      if (insertedInstallments?.length) {
        firstInstallment = insertedInstallments[0] as any;
        totalInstallments = insertedInstallments.length;
      }
      }

      if (paymentMode === 'full' && created) {
      const dueDate = new Date().toISOString().slice(0, 10);
      const { data: oneInstallment, error: oneInstallmentErr } = await supabase
        .from('school_payment_installments')
        .insert({
          contract_id: created.id,
          installment_number: 1,
          amount: Number(effectiveAnnualFee),
          due_date: dueDate,
        })
        .select('id, installment_number, amount, due_date')
        .single();
      if (oneInstallmentErr) {
        setToast({ message: oneInstallmentErr.message, type: 'error' });
        reload();
        return;
      }
      firstInstallment = oneInstallment as any;
      totalInstallments = 1;
      }

      let installmentCheckoutWarning: string | undefined;

      if (sendImmediately && created) {
        const recipient = contractParentEmail.trim() || created.student?.payer_email || created.student?.email;
        if (!recipient) {
          await supabase.from('school_contracts').update({ signing_status: 'draft', sent_at: null }).eq('id', created.id);
          setToast({ message: tr('school.toastNoEmail'), type: 'error' });
          reload();
          return;
        }

        const sendContractChainOk = await (async (): Promise<boolean> => {
          const shouldIncludeCompletion = (isSchoolView && missingFields.length > 0) || (parentsWillFillMissing && missingFields.length > 0);
          const completionUrl = shouldIncludeCompletion ? await createCompletionUrl(created.id) : null;
          const ok = await sendEmail({
            type: 'school_contract',
            to: recipient,
            data: {
              schoolName: orgName,
              schoolEmail: orgEmail,
              studentName: created.student?.full_name || '',
              parentName: contractParentName.trim() || created.student?.payer_name || created.student?.full_name || '',
              recipientName: contractParentName.trim() || created.student?.payer_name || created.student?.full_name || '',
              parentPhone: contractParentPhone.trim(),
              parentPersonalCode: contractParentPersonalCode.trim() || undefined,
              childBirthDate: contractChildBirthDate.trim() || undefined,
              address: contractAddress.trim() || undefined,
              missingFields: isSchoolView ? missingFields : (parentsWillFillMissing ? missingFields : []),
              completionUrl: completionUrl || undefined,
              contractId: created.id,
              contractNumber: created.contract_number || effectiveContractNumber,
              annualFee: created.annual_fee,
              contractBody: created.filled_body,
              pdfUrl: created.pdf_url || undefined,
              date: new Date().toLocaleDateString('lt-LT'),
            },
          });
          if (!ok) {
            await supabase.from('school_contracts').update({ signing_status: 'draft', sent_at: null }).eq('id', created.id);
            setToast({ message: tr('school.toastContractSendFail'), type: 'error' });
            reload();
            return false;
          }

          if (firstInstallment) {
            try {
              const pay = await sendFirstInstallmentPaymentLink({
                installmentId: firstInstallment.id,
                installmentNumber: firstInstallment.installment_number,
                totalInstallments,
                amount: Number(firstInstallment.amount),
                dueDate: firstInstallment.due_date,
                studentName: created.student?.full_name || '',
                parentName: contractParentName.trim() || created.student?.payer_name || created.student?.full_name || '',
                recipientEmail: recipient,
              });
              if (!pay.paymentUrl && pay.checkoutError) {
                installmentCheckoutWarning = pay.checkoutError;
              }
            } catch (paymentErr: any) {
              setToast({
                message: paymentErr?.message || tr('school.toastInstallmentEmailFail'),
                type: 'error',
              });
              return false;
            }
          }
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
      setToast({
        message: installmentCheckoutWarning
          ? `${baseSuccessMsg} (${tr('school.checkoutStripeDetail')}: ${installmentCheckoutWarning})`
          : baseSuccessMsg,
        type: installmentCheckoutWarning ? 'warning' : 'success',
      });
      reload();
    } catch (e: any) {
      setToast({ message: e?.message || 'Nepavyko sukurti sutarties.', type: 'error' });
    } finally {
      setSaving(false);
    }
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

      const missingFields = [
      !(student?.student_address || '').trim() && !(student?.student_city || '').trim() ? 'Gyvenamoji vieta' : '',
      !(student?.child_birth_date || '').trim() ? 'Vaiko gimimo data' : '',
      !(student?.payer_personal_code || '').trim() ? 'Tėvų asmens kodas' : '',
      isSchoolView && !(String((contract as any)?.media_publicity_consent || '').trim()) ? 'Vaiko atvaizdo naudojimo sutikimas' : '',
    ].filter(Boolean);
      const completionUrl = missingFields.length > 0 ? await createCompletionUrl(contract.id) : null;
      void (async () => {
        const ok = await sendEmail({
          type: 'school_contract',
          to: recipient,
          data: {
            schoolName: orgName,
            schoolEmail: orgEmail,
            studentName: student?.full_name || '',
            parentName: student?.payer_name || student?.full_name || '',
            recipientName: student?.payer_name || student?.full_name || '',
            parentPhone: student?.payer_phone || undefined,
            parentPersonalCode: student?.payer_personal_code || undefined,
            missingFields,
            completionUrl: completionUrl || undefined,
            contractId: contract.id,
            childBirthDate: student?.child_birth_date || undefined,
            contractNumber: contract.contract_number || undefined,
            annualFee: contract.annual_fee,
            contractBody: contract.filled_body,
            pdfUrl: ensuredPdfUrl || undefined,
            date: new Date().toLocaleDateString('lt-LT'),
          },
        });

        if (!ok) {
          setToast({ message: tr('school.toastContractSendFail'), type: 'error' });
          reload();
          return;
        }

        const { data: existingInstallments } = await supabase
          .from('school_payment_installments')
          .select('id, installment_number, amount, due_date, payment_status')
          .eq('contract_id', contract.id)
          .order('installment_number', { ascending: true });

        const sendPendingInstallmentEmail = async (row: {
          id: string;
          installment_number: number;
          amount: number | string;
          due_date: string;
        }, totalCnt: number) => {
          try {
            const pay = await sendFirstInstallmentPaymentLink({
              installmentId: row.id,
              installmentNumber: row.installment_number,
              totalInstallments: totalCnt,
              amount: Number(row.amount),
              dueDate: row.due_date,
              studentName: student?.full_name || '',
              parentName: student?.payer_name || student?.full_name || '',
              recipientEmail: recipient,
            });
            if (!pay.paymentUrl && pay.checkoutError) {
              setToast({
                message: `${tr('school.toastContractSendingSoon')} (${tr('school.checkoutStripeDetail')}: ${pay.checkoutError})`,
                type: 'warning',
              });
            }
          } catch {
            /* contract email already sent; installment email failure is non-fatal */
          }
        };

        if (!existingInstallments || existingInstallments.length === 0) {
          const dueDate = new Date().toISOString().slice(0, 10);
          const { data: createdInstallment, error: installmentErr } = await supabase
            .from('school_payment_installments')
            .insert({
              contract_id: contract.id,
              installment_number: 1,
              amount: Number(contract.annual_fee),
              due_date: dueDate,
            })
            .select('id, installment_number, amount, due_date')
            .single();

          if (!installmentErr && createdInstallment) {
            await sendPendingInstallmentEmail(createdInstallment, 1);
          }
        } else {
          const pending = existingInstallments.find((i: { payment_status?: string }) => i.payment_status === 'pending');
          if (pending) {
            await sendPendingInstallmentEmail(pending, existingInstallments.length);
          }
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

  const markSigned = async (contractId: string) => {
    try {
      const hdrs = await authHeaders();
      const res = await fetch('/api/school-contract-mark-signed', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ contractId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success !== true) {
        setToast({ message: data?.error || `HTTP ${res.status}`, type: 'error' });
      } else {
        setToast({ message: tr('school.toastContractSigned'), type: 'success' });
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

  const uploadSignedContract = async (contract: Contract, file: File) => {
    if (!orgId) return;
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const safeStudent = (contract.student?.full_name || 'student')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const path = `${orgId}/signed/${contract.id}-${safeStudent}-${Date.now()}.${fileExt}`;

    setSaving(true);
    const { error: uploadErr } = await supabase.storage.from('school-contracts').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/pdf',
    });
    if (uploadErr) {
      setSaving(false);
      setToast({ message: uploadErr.message, type: 'error' });
      return;
    }
    const { data } = supabase.storage.from('school-contracts').getPublicUrl(path);
    const { error: updateErr } = await supabase
      .from('school_contracts')
      .update({
        signed_contract_url: data.publicUrl,
        signed_uploaded_at: new Date().toISOString(),
        signing_status: 'signed',
        signed_at: new Date().toISOString(),
      })
      .eq('id', contract.id);
    setSaving(false);
    if (updateErr) {
      setToast({ message: updateErr.message, type: 'error' });
      return;
    }
    setToast({ message: 'Pasirašyta sutartis įkelta.', type: 'success' });
    // Also send student/parent access emails (idempotent).
    try {
      const hdrs = await authHeaders();
      void fetch('/api/school-contract-mark-signed', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({ contractId: contract.id }),
      });
    } catch {
      /* non-fatal */
    }
    reload();
  };

  const pickAndUploadSignedContract = (contract: Contract) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await uploadSignedContract(contract, file);
    };
    input.click();
  };

  const statusBadge = (s: Contract['signing_status']) => {
    const map = {
      draft: { label: tr('school.draft'), cls: 'bg-gray-100 text-gray-600' },
      sent: { label: tr('school.sentStatus'), cls: 'bg-amber-50 text-amber-700' },
      signed: { label: tr('school.signedStatus'), cls: 'bg-green-50 text-green-700' },
    };
    const { label, cls } = map[s];
    return <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
  };

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
              <Button onClick={openCreateContract} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" /> {tr('school.newContract')}
              </Button>
            ) : (
              <Button onClick={() => { setEditTemplate(null); setTemplatePdfFile(null); setTForm({ name: '', body: tr('school.contract.defaultBody'), annual_fee_default: '', pdf_url: '' }); setTemplateOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" /> {tr('school.newTemplate')}
              </Button>
            )}
          </div>
        </div>

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
            <div className="grid gap-3">
              {contracts.map((c) => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{c.student?.full_name || '—'}</p>
                        {statusBadge(c.signing_status)}
                      </div>
      <p className="text-sm text-gray-500 mt-1">
                        {c.contract_number && <span className="mr-3">Sutarties Nr. {c.contract_number}</span>}
                        {tr('school.annualFee')} <span className="font-medium text-gray-700">&euro;{Number(c.annual_fee).toFixed(2)}</span>
                        {c.sent_at && <span className="ml-3">{tr('school.sent')} {new Date(c.sent_at).toLocaleDateString('lt-LT')}</span>}
                        {c.signed_at && <span className="ml-3">{tr('school.signed')} {new Date(c.signed_at).toLocaleDateString('lt-LT')}</span>}
                      </p>
                      {c.signed_contract_url && (
                        <p className="text-xs text-emerald-700 mt-1">
                          Pasirašyta sutartis ({c.student?.full_name || 'mokinys'}):{' '}
                          <a className="underline" href={c.signed_contract_url} target="_blank" rel="noreferrer">
                            Atidaryti failą
                          </a>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {c.signing_status === 'draft' && (
                        <Button size="sm" variant="outline" onClick={() => sendContract(c)}>
                          <Send className="w-3.5 h-3.5 mr-1.5" /> {tr('school.send')}
                        </Button>
                      )}
                      {c.signing_status === 'sent' && (
                        <Button size="sm" variant="outline" onClick={() => markSigned(c.id)} className="text-green-700 border-green-200 hover:bg-green-50">
                          <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> {tr('school.markSigned')}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => pickAndUploadSignedContract(c)} disabled={saving}>
                        Įkelti pasirašytą
                      </Button>
                      <button onClick={() => deleteContract(c.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
                  <div>
                    <p className="font-semibold text-gray-900">{tpl.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {tr('school.defaultFee')} {tpl.annual_fee_default ? `€${tpl.annual_fee_default}` : tr('school.defaultFeeNotSet')}
                    </p>
                    {tpl.pdf_url && (
                      <a className="text-xs text-emerald-700 hover:underline" href={tpl.pdf_url} target="_blank" rel="noreferrer">
                        {tr('school.openPdfTemplate')}
                      </a>
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
            <div className="space-y-2">
              <Label>{isSchoolView ? 'Ikelti faila' : tr('school.templatePdf')}</Label>
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
                <p>Nutempkite PDF/DOCX faila cia arba paspauskite pasirinkti faila.</p>
                {templatePdfFile && (
                  <p className="mt-2 text-xs text-emerald-700">Pasirinktas failas: {templatePdfFile.name}</p>
                )}
              </div>
              <Input
                ref={templateFileInputRef}
                type="file"
                accept="application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setTemplateFileFromCandidate(e.target.files?.[0] || null)}
                className="sr-only"
              />
              <Button type="button" variant="outline" onClick={() => templateFileInputRef.current?.click()}>
                Pasirinkti faila
              </Button>
              {tForm.pdf_url && (
                <a className="text-xs text-emerald-700 hover:underline" href={tForm.pdf_url} target="_blank" rel="noreferrer">
                  {tr('school.openPdfTemplate')}
                </a>
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
                <Select value={cForm.student_id} onValueChange={onStudentSelect}>
                  <SelectTrigger><SelectValue placeholder={tr('school.selectStudent')} /></SelectTrigger>
                  <SelectContent>
                    {sortStudentsByFullName(students).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                step="0.01"
                value={cForm.annual_fee}
                onChange={(e) =>
                  setCForm({
                    ...cForm,
                    annual_fee: isSchoolView ? '300' : e.target.value,
                    filled_body: buildFilledBody({
                      contractNumber: cForm.contract_number,
                      annualFee: isSchoolView ? '300' : e.target.value,
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
                placeholder="500.00"
                disabled={isSchoolView}
              />
              {isSchoolView && <p className="text-xs text-gray-500">Fiksuotas metinis mokestis: 300 EUR.</p>}
            </div>
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
                <Label>{tr('compStu.parentPhoneRequired')}</Label>
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
            <Button onClick={createContract} disabled={saving || !cForm.student_id || !cForm.annual_fee} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? tr('school.creating') : tr('school.createContract')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
