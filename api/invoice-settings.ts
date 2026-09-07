import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ENTITY_TYPES = ['verslo_liudijimas', 'individuali_veikla', 'mb', 'uab', 'ii'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const COMPANY_ENTITIES: EntityType[] = ['mb', 'uab', 'ii'];

interface InvoiceSettingsBody {
  entity_type: EntityType;
  business_name?: string;
  company_code?: string;
  vat_code?: string;
  address?: string;
  activity_number?: string;
  personal_code?: string;
  contact_email?: string;
  contact_phone?: string;
  invoice_series?: string;
  bank_name?: string;
  iban?: string;
  next_invoice_number?: number;
  scope?: 'user' | 'organization';
}

function validateFields(body: InvoiceSettingsBody): string | null {
  if (!ENTITY_TYPES.includes(body.entity_type)) {
    return `Invalid entity_type. Must be one of: ${ENTITY_TYPES.join(', ')}`;
  }

  if (COMPANY_ENTITIES.includes(body.entity_type)) {
    if (!body.business_name?.trim()) return 'business_name is required for company entities';
    if (!body.company_code?.trim()) return 'company_code is required for company entities';
    if (!body.address?.trim()) return 'address is required for company entities';
  } else {
    if (!body.activity_number?.trim()) return 'activity_number is required';
    // personal_code is optional (some tutors don't want to disclose it on invoices)
  }

  if (!body.contact_email?.trim() && !body.contact_phone?.trim()) {
    return 'At least one contact method (email or phone) is required';
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handleSave(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyRequestAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const userId = auth.userId;
  if (!userId) return res.status(400).json({ error: 'User context required' });

  const scope = req.query.scope as string;
  const tutorIdParam = typeof req.query.tutorId === 'string' ? req.query.tutorId.trim() : '';

  /** Org admin issuing on behalf of a tutor: seller profile is the tutor's invoice_profiles row. */
  if (scope === 'tutor' && tutorIdParam) {
    const adminRow = await getOrgAdminAccessByUserId(supabase, userId);

    if (!adminRow) {
      return res.status(403).json({ error: 'Insufficient organization permission' });
    }
    const canViewTutorInvoice =
      hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'finance.view') ||
      hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'tutors.view');
    if (!canViewTutorInvoice) {
      return res.status(403).json({ error: 'Insufficient organization permission' });
    }

    const { data: tutorProf } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', tutorIdParam)
      .maybeSingle();

    if (!tutorProf || tutorProf.organization_id !== adminRow.organizationId) {
      return res.status(403).json({ error: 'Tutor not in your organization' });
    }

    const { data, error } = await supabase
      .from('invoice_profiles')
      .select('*')
      .eq('user_id', tutorIdParam)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data, profile: data });
  }

  if (scope === 'organization') {
    const adminRow = await getOrgAdminAccessByUserId(supabase, userId);

    if (!adminRow || !hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'finance.view')) {
      return res.status(403).json({ error: 'Insufficient organization permission' });
    }

    const { data, error } = await supabase
      .from('invoice_profiles')
      .select('*')
      .eq('organization_id', adminRow.organizationId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data });
  }

  const { data, error } = await supabase
    .from('invoice_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ data });
}

async function handleSave(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyRequestAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const userId = auth.userId;
  if (!userId) return res.status(400).json({ error: 'User context required' });

  const body = req.body as InvoiceSettingsBody;

  const validationError = validateFields(body);
  if (validationError) return res.status(400).json({ error: validationError });

  const isOrgScope = body.scope === 'organization';

  const payload: Record<string, unknown> = {
    entity_type: body.entity_type,
    business_name: body.business_name?.trim() || null,
    company_code: body.company_code?.trim() || null,
    vat_code: body.vat_code?.trim() || null,
    address: body.address?.trim() || null,
    activity_number: body.activity_number?.trim() || null,
    personal_code: body.personal_code?.trim() || null,
    contact_email: body.contact_email?.trim() || null,
    contact_phone: body.contact_phone?.trim() || null,
    invoice_series: body.invoice_series?.trim() || 'SF',
    bank_name: body.bank_name?.trim() || null,
    iban: body.iban?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (typeof body.next_invoice_number === 'number' && Number.isFinite(body.next_invoice_number)) {
    const n = Math.floor(body.next_invoice_number);
    if (n >= 1 && n <= 9999999) payload.next_invoice_number = n;
  }

  if (isOrgScope) {
    const adminRow = await getOrgAdminAccessByUserId(supabase, userId);

    if (!adminRow || !hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'finance.edit')) {
      return res.status(403).json({ error: 'Insufficient organization permission' });
    }

    const orgId = adminRow.organizationId;

    const { data: existing } = await supabase
      .from('invoice_profiles')
      .select('id')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('invoice_profiles')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ data });
    }

    payload.organization_id = orgId;
    const { data, error } = await supabase
      .from('invoice_profiles')
      .insert(payload)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ data });
  }

  // User scope (tutor)
  const { data: existing } = await supabase
    .from('invoice_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('invoice_profiles')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ data });
  }

  payload.user_id = userId;
  const { data, error } = await supabase
    .from('invoice_profiles')
    .insert(payload)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ data });
}
