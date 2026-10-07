import type { VercelRequest, VercelResponse } from './types.js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { assertSchoolMonthlyInvoiceEnabled, serviceSupabase } from './_lib/schoolConsultationsAccess.js';
import { loadSchoolInvoiceOverpayments } from './_lib/schoolInvoiceOverpayments.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { fetchAllRows } from '../src/lib/fetchAllRows.js';
import { schoolInvoiceAmountDue } from '../src/lib/schoolInvoiceOverpayments.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const db = serviceSupabase();
  const accessResult = await requireOrgAdminAccess(req, db, 'finance.view');
  if (accessResult.ok === false) return res.status(accessResult.status).json({ error: accessResult.error });
  const access = accessResult.access;
  const orgId = access.organizationId;
  const body = req.body || {};
  if (body.organizationId && body.organizationId !== orgId) return res.status(403).json({ error: 'Forbidden' });
  const gate = await assertSchoolMonthlyInvoiceEnabled(db, orgId);
  if (gate.ok === false) return res.status(gate.status).json({ error: gate.error });
  const canEdit = hasOrgAdminPermission(access.role, access.permissions, 'finance.edit');
  try {
    if (body.action && body.action !== 'list') {
      if (!canEdit) return res.status(403).json({ error: 'Insufficient organization permission' });
      const reason = String(body.reason || '').trim();
      if (reason.length < 3 || reason.length > 1000) return res.status(400).json({ error: 'Nurodykite 3–1000 simbolių priežastį.' });
      let result;
      if (body.action === 'register') {
        const amount = Number(body.amountEur);
        if (!UUID.test(String(body.invoiceId || '')) || !UUID.test(String(body.requestId || ''))
          || !Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
          return res.status(400).json({ error: 'Pasirinkite apmokėtą sąskaitą ir teisingą permokos sumą.' });
        }
        result = await db.rpc('register_school_invoice_overpayment', {
          p_organization_id: orgId, p_invoice_id: body.invoiceId, p_amount_eur: amount,
          p_reason: reason, p_request_id: body.requestId, p_created_by: access.userId,
        });
      } else if (body.action === 'void' && UUID.test(String(body.overpaymentId || ''))) {
        result = await db.rpc('void_school_invoice_overpayment', {
          p_organization_id: orgId, p_overpayment_id: body.overpaymentId, p_reason: reason, p_created_by: access.userId,
        });
      } else return res.status(400).json({ error: 'Nežinomas veiksmas.' });
      if (result.error) return res.status(400).json({ error: result.error.message });
      return res.status(200).json({ ok: true, id: result.data });
    }
    const [credits, invoices] = await Promise.all([
      loadSchoolInvoiceOverpayments(db, orgId),
      fetchAllRows<any>((from, to) => db.from('school_monthly_invoices')
        .select('id,student_id,invoice_number,period_start,period_end,total_eur,credit_applied_eur,paid_at,student:students(full_name,payer_email)')
        .eq('organization_id', orgId).eq('payment_status', 'paid').order('paid_at', { ascending: false }).order('id').range(from, to)),
    ]);
    const activeSources = new Set(credits.filter((credit) => !credit.voided_at).map((credit) => credit.source_invoice_id));
    const names = new Map(invoices.map((invoice) => [invoice.id, invoice.student?.full_name || '']));
    return res.status(200).json({
      ok: true, canEdit,
      credits: credits.map((credit) => ({ ...credit, studentName: names.get(credit.source_invoice_id) || '' })),
      invoices: invoices.filter((invoice) => !activeSources.has(invoice.id) && schoolInvoiceAmountDue(invoice) > 0 && invoice.student?.payer_email)
        .map((invoice) => ({ ...invoice, paidCashEur: schoolInvoiceAmountDue(invoice) })),
    });
  } catch (cause) {
    console.error('[school-invoice-overpayments]', cause);
    return res.status(500).json({ error: 'Nepavyko įkelti permokų. Patikrinkite, ar pritaikyta permokų migracija.' });
  }
}
