import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schoolServiceTranslations } from '../../src/lib/i18n/schoolServiceTranslations';
import SchoolOtherServices from '../../src/components/school/SchoolOtherServices';

vi.mock('../../src/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer test' }) }));
vi.mock('../../src/lib/i18n', () => ({ useTranslation: () => ({ locale: 'lt', t: (key: string, params: Record<string, string> = {}) => {
  let value = schoolServiceTranslations.lt[key] || key;
  Object.entries(params).forEach(([name, replacement]) => { value = value.replace(`{${name}}`, replacement); });
  return value;
} }) }));
vi.mock('../../src/components/ui/date-input', () => ({ DateInput: (props: any) => <input {...props} type="date" /> }));
vi.mock('../../src/components/school/SchoolMonthlyInvoiceDialog', () => ({ default: (props: any) => <div role="dialog" aria-label="Invoice preview">{props.initialMonth} · {String(props.includePayerFamily)}</div> }));

let charges: any[], templates: any[], calls: any[], canEdit: boolean;
const student = { id: 'child', fullName: 'Test Child', payerEmail: 'parent@example.com' };
beforeEach(() => {
  charges = []; calls = []; canEdit = true;
  templates = [{ id: 'template', name: 'Licencija', unit_price_eur: 12, version: 1, is_active: true }];
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: any) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body); calls.push(body);
      if (body.action === 'save-charge') {
        const existing = charges.find(row => row.id === body.id);
        const row = { id: body.id, student_id: student.id, description: body.description, unit_price_eur: body.unitPriceEur,
          quantity: body.quantity, invoice_month: `${body.invoiceMonth}-01`, service_date: body.serviceDate, version: (existing?.version || 0) + 1 };
        charges = [...charges.filter(item => item.id !== body.id), row];
      } else if (body.action === 'cancel-charge' || body.action === 'restore-charge') {
        const row = charges.find(item => item.id === body.id); row.cancelled_at = body.action === 'cancel-charge' ? 'now' : null; row.version++;
      } else if (body.action === 'archive-template') templates[0].is_active = false;
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({ charges: structuredClone(charges), templates: structuredClone(templates), canEdit }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('school one-off services editor', () => {
  it('uses the catalog defaults, saves a one-off charge, and opens its family invoice in the right month', async () => {
    render(<SchoolOtherServices organizationId="org" student={student} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pridėti paslaugą' }));
    fireEvent.change(screen.getByLabelText('Paslaugų šablonai'), { target: { value: 'template' } });
    expect((screen.getByLabelText('Pavadinimas sąskaitoje') as HTMLInputElement).value).toBe('Licencija');
    fireEvent.change(screen.getByLabelText('Sąskaitos mėnuo'), { target: { value: '2026-11' } });
    fireEvent.change(screen.getByLabelText('Vidinė pastaba (tik administracijai)'), { target: { value: 'Private' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await screen.findByText('Licencija');
    expect(calls[0]).toMatchObject({ action: 'save-charge', studentId: 'child', templateId: 'template', quantity: 1,
      unitPriceEur: 12, invoiceMonth: '2026-11', internalNote: 'Private' });
    expect(screen.queryByLabelText('Pavadinimas sąskaitoje')).toBeNull();
    expect(screen.getByText('Laukia sąskaitos')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Peržiūrėti sąskaitą' }));
    expect(screen.getByRole('dialog').textContent).toContain('2026-11 · true');
  });
  it('cancels and restores pending charges and does not offer edits for an invoiced charge', async () => {
    charges = [{ id: 'pending', description: 'Olimpiada', student_id: 'child', unit_price_eur: 8, quantity: 1,
      service_date: '2026-10-21', invoice_month: '2026-10-01', version: 1 },
    { id: 'paid', description: 'Apmokėta licencija', student_id: 'child', unit_price_eur: 12, quantity: 1,
      service_date: '2026-09-21', invoice_month: '2026-09-01', version: 1, invoice_id: 'invoice', invoice: { payment_status: 'paid', invoice_number: 'PAM-1' } }];
    render(<SchoolOtherServices organizationId="org" student={student} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Atšaukti paslaugą' }));
    await screen.findByText('Atšaukta');
    expect(calls[0]).toMatchObject({ action: 'cancel-charge', id: 'pending', version: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Grąžinti' }));
    await screen.findByText('Laukia sąskaitos');
    expect(calls[1]).toMatchObject({ action: 'restore-charge', version: 2 });
    expect(screen.getAllByRole('button', { name: 'common.edit' })).toHaveLength(1);
    expect(screen.getByText('Apmokėta · PAM-1')).toBeTruthy();
  });
  it('supports read-only finance access and catalog administration', async () => {
    canEdit = false;
    const view = render(<SchoolOtherServices organizationId="org" />);
    await screen.findByText('Licencija');
    expect(screen.queryByRole('button', { name: 'Pridėti šabloną' })).toBeNull();
    view.unmount(); canEdit = true;
    render(<SchoolOtherServices organizationId="org" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archyvuoti šabloną' }));
    await screen.findByText('Archyvuota');
    expect(calls[0]).toMatchObject({ action: 'archive-template', id: 'template', version: 1 });
  });
  it('rejects an incomplete charge without making a mutation', async () => {
    render(<SchoolOtherServices organizationId="org" student={student} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pridėti paslaugą' }));
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    expect(within(screen.getByRole('alert')).getByText(/Patikrinkite pavadinimą/)).toBeTruthy();
    expect(calls).toEqual([]);
  });
});
